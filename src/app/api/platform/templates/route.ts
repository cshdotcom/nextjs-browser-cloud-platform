import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody, parseQuery, queryRecord } from '@/lib/platform-helpers'

// GET /api/platform/templates — list (visibility-filtered)
const ListQuerySchema = z.object({
  visibility: z.string().optional(),
  ownerId: z.string().optional(),
  groupId: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  // Visibility rules: admins see all; users see own + group + global
  const where =
    s.role === 'admin' || s.role === 'superadmin'
      ? { deletedAt: null, ...(q.visibility ? { visibility: q.visibility } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}), ...(q.groupId ? { groupId: q.groupId } : {}) }
      : {
          deletedAt: null,
          OR: [
            { ownerId: s.uid },
            { visibility: 'global' },
            ...(q.groupId ? [{ groupId: q.groupId, visibility: 'group' as const }] : []),
            { groupId: null, visibility: 'group' as const }, // any group template (loose; admin should restrict)
          ],
        }
  const [total, items] = await Promise.all([
    db.browserTemplate.count({ where }),
    db.browserTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { owner: { select: { id: true, username: true, displayName: true } } },
    }),
  ])
  return {
    items: items.map((t) => ({
      id: t.id,
      name: t.name,
      visibility: t.visibility,
      ownerId: t.ownerId,
      owner: t.owner,
      groupId: t.groupId,
      parentId: t.parentId,
      config: t.config ? JSON.parse(t.config) : null,
      createdAt: t.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/templates — create
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  visibility: z.enum(['private', 'group', 'global']).default('private'),
  groupId: z.string().optional(),
  parentId: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
})

export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const body = await parseBody(req, CreateBodySchema)
  // Only admins can create group/global templates
  if ((body.visibility === 'group' || body.visibility === 'global') && s.role !== 'admin' && s.role !== 'superadmin') {
    throw new BizError('仅管理员可创建组级/全局模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  if (body.parentId) {
    const parent = await db.browserTemplate.findUnique({ where: { id: body.parentId } })
    if (!parent || parent.deletedAt) {
      throw new ValidationError('父模板不存在', { code: 'NOT_FOUND', httpStatus: 404 })
    }
  }
  const tpl = await db.browserTemplate.create({
    data: {
      name: body.name,
      visibility: body.visibility,
      ownerId: s.uid,
      groupId: body.groupId ?? null,
      parentId: body.parentId ?? null,
      config: JSON.stringify(body.config),
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
    resourceType: 'template',
    resourceId: tpl.id,
    req,
    afterJson: { name: body.name, visibility: body.visibility },
  })

  return { id: tpl.id, name: tpl.name }
})
