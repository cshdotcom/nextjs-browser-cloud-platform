import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import * as steel from '@/lib/steel-client'
import { releaseQuota } from '@/lib/quota'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// POST /api/platform/workspaces/batch — batch stop / delete
const BatchBodySchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(['stop', 'delete']),
})

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, BatchBodySchema)
  const workspaces = await db.browserWorkspace.findMany({
    where: { id: { in: body.ids }, deletedAt: null },
  })
  if (workspaces.length === 0) {
    throw new ValidationError('未找到任何匹配的工作区', { code: 'NOT_FOUND', httpStatus: 404 })
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const w of workspaces) {
    try {
      if (body.action === 'stop') {
        if (w.steelSessionId) await steel.deleteSession(w.steelSessionId).catch(() => {})
        await db.browserWorkspace.update({ where: { id: w.id }, data: { status: 'stopped' } })
      } else {
        // delete
        if (w.steelSessionId) await steel.deleteSession(w.steelSessionId).catch(() => {})
        await db.browserWorkspace.update({
          where: { id: w.id },
          data: { deletedAt: new Date(), status: 'stopped' },
        })
        // Release quota
        const resource = w.mode === 'novnc_full' ? 'novnc_workspace' : 'browser_workspace'
        await releaseQuota('user', w.userId, resource, 1, { actorId: admin.uid }).catch(() => {})
      }
      results.push({ id: w.id, ok: true })
    } catch (e) {
      results.push({ id: w.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: body.action === 'stop' ? 'update' : 'delete',
    resourceType: 'workspace',
    req,
    afterJson: {
      action: body.action,
      requested: body.ids.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
  })

  return {
    action: body.action,
    requested: body.ids.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  }
})
