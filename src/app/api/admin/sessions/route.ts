import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { lookupGeo } from '@/lib/geoip'

// GET /api/admin/sessions — list all active sessions across users (admin overview)
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const sessions = await db.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
    orderBy: { lastActiveAt: 'desc' },
    take: 200,
  })
  const { describeDevice } = await import('@/lib/api')
  return apiOk({
    sessions: sessions.map((x) => {
      const geo = lookupGeo(x.ipAddress)
      return {
        id: x.id,
        userId: x.userId,
        userEmail: x.user?.email,
        userName: x.user?.name,
        userRole: x.user?.role,
        deviceLabel: x.deviceLabel || describeDevice(x.userAgent),
        ipAddress: x.ipAddress,
        geo: {
          country: geo.country,
          countryName: geo.countryName,
          city: geo.city,
          flag: geo.flag,
          isPrivate: geo.isPrivate,
          asn: geo.asn,
        },
        isTrusted: x.isTrusted,
        remember: x.remember,
        createdAt: x.createdAt,
        lastActiveAt: x.lastActiveAt,
        expiresAt: x.expiresAt,
      }
    }),
  })
}
