import { wrapHandler, ValidationError } from '@/lib/errors'
import { listConfigHistory, rollbackConfig } from '@/lib/config-cache'
import { db } from '@/lib/db'
import { z } from 'zod'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody, parsePagination } from '@/lib/platform-helpers'

// GET /api/platform/config/[key]/versions — version history
export const GET = wrapHandler(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  await requireAdmin()
  const { key } = await ctx.params
  const url = new URL(req.url)
  const { pageSize, skip } = parsePagination(url)
  const limit = Math.min(pageSize, 100)
  const rows = await listConfigHistory(key, limit)
  const items = rows.slice(skip, skip + limit)
  return {
    items: items.map((v) => ({
      id: v.id,
      configKey: v.configKey,
      beforeJson: v.beforeJson ? JSON.parse(v.beforeJson) : null,
      afterJson: v.afterJson ? JSON.parse(v.afterJson) : null,
      operatorUserId: v.operatorUserId,
      createdAt: v.createdAt,
    })),
    total: rows.length,
  }
})

// POST /api/platform/config/[key]/versions — rollback to a version
const RollbackBodySchema = z.object({
  versionId: z.string(),
})

export const POST = wrapHandler(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const admin = await requireAdmin()
  const { key } = await ctx.params
  const body = await parseBody(req, RollbackBodySchema)
  // Verify version belongs to this key
  const ver = await db.configVersion.findUnique({ where: { id: body.versionId } })
  if (!ver || ver.configKey !== key) {
    throw new ValidationError('版本不存在或不属于该配置项', { code: 'NOT_FOUND', httpStatus: 404 })
  }
  const rolledBack = await rollbackConfig(body.versionId, admin.uid)

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'config',
    resourceId: key,
    req,
    beforeJson: { rolledBackToVersion: body.versionId },
    afterJson: rolledBack,
  })

  return { key, value: rolledBack, rolledBackToVersion: body.versionId }
})
