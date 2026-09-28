import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/schedule-tasks — list
export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const enabledParam = url.searchParams.get('enabled')
  const where = {
    ...(enabledParam === 'true' ? { enabled: true } : enabledParam === 'false' ? { enabled: false } : {}),
  }
  const [total, tasks] = await Promise.all([
    db.scheduleTask.count({ where }),
    db.scheduleTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])
  return {
    items: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      cronExpr: t.cronExpr,
      enabled: t.enabled,
      lastExecuteAt: t.lastExecuteAt,
      nextExecuteAt: t.nextExecuteAt,
      lastResult: t.lastResult,
      lastError: t.lastError,
      consecutiveFailures: t.consecutiveFailures,
      createdAt: t.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})
