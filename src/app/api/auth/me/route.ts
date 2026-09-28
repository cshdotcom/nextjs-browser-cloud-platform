import { NextRequest } from 'next/server'
import { getSession, requireAuth } from '@/lib/session'
import { apiOk, apiError } from '@/lib/api'
import { db } from '@/lib/db'
import { userRequiresTwoFactor, getSecuritySettings } from '@/lib/security-settings'

// GET /api/auth/me
export async function GET() {
  const s = await getSession()
  if (!s) return apiOk({ authenticated: false })
  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      role: true,
      emailVerified: true,
      twoFactorEnabled: true,
      status: true,
      mustChangePassword: true,
      passwordHash: true,
      password: { select: { changedAt: true, mustChange: true } },
    },
  })
  if (!user) return apiOk({ authenticated: false })
  const forceTwoFactor = await userRequiresTwoFactor(user.id)
  const settings = await getSecuritySettings()

  // Compute password expiry info — prefer PasswordCredential.changedAt, fallback to user-level
  let passwordExpiringSoon = false
  let passwordExpired = false
  let daysUntilExpiry: number | null = null
  let passwordChangedAt: string | null = null
  const changedAt = user.password?.changedAt
  if (changedAt) {
    passwordChangedAt = changedAt.toISOString()
    if (settings.passwordExpiryDays > 0) {
      const expiryDate = new Date(changedAt.getTime() + settings.passwordExpiryDays * 86400 * 1000)
      daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
      if (daysUntilExpiry <= 0) passwordExpired = true
      else if (daysUntilExpiry <= settings.passwordExpiryWarningDays) passwordExpiringSoon = true
    }
  }

  return apiOk({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.displayName,
      username: user.username,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      status: user.status,
    },
    session: { twofa: s.twofa, remember: s.remember },
    needsTwoFactorSetup: forceTwoFactor && !user.twoFactorEnabled,
    password: {
      changedAt: passwordChangedAt,
      mustChange: user.mustChangePassword || (user.password?.mustChange ?? false),
      expiringSoon: passwordExpiringSoon,
      expired: passwordExpired,
      daysUntilExpiry,
      expiryDays: settings.passwordExpiryDays,
    },
  })
}

void NextRequest
void requireAuth
void apiError

// Helper for protected route handlers
export async function getAuthUser() {
  const s = await requireAuth()
  return s
}
