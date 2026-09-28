import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin, killAllSessions } from '@/lib/session'
import { audit } from '@/lib/audit'

// POST /api/admin/users/[id]/sessions — admin views/forces logout
// GET: list user sessions; DELETE: kill all sessions of the user
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  void admin
  const { id } = await ctx.params
  const sessions = await db.session.findMany({
    where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
  })
  return apiOk({
    sessions: sessions.map((x) => ({
      id: x.id,
      deviceLabel: x.deviceLabel,
      userAgent: x.userAgent,
      ipAddress: x.ipAddress,
      isTrusted: x.isTrusted,
      remember: x.remember,
      createdAt: x.createdAt,
      lastActiveAt: x.lastActiveAt,
      expiresAt: x.expiresAt,
    })),
  })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)
  const count = await killAllSessions(id)
  await audit({ userId: id, actorId: admin.uid, eventType: 'admin_force_logout', severity: 'warning', req, metadata: { count } })
  return apiOk({ revoked: count })
}
