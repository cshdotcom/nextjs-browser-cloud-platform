import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk, describeDevice, buildDeviceId } from '@/lib/api'
import { getClientIp, getUserAgent, decryptSecret, timingSafeEqualStr } from '@/lib/crypto'
import { getPending2fa, clearPending2fa, createSession } from '@/lib/session'
import { getSecuritySettings, userRequiresTwoFactor } from '@/lib/security-settings'
import { checkTwoFactorRateLimit } from '@/lib/rate-limit'
import { verifyTotp } from '@/lib/totp'
import { audit } from '@/lib/audit'
import { detectAndAlertAnomaly } from '@/lib/anomaly'
import bcrypt from 'bcryptjs'

// POST /api/auth/verify-2fa
// Body: { code, type: 'totp' | 'backup', trustDevice?: boolean }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { code, type = 'totp', trustDevice } = body as {
    code?: string
    type?: 'totp' | 'backup'
    trustDevice?: boolean
  }
  if (!code) return apiError('请输入验证码', 422)

  const pending = await getPending2fa()
  if (!pending) return apiError('未进行中的登录流程，请重新登录', 401)

  const rl = checkTwoFactorRateLimit(pending.uid)
  if (!rl.ok) return apiError('验证尝试过于频繁，请稍后再试', 429)

  const user = await db.user.findUnique({
    where: { id: pending.uid },
    include: { twoFactor: true, backupCodes: true, group: true },
  })
  if (!user) return apiError('用户不存在', 404)

  const ip = getClientIp(req)
  const ua = getUserAgent(req)
  const acceptLang = req.headers.get('accept-language') || ''
  const deviceId = buildDeviceId(ua, acceptLang)
  const settings = await getSecuritySettings()

  let verified = false
  let backupUsedId: string | null = null

  if (type === 'totp') {
    if (!user.twoFactor?.encryptedSecret) {
      return apiError('尚未设置 2FA', 400)
    }
    const secret = decryptSecret({
      ciphertext: user.twoFactor.encryptedSecret,
      iv: user.twoFactor.iv,
      tag: user.twoFactor.tag,
    })
    verified = verifyTotp(code, secret)
  } else {
    // backup code
    const normalized = (code as string).toUpperCase().trim()
    for (const bc of user.backupCodes) {
      if (bc.used) continue
      if (await bcrypt.compare(normalized, bc.codeHash)) {
        verified = true
        backupUsedId = bc.id
        break
      }
    }
  }

  if (!verified) {
    await audit({
      userId: user.id,
      eventType: type === 'totp' ? 'twofa_verify_failed' : 'backup_code_used',
      severity: 'warning',
      req,
      metadata: { type, reason: 'invalid' },
    })
    return apiError('验证码错误', 401)
  }

  // consume backup code
  if (backupUsedId) {
    await db.twoFactorBackupCode.update({
      where: { id: backupUsedId },
      data: { used: true, usedAt: new Date() },
    })
    await audit({
      userId: user.id,
      eventType: 'backup_code_used',
      severity: 'warning',
      req,
      metadata: {},
    })
  }

  await audit({
    userId: user.id,
    eventType: 'twofa_verify_success',
    req,
    metadata: { type, method: pending.method },
  })

  // Issue full session
  const { sessionId } = await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    remember: false,
    req,
    twoFactorDone: true,
    trusted: !!trustDevice,
    maxLifetimeHours: settings.sessionMaxLifetimeHours,
    idleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
  })

  // Persist trusted device if requested
  if (trustDevice) {
    await db.trustedDevice.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      create: {
        userId: user.id,
        deviceId,
        label: describeDevice(ua),
        userAgent: ua,
        ipAddress: ip,
        expiresAt: new Date(Date.now() + settings.trustedDeviceDays * 86400 * 1000),
      },
      update: {
        label: describeDevice(ua),
        userAgent: ua,
        ipAddress: ip,
        expiresAt: new Date(Date.now() + settings.trustedDeviceDays * 86400 * 1000),
      },
    })
    await audit({
      userId: user.id,
      eventType: 'trusted_device_added',
      req,
      metadata: { deviceId },
    })
  }

  await clearPending2fa()
  await detectAndAlertAnomaly({ userId: user.id, email: user.email, ip, ua, req })

  return apiOk({
    stage: 'success',
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

// mark timingSafeEqualStr used to avoid tree-shake removal in case
void timingSafeEqualStr
void userRequiresTwoFactor
