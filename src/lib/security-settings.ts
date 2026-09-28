import { db } from '@/lib/db'
import type { SecuritySettings } from '@prisma/client'

export type SecuritySettingsRow = SecuritySettings

const DEFAULTS = {
  id: 'singleton',
  allowRegistration: true,
  requireEmailActivation: true,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireDigit: true,
  passwordRequireSpecial: true,
  passwordBlockWeakDictionary: true,
  maxFailedLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  emailCodeTtlMinutes: 5,
  emailCodeSendIntervalSeconds: 60,
  emailCodeMaxPerHour: 10,
  sessionMaxLifetimeHours: 24,
  sessionIdleTimeoutMinutes: 60,
  rememberSessionDays: 30,
  globalEnforceTwoFactor: false,
  allowEmailCodeLogin: true,
  trustedDeviceDays: 30,
  autoRevokeTokensOnSecurityChange: false,
  enableAnomalyAlert: true,
  passwordExpiryDays: 0,
  passwordExpiryWarningDays: 7,
  passwordHistoryCount: 0,
  enableLoginCaptcha: true,
} satisfies Partial<SecuritySettings>

export async function getSecuritySettings(): Promise<SecuritySettings> {
  let row = await db.securitySettings.findUnique({ where: { id: 'singleton' } })
  if (!row) {
    row = await db.securitySettings.create({ data: DEFAULTS })
  }
  return row
}

export async function updateSecuritySettings(patch: Partial<SecuritySettings>): Promise<SecuritySettings> {
  const current = await getSecuritySettings()
  return db.securitySettings.update({
    where: { id: 'singleton' },
    data: { ...current, ...patch, id: 'singleton' },
  })
}

// Does this user require 2FA to be enforced (global OR group-level)?
export async function userRequiresTwoFactor(userId: string): Promise<boolean> {
  const settings = await getSecuritySettings()
  if (settings.globalEnforceTwoFactor) return true
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { group: true },
  })
  if (!user) return false
  if (user.group?.enforceTwoFactor) return true
  if (user.group?.inheritGlobalTwoFactor && settings.globalEnforceTwoFactor) return true
  return false
}
