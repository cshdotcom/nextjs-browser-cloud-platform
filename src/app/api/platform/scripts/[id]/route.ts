import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// GET /api/platform/scripts/[id] — detail (admin: full source; user: metadata only)
export const GET = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const sc = await db.browserScriptTemplate.findUnique({ where: { id } })
  if (!sc || sc.deletedAt) {
    throw new ValidationError('脚本不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (!sc.enabled && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('脚本未启用', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const isAdmin = s.role === 'admin' || s.role === 'superadmin'
  return {
    id: sc.id,
    name: sc.name,
    version: sc.version,
    enabled: sc.enabled,
    boundDomains: sc.boundDomains ? JSON.parse(sc.boundDomains) : [],
    sourceCode: isAdmin ? sc.sourceCode : undefined,
    createdAt: sc.createdAt,
    updatedAt: sc.updatedAt,
  }
})

// PATCH /api/platform/scripts/[id]
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  sourceCode: z.string().min(1).max(1024 * 1024).optional(),
  version: z.string().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  boundDomains: z.array(z.string()).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  if (s.role !== 'admin' && s.role !== 'superadmin') {
    throw new BizError('仅管理员可修改脚本模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)
  const before = await db.browserScriptTemplate.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('脚本不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.sourceCode !== undefined) patch.sourceCode = body.sourceCode
  if (body.version !== undefined) patch.version = body.version
  if (body.enabled !== undefined) patch.enabled = body.enabled
  if (body.boundDomains !== undefined) patch.boundDomains = body.boundDomains.length ? JSON.stringify(body.boundDomains) : null
  const updated = await db.browserScriptTemplate.update({ where: { id }, data: patch })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'update',
    resourceType: 'script',
    resourceId: id,
    req,
    beforeJson: { name: before.name, version: before.version, enabled: before.enabled },
    afterJson: { name: updated.name, version: updated.version, enabled: updated.enabled },
  })

  return { id: updated.id }
})

// DELETE /api/platform/scripts/[id] — soft-delete
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  if (s.role !== 'admin' && s.role !== 'superadmin') {
    throw new BizError('仅管理员可删除脚本模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const { id } = await ctx.params
  const sc = await db.browserScriptTemplate.findUnique({ where: { id } })
  if (!sc || sc.deletedAt) {
    throw new ValidationError('脚本不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  await db.browserScriptTemplate.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'delete',
    resourceType: 'script',
    resourceId: id,
    req,
    beforeJson: { name: sc.name, version: sc.version },
  })

  return { id, deleted: true }
})
