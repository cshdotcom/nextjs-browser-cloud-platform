import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody, parseQuery, queryRecord } from '@/lib/platform-helpers'

// GET /api/platform/recycle-bin — list
const ListQuerySchema = z.object({
  resourceType: z.string().optional(),
  deletedBy: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  void admin
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  const where = {
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.deletedBy ? { deletedBy: q.deletedBy } : {}),
  }
  const [total, items] = await Promise.all([
    db.recycleBin.count({ where }),
    db.recycleBin.findMany({ where, orderBy: { deletedAt: 'desc' }, skip, take: pageSize }),
  ])
  return {
    items: items.map((r) => ({
      id: r.id,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      resourceSnapshot: r.resourceSnapshot ? JSON.parse(r.resourceSnapshot) : null,
      deletedBy: r.deletedBy,
      deletedAt: r.deletedAt,
      expiresAt: r.expiresAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/recycle-bin — restore item
const RestoreBodySchema = z.object({
  id: z.string(),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, RestoreBodySchema)
  const entry = await db.recycleBin.findUnique({ where: { id: body.id } })
  if (!entry) {
    throw new ValidationError('回收站条目不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  if (entry.expiresAt < new Date()) {
    throw new BizError('回收站条目已过保留期', { code: 'CONFLICT', httpStatus: 410, data: { expiresAt: entry.expiresAt } })
  }

  // Restore based on resourceType
  const snapshot = JSON.parse(entry.resourceSnapshot) as Record<string, unknown>
  let restored = false
  switch (entry.resourceType) {
    case 'user': {
      if (typeof snapshot.id === 'string') {
        await db.user.update({ where: { id: snapshot.id }, data: { deletedAt: null, status: 'active' } }).catch(() => {})
        restored = true
      }
      break
    }
    case 'group': {
      if (typeof snapshot.id === 'string') {
        await db.userGroup.update({ where: { id: snapshot.id }, data: { deletedAt: null, enabled: true } }).catch(() => {})
        restored = true
      }
      break
    }
    case 'workspace': {
      if (typeof snapshot.id === 'string') {
        await db.browserWorkspace.update({ where: { id: snapshot.id }, data: { deletedAt: null, status: 'stopped' } }).catch(() => {})
        restored = true
      }
      break
    }
    case 'template': {
      if (typeof snapshot.id === 'string') {
        await db.browserTemplate.update({ where: { id: snapshot.id }, data: { deletedAt: null } }).catch(() => {})
        restored = true
      }
      break
    }
    default:
      // Other resource types — record restore intent; caller can manually re-create.
      restored = false
  }

  // Delete the recycle bin entry once restored (or attempt failed-soft-restore)
  await db.recycleBin.delete({ where: { id: entry.id } })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    req,
    afterJson: { action: 'restore', restored },
  })

  return { id: entry.id, resourceType: entry.resourceType, resourceId: entry.resourceId, restored }
})
