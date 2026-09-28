import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { releaseQuota } from '@/lib/quota'
import * as steel from '@/lib/steel-client'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { snapshotToRecycleBin, snapshotWorkspace } from '@/lib/recycle'

// GET /api/platform/workspaces/[id] — detail
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const w = await db.browserWorkspace.findUnique({
    where: { id },
    include: {
      proxyNode: { select: { id: true, name: true, status: true, socksAddress: true } },
      singboxInstance: { select: { id: true, name: true, status: true } },
      shares: { select: { id: true, targetUserId: true, permission: true, expireAt: true } },
    },
  })
  if (!w || w.deletedAt) {
    throw new ValidationError('工作区不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Ownership or shared access
  const isOwner = w.userId === s.uid
  const isAdmin = s.role === 'admin' || s.role === 'superadmin'
  const isShared = w.shares.some((sh) => sh.targetUserId === s.uid)
  if (!isOwner && !isAdmin && !isShared) {
    throw new ValidationError('无权访问该工作区', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  return {
    id: w.id,
    name: w.name,
    mode: w.mode,
    status: w.status,
    steelSessionId: w.steelSessionId,
    novncSessionId: w.novncSessionId,
    ttlMinutes: w.ttlMinutes,
    idleTimeoutMinutes: w.idleTimeoutMinutes,
    tags: w.tags ? JSON.parse(w.tags) : [],
    proxyNode: w.proxyNode,
    singboxInstance: w.singboxInstance,
    shares: w.shares,
    userId: w.userId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
})

// DELETE /api/platform/workspaces/[id] — stop+delete via steel-client, soft-delete
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const w = await db.browserWorkspace.findUnique({ where: { id } })
  if (!w || w.deletedAt) {
    throw new ValidationError('工作区不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (w.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权删除该工作区', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }

  // Best-effort stop the underlying steel session
  if (w.steelSessionId) {
    await steel.deleteSession(w.steelSessionId).catch(() => {})
  }

  await db.browserWorkspace.update({ where: { id }, data: { deletedAt: new Date(), status: 'stopped' } })

  // Snapshot to recycle bin
  await snapshotToRecycleBin({
    resourceType: 'workspace',
    resourceId: id,
    snapshot: snapshotWorkspace(w),
    deletedBy: s.uid,
  })

  // Release quota
  const resource = w.mode === 'novnc_full' ? 'novnc_workspace' : 'browser_workspace'
  await releaseQuota('user', w.userId, resource, 1, { actorId: s.uid }).catch(() => {})

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'delete',
    resourceType: 'workspace',
    resourceId: id,
    req,
    beforeJson: { name: w.name, mode: w.mode, steelSessionId: w.steelSessionId },
  })

  return { id, deleted: true }
})
