import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { checkQuota, reserveQuota, releaseQuota } from '@/lib/quota'
import * as steel from '@/lib/steel-client'
import { requireAuth } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody, parsePagination, parseQuery, queryRecord } from '@/lib/platform-helpers'

// GET /api/platform/workspaces — list with filters
const ListQuerySchema = z.object({
  status: z.string().optional(),
  mode: z.string().optional(),
  tag: z.string().optional(),
})

export const GET = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const q = parseQuery(queryRecord(url), ListQuerySchema)
  // Non-admins can only see their own workspaces; admins can see all (or pass userId= filter)
  const targetUserId = url.searchParams.get('userId') || ''
  const where = {
    deletedAt: null,
    ...(s.role === 'admin' || s.role === 'superadmin'
      ? targetUserId
        ? { userId: targetUserId }
        : {}
      : { userId: s.uid }),
    ...(q.status ? { status: q.status } : {}),
    ...(q.mode ? { mode: q.mode } : {}),
  }
  const [total, items] = await Promise.all([
    db.browserWorkspace.count({ where }),
    db.browserWorkspace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        proxyNode: { select: { id: true, name: true, status: true } },
        singboxInstance: { select: { id: true, name: true, status: true } },
      },
    }),
  ])
  return {
    items: items.map((w) => ({
      ...filterWorkspace(w),
      proxyNode: w.proxyNode,
      singboxInstance: w.singboxInstance,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/workspaces — create (calls steel.createSession)
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  templateId: z.string().optional(),
  proxyNodeId: z.string().optional(),
  singboxInstanceId: z.string().optional(),
  mode: z.enum(['cdp_light', 'novnc_full']).default('cdp_light'),
  ttlMinutes: z.number().int().min(1).max(1440).default(60),
  idleTimeoutMinutes: z.number().int().min(1).max(1440).default(15),
  tags: z.array(z.string()).default([]),
  groupId: z.string().optional(),
})

export const POST = wrapHandler(async (req: Request) => {
  const s = await requireAuth()
  const body = await parseBody(req, CreateBodySchema)

  // Quota check (user scope, browser_workspace resource)
  const resource = body.mode === 'novnc_full' ? 'novnc_workspace' : 'browser_workspace'
  await checkQuota('user', s.uid, resource, 1, { actorId: s.uid })
  await reserveQuota('user', s.uid, resource, 1, { actorId: s.uid })

  // Resolve proxy URL if a proxy node was specified
  let proxyUrl: string | undefined
  if (body.proxyNodeId) {
    const proxy = await db.proxyNode.findUnique({ where: { id: body.proxyNodeId } })
    if (!proxy || proxy.deletedAt) {
      await releaseQuota('user', s.uid, resource, 1).catch(() => {})
      throw new ValidationError('代理节点不存在', { code: 'NOT_FOUND', httpStatus: 404 })
    }
    if (proxy.socksAddress) proxyUrl = `socks5://${proxy.socksAddress}`
    else if (proxy.httpAddress) proxyUrl = `http://${proxy.httpAddress}`
  }

  let steelSessionId: string | null = null
  let cdpUrl: string | undefined
  try {
    const info = await steel.createSession({
      proxyUrl,
      ttlSeconds: body.ttlMinutes * 60,
      labels: { workspaceUserId: s.uid, mode: body.mode },
    })
    steelSessionId = info.id || null
    cdpUrl = info.cdpUrl
  } catch (e) {
    // Release quota reservation on failure; let ExternalApiError propagate.
    await releaseQuota('user', s.uid, resource, 1).catch(() => {})
    throw e
  }

  const workspace = await db.browserWorkspace.create({
    data: {
      userId: s.uid,
      groupId: body.groupId ?? null,
      proxyNodeId: body.proxyNodeId ?? null,
      singboxInstanceId: body.singboxInstanceId ?? null,
      steelSessionId,
      name: body.name,
      tags: body.tags.length ? JSON.stringify(body.tags) : null,
      mode: body.mode,
      status: steelSessionId ? 'running' : 'creating',
      ttlMinutes: body.ttlMinutes,
      idleTimeoutMinutes: body.idleTimeoutMinutes,
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
    resourceType: 'workspace',
    resourceId: workspace.id,
    req,
    afterJson: { name: body.name, mode: body.mode, steelSessionId, cdpUrl },
  })

  return { id: workspace.id, steelSessionId, cdpUrl, status: workspace.status }
})

// ---------------- helpers ----------------
function filterWorkspace(w: {
  id: string
  name: string
  mode: string
  status: string
  steelSessionId: string | null
  novncSessionId: string | null
  ttlMinutes: number
  idleTimeoutMinutes: number
  tags: string | null
  proxyNodeId: string | null
  singboxInstanceId: string | null
  userId: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: w.id,
    name: w.name,
    mode: w.mode,
    status: w.status,
    steelSessionId: w.steelSessionId,
    novncSessionId: w.novncSessionId,
    ttlMinutes: w.ttlMinutes,
    idleTimeoutMinutes: w.idleTimeoutMinutes,
    tags: w.tags ? JSON.parse(w.tags) : [],
    proxyNodeId: w.proxyNodeId,
    singboxInstanceId: w.singboxInstanceId,
    userId: w.userId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}
