import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import * as steel from '@/lib/steel-client'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// POST /api/platform/workspaces/[id]/stop — stop session
export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const w = await db.browserWorkspace.findUnique({ where: { id } })
  if (!w || w.deletedAt) {
    throw new ValidationError('工作区不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (w.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权停止该工作区', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  if (w.status === 'stopped') {
    return { id, alreadyStopped: true }
  }
  if (w.steelSessionId) {
    await steel.deleteSession(w.steelSessionId).catch(() => {})
  }
  await db.browserWorkspace.update({ where: { id }, data: { status: 'stopped' } })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'update',
    resourceType: 'workspace',
    resourceId: id,
    req,
    afterJson: { status: 'stopped' },
  })

  return { id, stopped: true }
})
