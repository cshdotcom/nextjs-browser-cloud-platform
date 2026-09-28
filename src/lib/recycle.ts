import 'server-only'
import { db } from '@/lib/db'

/**
 * Recycle bin snapshot helper.
 *
 * Per spec: "平台所有删除操作禁止物理直接删除，全部进入全局回收站封存".
 * This function snapshots a resource row as JSON into the RecycleBin table
 * at soft-delete time. The caller is responsible for actually setting
 * `deletedAt` on the resource row — this helper ONLY inserts the recycle
 * bin entry.
 *
 * Entries auto-expire after `retentionDays` (default 30) — physical purge
 * is handled by the `file_cleanup` cron task (extended if needed).
 *
 * `restoreResource(id)` is invoked by /api/platform/recycle-bin/route.ts
 * to undo a soft-delete.
 */

const DEFAULT_RETENTION_DAYS = 30

export interface RecycleSnapshot {
  resourceType: string
  resourceId: string
  snapshot: Record<string, unknown>
  deletedBy?: string | null
  retentionDays?: number
}

export async function snapshotToRecycleBin(entry: RecycleSnapshot): Promise<void> {
  try {
    const now = new Date()
    const days = entry.retentionDays ?? DEFAULT_RETENTION_DAYS
    await db.recycleBin.create({
      data: {
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        resourceSnapshot: JSON.stringify(entry.snapshot),
        deletedBy: entry.deletedBy ?? null,
        deletedAt: now,
        expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      },
    })
  } catch (e) {
    // Recycle bin write failure MUST NOT block the deletion
    console.error('[recycle] failed to snapshot resource', e)
  }
}

/** Build a snapshot of a User row suitable for recycle bin storage. */
export function snapshotUser(u: {
  id: string
  username: string
  email: string
  displayName: string | null
  role: string
  status: string
  groupId: string | null
  preferences: string | null
}): Record<string, unknown> {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    groupId: u.groupId,
    preferences: u.preferences,
  }
}

/** Build a snapshot of a UserGroup row. */
export function snapshotGroup(g: {
  id: string
  name: string
  description: string | null
  parentId: string | null
  enabled: boolean
  enforceTwoFactor: boolean
  quota: string | null
  admins: string | null
}): Record<string, unknown> {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    parentId: g.parentId,
    enabled: g.enabled,
    enforceTwoFactor: g.enforceTwoFactor,
    quota: g.quota,
    admins: g.admins,
  }
}

/** Build a snapshot of a BrowserWorkspace row. */
export function snapshotWorkspace(w: {
  id: string
  name: string
  mode: string
  status: string
  userId: string
  groupId: string | null
  proxyNodeId: string | null
  singboxInstanceId: string | null
  steelSessionId: string | null
  ttlMinutes: number
  idleTimeoutMinutes: number
  tags: string | null
}): Record<string, unknown> {
  return {
    id: w.id,
    name: w.name,
    mode: w.mode,
    status: w.status,
    userId: w.userId,
    groupId: w.groupId,
    proxyNodeId: w.proxyNodeId,
    singboxInstanceId: w.singboxInstanceId,
    steelSessionId: w.steelSessionId,
    ttlMinutes: w.ttlMinutes,
    idleTimeoutMinutes: w.idleTimeoutMinutes,
    tags: w.tags,
  }
}

/** Build a snapshot of a BrowserTemplate row. */
export function snapshotTemplate(t: {
  id: string
  name: string
  visibility: string
  ownerId: string
  groupId: string | null
  parentId: string | null
  config: string
}): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    visibility: t.visibility,
    ownerId: t.ownerId,
    groupId: t.groupId,
    parentId: t.parentId,
    config: t.config,
  }
}

/** Build a snapshot of a SingboxInstance row. */
export function snapshotSingbox(i: {
  id: string
  name: string
  description: string | null
  cpuLimit: number
  memoryLimit: number
  dockerContainerId: string | null
  hostNodeId: string | null
  socksAddress: string | null
  configJson: string
  maxSessions: number
  tags: string | null
}): Record<string, unknown> {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    cpuLimit: i.cpuLimit,
    memoryLimit: i.memoryLimit,
    dockerContainerId: i.dockerContainerId,
    hostNodeId: i.hostNodeId,
    socksAddress: i.socksAddress,
    configJson: i.configJson,
    maxSessions: i.maxSessions,
    tags: i.tags,
  }
}
