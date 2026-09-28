import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk, describeDevice, buildDeviceId } from '@/lib/api'
import { getClientIp, getUserAgent } from '@/lib/crypto'
import { verifyCode } from '@/app/api/auth/login-code/route'
import { createSession, setPending2fa } from '@/lib/session'
import { getSecuritySettings, userRequiresTwoFactor } from '@/lib/security-settings'
import { audit } from '@/lib/audit'
import { detectAndAlertAnomaly } from '@/lib/anomaly'

// POST /api/auth/login-code/verify — verify email code for passwordless login
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, code, remember } = body as { email?: string; code?: string; remember?: boolean }
  if (!email || !code) return apiError('请输入邮箱和验证码', 422)
  const settings = await getSecuritySettings()
  if (!settings.allowEmailCodeLogin) return apiError('邮箱验证码登录已被关闭', 403)

  const result = await verifyCode({ email, code, purpose: 'login', req })
  if (!result.ok) {
    return apiError('验证码错误或已过期', 401)
  }
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { group: true },
  })
  if (!user) {
    // avoid enumeration
    return apiError('验证码错误或已过期', 401)
  }
  if (user.status !== 'active') return apiError('账号已被禁用', 403)
  if (settings.requireEmailActivation && !user.emailVerified) return apiError('账号尚未激活', 403)

  const ip = getClientIp(req)
  const ua = getUserAgent(req)
  const acceptLang = req.headers.get('accept-language') || ''
  const deviceId = buildDeviceId(ua, acceptLang)
  const rememberBool = !!remember

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
  })

  const forceTwoFactor = await userRequiresTwoFactor(user.id)
  const needsTwoFactor = user.twoFactorEnabled || forceTwoFactor

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

  if (needsTwoFactor && !trustedRow) {
    await setPending2fa({ uid: user.id, email: user.email, method: 'email-code' })
    await audit({ userId: user.id, eventType: 'login_success', req, metadata: { stage: 'pending_2fa', method: 'email-code' } })
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
    metadata: { sessionId, method: 'email-code', trustedDevice: !!trustedRow },
  })
  await detectAndAlertAnomaly({ userId: user.id, email: user.email, ip, ua, req })

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
  })
}
