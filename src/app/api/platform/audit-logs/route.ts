import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/audit-logs — list with filters: time range, operator, type, resourceId
export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const operatorId = url.searchParams.get('operatorId') || ''
  const operationType = url.searchParams.get('operationType') || ''
  const resourceType = url.searchParams.get('resourceType') || ''
  const resourceId = url.searchParams.get('resourceId') || ''
  const startTime = url.searchParams.get('startTime')
  const endTime = url.searchParams.get('endTime')

  const where = {
    ...(operatorId ? { operatorUserId: operatorId } : {}),
    ...(operationType ? { operationType } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(startTime || endTime
      ? {
          createdAt: {
            ...(startTime ? { gte: new Date(startTime) } : {}),
            ...(endTime ? { lte: new Date(endTime) } : {}),
          },
        }
      : {}),
  }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])

  const items = logs.map((l) => ({
    id: l.id,
    traceId: l.traceId,
    operatorUserId: l.operatorUserId,
    operatorName: l.operatorName,
    operationType: l.operationType,
    resourceType: l.resourceType,
    resourceId: l.resourceId,
    clientIp: l.clientIp,
    beforeJson: l.beforeJson ? JSON.parse(l.beforeJson) : null,
    afterJson: l.afterJson ? JSON.parse(l.afterJson) : null,
    createdAt: l.createdAt,
  }))

  return { items, total, page, pageSize }
})
