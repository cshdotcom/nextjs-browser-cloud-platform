import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/platform-auth'
import { parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/notices — current user's notices
export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const onlyUnread = url.searchParams.get('unread') === 'true'
  const where = { userId: s.uid, ...(onlyUnread ? { read: false } : {}) }
  const [total, unread, notices] = await Promise.all([
    db.notice.count({ where: { userId: s.uid } }),
    db.notice.count({ where: { userId: s.uid, read: false } }),
    db.notice.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return {
    items: notices.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      read: n.read,
      createdAt: n.createdAt,
    })),
    total,
    unreadCount: unread,
    page,
    pageSize,
  }
})
