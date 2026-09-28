import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'

// POST /api/admin/users/[id]/backup-codes-reset — admin regenerates backup codes for user
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)

  // Dynamic import to avoid circular
  const { generateBackupCodes, hashBackupCode } = await import('@/lib/crypto')
  const codes = generateBackupCodes(10)
  await db.twoFactorBackupCode.deleteMany({ where: { userId: id } })
  const rows = await Promise.all(codes.map(async (c) => ({ userId: id, codeHash: await hashBackupCode(c) })))
  await db.twoFactorBackupCode.createMany({ data: rows as { userId: string; codeHash: string }[] })

  await audit({ userId: id, actorId: admin.uid, eventType: 'backup_code_regenerated', severity: 'warning', req, metadata: { by: 'admin' } })
  return apiOk({ backupCodes: codes })
}
