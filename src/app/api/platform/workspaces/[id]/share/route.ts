import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody, parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/workspaces/[id]/share — list shares
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const w = await db.browserWorkspace.findUnique({ where: { id } })
  if (!w || w.deletedAt) {
    throw new ValidationError('工作区不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (w.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权查看该工作区的共享列表', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const url = new URL(req.url)
  const { skip, pageSize } = parsePagination(url)
  const where = { workspaceId: id }
  const [total, shares] = await Promise.all([
    db.workspaceShare.count({ where }),
    db.workspaceShare.findMany({
      where,
      include: { targetUser: { select: { id: true, username: true, email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])
  return {
    items: shares.map((sh) => ({
      id: sh.id,
      targetUser: sh.targetUser,
      permission: sh.permission,
      expireAt: sh.expireAt,
      createdAt: sh.createdAt,
    })),
    total,
  }
})

// POST /api/platform/workspaces/[id]/share — create share
const CreateShareBodySchema = z.object({
  targetUserId: z.string(),
  permission: z.enum(['readonly', 'operable']).default('readonly'),
  expireAt: z.string().datetime().optional(),
})

export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const body = await parseBody(req, CreateShareBodySchema)
  const w = await db.browserWorkspace.findUnique({ where: { id } })
  if (!w || w.deletedAt) {
    throw new ValidationError('工作区不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (w.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权共享该工作区', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  // Verify target user exists
  const target = await db.user.findUnique({ where: { id: body.targetUserId } })
  if (!target || target.deletedAt) {
    throw new ValidationError('目标用户不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }

  const share = await db.workspaceShare.create({
    data: {
      workspaceId: id,
      targetUserId: body.targetUserId,
      permission: body.permission,
      expireAt: body.expireAt ? new Date(body.expireAt) : null,
    },
  })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'create',
    resourceType: 'workspace',
    resourceId: id,
    req,
    afterJson: { shareId: share.id, targetUserId: body.targetUserId, permission: body.permission },
  })

  return { id: share.id, workspaceId: id, targetUserId: body.targetUserId }
})
