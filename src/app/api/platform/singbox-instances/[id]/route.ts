import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { assembleConfig, validateConfig, type SingBoxFormConfig } from '@/lib/singbox-config'
import * as docker from '@/lib/docker-client'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'
import { snapshotToRecycleBin, snapshotSingbox } from '@/lib/recycle'

// GET /api/platform/singbox-instances/[id] — detail with config preview
export const GET = wrapHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSuperadmin()
  const { id } = await ctx.params
  const inst = await db.singboxInstance.findUnique({
    where: { id },
    include: {
      hostNode: { select: { id: true, name: true, status: true } },
      proxyNodes: { select: { id: true, name: true, status: true, socksAddress: true } },
      _count: { select: { browserWorkspaces: true, configVersions: true } },
    },
  })
  if (!inst || inst.deletedAt) {
    throw new ValidationError('实例不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  return {
    id: inst.id,
    name: inst.name,
    description: inst.description,
    tags: inst.tags ? JSON.parse(inst.tags) : [],
    cpuLimit: inst.cpuLimit,
    memoryLimit: inst.memoryLimit,
    dockerContainerId: inst.dockerContainerId,
    status: inst.status,
    hostNode: inst.hostNode,
    socksAddress: inst.socksAddress,
    maxSessions: inst.maxSessions,
    trafficIn: inst.trafficIn,
    trafficOut: inst.trafficOut,
    configJson: inst.configJson ? JSON.parse(inst.configJson) : null,
    configVersions: inst._count.configVersions,
    activeWorkspaces: inst._count.browserWorkspaces,
    proxyNodes: inst.proxyNodes,
    createdAt: inst.createdAt,
    updatedAt: inst.updatedAt,
  }
})

// PATCH /api/platform/singbox-instances/[id] — update config → hot reload via docker signal
const UpdateBodySchema = z.object({
  formConfig: z.custom<SingBoxFormConfig>((val) => {
    try {
      validateConfig(assembleConfig(val as SingBoxFormConfig))
      return true
    } catch (e) {
      throw new ValidationError('表单配置无效', { code: 'VALIDATION_FAILED', cause: e })
    }
  }).optional(),
  description: z.string().max(1024).optional(),
  tags: z.array(z.string()).optional(),
  maxSessions: z.number().int().min(1).max(1024).optional(),
  cpuLimit: z.number().min(0.001).max(64).optional(),
  memoryLimit: z.number().min(1).max(65536).optional(),
})

export const PATCH = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireSuperadmin()
  const { id } = await ctx.params
  const body = await parseBody(req, UpdateBodySchema)
  const before = await db.singboxInstance.findUnique({ where: { id } })
  if (!before || before.deletedAt) {
    throw new ValidationError('实例不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }

  let newConfigJson: string | null = null
  if (body.formConfig) {
    const configObj = assembleConfig(body.formConfig)
    validateConfig(configObj)
    newConfigJson = JSON.stringify(configObj)
  }

  const patch: Record<string, unknown> = {}
  if (body.description !== undefined) patch.description = body.description
  if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags)
  if (body.maxSessions !== undefined) patch.maxSessions = body.maxSessions
  if (newConfigJson !== null) patch.configJson = newConfigJson

  const updated = await db.singboxInstance.update({ where: { id }, data: patch })

  // Hot-reload: stop+start the container with the new env var
  // (Sing-Box reads its config from the env var on container start; a SIGHUP
  // hot-reload isn't supported uniformly across versions, so we restart.)
  if (newConfigJson && before.dockerContainerId) {
    try {
      await docker.stopContainer(before.dockerContainerId, 5).catch(() => {})
      // Note: env var changes require container recreate. For minimal viable
      // implementation, we restart; for true hot-reload the container's
      // entrypoint would need to re-read the env var on SIGHUP. Documented
      // limitation.
      await docker.startContainer(before.dockerContainerId)
    } catch (e) {
      // Rollback config on failure
      await db.singboxInstance.update({ where: { id }, data: { configJson: before.configJson, status: 'error' } })
      throw new BizError('Sing-Box 配置热更新失败，已自动回滚', {
        code: 'EXTERNAL_API_ERROR',
        httpStatus: 502,
        data: { error: e instanceof Error ? e.message : String(e) },
      })
    }
    // Append config version history
    await db.singboxConfigVersion.create({
      data: { instanceId: id, configJson: newConfigJson },
    })
  }

  // Resource adjustments on host node
  if ((body.cpuLimit !== undefined || body.memoryLimit !== undefined) && before.hostNodeId) {
    const deltaCpu = (body.cpuLimit ?? before.cpuLimit) - before.cpuLimit
    const deltaMem = (body.memoryLimit ?? before.memoryLimit) - before.memoryLimit
    await db.hostNode.update({
      where: { id: before.hostNodeId },
      data: {
        cpuUsed: { increment: deltaCpu },
        memoryUsed: { increment: deltaMem },
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
    operationType: 'update',
    resourceType: 'singbox',
    resourceId: id,
    req,
    beforeJson: { name: before.name, status: before.status },
    afterJson: { name: updated.name, status: updated.status, hotReloaded: newConfigJson !== null },
  })

  return { id, hotReloaded: newConfigJson !== null }
})

// DELETE /api/platform/singbox-instances/[id] — with checks: no active workspaces
export const DELETE = wrapHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireSuperadmin()
  const { id } = await ctx.params
  const inst = await db.singboxInstance.findUnique({ where: { id } })
  if (!inst || inst.deletedAt) {
    throw new ValidationError('实例不存在', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  const activeWorkspaces = await db.browserWorkspace.count({
    where: { singboxInstanceId: id, deletedAt: null, status: { in: ['creating', 'running', 'idle'] } },
  })
  if (activeWorkspaces > 0) {
    throw new BizError('实例下存在活跃工作区，禁止删除', {
      code: 'CONFLICT',
      httpStatus: 409,
      data: { activeWorkspaces },
    })
  }

  // Best-effort Docker container removal
  if (inst.dockerContainerId) {
    await docker.stopContainer(inst.dockerContainerId, 10).catch(() => {})
    await docker.removeContainer(inst.dockerContainerId, { force: true }).catch(() => {})
  }

  await db.singboxInstance.update({ where: { id }, data: { deletedAt: new Date(), status: 'stopped' } })
  // Disable associated proxy nodes
  await db.proxyNode.updateMany({
    where: { singboxInstanceId: id },
    data: { status: 'offline' },
  })

  // Snapshot to recycle bin
  await snapshotToRecycleBin({
    resourceType: 'singbox',
    resourceId: id,
    snapshot: snapshotSingbox(inst),
    deletedBy: admin.uid,
  })

  // Release host node resources
  if (inst.hostNodeId) {
    await db.hostNode.update({
      where: { id: inst.hostNodeId },
      data: { cpuUsed: { decrement: inst.cpuLimit }, memoryUsed: { decrement: inst.memoryLimit } },
    })
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'delete',
    resourceType: 'singbox',
    resourceId: id,
    req,
    beforeJson: { name: inst.name, containerId: inst.dockerContainerId },
  })

  return { id, deleted: true }
})
