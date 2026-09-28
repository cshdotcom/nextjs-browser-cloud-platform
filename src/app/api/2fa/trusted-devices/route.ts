import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, describeDevice } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { audit } from '@/lib/audit'

// GET /api/2fa/trusted-devices — list trusted devices
export async function GET() {
  const s = await requireAuth()
  const devices = await db.trustedDevice.findMany({ where: { userId: s.uid }, orderBy: { createdAt: 'desc' } })
  return apiOk({
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      label: d.label || describeDevice(d.userAgent),
      userAgent: d.userAgent,
      ipAddress: d.ipAddress,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
    })),
  })
}

// DELETE /api/2fa/trusted-devices/[id] — revoke a trusted device (handled in [id]/route.ts)
