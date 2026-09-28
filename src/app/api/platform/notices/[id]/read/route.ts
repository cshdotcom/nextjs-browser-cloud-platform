import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/platform-auth'

// POST /api/platform/notices/[id]/read — mark a single notice as read
export const POST = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const notice = await db.notice.findUnique({ where: { id } })
  if (!notice || notice.userId !== s.uid) {
    throw new ValidationError('通知不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  await db.notice.update({ where: { id }, data: { read: true } })
  return { read: true }
})
