import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk, describeDevice, buildDeviceId } from '@/lib/api'
import { getClientIp, getUserAgent, verifyPassword, hashPassword } from '@/lib/crypto'
import { getPending2fa, clearPending2fa, createSession } from '@/lib/session'
import { getSecuritySettings, userRequiresTwoFactor } from '@/lib/security-settings'
import { validatePassword } from '@/lib/password-policy'
import { audit } from '@/lib/audit'

// POST /api/auth/change-expired-password
// Used when login returned stage='password_change_required' (expired or admin-forced).
// The pending-2fa cookie (method='password-expiry') authorizes this flow.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { oldPassword, newPassword } = body as { oldPassword?: string; newPassword?: string }
  if (!oldPassword || !newPassword) return apiError('请输入旧密码与新密码', 422)

  const pending = await getPending2fa()
  if (!pending || pending.method !== 'password-expiry') {
    return apiError('无有效的密码修改流程，请重新登录', 401)
  }

  const user = await db.user.findUnique({
    where: { id: pending.uid },
    include: { password: { include: { history: true } }, group: true },
  })
  if (!user || !user.password) return apiError('用户或密码记录不存在', 404)

  // Re-verify old password for safety
  const ok = await verifyPassword(oldPassword, user.password.hash)
  if (!ok) return apiError('旧密码错误', 401)

  // Validate new password policy
  const pwCheck = await validatePassword(newPassword, [user.email, user.name ?? ''])
  if (!pwCheck.ok) return apiError(pwCheck.reasons.join('；'), 422)
  if (oldPassword === newPassword) return apiError('新密码不能与旧密码相同', 422)

  const settings = await getSecuritySettings()

  // Password history reuse check
  if (settings.passwordHistoryCount > 0) {
    const recent = user.password.history
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
      .slice(0, settings.passwordHistoryCount)
    for (const h of recent) {
      if (await verifyPassword(newPassword, h.hash)) {
        return apiError(`新密码不能与最近 ${settings.passwordHistoryCount} 次使用过的密码重复`, 422)
      }
    }
    // Also check current hash
    if (await verifyPassword(newPassword, user.password.hash)) {
      return apiError('新密码不能与当前密码相同', 422)
    }
  }

  // Save old hash to history, then update
  await db.passwordHistory.create({
    data: { credentialId: user.password.id, hash: user.password.hash },
  })
  // Trim history to configured count + a small buffer
  if (settings.passwordHistoryCount > 0) {
    const allHistory = await db.passwordHistory.findMany({
      where: { credentialId: user.password.id },
      orderBy: { changedAt: 'desc' },
    })
    const toDelete = allHistory.slice(settings.passwordHistoryCount)
    if (toDelete.length > 0) {
      await db.passwordHistory.deleteMany({ where: { id: { in: toDelete.map((h) => h.id) } } })
    }
  }

  const newHash = await hashPassword(newPassword)
  await db.passwordCredential.update({
    where: { userId: user.id },
    data: { hash: newHash, changedAt: new Date(), mustChange: false },
  })

  await audit({
    userId: user.id,
    eventType: 'password_change',
    severity: 'warning',
    req,
    metadata: { reason: 'expired_or_forced', stage: 'login_forced' },
  })

  // Now check if 2FA is still required before issuing full session
  const forceTwoFactor = await userRequiresTwoFactor(user.id)
  const needsTwoFactor = user.twoFactorEnabled || forceTwoFactor
  const ip = getClientIp(req)
  const ua = getUserAgent(req)
  const acceptLang = req.headers.get('accept-language') || ''
  const deviceId = buildDeviceId(ua, acceptLang)

  if (needsTwoFactor) {
    // Switch the pending method to 'password' so the 2FA gate shows
    await clearPending2fa()
    // Re-set pending for 2FA
    const { setPending2fa } = await import('@/lib/session')
    await setPending2fa({ uid: user.id, email: user.email, method: 'password' })
    return apiOk({
      stage: 'twofa_required',
      email: user.email,
      twoFactorEnabled: true,
      forceTwoFactor,
      passwordChanged: true,
    })
  }

  // Issue full session
  await clearPending2fa()
  const { sessionId } = await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    remember: false,
    req,
    twoFactorDone: true,
    trusted: false,
    maxLifetimeHours: settings.sessionMaxLifetimeHours,
    idleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
  })

  void deviceId
  void describeDevice

  return apiOk({
    stage: 'success',
    passwordChanged: true,
    sessionId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  })
}
