import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { generateApiToken } from '@/lib/crypto'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody } from '@/lib/platform-helpers'

// GET /api/platform/tokens — list current user's tokens
export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const where = { userId: s.uid, deletedAt: null }
  const [total, tokens] = await Promise.all([
    db.apiToken.count({ where }),
    db.apiToken.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  const items = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scopes: t.scopes ? JSON.parse(t.scopes) : [],
    ipWhitelist: t.ipWhitelist ? JSON.parse(t.ipWhitelist) : [],
    permissions: t.permissions,
    enabled: t.enabled,
    expireAt: t.expireAt,
    lastUsedAt: t.lastUsedAt,
    totalCalls: t.totalCalls,
    createdAt: t.createdAt,
  }))
  return { items, total, page, pageSize }
})

// POST /api/platform/tokens — create: name/scopes/ipWhitelist/expireAt/permissions
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(z.string()).default([]),
  ipWhitelist: z.array(z.string()).default([]),
  permissions: z.number().int().min(0).default(0),
  expireAt: z.string().datetime().optional(),
})

export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const body = await parseBody(req, CreateBodySchema)

  // Cap tokens per user (max 20)
  const existing = await db.apiToken.count({ where: { userId: s.uid, deletedAt: null } })
  if (existing >= 20) {
    throw new BizError('单用户最多创建 20 个 Token', {
      code: 'QUOTA_EXCEEDED',
      httpStatus: 429,
      data: { count: existing, max: 20 },
    })
  }

  const { token, prefix, hash } = generateApiToken()
  const created = await db.apiToken.create({
    data: {
      userId: s.uid,
      name: body.name,
      tokenHash: hash,
      prefix,
      scopes: JSON.stringify(body.scopes),
      ipWhitelist: body.ipWhitelist.length ? JSON.stringify(body.ipWhitelist) : null,
      permissions: body.permissions,
      enabled: true,
      expireAt: body.expireAt ? new Date(body.expireAt) : null,
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
    resourceType: 'token',
    resourceId: created.id,
    req,
    afterJson: { name: body.name, prefix, scopes: body.scopes, expireAt: body.expireAt ?? null },
  })

  // Raw token returned ONCE — never persisted
  return { id: created.id, token, prefix }
})
