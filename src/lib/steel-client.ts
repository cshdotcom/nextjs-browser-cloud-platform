import 'server-only'
import { ExternalApiError } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { getCurrentTraceId, traceHeader } from '@/lib/trace'

/**
 * Steel-Browser HTTP client.
 *
 * Steel-Browser is the headless-Chrome-as-a-service that backs the platform's
 * browser workspace sessions. This client wraps the REST endpoints we need:
 *   POST   /v1/sessions             createSession
 *   GET    /v1/sessions/:id          getSessionStatus
 *   GET    /v1/sessions              listSessions
 *   DELETE /v1/sessions/:id          deleteSession
 *
 * Configuration:
 *   - STEEL_API_URL   base URL (e.g. http://steel-browser:3000)
 *   - STEEL_API_KEY   optional bearer token
 *   - STEEL_TIMEOUT_MS (default 10s)
 *   - STEEL_RETRIES   (default 1)
 *
 * All calls have:
 *   - timeout
 *   - retry on transient errors (network reset / 5xx)
 *   - try/catch returning ExternalApiError with upstream='steel'
 *
 * If STEEL_API_URL is not configured, every call throws a clear
 * ExternalApiError so the caller (Route Handler / Server Action) can show
 * "Steel-Browser 未配置" to the admin without crashing Next.js.
 */

const UPSTREAM = 'steel'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 1
const RETRY_BACKOFF_MS = 300

// ---------------- Types ----------------
export interface CreateSessionInput {
  /** Optional upstream proxy URL passed to Chrome. */
  proxyUrl?: string
  /** User-Agent override. */
  ua?: string
  /** Timezone, e.g. "Asia/Shanghai". */
  timezone?: string
  /** Geolocation override. */
  geolocation?: { latitude: number; longitude: number }
  /** Browser fingerprint seed / overrides. */
  fingerprint?: Record<string, unknown>
  /** Custom labels for filtering / grouping. */
  labels?: Record<string, string>
  /** Optional session TTL in seconds (server-side enforced). */
  ttlSeconds?: number
  /** Whether to keep the browser alive between CDP disconnects. */
  keepAlive?: boolean
  /** Optional extra config to pass through to Steel-Browser. */
  extra?: Record<string, unknown>
}

export interface SessionInfo {
  id: string
  status: 'new' | 'active' | 'idle' | 'closed' | 'error' | string
  cdpUrl?: string
  novncUrl?: string
  proxyUrl?: string
  ua?: string
  timezone?: string
  createdAt?: string
  updatedAt?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
  raw: unknown
}

// ---------------- Internal fetcher ----------------
function getBaseUrl(): string | null {
  const u = process.env.STEEL_API_URL
  if (!u || u.trim() === '') return null
  return u.replace(/\/+$/, '')
}

function getApiKey(): string | undefined {
  const k = process.env.STEEL_API_KEY
  return k && k.trim() !== '' ? k : undefined
}

function ensureBaseUrl(): string {
  const base = getBaseUrl()
  if (!base) {
    throw new ExternalApiError(
      'Steel-Browser 服务未配置（STEEL_API_URL 环境变量缺失）',
      { upstream: UPSTREAM, code: 'EXTERNAL_API_UNAVAILABLE', httpStatus: 503 },
    )
  }
  return base
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...traceHeader(),
    ...(extra ?? {}),
  }
  const key = getApiKey()
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

function withTimeout<T>(promise: Promise<T>, ms: number, op: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ExternalApiError(`Steel ${op} 超时（${ms}ms）`, {
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
        reject(wrapSteelError(e, op))
      },
    )
  })
}

function wrapSteelError(e: unknown, op: string): ExternalApiError {
  if (e instanceof ExternalApiError) return e
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (lower.includes('not found') || lower.includes('no such')) {
    return new ExternalApiError(`Steel ${op} 失败：会话不存在`, {
      upstream: UPSTREAM,
      code: 'NOT_FOUND',
      httpStatus: 404,
      cause: e,
    })
  }
  if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('fetch failed')) {
    return new ExternalApiError(`Steel-Browser 服务不可达（${op}）`, {
      upstream: UPSTREAM,
      code: 'EXTERNAL_API_UNAVAILABLE',
      httpStatus: 503,
      cause: e,
    })
  }
  return new ExternalApiError(`Steel ${op} 失败：${msg}`, {
    upstream: UPSTREAM,
    code: 'EXTERNAL_API_ERROR',
    httpStatus: 502,
    cause: e,
  })
}

async function withRetry<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const retries = Number(process.env.STEEL_RETRIES ?? DEFAULT_RETRIES)
  const timeoutMs = Number(process.env.STEEL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await withTimeout(fn(), timeoutMs, op)
      void auditExternalCall(op, true)
      return r
    } catch (e) {
      lastErr = e
      // Don't retry on 4xx (definite client error) — except 429 (rate limited)
      if (e instanceof ExternalApiError) {
        const s = e.httpStatus
        if (s >= 400 && s < 500 && s !== 429 && s !== 408) {
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

// ---------------- Low-level HTTP ----------------
async function steelFetch<T>(path: string, init: RequestInit = {}, op: string): Promise<T> {
  const base = ensureBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    headers: buildHeaders((init.headers as Record<string, string> | undefined) ?? undefined),
  })
  // Empty body on 204 / empty
  const text = await res.text()
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const errMsg = (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string')
      ? (body as { message: string }).message
      : `HTTP ${res.status}`
    throw new ExternalApiError(`Steel ${op} 失败：${errMsg}`, {
      upstream: UPSTREAM,
      code: res.status >= 500 ? 'EXTERNAL_API_ERROR' : 'EXTERNAL_API_ERROR',
      httpStatus: res.status >= 500 ? 502 : res.status,
      data: body,
    })
  }
  return body as T
}

// ---------------- Public API ----------------

export async function createSession(input: CreateSessionInput): Promise<SessionInfo> {
  const payload: Record<string, unknown> = {
    ...(input.proxyUrl ? { proxyUrl: input.proxyUrl } : {}),
    ...(input.ua ? { userAgent: input.ua } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.geolocation ? { geolocation: input.geolocation } : {}),
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    ...(input.labels ? { labels: input.labels } : {}),
    ...(input.ttlSeconds ? { ttl: input.ttlSeconds } : {}),
    ...(input.keepAlive !== undefined ? { keepAlive: input.keepAlive } : {}),
    ...(input.extra ?? {}),
  }
  const raw = await withRetry('createSession', () =>
    steelFetch<unknown>('/v1/sessions', { method: 'POST', body: JSON.stringify(payload) }, 'createSession'),
  )
  return normalizeSession(raw)
}

export async function deleteSession(id: string): Promise<void> {
  await withRetry('deleteSession', () =>
    steelFetch<unknown>(`/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'deleteSession'),
  )
}

export async function getSessionStatus(id: string): Promise<SessionInfo> {
  const raw = await withRetry('getSessionStatus', () =>
    steelFetch<unknown>(`/v1/sessions/${encodeURIComponent(id)}`, { method: 'GET' }, 'getSessionStatus'),
  )
  return normalizeSession(raw)
}

export async function listSessions(filter?: { status?: string; labelSelector?: Record<string, string> }): Promise<SessionInfo[]> {
  const params = new URLSearchParams()
  if (filter?.status) params.set('status', filter.status)
  if (filter?.labelSelector) {
    for (const [k, v] of Object.entries(filter.labelSelector)) params.set(`label.${k}`, v)
  }
  const qs = params.toString()
  const raw = await withRetry('listSessions', () =>
    steelFetch<unknown>(`/v1/sessions${qs ? `?${qs}` : ''}`, { method: 'GET' }, 'listSessions'),
  )
  const arr = Array.isArray(raw) ? raw : ((raw as { sessions?: unknown[] })?.sessions ?? [])
  return arr.map((r) => normalizeSession(r))
}

/** Ping the Steel-Browser health endpoint. Returns true/false. */
export async function pingSteel(): Promise<boolean> {
  const base = getBaseUrl()
  if (!base) return false
  try {
    const res = await fetch(`${base}/v1/health`, {
      method: 'GET',
      headers: buildHeaders(),
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------- Normaliser ----------------
function normalizeSession(raw: unknown): SessionInfo {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: String(r.id ?? r.sessionId ?? r.session_id ?? ''),
    status: (r.status as string) ?? 'unknown',
    cdpUrl: typeof r.cdpUrl === 'string' ? r.cdpUrl : typeof r.cdp_url === 'string' ? r.cdp_url : undefined,
    novncUrl: typeof r.novncUrl === 'string' ? r.novncUrl : typeof r.novnc_url === 'string' ? r.novnc_url : undefined,
    proxyUrl: typeof r.proxyUrl === 'string' ? r.proxyUrl : typeof r.proxy_url === 'string' ? r.proxy_url : undefined,
    ua: typeof r.userAgent === 'string' ? r.userAgent : typeof r.ua === 'string' ? r.ua : undefined,
    timezone: typeof r.timezone === 'string' ? r.timezone : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    expiresAt: typeof r.expiresAt === 'string' ? r.expiresAt : undefined,
    metadata: (r.metadata as Record<string, unknown> | undefined) ?? undefined,
    raw: r,
  }
}
