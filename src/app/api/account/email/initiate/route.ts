import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { generateNumericCode, timingSafeEqualStr } from '@/lib/crypto'
import { getSecuritySettings } from '@/lib/security-settings'
import { checkEmailCodeSendRateLimit } from '@/lib/rate-limit'
import { sendVerificationCodeEmail } from '@/lib/email'
import { audit } from '@/lib/audit'

// POST /api/account/email/initiate — start email change: send codes to both old & new email
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { newEmail } = body as { newEmail?: string }
  if (!newEmail) return apiError('请输入新邮箱', 422)

  const user = await db.user.findUnique({ where: { id: s.uid } })
  if (!user) return apiError('用户不存在', 404)

  const settings = await getSecuritySettings()
  // rate limit by both emails
  const rl1 = checkEmailCodeSendRateLimit(user.email, settings.emailCodeSendIntervalSeconds, settings.emailCodeMaxPerHour)
  if (!rl1.ok) return apiError('发送过于频繁，请稍后再试', 429)
  const rl2 = checkEmailCodeSendRateLimit(newEmail.toLowerCase(), settings.emailCodeSendIntervalSeconds, settings.emailCodeMaxPerHour)
  if (!rl2.ok) return apiError('发送过于频繁，请稍后再试', 429)

  const taken = await db.user.findUnique({ where: { email: newEmail.toLowerCase() } })
  if (taken) return apiError('该邮箱已被占用', 409)

  const oldCode = generateNumericCode(6)
  const newCode = generateNumericCode(6)
  const ttlMs = settings.emailCodeTtlMinutes * 60 * 1000

  await db.changeEmailRequest.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      newEmail: newEmail.toLowerCase(),
      oldEmailCode: oldCode,
      newEmailCode: newCode,
      expiresAt: new Date(Date.now() + ttlMs),
    },
    update: {
      newEmail: newEmail.toLowerCase(),
      oldEmailCode: oldCode,
      newEmailCode: newCode,
      oldEmailVerified: false,
      newEmailVerified: false,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  })

  // send to old email
  await sendVerificationCodeEmail(user.email, oldCode, 'change-email')
  // send to new email
  await sendVerificationCodeEmail(newEmail.toLowerCase(), newCode, 'change-email')

  await audit({ userId: s.uid, eventType: 'email_change', severity: 'warning', req, metadata: { stage: 'initiated', newEmail } })
  return apiOk({ sent: true, oldEmail: user.email, newEmail: newEmail.toLowerCase() })
}

// POST /api/account/email/confirm — confirm with both codes
export async function PUT_CONFIRM(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { oldCode, newCode } = body as { oldCode?: string; newCode?: string }
  if (!oldCode || !newCode) return apiError('请输入两个验证码', 422)

  const req2 = await db.changeEmailRequest.findUnique({ where: { userId: s.uid } })
  if (!req2) return apiError('没有进行中的邮箱变更', 400)
  if (req2.expiresAt < new Date()) return apiError('请求已过期，请重新发起', 410)

  if (!timingSafeEqualStr(req2.oldEmailCode, oldCode)) return apiError('旧邮箱验证码错误', 401)
  if (!timingSafeEqualStr(req2.newEmailCode, newCode)) return apiError('新邮箱验证码错误', 401)

  const user = await db.user.findUnique({ where: { id: s.uid } })
  if (!user) return apiError('用户不存在', 404)

  const oldEmail = user.email
  await db.user.update({ where: { id: s.uid }, data: { email: req2.newEmail, emailVerified: true } })
  await db.changeEmailRequest.delete({ where: { userId: s.uid } })

  await audit({ userId: s.uid, eventType: 'email_change', severity: 'warning', req, metadata: { oldEmail, newEmail: req2.newEmail } })
  return apiOk({ changed: true, newEmail: req2.newEmail })
}

export { PUT_CONFIRM as PUT }
