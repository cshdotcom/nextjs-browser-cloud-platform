import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { lookupGeo } from '@/lib/geoip'

// GET /api/admin/audit-logs — query all security audit logs (with filters)
// Supports time range via `days` param (7/30/90).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const eventType = url.searchParams.get('eventType')
  const severity = url.searchParams.get('severity')
  const userId = url.searchParams.get('userId')
  const cursor = url.searchParams.get('cursor')
  const days = parseInt(url.searchParams.get('days') || '0')

  const where = {
    ...(eventType ? { eventType } : {}),
    ...(severity ? { severity } : {}),
    ...(userId ? { userId } : {}),
    ...(days > 0 ? { createdAt: { gt: new Date(Date.now() - days * 86400 * 1000) } } : {}),
  }
  const logs = await db.securityAuditLog.findMany({
    where,
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
        userId: l.userId,
        actorId: l.actorId,
        eventType: l.eventType,
        severity: l.severity,
        ipAddress: l.ipAddress,
        geo: {
          country: geo.country,
          countryName: geo.countryName,
          city: geo.city,
          flag: geo.flag,
          isPrivate: geo.isPrivate,
          asn: geo.asn,
        },
        userAgent: l.userAgent,
        metadata: l.metadata ? JSON.parse(l.metadata) : null,
        createdAt: l.createdAt,
      }
    }),
    nextCursor,
  })
}
