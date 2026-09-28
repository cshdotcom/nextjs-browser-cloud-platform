import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'

// GET /api/dev-mail — list recent verification codes sent (admin only, dev/test convenience)
export async function GET(req: NextRequest) {
  await requireAdmin()
  const url = new URL(req.url)
  const email = url.searchParams.get('email')
  const codes = await db.emailVerificationCode.findMany({
    where: email ? { email } : {},
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return apiOk({
    mails: codes.map((c) => ({
      id: c.id,
      email: c.email,
      code: c.code,
      purpose: c.purpose,
      expiresAt: c.expiresAt,
      consumed: c.consumed,
      attempts: c.attempts,
      createdAt: c.createdAt,
    })),
  })
}
