import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/alerts — list with level filter
export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const level = url.searchParams.get('level') || ''
  const handleStatus = url.searchParams.get('handleStatus') || ''
  const resourceType = url.searchParams.get('resourceType') || ''
  const where = {
    ...(level ? { level } : {}),
    ...(handleStatus ? { handleStatus } : {}),
    ...(resourceType ? { resourceType } : {}),
  }
  const [total, alerts] = await Promise.all([
    db.alert.count({ where }),
    db.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return {
    items: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      level: a.level,
      content: a.content,
      resourceId: a.resourceId,
      resourceType: a.resourceType,
      triggerAt: a.triggerAt,
      handleStatus: a.handleStatus,
      handledBy: a.handledBy,
      handledAt: a.handledAt,
      createdAt: a.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})
