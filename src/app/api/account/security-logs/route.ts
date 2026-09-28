import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAuth } from '@/lib/session'
import { lookupGeo } from '@/lib/geoip'

// GET /api/account/security-logs — current user's security audit logs
export async function GET(req: NextRequest) {
  const s = await requireAuth()
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const cursor = url.searchParams.get('cursor')
  const logs = await db.securityAuditLog.findMany({
    where: { userId: s.uid },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const nextCursor = logs.length > limit ? logs[logs.length - 1].id : null
  return apiOk({
    logs: logs.slice(0, limit).map((l) => {
      const geo = lookupGeo(l.ipAddress)
      return {
        id: l.id,
        eventType: l.eventType,
        severity: l.severity,
        ipAddress: l.ipAddress,
        geo: {
          country: geo.country,
          countryName: geo.countryName,
          city: geo.city,
          flag: geo.flag,
          isPrivate: geo.isPrivate,
        },
        userAgent: l.userAgent,
        metadata: l.metadata ? JSON.parse(l.metadata) : null,
        createdAt: l.createdAt,
      }
    }),
    nextCursor,
  })
}
