import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { generateTotpSecret, buildTotpUri } from '@/lib/totp'
import { encryptSecret } from '@/lib/crypto'
import QRCode from 'qrcode'
import { audit } from '@/lib/audit'

// POST /api/2fa/setup — generate a new TOTP secret + QR, store encrypted (not yet enabled)
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const user = await db.user.findUnique({ where: { id: s.uid } })
  if (!user) return apiError('用户不存在', 404)

  const secret = generateTotpSecret()
  const encrypted = encryptSecret(secret)

  // Store as pending (enabledAt=null). If already exists, overwrite.
  await db.twoFactorSecret.upsert({
    where: { userId: user.id },
    create: { userId: user.id, encryptedSecret: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag },
    update: { encryptedSecret: encrypted.ciphertext, iv: encrypted.iv, tag: encrypted.tag, enabledAt: null },
  })

  const uri = buildTotpUri(user.email, secret)
  const qr = await QRCode.toDataURL(uri, { width: 240, margin: 1 })

  await audit({ userId: user.id, eventType: 'twofa_enable', severity: 'info', req, metadata: { stage: 'setup_initiated' } })

  return apiOk({
    secret, // shown once for manual entry
    qr,
    uri,
  })
}
