import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { audit } from '@/lib/audit'

// DELETE /api/2fa/trusted-devices/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await requireAuth()
  const { id } = await ctx.params
  const device = await db.trustedDevice.findUnique({ where: { id } })
  if (!device) return apiError('设备不存在', 404)
  if (device.userId !== s.uid) return apiError('无权操作', 403)
  await db.trustedDevice.delete({ where: { id } })
  await audit({ userId: s.uid, eventType: 'trusted_device_revoked', req, metadata: { deviceId: device.deviceId } })
  return apiOk({ revoked: true })
}
