import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'

// GET /api/admin/dashboard — overview metrics
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 3600 * 1000)

  const [
    totalUsers,
    activeUsers,
    lockedUsers,
    disabledUsers,
    twoFactorUsers,
    activeSessions,
    activeApiTokens,
    loginSuccess24h,
    loginFailed24h,
    auditLogs24h,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: 'active' } }),
    db.user.count({ where: { lockedUntil: { gt: now } } }),
    db.user.count({ where: { status: { in: ['disabled', 'suspended'] } } }),
    db.user.count({ where: { twoFactorEnabled: true } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    db.apiToken.count({ where: { revokedAt: null } }),
    db.loginAttempt.count({ where: { success: true, createdAt: { gt: last24h } } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gt: last24h } } }),
    db.securityAuditLog.count({ where: { createdAt: { gt: last24h } } }),
  ])

  return apiOk({
    metrics: {
      totalUsers,
      activeUsers,
      lockedUsers,
      disabledUsers,
      twoFactorUsers,
      twoFactorRate: totalUsers > 0 ? Math.round((twoFactorUsers / totalUsers) * 100) : 0,
      activeSessions,
      activeApiTokens,
      loginSuccess24h,
      loginFailed24h,
      auditLogs24h,
    },
  })
}
