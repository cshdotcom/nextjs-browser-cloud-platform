import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import * as docker from '@/lib/docker-client'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// POST /api/platform/singbox-instances/[id]/stop
export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireSuperadmin()
  const { id } = await ctx.params
  const inst = await db.singboxInstance.findUnique({ where: { id } })
  if (!inst || inst.deletedAt) {
    throw new ValidationError('实例不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (!inst.dockerContainerId) {
    throw new ValidationError('实例未绑定 Docker 容器', { code: 'VALIDATION_FAILED', httpStatus: 400 })
  }
  if (inst.status === 'stopped') return { id, alreadyStopped: true }

  await docker.stopContainer(inst.dockerContainerId, 10)
  await db.singboxInstance.update({ where: { id }, data: { status: 'stopped' } })
  await db.proxyNode.updateMany({
    where: { singboxInstanceId: id },
    data: { status: 'offline' },
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'singbox',
    resourceId: id,
    req,
    afterJson: { action: 'stop' },
  })

  return { id, stopped: true }
})
