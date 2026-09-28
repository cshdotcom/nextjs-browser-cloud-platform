import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'

// DELETE /api/admin/sessions/[id] — admin force-revoke any session
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const session = await db.session.findUnique({ where: { id } })
  if (!session) return apiOk({ revoked: 0 })
  if (session.revokedAt) return apiOk({ revoked: 0 })
  await db.session.update({ where: { id }, data: { revokedAt: new Date() } })
  await audit({ userId: session.userId, actorId: admin.uid, eventType: 'admin_force_logout', severity: 'warning', req, metadata: { sessionId: id } })
  return apiOk({ revoked: 1 })
}
