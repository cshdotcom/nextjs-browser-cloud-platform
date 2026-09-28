import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { decryptSecret } from '@/lib/crypto'
import { verifyTotp } from '@/lib/totp'
import { generateBackupCodes, hashBackupCode } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { checkTwoFactorRateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

// POST /api/2fa/backup-codes — regenerate a fresh batch of 10 backup codes (requires current TOTP or unused backup code)
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { code, type = 'totp' } = body as { code?: string; type?: 'totp' | 'backup' }
  if (!code) return apiError('请输入验证码', 422)

  const rl = checkTwoFactorRateLimit(s.uid)
  if (!rl.ok) return apiError('尝试过于频繁', 429)

  const user = await db.user.findUnique({
    where: { id: s.uid },
    include: { twoFactor: true, backupCodes: true },
  })
  if (!user) return apiError('用户不存在', 404)
  if (!user.twoFactorEnabled) return apiError('尚未启用 2FA', 400)

  let verified = false
  if (type === 'totp') {
    if (!user.twoFactor?.encryptedSecret) return apiError('尚未设置 2FA', 400)
    const secret = decryptSecret({
      ciphertext: user.twoFactor.encryptedSecret,
      iv: user.twoFactor.iv,
      tag: user.twoFactor.tag,
    })
    verified = verifyTotp(code, secret)
  } else {
    const normalized = (code as string).toUpperCase().trim()
    for (const bc of user.backupCodes) {
      if (bc.used) continue
      if (await bcrypt.compare(normalized, bc.codeHash)) {
        verified = true
        await db.twoFactorBackupCode.update({ where: { id: bc.id }, data: { used: true, usedAt: new Date() } })
        break
      }
    }
  }

  if (!verified) {
    await audit({ userId: s.uid, eventType: 'twofa_verify_failed', severity: 'warning', req, metadata: { stage: 'regen_backup' } })
    return apiError('验证码错误', 401)
  }

  const codes = generateBackupCodes(10)
  await db.twoFactorBackupCode.deleteMany({ where: { userId: user.id } })
  const rows = await Promise.all(codes.map(async (c) => ({ userId: user.id, codeHash: await hashBackupCode(c) })))
  await db.twoFactorBackupCode.createMany({ data: rows as { userId: string; codeHash: string }[] })

  await audit({ userId: s.uid, eventType: 'backup_code_regenerated', severity: 'warning', req, metadata: {} })
  return apiOk({ backupCodes: codes })
}
