import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { assembleConfig, validateConfig, type SingBoxFormConfig } from '@/lib/singbox-config'
import * as docker from '@/lib/docker-client'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parsePagination, parseBody } from '@/lib/platform-helpers'

const SINGBOX_IMAGE = process.env.SINGBOX_IMAGE || 'ghcr.io/sagernet/sing-box:latest'

// GET /api/platform/singbox-instances — list
export const GET = wrapHandler(async (req: Request) => {
  await requireSuperadmin()
  const url = new URL(req.url)
  const { page, pageSize, skip } = parsePagination(url)
  const status = url.searchParams.get('status') || ''
  const where = { deletedAt: null, ...(status ? { status } : {}) }
  const [total, instances] = await Promise.all([
    db.singboxInstance.count({ where }),
    db.singboxInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ])
  return {
    items: instances.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      tags: i.tags ? JSON.parse(i.tags) : [],
      cpuLimit: i.cpuLimit,
      memoryLimit: i.memoryLimit,
      dockerContainerId: i.dockerContainerId,
      status: i.status,
      hostNodeId: i.hostNodeId,
      socksAddress: i.socksAddress,
      maxSessions: i.maxSessions,
      trafficIn: i.trafficIn,
      trafficOut: i.trafficOut,
      createdAt: i.createdAt,
    })),
    total,
    page,
    pageSize,
  }
})

// POST /api/platform/singbox-instances — create
const CreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  tags: z.array(z.string()).default([]),
  cpuLimit: z.number().min(0.001).max(64).default(1),
  memoryLimit: z.number().min(1).max(65536).default(512),
  hostNodeId: z.string().optional(),
  maxSessions: z.number().int().min(1).max(1024).default(64),
  formConfig: z.custom<SingBoxFormConfig>((val) => {
    try {
      validateConfig(assembleConfig(val as SingBoxFormConfig))
      return true
    } catch (e) {
      throw new ValidationError('表单配置无效', { code: 'VALIDATION_FAILED', cause: e })
    }
  }),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireSuperadmin()
  const body = await parseBody(req, CreateBodySchema)

  // Uniqueness
  const existing = await db.singboxInstance.findUnique({ where: { name: body.name } })
  if (existing && !existing.deletedAt) {
    throw new BizError('实例名称已存在', { code: 'CONFLICT', httpStatus: 409, data: { name: body.name } })
  }

  // Optional: host node resource check
  let hostNode: Awaited<ReturnType<typeof db.hostNode.findUnique>> = null
  if (body.hostNodeId) {
    hostNode = await db.hostNode.findUnique({ where: { id: body.hostNodeId } })
    if (!hostNode || hostNode.deletedAt) {
      throw new ValidationError('宿主机不存在', { code: 'NOT_FOUND', httpStatus: 404 })
    }
    if (hostNode.cpuUsed + body.cpuLimit > hostNode.cpuTotal) {
      throw new BizError('宿主机 CPU 资源不足', {
        code: 'QUOTA_EXCEEDED',
        httpStatus: 429,
        data: { available: hostNode.cpuTotal - hostNode.cpuUsed, requested: body.cpuLimit },
      })
    }
  }

  // Assemble + validate config in memory
  const configObj = assembleConfig(body.formConfig)
  validateConfig(configObj)
  const configJson = JSON.stringify(configObj)

  // Create Docker container, inject config via env var (config is NOT written to disk)
  const containerName = `singbox-${body.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now()}`
  let containerId: string | null = null
  try {
    containerId = await docker.createContainer({
      name: containerName,
      image: SINGBOX_IMAGE,
      env: [`SINGBOX_CONFIG=${configJson}`],
      cpuQuota: Math.round(body.cpuLimit * 100_000),
      memoryBytes: Math.round(body.memoryLimit * 1024 * 1024),
      networkMode: 'bridge',
      exposedPorts: { '1080/tcp': {} },
      portBindings: { '1080/tcp': [{ HostPort: '0' }] }, // 0 = random host port
      restartPolicy: { Name: 'unless-stopped' },
      labels: { app: 'singbox', name: body.name },
    })
    await docker.startContainer(containerId)
  } catch (e) {
    // If container was created but start failed, clean up
    if (containerId) await docker.removeContainer(containerId, { force: true }).catch(() => {})
    throw e
  }

  // Inspect to read back the assigned host port
  let socksAddress: string | null = null
  try {
    const info = await docker.inspectContainer(containerId)
    const ip = info.networkSettings?.ipAddress
    if (ip) socksAddress = `${ip}:1080`
  } catch {
    // Non-fatal — admin can update later
  }

  // Insert singbox_instance
  const instance = await db.singboxInstance.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      tags: body.tags.length ? JSON.stringify(body.tags) : null,
      cpuLimit: body.cpuLimit,
      memoryLimit: body.memoryLimit,
      dockerContainerId: containerId,
      status: 'running',
      hostNodeId: body.hostNodeId ?? null,
      socksAddress,
      configJson,
      maxSessions: body.maxSessions,
    },
  })

  // Auto-create proxy_node entry pointing back to this singbox instance
  await db.proxyNode.create({
    data: {
      name: `${body.name}-internal`,
      type: 'internal_singbox',
      singboxInstanceId: instance.id,
      socksAddress,
      status: 'active',
      tags: body.tags.length ? JSON.stringify(body.tags) : null,
      groupId: null,
    },
  })

  // Update host node resource usage
  if (hostNode) {
    await db.hostNode.update({
      where: { id: hostNode.id },
      data: {
        cpuUsed: { increment: body.cpuLimit },
        memoryUsed: { increment: body.memoryLimit },
      },
    })
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'create',
    resourceType: 'singbox',
    resourceId: instance.id,
    req,
    afterJson: { name: body.name, containerId, socksAddress, cpuLimit: body.cpuLimit, memoryLimit: body.memoryLimit },
  })

  return {
    id: instance.id,
    name: instance.name,
    containerId,
    socksAddress,
    status: instance.status,
  }
})
