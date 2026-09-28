import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { hashPassword } from '@/lib/crypto'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'
import { snapshotToRecycleBin, snapshotUser } from '@/lib/recycle'

// GET /api/platform/users/[id] — detail with groups + quota usage
export const GET = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({
    where: { id },
    include: {
      group: { select: { id: true, name: true } },
      groupMemberships: { include: { group: { select: { id: true, name: true } } } },
      apiTokens: { where: { deletedAt: null }, select: { id: true, name: true, prefix: true, expireAt: true, enabled: true } },
      _count: { select: { sessions: true, browserWorkspaces: true, fileMetas: true } },
    },
  })
  if (!user || user.deletedAt) {
    throw new ValidationError('用户不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
    preferences: user.preferences ? JSON.parse(user.preferences) : null,
    primaryGroup: user.group,
    groups: user.groupMemberships.map((m) => ({ id: m.group.id, name: m.group.name, role: m.role })),
    tokens: user.apiTokens,
    counts: {
      sessions: user._count.sessions,
      workspaces: user._count.browserWorkspaces,
      files: user._count.fileMetas,
    },
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    createdAt: user.createdAt,
  }
})

// PATCH /api/platform/users/[id] — update displayName / role / status / preferences / password
const UpdateBodySchema = z.object({
  displayName: z.string().max(128).optional(),
  role: z.enum(['user', 'admin', 'superadmin']).optional(),
  status: z.enum(['active', 'suspended', 'disabled']).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  password: z.string().min(8).max(128).optional(),
  mustChangePassword: z.boolean().optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)

  const before = await db.user.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('用户不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }

  const patch: Record<string, unknown> = {}
  if (body.displayName !== undefined) patch.displayName = body.displayName
  if (body.role !== undefined) patch.role = body.role
  if (body.status !== undefined) patch.status = body.status
  if (body.preferences !== undefined) patch.preferences = JSON.stringify(body.preferences)
  if (body.mustChangePassword !== undefined) patch.mustChangePassword = body.mustChangePassword
  if (body.password) patch.passwordHash = await hashPassword(body.password)

  const updated = await db.user.update({ where: { id }, data: patch })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'user',
    resourceId: id,
    req,
    beforeJson: { role: before.role, status: before.status, displayName: before.displayName },
    afterJson: { role: updated.role, status: updated.status, displayName: updated.displayName },
  })

  return { id: updated.id }
})

// DELETE /api/platform/users/[id] — soft-delete with checks
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id } })
  if (!user || user.deletedAt) {
    throw new ValidationError('用户不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Block soft-delete when there are active sessions / tokens
  const [activeSessions, activeTokens] = await Promise.all([
    db.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.apiToken.count({ where: { userId: id, deletedAt: null, enabled: true } }),
  ])
  if (activeSessions > 0 || activeTokens > 0) {
    throw new ValidationError('用户存在活跃会话或 API-Token，禁止删除', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { activeSessions, activeTokens },
    })
  }

  await db.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'disabled' } })

  // Snapshot to recycle bin (per spec: no physical delete, all enter recycle bin)
  await snapshotToRecycleBin({
    resourceType: 'user',
    resourceId: id,
    snapshot: snapshotUser(user),
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
    resourceType: 'user',
    resourceId: id,
    req,
    beforeJson: { username: user.username, email: user.email },
  })

  return { id, deleted: true }
})
