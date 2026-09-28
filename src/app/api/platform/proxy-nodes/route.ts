import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody, parseQuery, queryRecord } from '@/lib/platform-helpers'

// GET /api/platform/proxy-nodes — list
const ListQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  groupId: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  const where = {
    deletedAt: null,
    ...(q.type ? { type: q.type } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.groupId ? { groupId: q.groupId } : {}),
  }
  const [total, items] = await Promise.all([
    db.proxyNode.count({ where }),
    db.proxyNode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { singboxInstance: { select: { id: true, name: true, status: true } }, group: { select: { id: true, name: true } } },
    }),
  ])
  return {
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      singboxInstanceId: p.singboxInstanceId,
      singboxInstance: p.singboxInstance,
      socksAddress: p.socksAddress,
      httpAddress: p.httpAddress,
      status: p.status,
      healthLatency: p.healthLatency,
      tags: p.tags ? JSON.parse(p.tags) : [],
      weight: p.weight,
      groupId: p.groupId,
      group: p.group,
      createdAt: p.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/proxy-nodes — create external proxy
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  socksAddress: z.string().optional(),
  httpAddress: z.string().optional(),
  tags: z.array(z.string()).default([]),
  weight: z.number().int().min(1).max(100).default(1),
  groupId: z.string().optional(),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, CreateBodySchema)
  if (!body.socksAddress && !body.httpAddress) {
    throw new ValidationError('外部代理必须提供 socksAddress 或 httpAddress', { code: 'VALIDATION_FAILED' })
  }
  const existing = await db.proxyNode.findUnique({ where: { name: body.name } })
  if (existing && !existing.deletedAt) {
    throw new BizError('代理节点名称已存在', { code: 'CONFLICT', httpStatus: 409, data: { name: body.name } })
  }
  const proxy = await db.proxyNode.create({
    data: {
      name: body.name,
      type: 'external',
      socksAddress: body.socksAddress ?? null,
      httpAddress: body.httpAddress ?? null,
      status: 'active',
      tags: body.tags.length ? JSON.stringify(body.tags) : null,
      weight: body.weight,
      groupId: body.groupId ?? null,
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
    resourceType: 'proxy',
    resourceId: proxy.id,
    req,
    afterJson: { name: body.name, type: 'external', socksAddress: body.socksAddress, httpAddress: body.httpAddress },
  })

  return { id: proxy.id, name: proxy.name }
})
