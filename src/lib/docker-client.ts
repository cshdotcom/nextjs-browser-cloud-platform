import 'server-only'
import { ExternalApiError } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { getCurrentTraceId } from '@/lib/trace'

/**
 * Docker API client wrapper.
 *
 * Backed by `dockerode`. Connection string is read from the DOCKER_API_URL
 * env var. Common formats:
 *   - unix:///var/run/docker.sock      (default — local socket)
 *   - tcp://docker-host:2375           (remote, plain TCP)
 *   - https://docker-host:2376         (remote TLS)
 *
 * Graceful degradation:
 *   - If dockerode is not installed, all calls throw ExternalApiError
 *     (no module-load crash).
 *   - If Docker daemon is unreachable, all calls throw ExternalApiError after
 *     `DEFAULT_TIMEOUT_MS` with code EXTERNAL_API_UNAVAILABLE.
 *
 * Every call:
 *   1. Times out after `DEFAULT_TIMEOUT_MS` (or per-call override).
 *   2. Retries transient failures up to `DEFAULT_RETRIES` times with backoff.
 *   3. Wraps errors in ExternalApiError with upstream='docker'.
 *   4. Writes a 'external_api_called' audit log on success.
 *
 * NOTE: This module NEVER lets a Docker connection failure kill the Next.js
 * server process. All errors are converted to thrown ExternalApiError objects
 * that Route Handlers / Server Actions can catch via wrapHandler / wrapAction.
 */

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_RETRIES = 1
const RETRY_BACKOFF_MS = 250

const UPSTREAM = 'docker'

// ---------------- Lazy dockerode loader ----------------
// We lazy-import so the module is safe to import even if dockerode isn't
// installed or the daemon is down.
type DockerodeCtor = new (opts?: unknown) => {
  createContainer(opts: unknown): Promise<{ id: string }>
  getContainer(id: string): {
    start(): Promise<unknown>
    stop(opts?: { t?: number }): Promise<unknown>
    remove(opts?: { force?: boolean; v?: boolean }): Promise<unknown>
    stats(opts?: { stream?: boolean }): Promise<unknown>
    logs(opts?: {
      stdout?: boolean
      stderr?: boolean
      follow?: boolean
      tail?: number | 'all'
      since?: number
      until?: number
      timestamps?: boolean
    }): Promise<NodeJS.ReadableStream>
    inspect(): Promise<unknown>
  }
  listContainers(opts?: { all?: boolean; filters?: string }): Promise<unknown[]>
  ping(): Promise<unknown>
  modem: {
    demuxStream(stream: NodeJS.ReadableStream, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): void
  }
}

let dockerodeCtor: DockerodeCtor | null = null
let dockerodeLoadError: unknown = null
let dockerClient: InstanceType<DockerodeCtor> | null = null
let dockerClientError: unknown = null

async function loadDockerode(): Promise<DockerodeCtor> {
  if (dockerodeCtor) return dockerodeCtor
  if (dockerodeLoadError) throw dockerodeLoadError
  try {
    // Dynamic import keeps the module safe if dockerode isn't installed.
    const mod = (await import('dockerode')) as unknown
    // dockerode exports the class as default in ESM, or as the module itself
    // under CJS interop. Handle both shapes.
    const Ctor = (mod as { default?: DockerodeCtor }).default ?? (mod as unknown as DockerodeCtor)
    dockerodeCtor = Ctor
    return Ctor
  } catch (e) {
    dockerodeLoadError = e
    console.error('[docker-client] dockerode module not available', e)
    throw new ExternalApiError(
      'Docker 客户端未安装，无法调度容器',
      { upstream: UPSTREAM, code: 'EXTERNAL_API_UNAVAILABLE', httpStatus: 503, cause: e },
    )
  }
}

function parseDockerUrl(): Record<string, unknown> {
  const url = process.env.DOCKER_API_URL || 'unix:///var/run/docker.sock'
  if (url.startsWith('unix://')) {
    return { socketPath: url.replace('unix://', '') }
  }
  if (url.startsWith('tcp://')) {
    const rest = url.replace('tcp://', '')
    const [host, portStr] = rest.split(':')
    return { host, port: Number(portStr) || 2375 }
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const u = new URL(url)
    return {
      host: u.hostname,
      port: Number(u.port) || (u.protocol === 'https:' ? 2376 : 2375),
      protocol: u.protocol.replace(':', ''),
      ...(u.username ? { username: u.username } : {}),
      ...(u.password ? { password: u.password } : {}),
    }
  }
  // Fallback to socketPath
  return { socketPath: '/var/run/docker.sock' }
}

async function getDocker(): Promise<InstanceType<DockerodeCtor>> {
  if (dockerClient) return dockerClient
  if (dockerClientError) throw dockerClientError
  const Ctor = await loadDockerode()
  try {
    const instance = new Ctor(parseDockerUrl()) as InstanceType<DockerodeCtor>
    dockerClient = instance
    return instance
  } catch (e) {
    dockerClientError = e
    console.error('[docker-client] failed to construct Docker client', e)
    throw new ExternalApiError(
      'Docker 客户端初始化失败',
      { upstream: UPSTREAM, code: 'EXTERNAL_API_UNAVAILABLE', httpStatus: 503, cause: e },
    )
  }
}

// ---------------- Timeout + retry helpers ----------------
function withTimeout<T>(promise: Promise<T>, ms: number, op: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ExternalApiError(`Docker ${op} 超时（${ms}ms）`, {
          upstream: UPSTREAM,
          code: 'EXTERNAL_API_TIMEOUT',
          httpStatus: 504,
        }),
      )
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(wrapDockerError(e, op))
      },
    )
  })
}

function wrapDockerError(e: unknown, op: string): ExternalApiError {
  if (e instanceof ExternalApiError) return e
  const msg = e instanceof Error ? e.message : String(e)
  // Common "container not found" / "no such container" → 404
  const lower = msg.toLowerCase()
  if (lower.includes('no such') || lower.includes('not found')) {
    return new ExternalApiError(`Docker ${op} 失败：容器不存在`, {
      upstream: UPSTREAM,
      code: 'NOT_FOUND',
      httpStatus: 404,
      cause: e,
    })
  }
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('connect enoent')) {
    return new ExternalApiError(`Docker 守护进程不可达（${op}）`, {
      upstream: UPSTREAM,
      code: 'EXTERNAL_API_UNAVAILABLE',
      httpStatus: 503,
      cause: e,
    })
  }
  return new ExternalApiError(`Docker ${op} 失败：${msg}`, {
    upstream: UPSTREAM,
    code: 'EXTERNAL_API_ERROR',
    httpStatus: 502,
    cause: e,
  })
}

async function withRetry<T>(op: string, fn: () => Promise<T>, retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await withTimeout(fn(), timeoutMs, op)
      // Best-effort audit log
      void auditExternalCall(op, true)
      return r
    } catch (e) {
      lastErr = e
      // Don't retry on 404 (definite not-found) or on validation errors
      if (e instanceof ExternalApiError) {
        if (e.code === 'NOT_FOUND' || e.httpStatus === 404) {
          void auditExternalCall(op, false, e.message)
          throw e
        }
      }
      if (attempt < retries) {
        await sleep(RETRY_BACKOFF_MS * (attempt + 1))
        continue
      }
      void auditExternalCall(op, false, e instanceof Error ? e.message : String(e))
      throw e
    }
  }
  throw lastErr
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function auditExternalCall(op: string, ok: boolean, errMsg?: string): Promise<void> {
  await audit({
    eventType: 'external_api_called',
    severity: ok ? 'info' : 'warning',
    traceId: getCurrentTraceId() ?? undefined,
    metadata: {
      upstream: UPSTREAM,
      op,
      ok,
      errMsg,
    },
  }).catch(() => {})
}

// ---------------- Public types ----------------
export interface ContainerCreateOptions {
  /** Container name (without leading slash). */
  name?: string
  image: string
  /** Override command (CMD). */
  cmd?: string[]
  /** Env vars as ["KEY=value", ...]. */
  env?: string[]
  /** Labels. */
  labels?: Record<string, string>
  /** CPU quota in units of 10^-2 cores (100000 = 1 core). Optional. */
  cpuQuota?: number
  /** Memory limit in bytes. Optional. */
  memoryBytes?: number
  /** Network mode, e.g. "bridge" or name of a custom network. */
  networkMode?: string
  /** Exposed ports like { "1080/tcp": {} }. */
  exposedPorts?: Record<string, Record<string, never>>
  /** Port bindings like { "1080/tcp": [{ HostPort: "0" }] }. */
  portBindings?: Record<string, Array<{ HostPort?: string; HostIp?: string }>>
  /** Bind mounts like [{ Source: "/host", Target: "/container", ReadOnly: false }]. */
  binds?: Array<{ Source: string; Target: string; ReadOnly?: boolean }>
  /** Restart policy. */
  restartPolicy?: { Name: 'no' | 'always' | 'unless-stopped' | 'on-failure'; MaximumRetryCount?: number }
  /** Auto-remove on stop. */
  autoRemove?: boolean
  /** Whether to attach stdin/stdout. */
  attachStdout?: boolean
  attachStderr?: boolean
  /** Working directory inside container. */
  workingDir?: string
}

export interface ContainerInspectResult {
  id: string
  name: string
  image: string
  state: {
    status: string // "created" | "running" | "exited" | "paused" | "restarting" | ...
    running: boolean
    paused: boolean
    restarting: boolean
    dead: boolean
    exitCode: number
    startedAt?: string
    finishedAt?: string
    error?: string
    oomKilled?: boolean
  }
  networkSettings?: {
    ipAddress?: string
    ports?: Record<string, unknown>
  }
  // Raw dockerode inspect payload
  raw: unknown
}

export interface ContainerStatsResult {
  cpuPercent: number
  memoryUsageBytes: number
  memoryLimitBytes: number
  memoryPercent: number
  rxBytes: number
  txBytes: number
  readAt: string
  raw: unknown
}

// ---------------- Public API ----------------

/** Check whether Docker daemon is reachable. Returns true/false. */
export async function pingDocker(): Promise<boolean> {
  try {
    const d = await getDocker()
    await withTimeout(d.ping(), 2000, 'ping')
    return true
  } catch (e) {
    console.warn('[docker-client] ping failed', e)
    return false
  }
}

export async function createContainer(opts: ContainerCreateOptions): Promise<string> {
  const d = await getDocker()
  const createOpts: Record<string, unknown> = {
    Image: opts.image,
    ...(opts.cmd ? { Cmd: opts.cmd } : {}),
    ...(opts.env ? { Env: opts.env } : {}),
    ...(opts.labels ? { Labels: opts.labels } : {}),
    ...(opts.workingDir ? { WorkingDir: opts.workingDir } : {}),
    ...(opts.exposedPorts ? { ExposedPorts: opts.exposedPorts } : {}),
    ...(opts.autoRemove !== undefined ? { HostConfig: { AutoRemove: opts.autoRemove } } : {}),
    ...(opts.attachStdout !== undefined ? { AttachStdout: opts.attachStdout } : {}),
    ...(opts.attachStderr !== undefined ? { AttachStderr: opts.attachStderr } : {}),
  }
  const hostConfig: Record<string, unknown> = {}
  if (opts.cpuQuota) hostConfig.CpuQuota = opts.cpuQuota
  if (opts.memoryBytes) hostConfig.Memory = opts.memoryBytes
  if (opts.networkMode) hostConfig.NetworkMode = opts.networkMode
  if (opts.portBindings) hostConfig.PortBindings = opts.portBindings
  if (opts.binds) hostConfig.Binds = opts.binds.map((b) => `${b.Source}:${b.Target}:${b.ReadOnly ? 'ro' : 'rw'}`)
  if (opts.restartPolicy) hostConfig.RestartPolicy = opts.restartPolicy
  if (opts.autoRemove !== undefined) hostConfig.AutoRemove = opts.autoRemove
  if (Object.keys(hostConfig).length > 0) createOpts.HostConfig = hostConfig

  const container = await withRetry('createContainer', async () =>
    d.createContainer(createOpts),
  )
  return container.id
}

export async function startContainer(id: string): Promise<void> {
  const d = await getDocker()
  await withRetry('startContainer', async () => d.getContainer(id).start())
}

export async function stopContainer(id: string, timeoutSeconds = 10): Promise<void> {
  const d = await getDocker()
  await withRetry('stopContainer', async () => d.getContainer(id).stop({ t: timeoutSeconds }), 0)
}

export async function removeContainer(id: string, opts: { force?: boolean; removeVolumes?: boolean } = {}): Promise<void> {
  const d = await getDocker()
  await withRetry(
    'removeContainer',
    async () =>
      d.getContainer(id).remove({ force: opts.force ?? false, v: opts.removeVolumes ?? false }),
    0,
  )
}

export async function inspectContainer(id: string): Promise<ContainerInspectResult> {
  const d = await getDocker()
  const raw = (await withRetry('inspectContainer', async () => d.getContainer(id).inspect())) as {
    Id: string
    Name: string
    Config: { Image: string }
    State: {
      Status: string
      Running: boolean
      Paused: boolean
      Restarting: boolean
      Dead: boolean
      ExitCode: number
      StartedAt?: string
      FinishedAt?: string
      Error?: string
      OOMKilled?: boolean
    }
    NetworkSettings?: { IPAddress?: string; Ports?: Record<string, unknown> }
  }
  return {
    id: raw.Id,
    name: raw.Name,
    image: raw.Config?.Image ?? '',
    state: {
      status: raw.State?.Status ?? 'unknown',
      running: raw.State?.Running ?? false,
      paused: raw.State?.Paused ?? false,
      restarting: raw.State?.Restarting ?? false,
      dead: raw.State?.Dead ?? false,
      exitCode: raw.State?.ExitCode ?? 0,
      startedAt: raw.State?.StartedAt,
      finishedAt: raw.State?.FinishedAt,
      error: raw.State?.Error,
      oomKilled: raw.State?.OOMKilled,
    },
    networkSettings: {
      ipAddress: raw.NetworkSettings?.IPAddress,
      ports: raw.NetworkSettings?.Ports,
    },
    raw,
  }
}

export async function getContainerStats(id: string, stream = false): Promise<ContainerStatsResult> {
  const d = await getDocker()
  const raw = (await withRetry('getContainerStats', async () =>
    d.getContainer(id).stats({ stream }),
  )) as {
    read: string
    preread: string
    cpu_stats: {
      cpu_usage: { total_usage: number }
      system_cpu_usage?: number
      online_cpus?: number
    }
    precpu_stats: {
      cpu_usage: { total_usage: number }
      system_cpu_usage?: number
      online_cpus?: number
    }
    memory_stats: { usage?: number; limit?: number }
    networks?: Record<string, { rx_bytes: number; tx_bytes: number }>
  }
  // CPU percent
  let cpuPercent = 0
  const cpuDelta = (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const systemDelta =
    (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0)
  const onlineCpus = raw.cpu_stats?.online_cpus ?? 1
  if (systemDelta > 0 && cpuDelta > 0) {
    cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100
  }
  // Memory
  const memoryUsageBytes = raw.memory_stats?.usage ?? 0
  const memoryLimitBytes = raw.memory_stats?.limit ?? 0
  const memoryPercent = memoryLimitBytes > 0 ? (memoryUsageBytes / memoryLimitBytes) * 100 : 0
  // Network
  let rxBytes = 0
  let txBytes = 0
  if (raw.networks) {
    for (const net of Object.values(raw.networks)) {
      rxBytes += net.rx_bytes
      txBytes += net.tx_bytes
    }
  }
  return {
    cpuPercent,
    memoryUsageBytes,
    memoryLimitBytes,
    memoryPercent,
    rxBytes,
    txBytes,
    readAt: raw.read,
    raw,
  }
}

export async function getContainerLogs(
  id: string,
  tail: number | 'all' = 200,
  opts: { sinceSeconds?: number; untilSeconds?: number; timestamps?: boolean } = {},
): Promise<{ stdout: string; stderr: string; combined: string }> {
  const d = await getDocker()
  const stream = await withRetry('getContainerLogs', async () =>
    d.getContainer(id).logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail,
      since: opts.sinceSeconds,
      until: opts.untilSeconds,
      timestamps: opts.timestamps ?? true,
    }),
  )
  // Demux the multi-plexed docker stream into stdout/stderr buffers
  const stdoutBuf: Buffer[] = []
  const stderrBuf: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const stdout = {
      write: (chunk: Buffer) => {
        stdoutBuf.push(chunk)
      },
    } as unknown as NodeJS.WritableStream
    const stderr = {
      write: (chunk: Buffer) => {
        stderrBuf.push(chunk)
      },
    } as unknown as NodeJS.WritableStream
    try {
      d.modem.demuxStream(stream, stdout, stderr)
      stream.on('end', () => resolve())
      stream.on('close', () => resolve())
      stream.on('error', (e: unknown) => reject(wrapDockerError(e, 'getContainerLogs')))
    } catch (e) {
      reject(wrapDockerError(e, 'getContainerLogs'))
    }
  })
  const stdout = Buffer.concat(stdoutBuf).toString('utf8')
  const stderr = Buffer.concat(stderrBuf).toString('utf8')
  return { stdout, stderr, combined: stdout + (stderr ? '\n--- stderr ---\n' + stderr : '') }
}

/** List containers (optionally including stopped ones). */
export async function listContainers(opts: { all?: boolean } = {}): Promise<unknown[]> {
  const d = await getDocker()
  return withRetry('listContainers', async () => d.listContainers({ all: opts.all ?? true }))
}

/** Diagnostics helper: returns whether the Docker client initialised cleanly. */
export function isDockerAvailableSync(): boolean {
  return dockerClient !== null && !dockerClientError
}

/** Reset the singleton (testing only). */
export function _resetDockerClientForTest(): void {
  dockerClient = null
  dockerClientError = null
  dockerodeCtor = null
  dockerodeLoadError = null
}
