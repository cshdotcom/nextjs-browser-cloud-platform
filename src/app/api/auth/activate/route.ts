import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiError, apiOk } from '@/lib/api'
import { verifyCode } from '@/app/api/auth/login-code/route'

// POST /api/auth/activate — verify register activation code
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { email, code } = body as { email?: string; code?: string }
  if (!email || !code) return apiError('请输入邮箱和验证码', 422)
  const result = await verifyCode({ email, code, purpose: 'register', req })
  if (!result.ok) return apiError('验证码错误或已过期', 401)
  if (!result.userId) return apiError('验证码错误或已过期', 401)
  await db.user.update({ where: { id: result.userId }, data: { emailVerified: true } })
  return apiOk({ activated: true })
}
