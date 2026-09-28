import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk, apiError, describeDevice } from '@/lib/api'
import { requireAuth, getSession } from '@/lib/session'
import { lookupGeo } from '@/lib/geoip'

// GET /api/sessions — list current user's active sessions
export async function GET() {
  const s = await requireAuth()
  const sessions = await db.session.findMany({
    where: { userId: s.uid, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
  })
  return apiOk({
    sessions: sessions.map((x) => {
      const geo = lookupGeo(x.ipAddress)
      return {
        id: x.id,
        current: x.id === s.sid,
        deviceLabel: x.deviceLabel || describeDevice(x.userAgent),
        userAgent: x.userAgent,
        ipAddress: x.ipAddress,
        geo: {
          country: geo.country,
          countryName: geo.countryName,
          city: geo.city,
          flag: geo.flag,
          isPrivate: geo.isPrivate,
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

void apiError
void getSession
