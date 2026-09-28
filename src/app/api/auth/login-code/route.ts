import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk } from '@/lib/api'
import { getClientIp, getUserAgent, generateNumericCode, timingSafeEqualStr } from '@/lib/crypto'
import { getSecuritySettings } from '@/lib/security-settings'
import { checkEmailCodeSendRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { sendVerificationCodeEmail } from '@/lib/email'
import { verifyCaptcha } from '@/lib/captcha'

// POST /api/auth/login-code — request an email login / forgot-password / register code
// Body: { email, purpose, captchaToken, captchaAnswer }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, purpose = 'login', captchaToken, captchaAnswer } = body as {
    email?: string; purpose?: string; captchaToken?: string; captchaAnswer?: string
  }
  if (!email) return apiError('请输入邮箱', 422)
  const settings = await getSecuritySettings()
  if (purpose === 'login' && !settings.allowEmailCodeLogin) {
    return apiError('管理员已关闭邮箱验证码登录', 403)
  }

  // Captcha verification (if enabled)
  if (settings.enableLoginCaptcha) {
    const cap = verifyCaptcha(captchaToken, captchaAnswer)
    if (!cap.ok) {
      return apiError('图形验证码错误或已过期', 422)
    }
  }

  // Rate limit per email (gap + per hour)
  const rl = checkEmailCodeSendRateLimit(email, settings.emailCodeSendIntervalSeconds, settings.emailCodeMaxPerHour)
  if (!rl.ok) {
    return apiError('验证码发送过于频繁，请稍后再试', 429)
  }

  const ttlMs = settings.emailCodeTtlMinutes * 60 * 1000
  const code = generateNumericCode(6)
  const ip = getClientIp(req)
  const ua = getUserAgent(req)

  // For login purpose we must ensure user exists; but to prevent enumeration we
  // always return success-looking response. We just don't send a code if no user.
  let userId: string | null = null
  if (purpose === 'login' || purpose === 'forgot-password') {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (user) userId = user.id
  }

  // Persist code
  await db.emailVerificationCode.create({
    data: {
      userId,
      email: email.toLowerCase(),
      code,
      purpose,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  })

  if (userId || purpose === 'register' || purpose === 'change-email') {
    await sendVerificationCodeEmail(email.toLowerCase(), code, purpose)
  }

  await audit({
    userId: userId ?? undefined,
    eventType: purpose === 'forgot-password' ? 'forgot_password_requested' : 'login_success',
    severity: 'info',
    req,
    metadata: { purpose, email, sent: !!userId || purpose === 'register' || purpose === 'change-email' },
  })

  // Always return generic ok to avoid enumeration
  return apiOk({ sent: true, ttlSeconds: Math.floor(ttlMs / 1000) })
}

// Verify a code (used by login-code verify and register-activate)
export async function verifyCode(opts: {
  email: string
  code: string
  purpose: string
  req: Request
}): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const { email, code, purpose, req } = opts
  const rows = await db.emailVerificationCode.findMany({
    where: { email: email.toLowerCase(), purpose, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  if (rows.length === 0) return { ok: false, reason: 'expired_or_none' }

  let matched: typeof rows[number] | null = null
  for (const r of rows) {
    if (timingSafeEqualStr(r.code, code)) {
      matched = r
      break
    }
  }

  if (!matched) {
    // increment attempts on most recent
    const recent = rows[0]
    await db.emailVerificationCode.update({
      where: { id: recent.id },
      data: { attempts: { increment: 1 } },
    })
    await audit({ eventType: 'email_code_error', severity: 'warning', req, metadata: { email, purpose } })
    return { ok: false, reason: 'invalid' }
  }

  // consume
  await db.emailVerificationCode.update({ where: { id: matched.id }, data: { consumed: true } })
  return { ok: true, userId: matched.userId ?? undefined }
}
