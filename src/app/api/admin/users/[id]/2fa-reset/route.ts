import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'

// POST /api/admin/users/[id]/2fa-reset — reset a user's 2FA entirely
// (delete secret, backup codes, trusted devices; disable flag)
// Admins cannot READ the original 2FA secret — only reset it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)

  await db.twoFactorSecret.deleteMany({ where: { userId: id } })
  await db.twoFactorBackupCode.deleteMany({ where: { userId: id } })
  await db.trustedDevice.deleteMany({ where: { userId: id } })
  await db.user.update({ where: { id }, data: { twoFactorEnabled: false } })

  await audit({ userId: id, actorId: admin.uid, eventType: 'twofa_reset_by_admin', severity: 'critical', req, metadata: {} })
  return apiOk({ reset: true })
}
