import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api'
import { requireAuth, killOtherSessions } from '@/lib/session'
import { audit } from '@/lib/audit'

// DELETE /api/sessions/all-others — revoke all other sessions of current user
export async function DELETE(req: NextRequest) {
  const s = await requireAuth()
  const count = await killOtherSessions(s.uid, s.sid)
  await audit({ userId: s.uid, eventType: 'all_devices_logout', req, metadata: { count } })
  return apiOk({ revoked: count })
}
