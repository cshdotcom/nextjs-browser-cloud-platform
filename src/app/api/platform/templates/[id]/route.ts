import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'
import { snapshotToRecycleBin, snapshotTemplate } from '@/lib/recycle'

// GET /api/platform/templates/[id] — detail
export const GET = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const tpl = await db.browserTemplate.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, username: true, displayName: true } },
      parent: { select: { id: true, name: true } },
      modifyRules: true,
    },
  })
  if (!tpl || tpl.deletedAt) {
    throw new ValidationError('模板不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (
    tpl.ownerId !== s.uid &&
    s.role !== 'admin' &&
    s.role !== 'superadmin' &&
    !(tpl.visibility === 'global') &&
    !(tpl.visibility === 'group' && tpl.groupId === null)
  ) {
    throw new ValidationError('无权访问该模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  return {
    id: tpl.id,
    name: tpl.name,
    visibility: tpl.visibility,
    ownerId: tpl.ownerId,
    owner: tpl.owner,
    groupId: tpl.groupId,
    parentId: tpl.parentId,
    parent: tpl.parent,
    config: tpl.config ? JSON.parse(tpl.config) : null,
    modifyRules: tpl.modifyRules,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
  }
})

// PATCH /api/platform/templates/[id]
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  visibility: z.enum(['private', 'group', 'global']).optional(),
  groupId: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)
  const tpl = await db.browserTemplate.findUnique({ where: { id } })
  if (!tpl || tpl.deletedAt) {
    throw new ValidationError('模板不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (tpl.ownerId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权修改该模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.visibility !== undefined) patch.visibility = body.visibility
  if (body.groupId !== undefined) patch.groupId = body.groupId
  if (body.config !== undefined) patch.config = JSON.stringify(body.config)
  const updated = await db.browserTemplate.update({ where: { id }, data: patch })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'update',
    resourceType: 'template',
    resourceId: id,
    req,
    beforeJson: { name: tpl.name, visibility: tpl.visibility },
    afterJson: { name: updated.name, visibility: updated.visibility },
  })

  return { id: updated.id }
})

// DELETE /api/platform/templates/[id] — soft-delete
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const tpl = await db.browserTemplate.findUnique({ where: { id } })
  if (!tpl || tpl.deletedAt) {
    throw new ValidationError('模板不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (tpl.ownerId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权删除该模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  await db.browserTemplate.update({ where: { id }, data: { deletedAt: new Date() } })

  // Snapshot to recycle bin
  await snapshotToRecycleBin({
    resourceType: 'template',
    resourceId: id,
    snapshot: snapshotTemplate(tpl),
    deletedBy: s.uid,
  })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'delete',
    resourceType: 'template',
    resourceId: id,
    req,
    beforeJson: { name: tpl.name, visibility: tpl.visibility },
  })

  return { id, deleted: true }
})
