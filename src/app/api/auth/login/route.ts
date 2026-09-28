import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk, describeDevice, buildDeviceId } from '@/lib/api'
import { verifyPassword, getClientIp, getUserAgent } from '@/lib/crypto'
import { createSession, setPending2fa } from '@/lib/session'
import { getSecuritySettings, userRequiresTwoFactor } from '@/lib/security-settings'
import { checkLoginIpRateLimit, checkLoginIdentifierRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { detectAndAlertAnomaly } from '@/lib/anomaly'
import { verifyCaptcha } from '@/lib/captcha'
import { evaluateRules } from '@/lib/risk-engine'

// POST /api/auth/login — password login
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { identifier, password, remember, trustedDevice, captchaToken, captchaAnswer } = body as {
    identifier?: string
    password?: string
    remember?: boolean
    trustedDevice?: boolean
    captchaToken?: string
    captchaAnswer?: string
  }
  if (!identifier || !password) return apiError('请输入账号和密码', 422)

  const settings = await getSecuritySettings()
  const ip = getClientIp(req)
  const ua = getUserAgent(req)
  const acceptLang = req.headers.get('accept-language') || ''
  const deviceId = buildDeviceId(ua, acceptLang)

  // Captcha verification (if enabled)
  if (settings.enableLoginCaptcha) {
    const cap = verifyCaptcha(captchaToken, captchaAnswer)
    if (!cap.ok) {
      return apiError('验证码错误或已过期', 422)
    }
  }

  // Rate limits (do not reveal whether account exists)
  const ipRl = checkLoginIpRateLimit(ip)
  if (!ipRl.ok) {
    await audit({ eventType: 'rate_limit_hit', severity: 'warning', req, metadata: { scope: 'login:ip', ip } })
    return apiError('请求过于频繁，请稍后再试', 429)
  }
  const idRl = checkLoginIdentifierRateLimit(identifier)
  if (!idRl.ok) {
    await audit({ eventType: 'rate_limit_hit', severity: 'warning', req, metadata: { scope: 'login:id', identifier } })
    return apiError('该账号尝试过于频繁，请稍后再试', 429)
  }

  const user = await db.user.findFirst({
    where: { email: identifier.toLowerCase() },
    include: { password: true, group: true },
  })

  // Always perform a bcrypt compare to keep timing similar even if user not found
  const dummyHash = '$2a$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV1234567890ab'
  // Support both legacy PasswordCredential relation and new direct passwordHash field
  const hashToCompare = user?.passwordHash ?? user?.password?.hash ?? dummyHash
  const passwordOk = user ? await verifyPassword(password, hashToCompare) : false

  await db.loginAttempt.create({
    data: {
      userId: user?.id ?? null,
      identifier,
      success: passwordOk,
      reason: passwordOk ? null : 'invalid_credentials',
      ipAddress: ip,
      userAgent: ua,
    },
  })

  if (!user || !passwordOk) {
    if (user) {
      const failed = user.failedLoginAttempts + 1
      const lockThreshold = settings.maxFailedLoginAttempts
      const shouldLock = failed >= lockThreshold
      const lockedUntil = shouldLock
        ? new Date(Date.now() + settings.lockoutDurationMinutes * 60 * 1000)
        : user.lockedUntil
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failed,
          lockedUntil: shouldLock ? lockedUntil : user.lockedUntil,
        },
      })
      if (shouldLock) {
        await audit({
          userId: user.id,
          eventType: 'account_locked',
          severity: 'critical',
          req,
          metadata: { failed, durationMin: settings.lockoutDurationMinutes },
        })
      } else {
        await audit({
          userId: user.id,
          eventType: 'password_error',
          severity: 'warning',
          req,
          metadata: { failed },
        })
      }
      // Evaluate risk rules on login failure
      await evaluateRules({
        userId: user.id,
        eventType: 'login_failed',
        severity: 'warning',
        ipAddress: ip,
        userAgent: ua,
        req,
      })
    } else {
      await audit({
        eventType: 'login_failed',
        severity: 'warning',
        req,
        metadata: { identifier, reason: 'no_user' },
      })
    }
    return apiError('账号或密码错误', 401)
  }

  if (user.status !== 'active') {
    await audit({
      userId: user.id,
      eventType: 'login_failed',
      severity: 'warning',
      req,
      metadata: { reason: 'account_disabled' },
    })
    return apiError('账号已被禁用，请联系管理员', 403)
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({
      userId: user.id,
      eventType: 'login_failed',
      severity: 'warning',
      req,
      metadata: { reason: 'locked', lockedUntil: user.lockedUntil },
    })
    return apiError('账号已被临时锁定，请稍后再试', 423)
  }

  if (settings.requireEmailActivation && !user.emailVerified) {
    return apiError('账号尚未激活，请前往邮箱查收激活邮件', 403)
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  })

  const rememberBool = !!remember
  let trustedRow = null
  if (user.twoFactorEnabled) {
    trustedRow = await db.trustedDevice.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId } },
    })
    if (trustedRow && trustedRow.expiresAt <= new Date()) {
      await db.trustedDevice.delete({ where: { id: trustedRow.id } })
      trustedRow = null
    }
  }

  const forceTwoFactor = await userRequiresTwoFactor(user.id)
  const needsTwoFactor = user.twoFactorEnabled || forceTwoFactor

  // Password expiry / forced change check — must happen before issuing a session
  const pwCred = user.password
  let passwordExpired = false
  let passwordExpiringSoon = false
  let daysUntilExpiry: number | null = null
  if (pwCred) {
    if (pwCred.mustChange) {
      passwordExpired = true
    } else if (settings.passwordExpiryDays > 0) {
      const expiryDate = new Date(pwCred.changedAt.getTime() + settings.passwordExpiryDays * 86400 * 1000)
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
      if (daysUntilExpiry <= 0) {
        passwordExpired = true
      } else if (daysUntilExpiry <= settings.passwordExpiryWarningDays) {
        passwordExpiringSoon = true
      }
    }
  }
  if (passwordExpired) {
    // Issue a short-lived "pending password change" token instead of a full session
    await setPending2fa({ uid: user.id, email: user.email, method: 'password-expiry' })
    await audit({
      userId: user.id,
      eventType: 'login_success',
      severity: 'warning',
      req,
      metadata: { stage: 'password_change_required', reason: pwCred?.mustChange ? 'admin_forced' : 'expired' },
    })
    return apiOk({
      stage: 'password_change_required',
      email: user.email,
      reason: pwCred?.mustChange ? 'admin_forced' : 'expired',
      daysUntilExpiry,
    })
  }

  if (needsTwoFactor && !trustedRow) {
    await setPending2fa({ uid: user.id, email: user.email, method: 'password' })
    await audit({
      userId: user.id,
      eventType: 'login_success',
      req,
      metadata: { stage: 'pending_2fa' },
    })
    return apiOk({
      stage: 'twofa_required',
      email: user.email,
      twoFactorEnabled: true,
      forceTwoFactor,
    })
  }

  const { sessionId } = await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    remember: rememberBool,
    req,
    twoFactorDone: !needsTwoFactor || !!trustedRow,
    trusted: !!trustedRow,
    maxLifetimeHours: rememberBool ? settings.rememberSessionDays * 24 : settings.sessionMaxLifetimeHours,
    idleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
  })

  if (trustedRow) {
    await db.trustedDevice.update({
      where: { id: trustedRow.id },
      data: {
        expiresAt: new Date(Date.now() + settings.trustedDeviceDays * 86400 * 1000),
        userAgent: ua,
        ipAddress: ip,
        label: describeDevice(ua),
      },
    })
  }

  await audit({
    userId: user.id,
    eventType: 'login_success',
    req,
    metadata: { sessionId, method: 'password', trustedDevice: !!trustedRow, remember: rememberBool },
  })
  await detectAndAlertAnomaly({ userId: user.id, email: user.email, ip, ua, req })
  // Evaluate risk rules on successful login (new geo / new device detection)
  await evaluateRules({
    userId: user.id,
    eventType: 'login_success',
    severity: 'info',
    ipAddress: ip,
    userAgent: ua,
    req,
  })

  return apiOk({
    stage: 'success',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    },
    needsTwoFactorSetup: forceTwoFactor && !user.twoFactorEnabled,
    passwordExpiringSoon,
    daysUntilExpiry,
  })
}
