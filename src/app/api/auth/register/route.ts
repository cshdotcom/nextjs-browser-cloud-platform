import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk } from '@/lib/api'
import { hashPassword, generateToken, getClientIp, getUserAgent } from '@/lib/crypto'
import { validatePassword } from '@/lib/password-policy'
import { getSecuritySettings } from '@/lib/security-settings'
import { checkEmailCodeSendRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { sendVerificationCodeEmail } from '@/lib/email'

// POST /api/auth/register
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, password, name } = body as { email?: string; password?: string; name?: string }
  if (!email || !password) return apiError('请输入邮箱和密码', 422)
  const settings = await getSecuritySettings()
  if (!settings.allowRegistration) return apiError('管理员已关闭注册功能', 403)

  const exists = await db.user.findUnique({ where: { email: email.toLowerCase() } })
  if (exists) return apiError('该邮箱已被注册', 409)

  const pwCheck = await validatePassword(password, [email, name ?? ''])
  if (!pwCheck.ok) return apiError(pwCheck.reasons.join('；'), 422)

  const hash = await hashPassword(password)
  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      emailVerified: false,
      status: 'active',
      role: 'user',
      password: { create: { hash } },
    },
  })

  await audit({ userId: user.id, eventType: 'register', req, metadata: { email } })

  if (settings.requireEmailActivation) {
    // send activation code
    const rl = checkEmailCodeSendRateLimit(email, settings.emailCodeSendIntervalSeconds, settings.emailCodeMaxPerHour)
    if (!rl.ok) return apiError('验证码发送过于频繁，请稍后再试', 429)
    // reuse generateToken approach via code
    const { generateNumericCode } = await import('@/lib/crypto')
    const code = generateNumericCode(6)
    await db.emailVerificationCode.create({
      data: {
        userId: user.id,
        email: email.toLowerCase(),
        code,
        purpose: 'register',
        expiresAt: new Date(Date.now() + settings.emailCodeTtlMinutes * 60 * 1000),
      },
    })
    await sendVerificationCodeEmail(email.toLowerCase(), code, 'register')
    return apiOk({ stage: 'activation_required', email })
  }

  // No activation required: auto-login not performed (user must login)
  return apiOk({ stage: 'success', email })
}
