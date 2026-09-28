import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { saveFile, detectFileType } from '@/lib/file-storage'
import { checkQuota, reserveQuota } from '@/lib/quota'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseQuery, queryRecord } from '@/lib/platform-helpers'

// GET /api/platform/files — list (current user's files)
const ListQuerySchema = z.object({
  sessionId: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  const where = {
    userId: s.uid,
    deletedAt: null,
    ...(q.sessionId ? { sessionId: q.sessionId } : {}),
  }
  const [total, files] = await Promise.all([
    db.fileMeta.count({ where }),
    db.fileMeta.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return {
    items: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      sessionId: f.sessionId,
      expireAt: f.expireAt,
      createdAt: f.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/files — multipart upload with quota check + magic-number validation
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MiB

export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new ValidationError('请使用 multipart/form-data 上传文件', { code: 'VALIDATION_FAILED' })
  }
  const form = await req.formData().catch(() => null)
  if (!form) {
    throw new ValidationError('无法解析 multipart 表单', { code: 'VALIDATION_FAILED' })
  }
  const file = form.get('file')
  const sessionIdRaw = form.get('sessionId')
  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw : undefined
  if (!(file instanceof File)) {
    throw new ValidationError('缺少 file 字段', { code: 'VALIDATION_MISSING_FIELD' })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new BizError('文件超过 50 MiB 上限', {
      code: 'QUOTA_EXCEEDED',
      httpStatus: 413,
      data: { size: file.size, max: MAX_UPLOAD_BYTES },
    })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const detected = detectFileType(buf)
  if (!detected) {
    throw new ValidationError('无法识别文件类型（魔数校验失败）', { code: 'VALIDATION_FAILED' })
  }
  // Block executables
  if (['exe', 'elf', 'macho', 'sh'].includes(detected.type)) {
    throw new ValidationError('禁止上传可执行文件', { code: 'VALIDATION_FAILED', data: { type: detected.type } })
  }

  // Storage quota check (user scope)
  await checkQuota('user', s.uid, 'storage_bytes', file.size, { actorId: s.uid })
  await reserveQuota('user', s.uid, 'storage_bytes', file.size, { actorId: s.uid })

  const storageKey = `uploads/${s.uid}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const saved = await saveFile(storageKey, buf, { contentType: detected.mime })

  const fileMeta = await db.fileMeta.create({
    data: {
      name: file.name,
      storageKey,
      size: saved.size,
      mime: detected.mime,
      userId: s.uid,
      sessionId: sessionId ?? null,
    },
  })

  const user = await db.user.findUnique({
    where: { id: s.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: s.uid,
    operatorName: operatorDisplayName(user),
    operationType: 'create',
    resourceType: 'file',
    resourceId: fileMeta.id,
    req,
    afterJson: { name: file.name, size: saved.size, mime: detected.mime },
  })

  return { id: fileMeta.id, name: file.name, size: saved.size, mime: detected.mime }
})
