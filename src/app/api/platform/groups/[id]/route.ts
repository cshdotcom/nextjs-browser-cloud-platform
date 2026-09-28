import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'
import { snapshotToRecycleBin, snapshotGroup } from '@/lib/recycle'

// GET /api/platform/groups/[id] — detail
export const GET = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin()
  const { id } = await ctx.params
  const group = await db.userGroup.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { where: { deletedAt: null }, select: { id: true, name: true, enabled: true } },
      groupUsers: { include: { user: { select: { id: true, username: true, email: true, displayName: true } } } },
      _count: { select: { proxyNodes: true, browserWorkspaces: true, browserTemplates: true, webhookRules: true } },
    },
  })
  if (!group || group.deletedAt) {
    throw new ValidationError('用户组不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    parentId: group.parentId,
    parent: group.parent,
    children: group.children,
    enabled: group.enabled,
    enforceTwoFactor: group.enforceTwoFactor,
    admins: group.admins ? JSON.parse(group.admins) : [],
    quota: group.quota ? JSON.parse(group.quota) : null,
    members: group.groupUsers.map((m) => ({ id: m.user.id, username: m.user.username, email: m.user.email, displayName: m.user.displayName, role: m.role })),
    counts: group._count,
    createdAt: group.createdAt,
  }
})

// PATCH /api/platform/groups/[id]
const UpdateBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).optional(),
  parentId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  enforceTwoFactor: z.boolean().optional(),
  admins: z.array(z.string()).optional(),
  quota: z.record(z.string(), z.unknown()).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)

  const before = await db.userGroup.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('用户组不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (body.parentId !== undefined && body.parentId) {
    if (body.parentId === id) {
      throw new ValidationError('不能将自身设为父组', { code: 'VALIDATION_FAILED' })
    }
    // Cycle check: parentId must not be a descendant
    const desc = await collectDescendants(id)
    if (desc.has(body.parentId)) {
      throw new ValidationError('父组不能是当前组的后代', { code: 'VALIDATION_FAILED' })
    }
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.parentId !== undefined) patch.parentId = body.parentId || null
  if (body.enabled !== undefined) patch.enabled = body.enabled
  if (body.enforceTwoFactor !== undefined) patch.enforceTwoFactor = body.enforceTwoFactor
  if (body.admins !== undefined) patch.admins = JSON.stringify(body.admins)
  if (body.quota !== undefined) patch.quota = JSON.stringify(body.quota)

  const updated = await db.userGroup.update({ where: { id }, data: patch })

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
    beforeJson: { name: before.name, enabled: before.enabled },
    afterJson: { name: updated.name, enabled: updated.enabled },
  })

  return { id: updated.id }
})

// DELETE /api/platform/groups/[id] — soft-delete with checks: no children/users
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const group = await db.userGroup.findUnique({ where: { id } })
  if (!group || group.deletedAt) {
    throw new ValidationError('用户组不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  const [childCount, userCount, workspaceCount] = await Promise.all([
    db.userGroup.count({ where: { parentId: id, deletedAt: null } }),
    db.groupUser.count({ where: { groupId: id } }),
    db.browserWorkspace.count({ where: { groupId: id, deletedAt: null, status: { in: ['creating', 'running', 'idle'] } } }),
  ])
  if (childCount > 0 || userCount > 0 || workspaceCount > 0) {
    throw new BizError('用户组下存在子组、成员或运行中工作区，禁止删除', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { childCount, userCount, workspaceCount },
    })
  }

  await db.userGroup.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } })

  // Snapshot to recycle bin
  await snapshotToRecycleBin({
    resourceType: 'group',
    resourceId: id,
    snapshot: snapshotGroup(group),
    deletedBy: admin.uid,
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'delete',
    resourceType: 'group',
    resourceId: id,
    req,
    beforeJson: { name: group.name },
  })

  return { id, deleted: true }
})

async function collectDescendants(groupId: string): Promise<Set<string>> {
  const result = new Set<string>()
  const queue = [groupId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const children = await db.userGroup.findMany({
      where: { parentId: cur, deletedAt: null },
      select: { id: true },
    })
    for (const c of children) {
      if (!result.has(c.id)) {
        result.add(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}
