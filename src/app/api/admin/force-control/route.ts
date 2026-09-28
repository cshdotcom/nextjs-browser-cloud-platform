import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { requireSuperadmin } from '@/lib/platform-auth'
import { platformAudit } from '@/lib/platform-audit'
import { z } from 'zod'
import { killAllSessions } from '@/lib/session'

// POST /api/admin/force-control
// Body: { resourceType: 'workspace'|'singbox'|'proxy', resourceId: string, action: string, options?: {} }
// Actions: force_stop | force_restart | force_recycle | force_delete | force_disconnect_vnc | force_set_ttl
const ForceControlSchema = z.object({
  resourceType: z.enum(['workspace', 'singbox', 'proxy']),
  resourceId: z.string().min(1),
  action: z.enum(['force_stop', 'force_restart', 'force_recycle', 'force_delete', 'force_disconnect_vnc', 'force_set_ttl']),
  ttlMinutes: z.number().int().min(1).max(1440).optional(),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireSuperadmin()
  const body = await ForceControlSchema.parseAsync(await req.json().catch(() => ({})))

  const { resourceType, resourceId, action } = body

  if (resourceType === 'workspace') {
    return ok(await forceControlWorkspace(admin.uid, resourceId, action, body.ttlMinutes, req))
  } else if (resourceType === 'singbox') {
    return ok(await forceControlSingbox(admin.uid, resourceId, action, req))
  }
  throw new ValidationError('不支持的资源类型')
})

async function forceControlWorkspace(adminId: string, workspaceId: string, action: string, ttlMinutes: number | undefined, req: Request) {
  const ws = await db.browserWorkspace.findUnique({ where: { id: workspaceId } })
  if (!ws || ws.deletedAt) throw new ValidationError('工作区不存在')

  let result: Record<string, unknown> = { workspaceId, action }

  if (action === 'force_stop') {
    // Stop the workspace session
    await db.browserWorkspace.update({ where: { id: workspaceId }, data: { status: 'stopped' } })
    result.message = '工作区已强制停止'
  } else if (action === 'force_restart') {
    // Restart: stop then mark as pending restart
    await db.browserWorkspace.update({ where: { id: workspaceId }, data: { status: 'restarting' } })
    result.message = '工作区已强制重启'
  } else if (action === 'force_recycle') {
    // Move to recycle bin
    await db.browserWorkspace.update({ where: { id: workspaceId }, data: { deletedAt: new Date(), status: 'deleted' } })
    await db.recycleBin.create({
      data: {
        resourceType: 'workspace',
        resourceId: workspaceId,
        resourceSnapshot: JSON.stringify({ name: ws.name, mode: ws.mode, status: ws.status }),
        deletedBy: adminId,
        expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
      },
    })
    result.message = '工作区已移入回收站'
  } else if (action === 'force_delete') {
    // Physical delete — bypass recycle bin
    await db.browserWorkspace.delete({ where: { id: workspaceId } })
    result.message = '工作区已彻底物理删除（不可恢复）'
    result.permanent = true
  } else if (action === 'force_disconnect_vnc') {
    // Disconnect all VNC clients (for NoVNC sessions)
    await db.browserWorkspace.update({ where: { id: workspaceId }, data: { status: 'vnc_disconnected' } })
    result.message = 'VNC 客户端已强制断开'
  } else if (action === 'force_set_ttl') {
    if (!ttlMinutes) throw new ValidationError('缺少 ttlMinutes 参数')
    await db.browserWorkspace.update({ where: { id: workspaceId }, data: { ttlMinutes } })
    result.message = `TTL 已修改为 ${ttlMinutes} 分钟`
    result.ttlMinutes = ttlMinutes
  }

  // Audit log — record as admin force control
  await platformAudit({
    userId: ws.userId,
    actorId: adminId,
    operationType: action,
    resourceType: 'workspace',
    resourceId: workspaceId,
    beforeJson: JSON.stringify({ status: ws.status, ttl: ws.ttlMinutes }),
    afterJson: JSON.stringify(result),
    req,
  })

  return result
}

async function forceControlSingbox(adminId: string, instanceId: string, action: string, req: Request) {
  const inst = await db.singboxInstance.findUnique({ where: { id: instanceId } })
  if (!inst || inst.deletedAt) throw new ValidationError('Sing-Box 实例不存在')

  let result: Record<string, unknown> = { instanceId, action }

  if (action === 'force_stop') {
    await db.singboxInstance.update({ where: { id: instanceId }, data: { status: 'stopped' } })
    // Cascade to proxy node
    await db.proxyNode.updateMany({ where: { singboxInstanceId: instanceId }, data: { status: 'offline' } })
    result.message = 'Sing-Box 实例已强制停止'
  } else if (action === 'force_restart') {
    await db.singboxInstance.update({ where: { id: instanceId }, data: { status: 'restarting' } })
    result.message = 'Sing-Box 实例已强制重启'
  } else if (action === 'force_recycle') {
    await db.singboxInstance.update({ where: { id: instanceId }, data: { deletedAt: new Date(), status: 'deleted' } })
    await db.proxyNode.updateMany({ where: { singboxInstanceId: instanceId }, data: { status: 'disabled', deletedAt: new Date() } })
    await db.recycleBin.create({
      data: {
        resourceType: 'singbox',
        resourceId: instanceId,
        resourceSnapshot: JSON.stringify({ name: inst.name, status: inst.status }),
        deletedBy: adminId,
        expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
      },
    })
    result.message = 'Sing-Box 实例已移入回收站'
  } else if (action === 'force_delete') {
    // Physical delete
    await db.singboxInstance.delete({ where: { id: instanceId } })
    await db.proxyNode.updateMany({ where: { singboxInstanceId: instanceId }, data: { status: 'disabled', deletedAt: new Date() } })
    result.message = 'Sing-Box 实例已彻底物理删除（不可恢复）'
    result.permanent = true
  }

  await platformAudit({
    actorId: adminId,
    operationType: action,
    resourceType: 'singbox',
    resourceId: instanceId,
    beforeJson: JSON.stringify({ name: inst.name, status: inst.status }),
    afterJson: JSON.stringify(result),
    req,
  })

  return result
}
