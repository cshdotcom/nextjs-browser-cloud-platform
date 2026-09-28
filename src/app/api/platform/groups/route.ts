import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody, parseQuery, queryRecord, type Paginated } from '@/lib/platform-helpers'

// GET /api/platform/groups — list groups (flat) + optional tree view
const ListQuerySchema = z.object({
  tree: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  if (q.tree) {
    return { tree: await assembleGroupTree() }
  }
  const { page, pageSize, skip } = parsePagination(url)
  const where = { deletedAt: null }
  const [total, groups] = await Promise.all([
    db.userGroup.count({ where }),
    db.userGroup.findMany({
      where,
      include: {
        _count: { select: { groupUsers: true, children: true, proxyNodes: true, browserWorkspaces: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])
  const items = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    parentId: g.parentId,
    enabled: g.enabled,
    counts: g._count,
    createdAt: g.createdAt,
  }))
  return { items, total, page, pageSize } satisfies Paginated<(typeof items)[number]>
})

// POST /api/platform/groups — create with parentId
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  parentId: z.string().optional(),
  enabled: z.boolean().default(true),
  enforceTwoFactor: z.boolean().default(false),
  admins: z.array(z.string()).default([]),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, CreateBodySchema)

  // Cycle check — parent must not be a descendant
  if (body.parentId) {
    await assertNoCycle(body.parentId, null)
    const parent = await db.userGroup.findUnique({ where: { id: body.parentId } })
    if (!parent || parent.deletedAt) {
      throw new ValidationError('父用户组不存在', { code: 'NOT_FOUND', httpStatus: 404 })
    }
  }

  const existing = await db.userGroup.findUnique({ where: { name: body.name } })
  if (existing && !existing.deletedAt) {
    throw new BizError('用户组名已存在', { code: 'CONFLICT', httpStatus: 409, data: { name: body.name } })
  }

  const group = await db.userGroup.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
      enabled: body.enabled,
      enforceTwoFactor: body.enforceTwoFactor,
      admins: body.admins.length ? JSON.stringify(body.admins) : null,
    },
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'create',
    resourceType: 'group',
    resourceId: group.id,
    req,
    afterJson: { id: group.id, name: group.name, parentId: group.parentId },
  })

  return { id: group.id, name: group.name }
})

// ---------------- Helpers ----------------
async function assertNoCycle(parentId: string, _newId: string | null): Promise<void> {
  let cur: string | null = parentId
  const seen = new Set<string>()
  while (cur) {
    if (seen.has(cur)) {
      throw new ValidationError('父组链路存在循环引用', { code: 'VALIDATION_FAILED' })
    }
    seen.add(cur)
    if (_newId && cur === _newId) {
      throw new ValidationError('不能将自身或后代用户组设为父组', { code: 'VALIDATION_FAILED' })
    }
    const g = await db.userGroup.findUnique({ where: { id: cur }, select: { parentId: true } })
    cur = g?.parentId ?? null
  }
}

async function assembleGroupTree(): Promise<Array<unknown>> {
  const all = await db.userGroup.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, parentId: true, enabled: true, description: true },
  })
  const byParent = new Map<string | null, typeof all>()
  for (const g of all) {
    const k = g.parentId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(g)
  }
  const build = (parentId: string | null): unknown[] => {
    const children = byParent.get(parentId) ?? []
    return children.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      enabled: g.enabled,
      description: g.description,
      children: build(g.id),
    }))
  }
  return build(null)
}
