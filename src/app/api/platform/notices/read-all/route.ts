import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// POST /api/platform/notices/read-all — mark all notices as read
export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const result = await db.notice.updateMany({
    where: { userId: s.uid, read: false },
    data: { read: true },
  })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'update',
    resourceType: 'notice',
    req,
    afterJson: { markedRead: result.count },
  })

  return { markedRead: result.count }
})
