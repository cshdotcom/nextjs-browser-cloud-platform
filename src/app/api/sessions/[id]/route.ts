import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { audit } from '@/lib/audit'

// DELETE /api/sessions/[id] — revoke a specific session (cannot revoke current)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireAuth()
  const { id } = await ctx.params
  const session = await db.session.findUnique({ where: { id } })
  if (!session) return apiError('会话不存在', 404)
  if (session.userId !== s.uid) return apiError('无权操作他人会话', 403)
  if (session.id === s.sid) return apiError('不能下线当前会话', 400)
  await db.session.update({ where: { id }, data: { revokedAt: new Date() } })
  await audit({ userId: s.uid, eventType: 'device_logout', req, metadata: { sessionId: id } })
  return apiOk({ revoked: true })
}
