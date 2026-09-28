import { NextRequest } from 'next/server'
import { destroySession, requireAuth } from '@/lib/session'
import { apiOk } from '@/lib/api'
import { audit } from '@/lib/audit'

// POST /api/auth/logout — logout current session
export async function POST(req: NextRequest) {
  let uid: string | undefined
  try {
    const s = await requireAuth()
    uid = s.uid
  } catch {
    /* not logged in — still clear cookie */
  }
  await destroySession(req)
  if (uid) {
    await audit({ userId: uid, eventType: 'device_logout', req, metadata: { scope: 'self' } })
  }
  return apiOk({ loggedOut: true })
}
