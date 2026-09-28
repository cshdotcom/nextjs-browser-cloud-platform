import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// PATCH /api/platform/host-nodes/[id]
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  dockerApiUrl: z.string().min(1).max(1024).optional(),
  cpuTotal: z.number().min(0.001).max(1024).optional(),
  memoryTotal: z.number().min(1).max(1048576).optional(),
  label: z.string().max(128).nullable().optional(),
  status: z.enum(['active', 'draining', 'offline', 'error']).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireSuperadmin()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)
  const before = await db.hostNode.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('宿主机不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Validate resources aren't being shrunk below current usage
  if (body.cpuTotal !== undefined && body.cpuTotal < before.cpuUsed) {
    throw new BizError('CPU 总量不能小于已用量', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { cpuTotal: body.cpuTotal, cpuUsed: before.cpuUsed },
    })
  }
  if (body.memoryTotal !== undefined && body.memoryTotal < before.memoryUsed) {
    throw new BizError('内存总量不能小于已用量', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { memoryTotal: body.memoryTotal, memoryUsed: before.memoryUsed },
    })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.dockerApiUrl !== undefined) patch.dockerApiUrl = body.dockerApiUrl
  if (body.cpuTotal !== undefined) patch.cpuTotal = body.cpuTotal
  if (body.memoryTotal !== undefined) patch.memoryTotal = body.memoryTotal
  if (body.label !== undefined) patch.label = body.label
  if (body.status !== undefined) patch.status = body.status
  const updated = await db.hostNode.update({ where: { id }, data: patch })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'host',
    resourceId: id,
    req,
    beforeJson: { name: before.name, status: before.status },
    afterJson: { name: updated.name, status: updated.status },
  })

  return { id: updated.id }
})

// DELETE /api/platform/host-nodes/[id]
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireSuperadmin()
  const { id } = await ctx.params
  const host = await db.hostNode.findUnique({ where: { id } })
  if (!host || host.deletedAt) {
    throw new ValidationError('宿主机不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Block delete when there are still running singbox instances
  const active = await db.singboxInstance.count({
    where: { hostNodeId: id, deletedAt: null, status: { in: ['running', 'creating', 'restarting'] } },
  })
  if (active > 0) {
    throw new BizError('宿主机下仍有运行中的 Sing-Box 实例，禁止删除', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { activeInstances: active },
    })
  }
  await db.hostNode.update({ where: { id }, data: { deletedAt: new Date(), status: 'offline' } })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'delete',
    resourceType: 'host',
    resourceId: id,
    req,
    beforeJson: { name: host.name, dockerApiUrl: host.dockerApiUrl },
  })

  return { id, deleted: true }
})
