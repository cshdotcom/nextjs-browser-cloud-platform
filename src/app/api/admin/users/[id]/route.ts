import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'
import { killAllSessions } from '@/lib/session'
import { getSecuritySettings } from '@/lib/security-settings'

// PATCH /api/admin/users/[id] — update user (status, role, groupId, force reset attempts)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const { status, role, groupId, clearLockout, forcePasswordChange } = body as {
    status?: string
    role?: string
    groupId?: string | null
    clearLockout?: boolean
    forcePasswordChange?: boolean
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)

  const patch: Record<string, unknown> = {}
  if (status) patch.status = status
  if (role) patch.role = role
  if (groupId !== undefined) patch.groupId = groupId || null
  if (clearLockout) {
    patch.failedLoginAttempts = 0
    patch.lockedUntil = null
  }
  const updated = await db.user.update({ where: { id }, data: patch })

  // Force password change on next login
  if (forcePasswordChange === true) {
    await db.passwordCredential.updateMany({ where: { userId: id }, data: { mustChange: true } })
    await audit({ userId: id, actorId: admin.uid, eventType: 'admin_user_disable', severity: 'warning', req, metadata: { action: 'force_password_change' } })
  }

  // If user disabled, kill all sessions
  if (status === 'disabled' || status === 'suspended') {
    await killAllSessions(id)
  }
  // Auto revoke tokens if configured
  const settings = await getSecuritySettings()
  let tokensRevoked = 0
  if (settings.autoRevokeTokensOnSecurityChange && (status === 'disabled' || status === 'suspended')) {
    const r = await db.apiToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    tokensRevoked = r.count
  }

  await audit({ userId: id, actorId: admin.uid, eventType: 'admin_user_disable', severity: 'warning', req, metadata: { patch, tokensRevoked, forcePasswordChange } })
  return apiOk({ user: { id: updated.id, status: updated.status, role: updated.role, groupId: updated.groupId } })
}
