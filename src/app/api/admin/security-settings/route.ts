import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { getSecuritySettings, updateSecuritySettings } from '@/lib/security-settings'
import { audit } from '@/lib/audit'
import type { SecuritySettings } from '@prisma/client'

const UPDATABLE_KEYS: (keyof SecuritySettings)[] = [
  'allowRegistration',
  'requireEmailActivation',
  'passwordMinLength',
  'passwordRequireUppercase',
  'passwordRequireLowercase',
  'passwordRequireDigit',
  'passwordRequireSpecial',
  'passwordBlockWeakDictionary',
  'maxFailedLoginAttempts',
  'lockoutDurationMinutes',
  'emailCodeTtlMinutes',
  'emailCodeSendIntervalSeconds',
  'emailCodeMaxPerHour',
  'sessionMaxLifetimeHours',
  'sessionIdleTimeoutMinutes',
  'rememberSessionDays',
  'globalEnforceTwoFactor',
  'allowEmailCodeLogin',
  'trustedDeviceDays',
  'autoRevokeTokensOnSecurityChange',
  'enableAnomalyAlert',
  'passwordExpiryDays',
  'passwordExpiryWarningDays',
  'passwordHistoryCount',
  'enableLoginCaptcha',
]

// GET /api/admin/security-settings
export async function GET() {
  await requireAdmin()
  const s = await getSecuritySettings()
  return apiOk({ settings: s })
}

// PUT /api/admin/security-settings
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  const body = await req.json().catch(() => ({})) as Partial<SecuritySettings>
  const patch: Partial<SecuritySettings> = {}
  for (const k of UPDATABLE_KEYS) {
    if (k in body) {
      // @ts-expect-error dynamic
      patch[k] = body[k]
    }
  }
  const updated = await updateSecuritySettings(patch)
  await audit({ actorId: admin.uid, eventType: 'admin_security_setting_change', severity: 'warning', req, metadata: { patch } })
  return apiOk({ settings: updated })
}
