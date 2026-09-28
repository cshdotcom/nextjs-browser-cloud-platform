import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth, killOtherSessions } from '@/lib/session'
import { verifyPassword, hashPassword } from '@/lib/crypto'
import { validatePassword } from '@/lib/password-policy'
import { getSecuritySettings } from '@/lib/security-settings'
import { audit } from '@/lib/audit'
import { decryptSecret } from '@/lib/crypto'
import { verifyTotp } from '@/lib/totp'
import { checkTwoFactorRateLimit } from '@/lib/rate-limit'

// POST /api/account/password — change password (verify old; optional 2FA when enabled)
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { oldPassword, newPassword, twofaCode } = body as {
    oldPassword?: string
    newPassword?: string
    twofaCode?: string
  }
  if (!oldPassword || !newPassword) return apiError('参数不完整', 422)

  const user = await db.user.findUnique({ where: { id: s.uid }, include: { password: { include: { history: true } }, twoFactor: true } })
  if (!user) return apiError('用户不存在', 404)
  if (!user.password) return apiError('账号未设置密码', 400)

  const ok = await verifyPassword(oldPassword, user.password.hash)
  if (!ok) {
    await audit({ userId: s.uid, eventType: 'password_error', severity: 'warning', req, metadata: { stage: 'change' } })
    return apiError('原密码错误', 401)
  }

  const pwCheck = await validatePassword(newPassword, [user.email, user.name ?? ''])
  if (!pwCheck.ok) return apiError(pwCheck.reasons.join('；'), 422)
  if (oldPassword === newPassword) return apiError('新密码不能与旧密码相同', 422)

  // Password history reuse check
  const settings = await getSecuritySettings()
  if (settings.passwordHistoryCount > 0) {
    const recent = user.password.history
      .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
      .slice(0, settings.passwordHistoryCount)
    for (const h of recent) {
      if (await verifyPassword(newPassword, h.hash)) {
        return apiError(`新密码不能与最近 ${settings.passwordHistoryCount} 次使用过的密码重复`, 422)
      }
    }
  }

  // If 2FA enabled, require TOTP
  if (user.twoFactorEnabled) {
    if (!twofaCode) return apiError('请输入 2FA 验证码', 422)
    const rl = checkTwoFactorRateLimit(s.uid)
    if (!rl.ok) return apiError('尝试过于频繁', 429)
    if (!user.twoFactor?.encryptedSecret) return apiError('2FA 异常', 400)
    const secret = decryptSecret({
      ciphertext: user.twoFactor.encryptedSecret,
      iv: user.twoFactor.iv,
      tag: user.twoFactor.tag,
    })
    if (!verifyTotp(twofaCode, secret)) {
      await audit({ userId: s.uid, eventType: 'twofa_verify_failed', severity: 'warning', req, metadata: { stage: 'change_password' } })
      return apiError('2FA 验证码错误', 401)
    }
  }

  // Save old hash to history, then update
  await db.passwordHistory.create({
    data: { credentialId: user.password.id, hash: user.password.hash },
  })
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

  const hash = await hashPassword(newPassword)
  await db.passwordCredential.update({ where: { userId: user.id }, data: { hash, changedAt: new Date(), mustChange: false } })

  // Auto-revoke all other sessions
  const revoked = await killOtherSessions(user.id, s.sid)

  // Auto-revoke API tokens if configured
  let tokensRevoked = 0
  if (settings.autoRevokeTokensOnSecurityChange) {
    const r = await db.apiToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    tokensRevoked = r.count
  }

  await audit({ userId: s.uid, eventType: 'password_change', severity: 'warning', req, metadata: { sessionsRevoked: revoked, tokensRevoked } })
  return apiOk({ changed: true, sessionsRevoked: revoked, tokensRevoked })
}
