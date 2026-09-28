import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

// GET /api/admin/audit-logs/export?format=csv|json&severity=&eventType=&userId=
// Exports up to 10000 audit log records.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv'
  const severity = url.searchParams.get('severity')
  const eventType = url.searchParams.get('eventType')
  const userId = url.searchParams.get('userId')

  const where = {
    ...(severity && severity !== 'all' ? { severity } : {}),
    ...(eventType && eventType !== 'all' ? { eventType } : {}),
    ...(userId ? { userId } : {}),
  }

  const logs = await db.securityAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  if (format === 'json') {
    const data = logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      actorId: l.actorId,
      eventType: l.eventType,
      severity: l.severity,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
      createdAt: l.createdAt.toISOString(),
    }))
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-logs-${Date.now()}.json"`,
      },
    })
  }

  // CSV
  const headers = ['id', 'createdAt', 'userId', 'actorId', 'eventType', 'severity', 'ipAddress', 'userAgent', 'metadata']
  const escapeCsv = (v: string | null | undefined) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const rows = logs.map((l) =>
    [l.id, l.createdAt.toISOString(), l.userId, l.actorId, l.eventType, l.severity, l.ipAddress, l.userAgent, l.metadata]
      .map(escapeCsv)
      .join(',')
  )
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n') // BOM for Excel UTF-8
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-logs-${Date.now()}.csv"`,
    },
  })
}
