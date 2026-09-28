import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { getSignedUrl } from '@/lib/file-storage'
import { requireAuth } from '@/lib/platform-auth'

// GET /api/platform/files/[id]/download — signed-URL download
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const file = await db.fileMeta.findUnique({ where: { id } })
  if (!file || file.deletedAt) {
    throw new ValidationError('文件不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (file.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权访问该文件', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const url = await getSignedUrl(file.storageKey, 300) // 5-minute signed URL
  return { url, expiresInSeconds: 300, name: file.name, size: file.size, mime: file.mime }
})
