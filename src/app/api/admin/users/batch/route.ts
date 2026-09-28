import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin, killAllSessions } from '@/lib/session'
import { audit } from '@/lib/audit'
import { getSecuritySettings } from '@/lib/security-settings'

// POST /api/admin/users/batch
// Body: { ids: string[], action: 'forcePasswordChange' | 'disable' | 'enable' | 'forceLogout' | 'clearLockout' }
// Performs the same action on multiple users at once.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  const body = await req.json().catch(() => ({}))
  const { ids, action } = body as { ids?: string[]; action?: string }
  if (!ids || !Array.isArray(ids) || ids.length === 0) return apiError('请选择至少一个用户', 422)
  if (ids.length > 500) return apiError('单次批量操作不超过 500 个用户', 422)
  if (!action) return apiError('请指定操作类型', 422)

  const settings = await getSecuritySettings()
  let affected = 0
  const summary: Record<string, unknown> = { action, count: ids.length }

  if (action === 'forcePasswordChange') {
    await db.passwordCredential.updateMany({
      where: { userId: { in: ids } },
      data: { mustChange: true },
    })
    affected = ids.length
  } else if (action === 'disable') {
    const r = await db.user.updateMany({
      where: { id: { in: ids } },
      data: { status: 'disabled' },
    })
    affected = r.count
    // kill all sessions for disabled users
    for (const id of ids) {
      await killAllSessions(id).catch(() => {})
    }
    // auto-revoke tokens if configured
    if (settings.autoRevokeTokensOnSecurityChange) {
      const tr = await db.apiToken.updateMany({
        where: { userId: { in: ids }, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      summary.tokensRevoked = tr.count
    }
  } else if (action === 'enable') {
    const r = await db.user.updateMany({
      where: { id: { in: ids } },
      data: { status: 'active' },
    })
    affected = r.count
  } else if (action === 'forceLogout') {
    let count = 0
    for (const id of ids) {
      count += await killAllSessions(id).catch(() => 0)
    }
    affected = count
    summary.sessionsKilled = count
  } else if (action === 'clearLockout') {
    const r = await db.user.updateMany({
      where: { id: { in: ids } },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
    affected = r.count
  } else {
    return apiError('未知的操作类型', 422)
  }

  summary.affected = affected
  await audit({
    actorId: admin.uid,
    eventType: 'admin_user_disable',
    severity: 'warning',
    req,
    metadata: summary,
  })

  return apiOk({ affected, summary })
}
