import { NextResponse } from 'next/server'
import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { readFile } from '@/lib/file-storage'
import { releaseQuota } from '@/lib/quota'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'

// GET /api/platform/files/[id] — download file content (auth-required)
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const file = await db.fileMeta.findUnique({ where: { id } })
  if (!file || file.deletedAt) {
    throw new ValidationError('文件不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  // Only owner or admin can download
  if (file.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权访问该文件', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const buf = await readFile(file.storageKey)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Length': String(buf.byteLength),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
    },
  })
})

// DELETE /api/platform/files/[id] — soft-delete
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireAuth()
  const { id } = await ctx.params
  const file = await db.fileMeta.findUnique({ where: { id } })
  if (!file || file.deletedAt) {
    throw new ValidationError('文件不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (file.userId !== s.uid && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new ValidationError('无权删除该文件', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  await db.fileMeta.update({ where: { id }, data: { deletedAt: new Date() } })
  // Release storage quota
  if (file.userId) {
    await releaseQuota('user', file.userId, 'storage_bytes', file.size, { actorId: s.uid }).catch(() => {})
  }

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'delete',
    resourceType: 'file',
    resourceId: id,
    req,
    beforeJson: { name: file.name, size: file.size },
  })

  return { id, deleted: true }
})
