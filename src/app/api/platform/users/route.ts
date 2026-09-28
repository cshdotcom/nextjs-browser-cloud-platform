import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { hashPassword } from '@/lib/crypto'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import {
  parsePagination,
  parseSort,
  parseBody,
  parseQuery,
  queryRecord,
  USER_SORT_FIELDS,
  type Paginated,
} from '@/lib/platform-helpers'

// GET /api/platform/users — list users with pagination + filters
const ListQuerySchema = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  groupId: z.string().optional(),
  sort: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  await requireAdmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  const sort = parseSort(url, USER_SORT_FIELDS)

  const where = {
    deletedAt: null,
    ...(q.q
      ? {
          OR: [
            { email: { contains: q.q } },
            { username: { contains: q.q } },
            { displayName: { contains: q.q } },
          ],
        }
      : {}),
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.groupId ? { groupId: q.groupId } : {}),
  }

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { group: { select: { id: true, name: true } } },
      orderBy: sort ? { [sort.field]: sort.direction } : { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])

  const items = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    twoFactorEnabled: u.twoFactorEnabled,
    groupId: u.groupId,
    groupName: u.group?.name ?? null,
    lastLoginAt: u.lastLoginAt,
    lastLoginIp: u.lastLoginIp,
    createdAt: u.createdAt,
  }))
  return { items, total, page, pageSize } satisfies Paginated<(typeof items)[number]>
})

// POST /api/platform/users — create a new user
const CreateBodySchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  displayName: z.string().max(128).optional(),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'admin', 'superadmin']).default('user'),
  groupIds: z.array(z.string()).default([]),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, CreateBodySchema)

  // Uniqueness checks
  const existing = await db.user.findFirst({
    where: { OR: [{ email: body.email }, { username: body.username }], deletedAt: null },
  })
  if (existing) {
    const field = existing.email === body.email ? 'email' : 'username'
    throw new ValidationError(`用户${field}已存在`, {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { field },
    })
  }

  const passwordHash = await hashPassword(body.password)
  const primaryGroupId = body.groupIds[0] ?? null
  const user = await db.user.create({
    data: {
      username: body.username,
      email: body.email,
      displayName: body.displayName ?? null,
      passwordHash,
      role: body.role,
      groupId: primaryGroupId,
      emailVerified: false,
      mustChangePassword: false,
    },
  })

  if (body.groupIds.length > 0) {
    // SQLite does not support skipDuplicates — filter to groups not yet bound.
    const existing = await db.groupUser.findMany({
      where: { userId: user.id, groupId: { in: body.groupIds } },
      select: { groupId: true },
    })
    const taken = new Set(existing.map((g) => g.groupId))
    const toInsert = body.groupIds.filter((gid) => !taken.has(gid))
    if (toInsert.length > 0) {
      await db.groupUser.createMany({
        data: toInsert.map((gid) => ({ groupId: gid, userId: user.id, role: 'member' })),
      })
    }
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'create',
    resourceType: 'user',
    resourceId: user.id,
    req,
    afterJson: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      groupIds: body.groupIds,
    },
  })

  return { id: user.id, username: user.username, email: user.email }
})
