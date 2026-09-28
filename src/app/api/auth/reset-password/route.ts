import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk } from '@/lib/api'
import { verifyCode } from '@/app/api/auth/login-code/route'
import { hashPassword } from '@/lib/crypto'
import { validatePassword } from '@/lib/password-policy'
import { getSecuritySettings } from '@/lib/security-settings'
import { audit } from '@/lib/audit'
import { killAllSessions } from '@/lib/session'

// POST /api/auth/forgot-password is handled by /api/auth/login-code with purpose=forgot-password
// POST /api/auth/reset-password — verify code then reset
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, code, newPassword } = body as { email?: string; code?: string; newPassword?: string }
  if (!email || !code || !newPassword) return apiError('参数不完整', 422)

  const result = await verifyCode({ email, code, purpose: 'forgot-password', req })
  if (!result.ok) return apiError('验证码错误或已过期', 401)
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) return apiError('验证码错误或已过期', 401)

  const pwCheck = await validatePassword(newPassword, [email, user.name ?? ''])
  if (!pwCheck.ok) return apiError(pwCheck.reasons.join('；'), 422)

  const hash = await hashPassword(newPassword)
  await db.passwordCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, hash },
    update: { hash, changedAt: new Date() },
  })
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  })
  await killAllSessions(user.id)
  await audit({ userId: user.id, eventType: 'password_reset', severity: 'warning', req, metadata: {} })
  return apiOk({ reset: true })
}
