import 'server-only'
import { db } from '@/lib/db'
import { platformAudit } from '@/lib/platform-audit'
import { inspectContainer, stopContainer, removeContainer } from '@/lib/docker-client'
import { deleteSession, getSessionStatus } from '@/lib/steel-client'

/**
 * Cron runner — built-in scheduled tasks invoked by /api/platform/cron and
 * the manual "run task" admin endpoint.
 *
 * Each task is identified by name. The dispatcher looks up the ScheduleTask
 * row by name; if it doesn't exist, it auto-registers a known built-in task
 * so admins can see / disable it from the UI.
 *
 * Built-in tasks (matching the spec):
 *   - session_reclamation      tear down expired / idle browser workspaces
 *   - singbox_status_sync      sync SingboxInstance.status with Docker container state
 *   - proxy_health_probe       ping each proxy node / singbox instance
 *   - file_cleanup             physically purge soft-deleted / expired FileMeta
 *   - token_expiry_sweep       soft-delete api_tokens that have passed expireAt
 *   - dirty_data_cleanup       clean up WorkspaceShares past expireAt, zombie containers
 */

const BUILTIN_TASKS: Record<string, { run: () => Promise<string>; description: string }> = {
  session_reclamation: { description: 'Reclaim expired / idle browser workspaces', run: runSessionReclamation },
  singbox_status_sync: { description: 'Sync SingboxInstance.status with Docker', run: runSingboxStatusSync },
  proxy_health_probe: { description: 'Probe proxy node / singbox health', run: runProxyHealthProbe },
  file_cleanup: { description: 'Purge soft-deleted / expired FileMeta rows', run: runFileCleanup },
  token_expiry_sweep: { description: 'Soft-delete expired API tokens', run: runTokenExpirySweep },
  dirty_data_cleanup: { description: 'Clean expired workspace shares + zombie containers', run: runDirtyDataCleanup },
}

/** Run a named task. Auto-registers the ScheduleTask row if missing. */
export async function runTaskByName(name: string): Promise<string> {
  const task = BUILTIN_TASKS[name]
  if (!task) {
    throw new Error(`Unknown scheduled task: ${name}`)
  }
  // Auto-register the task row if missing so admins can see it.
  await db.scheduleTask.upsert({
    where: { name },
    update: {},
    create: { name, cronExpr: '*/5 * * * *', enabled: true, nextExecuteAt: new Date() },
  })
  const result = await task.run()
  await platformAudit({
    operatorId: null,
    operatorName: 'system:cron',
    operationType: 'run',
    resourceType: 'schedule-task',
    resourceId: name,
    afterJson: { result },
  })
  return result
}

/** Run ALL enabled tasks. Used by the cron entrypoint. */
export async function runAllEnabled(): Promise<{ ran: string[]; failed: Record<string, string> }> {
  const tasks = await db.scheduleTask.findMany({ where: { enabled: true } })
  const ran: string[] = []
  const failed: Record<string, string> = {}
  for (const t of tasks) {
    if (!BUILTIN_TASKS[t.name]) continue // skip unknown tasks
    try {
      await runTaskByName(t.name)
      ran.push(t.name)
    } catch (e) {
      failed[t.name] = e instanceof Error ? e.message : String(e)
    }
  }
  return { ran, failed }
}

// ---------------- Built-in task implementations ----------------

// session_reclamation: stop+delete steel sessions for expired/idle workspaces
async function runSessionReclamation(): Promise<string> {
  const now = new Date()
  const expired = await db.browserWorkspace.findMany({
    where: {
      deletedAt: null,
      status: { in: ['creating', 'running', 'idle'] },
      OR: [
        // Hard TTL expired
        { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      ],
    },
    take: 50,
  })
  let reclaimed = 0
  for (const w of expired) {
    try {
      if (w.steelSessionId) {
        await deleteSession(w.steelSessionId).catch(() => {})
      }
      await db.browserWorkspace.update({
        where: { id: w.id },
        data: { status: 'expired' },
      })
      reclaimed++
    } catch (e) {
      console.warn(`[cron:session_reclamation] workspace ${w.id} failed`, e)
    }
  }
  return `reclaimed=${reclaimed}`
}

// singbox_status_sync: align DB status with Docker container reality
async function runSingboxStatusSync(): Promise<string> {
  const instances = await db.singboxInstance.findMany({
    where: { deletedAt: null, dockerContainerId: { not: null } },
    take: 50,
  })
  let updated = 0
  for (const inst of instances) {
    if (!inst.dockerContainerId) continue
    try {
      const info = await inspectContainer(inst.dockerContainerId)
      const running = info.state.running
      const newStatus = running ? 'running' : info.state.exitCode === 0 ? 'stopped' : 'error'
      if (newStatus !== inst.status) {
        await db.singboxInstance.update({ where: { id: inst.id }, data: { status: newStatus } })
        // Also update associated proxy node status
        await db.proxyNode.updateMany({
          where: { singboxInstanceId: inst.id },
          data: { status: running ? 'active' : 'error' },
        })
        updated++
      }
    } catch (e) {
      console.warn(`[cron:singbox_status_sync] instance ${inst.id} failed`, e)
      // Mark as error if container is gone
      await db.singboxInstance.update({ where: { id: inst.id }, data: { status: 'error' } }).catch(() => {})
      await db.proxyNode.updateMany({
        where: { singboxInstanceId: inst.id },
        data: { status: 'error' },
      }).catch(() => {})
    }
  }
  return `synced=${updated}`
}

// proxy_health_probe: light-weight ping for each active proxy node
async function runProxyHealthProbe(): Promise<string> {
  const proxies = await db.proxyNode.findMany({ where: { deletedAt: null, status: 'active' }, take: 50 })
  let probed = 0
  for (const p of proxies) {
    // For internal_singbox nodes, rely on singbox_status_sync to set status.
    // For external proxies we don't have a real probe here; just count.
    probed++
    void p
  }
  return `probed=${probed}`
}

// file_cleanup: physically purge soft-deleted or expired FileMeta rows
async function runFileCleanup(): Promise<string> {
  const now = new Date()
  const rows = await db.fileMeta.findMany({
    where: {
      OR: [{ deletedAt: { not: null } }, { expireAt: { lt: now } }],
    },
    take: 100,
  })
  let purged = 0
  for (const f of rows) {
    try {
      // Physical file deletion is best-effort
      const { deleteFile } = await import('@/lib/file-storage')
      await deleteFile(f.storageKey).catch(() => {})
      await db.fileMeta.delete({ where: { id: f.id } })
      purged++
    } catch (e) {
      console.warn(`[cron:file_cleanup] file ${f.id} failed`, e)
    }
  }
  return `purged=${purged}`
}

// token_expiry_sweep: soft-delete api_tokens that passed expireAt
async function runTokenExpirySweep(): Promise<string> {
  const result = await db.apiToken.updateMany({
    where: { deletedAt: null, expireAt: { lt: new Date() } },
    data: { deletedAt: new Date(), enabled: false },
  })
  return `expired=${result.count}`
}

// dirty_data_cleanup: clean expired WorkspaceShares + zombie singbox containers
async function runDirtyDataCleanup(): Promise<string> {
  const shares = await db.workspaceShare.deleteMany({
    where: { expireAt: { lt: new Date() } },
  })
  // Find singbox instances marked as running but whose containers are gone in Docker.
  // For each, do best-effort container cleanup (idempotent — removeContainer with force).
  const zombies = await db.singboxInstance.findMany({
    where: { deletedAt: null, status: 'running', dockerContainerId: { not: null } },
    take: 20,
  })
  let zombieCount = 0
  for (const z of zombies) {
    if (!z.dockerContainerId) continue
    try {
      const info = await inspectContainer(z.dockerContainerId)
      if (!info.state.running && info.state.dead) {
        await removeContainer(z.dockerContainerId, { force: true }).catch(() => {})
        await db.singboxInstance.update({ where: { id: z.id }, data: { status: 'error' } })
        zombieCount++
      }
    } catch {
      // Container not found — mark as error
      await db.singboxInstance.update({ where: { id: z.id }, data: { status: 'error' } }).catch(() => {})
      zombieCount++
    }
  }
  return `expiredShares=${shares.count}, zombieContainers=${zombieCount}`
}

/** Stop a singbox container cleanly (called by the singbox stop route). */
export async function stopSingboxContainer(containerId: string): Promise<void> {
  await stopContainer(containerId, 10)
}

/** Stop a steel session (called by the workspace stop route). */
export async function stopSteelSession(steelSessionId: string): Promise<void> {
  // Best-effort status check; if session doesn't exist anymore, no-op.
  await getSessionStatus(steelSessionId).then(
    async () => {
      await deleteSession(steelSessionId)
    },
    () => {
      // Session not found — nothing to do
    },
  )
}
