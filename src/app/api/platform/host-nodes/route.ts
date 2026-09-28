import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody } from '@/lib/platform-helpers'

// GET /api/platform/host-nodes — list with resource usage
export const GET = wrapHandler(async (req: Request) => {
  await requireSuperadmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const where = { deletedAt: null }
  const [total, items] = await Promise.all([
    db.hostNode.count({ where }),
    db.hostNode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { _count: { select: { singboxInstances: true } } },
    }),
  ])
  return {
    items: items.map((h) => ({
      id: h.id,
      name: h.name,
      dockerApiUrl: h.dockerApiUrl,
      cpuTotal: h.cpuTotal,
      memoryTotal: h.memoryTotal,
      cpuUsed: h.cpuUsed,
      memoryUsed: h.memoryUsed,
      cpuPercent: h.cpuTotal > 0 ? (h.cpuUsed / h.cpuTotal) * 100 : 0,
      memoryPercent: h.memoryTotal > 0 ? (h.memoryUsed / h.memoryTotal) * 100 : 0,
      status: h.status,
      label: h.label,
      singboxCount: h._count.singboxInstances,
      createdAt: h.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/host-nodes — add host
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  dockerApiUrl: z.string().min(1).max(1024),
  cpuTotal: z.number().min(0.001).max(1024).default(1),
  memoryTotal: z.number().min(1).max(1048576).default(1024),
  label: z.string().max(128).optional(),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireSuperadmin()
  const body = await parseBody(req, CreateBodySchema)
  const existing = await db.hostNode.findUnique({ where: { name: body.name } })
  if (existing && !existing.deletedAt) {
    throw new BizError('宿主机名称已存在', { code: 'CONFLICT', httpStatus: 409, data: { name: body.name } })
  }
  const host = await db.hostNode.create({
    data: {
      name: body.name,
      dockerApiUrl: body.dockerApiUrl,
      cpuTotal: body.cpuTotal,
      memoryTotal: body.memoryTotal,
      label: body.label ?? null,
      status: 'active',
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
    resourceType: 'host',
    resourceId: host.id,
    req,
    afterJson: { name: body.name, dockerApiUrl: body.dockerApiUrl, cpuTotal: body.cpuTotal, memoryTotal: body.memoryTotal },
  })

  return { id: host.id, name: host.name }
})
