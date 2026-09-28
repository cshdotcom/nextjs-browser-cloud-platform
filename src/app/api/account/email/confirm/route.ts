import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { timingSafeEqualStr } from '@/lib/crypto'
import { audit } from '@/lib/audit'

// POST /api/account/email/confirm — confirm with both codes
export async function POST(req: NextRequest) {
  const s = await requireAuth()
  const body = await req.json().catch(() => ({}))
  const { oldCode, newCode } = body as { oldCode?: string; newCode?: string }
  if (!oldCode || !newCode) return apiError('请输入两个验证码', 422)

  const req2 = await db.changeEmailRequest.findUnique({ where: { userId: s.uid } })
  if (!req2) return apiError('没有进行中的邮箱变更', 400)
  if (req2.expiresAt < new Date()) return apiError('请求已过期，请重新发起', 410)

  if (!timingSafeEqualStr(req2.oldEmailCode, oldCode)) return apiError('旧邮箱验证码错误', 401)
  if (!timingSafeEqualStr(req2.newEmailCode, newCode)) return apiError('新邮箱验证码错误', 401)

  const user = await db.user.findUnique({ where: { id: s.uid } })
  if (!user) return apiError('用户不存在', 404)

  const oldEmail = user.email
  await db.user.update({ where: { id: s.uid }, data: { email: req2.newEmail, emailVerified: true } })
  await db.changeEmailRequest.delete({ where: { userId: s.uid } })

  await audit({ userId: s.uid, eventType: 'email_change', severity: 'warning', req, metadata: { oldEmail, newEmail: req2.newEmail } })
  return apiOk({ changed: true, newEmail: req2.newEmail })
}
