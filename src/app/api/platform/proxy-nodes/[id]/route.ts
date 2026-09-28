import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// PATCH /api/platform/proxy-nodes/[id]
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  socksAddress: z.string().nullable().optional(),
  httpAddress: z.string().nullable().optional(),
  status: z.enum(['active', 'draining', 'offline', 'error']).optional(),
  tags: z.array(z.string()).optional(),
  weight: z.number().int().min(1).max(100).optional(),
  groupId: z.string().nullable().optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)
  const before = await db.proxyNode.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('代理节点不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Internal singbox proxies cannot have their socks address overridden
  if (before.type === 'internal_singbox' && (body.socksAddress !== undefined || body.httpAddress !== undefined)) {
    throw new ValidationError('内置 Sing-Box 代理节点的 socks/http 地址不允许直接修改', {
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
    })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.socksAddress !== undefined) patch.socksAddress = body.socksAddress
  if (body.httpAddress !== undefined) patch.httpAddress = body.httpAddress
  if (body.status !== undefined) patch.status = body.status
  if (body.tags !== undefined) patch.tags = body.tags.length ? JSON.stringify(body.tags) : null
  if (body.weight !== undefined) patch.weight = body.weight
  if (body.groupId !== undefined) patch.groupId = body.groupId
  const updated = await db.proxyNode.update({ where: { id }, data: patch })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'proxy',
    resourceId: id,
    req,
    beforeJson: { name: before.name, status: before.status },
    afterJson: { name: updated.name, status: updated.status },
  })

  return { id: updated.id }
})

// DELETE /api/platform/proxy-nodes/[id]
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const proxy = await db.proxyNode.findUnique({ where: { id } })
  if (!proxy || proxy.deletedAt) {
    throw new ValidationError('代理节点不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  await db.proxyNode.update({ where: { id }, data: { deletedAt: new Date(), status: 'offline' } })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'delete',
    resourceType: 'proxy',
    resourceId: id,
    req,
    beforeJson: { name: proxy.name, type: proxy.type },
  })

  return { id, deleted: true }
})
