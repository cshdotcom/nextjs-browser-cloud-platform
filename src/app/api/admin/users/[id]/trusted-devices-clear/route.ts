import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { audit } from '@/lib/audit'

// POST /api/admin/users/[id]/trusted-devices-clear — admin clears all trusted devices for a user
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return apiError('用户不存在', 404)
  const r = await db.trustedDevice.deleteMany({ where: { userId: id } })
  await audit({ userId: id, actorId: admin.uid, eventType: 'trusted_device_revoked', severity: 'warning', req, metadata: { count: r.count, by: 'admin' } })
  return apiOk({ cleared: r.count })
}
