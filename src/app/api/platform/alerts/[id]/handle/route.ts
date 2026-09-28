import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// POST /api/platform/alerts/[id]/handle — mark handled
export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const alert = await db.alert.findUnique({ where: { id } })
  if (!alert) {
    throw new ValidationError('告警不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (alert.handleStatus === 'handled') {
    return { id, alreadyHandled: true }
  }
  await db.alert.update({
    where: { id },
    data: { handleStatus: 'handled', handledBy: admin.uid, handledAt: new Date() },
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'alert',
    resourceId: id,
    req,
    beforeJson: { handleStatus: alert.handleStatus },
    afterJson: { handleStatus: 'handled' },
  })

  return { id, handled: true }
})
