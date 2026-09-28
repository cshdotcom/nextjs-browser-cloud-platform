import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// PATCH /api/platform/tokens/[id] — update name/scopes/expireAt
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  scopes: z.array(z.string()).optional(),
  expireAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
  ipWhitelist: z.array(z.string()).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)

  const before = await db.apiToken.findFirst({ where: { id, userId: s.uid, deletedAt: null } })
  if (!before) {
    throw new ValidationError('Token 不存在或不属于当前用户', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.scopes !== undefined) patch.scopes = JSON.stringify(body.scopes)
  if (body.expireAt !== undefined) patch.expireAt = body.expireAt ? new Date(body.expireAt) : null
  if (body.enabled !== undefined) patch.enabled = body.enabled
  if (body.ipWhitelist !== undefined) patch.ipWhitelist = body.ipWhitelist.length ? JSON.stringify(body.ipWhitelist) : null

  await db.apiToken.update({ where: { id }, data: patch })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'update',
    resourceType: 'token',
    resourceId: id,
    req,
    beforeJson: { name: before.name, expireAt: before.expireAt, enabled: before.enabled },
    afterJson: patch,
  })

  return { id }
})

// DELETE /api/platform/tokens/[id] — soft-delete
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const token = await db.apiToken.findFirst({ where: { id, userId: s.uid, deletedAt: null } })
  if (!token) {
    throw new ValidationError('Token 不存在或不属于当前用户', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  await db.apiToken.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'delete',
    resourceType: 'token',
    resourceId: id,
    req,
    beforeJson: { name: token.name, prefix: token.prefix },
  })

  return { id, revoked: true }
})
