import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { decryptSecret } from '@/lib/crypto'
import { verifyTotp } from '@/lib/totp'
import { generateBackupCodes, hashBackupCode } from '@/lib/crypto'
import { audit } from '@/lib/audit'
import { getSecuritySettings } from '@/lib/security-settings'
import { checkTwoFactorRateLimit } from '@/lib/rate-limit'

// POST /api/2fa/enable — verify the first TOTP code and officially enable 2FA; return backup codes
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { code } = body as { code?: string }
  if (!code) return apiError('请输入验证码', 422)

  const rl = checkTwoFactorRateLimit(s.uid)
  if (!rl.ok) return apiError('尝试过于频繁，请稍后再试', 429)

  const user = await db.user.findUnique({ where: { id: s.uid }, include: { twoFactor: true } })
  if (!user) return apiError('用户不存在', 404)
  if (!user.twoFactor?.encryptedSecret) return apiError('请先发起 2FA 设置', 400)

  const secret = decryptSecret({
    ciphertext: user.twoFactor.encryptedSecret,
    iv: user.twoFactor.iv,
    tag: user.twoFactor.tag,
  })
  if (!verifyTotp(code, secret)) {
    await audit({ userId: s.uid, eventType: 'twofa_verify_failed', severity: 'warning', req, metadata: { stage: 'enable' } })
    return apiError('验证码错误', 401)
  }

  // Enable 2FA + generate 10 backup codes
  const codes = generateBackupCodes(10)
  // wipe old backup codes
  await db.twoFactorBackupCode.deleteMany({ where: { userId: user.id } })
  await db.twoFactorBackupCode.createMany({
    data: await Promise.all(
      codes.map(async (c) => ({ userId: user.id, codeHash: await hashBackupCode(c) }))
    ).then((arr) => arr as { userId: string; codeHash: string }[]),
  })
  await db.twoFactorSecret.update({
    where: { userId: user.id },
    data: { enabledAt: new Date() },
  })
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } })

  await audit({ userId: s.uid, eventType: 'twofa_enable', req, metadata: {} })

  return apiOk({
    enabled: true,
    backupCodes: codes, // returned ONCE only
  })
}

void getSecuritySettings
