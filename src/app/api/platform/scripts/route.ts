import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody } from '@/lib/platform-helpers'

// GET /api/platform/scripts — list
export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const enabledParam = url.searchParams.get('enabled')
  const where = {
    deletedAt: null,
    ...(enabledParam === 'true' ? { enabled: true } : enabledParam === 'false' ? { enabled: false } : {}),
  }
  // Non-admins see only enabled scripts (read-only view); admins see all
  if (s.role !== 'admin' && s.role !== 'superadmin') {
    where.enabled = true
  }
  const [total, items] = await Promise.all([
    db.browserScriptTemplate.count({ where }),
    db.browserScriptTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return {
    items: items.map((sc) => ({
      id: sc.id,
      name: sc.name,
      version: sc.version,
      enabled: sc.enabled,
      boundDomains: sc.boundDomains ? JSON.parse(sc.boundDomains) : [],
      createdAt: sc.createdAt,
      updatedAt: sc.updatedAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/scripts — create (admin only)
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  sourceCode: z.string().min(1).max(1024 * 1024),
  version: z.string().min(1).max(64).default('1.0.0'),
  enabled: z.boolean().default(true),
  boundDomains: z.array(z.string()).default([]),
})

export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  if (s.role !== 'admin' && s.role !== 'superadmin') {
    throw new BizError('仅管理员可创建脚本模板', { code: 'PERMISSION_DENIED', httpStatus: 403 })
  }
  const body = await parseBody(req, CreateBodySchema)
  const script = await db.browserScriptTemplate.create({
    data: {
      name: body.name,
      sourceCode: body.sourceCode,
      version: body.version,
      enabled: body.enabled,
      boundDomains: body.boundDomains.length ? JSON.stringify(body.boundDomains) : null,
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
    resourceType: 'script',
    resourceId: script.id,
    req,
    afterJson: { name: body.name, version: body.version, enabled: body.enabled },
  })

  return { id: script.id, name: script.name }
})
