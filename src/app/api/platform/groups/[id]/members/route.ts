import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// POST /api/platform/groups/[id]/members — add members
// Body: { members: [{ userId, role?: 'member' | 'admin' }] }
const AddMembersBodySchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string(),
        role: z.enum(['member', 'admin', 'owner']).default('member'),
      }),
    )
    .min(1)
    .max(500),
})

export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await parseBody(req, AddMembersBodySchema)
  const group = await db.userGroup.findUnique({ where: { id } })
  if (!group || group.deletedAt) {
    throw new ValidationError('用户组不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Verify all users exist
  const users = await db.user.findMany({
    where: { id: { in: body.members.map((m) => m.userId) }, deletedAt: null },
    select: { id: true },
  })
  const foundIds = new Set(users.map((u) => u.id))
  const missing = body.members.filter((m) => !foundIds.has(m.userId))
  if (missing.length > 0) {
    throw new BizError('部分用户不存在或已删除', {
      code: 'VALIDATION_FAILED',
      httpStatus: 422,
      data: { missing: missing.map((m) => m.userId) },
    })
  }

  // Filter to users not yet in group (SQLite has no skipDuplicates on createMany)
  const existing = await db.groupUser.findMany({
    where: { groupId: id, userId: { in: body.members.map((m) => m.userId) } },
    select: { userId: true },
  })
  const taken = new Set(existing.map((g) => g.userId))
  const toInsert = body.members.filter((m) => !taken.has(m.userId))
  if (toInsert.length > 0) {
    await db.groupUser.createMany({
      data: toInsert.map((m) => ({ groupId: id, userId: m.userId, role: m.role })),
    })
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'group',
    resourceId: id,
    req,
    afterJson: { added: toInsert.map((m) => m.userId), skipped: Array.from(taken) },
  })

  return { added: toInsert.length, skipped: taken.size }
})

// DELETE /api/platform/groups/[id]/members — remove members
// Body: { userIds: [string] }
const RemoveMembersBodySchema = z.object({
  userIds: z.array(z.string()).min(1).max(500),
})

export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await parseBody(req, RemoveMembersBodySchema)
  const result = await db.groupUser.deleteMany({
    where: { groupId: id, userId: { in: body.userIds } },
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'group',
    resourceId: id,
    req,
    afterJson: { removed: result.count, userIds: body.userIds },
  })

  return { removed: result.count }
})
