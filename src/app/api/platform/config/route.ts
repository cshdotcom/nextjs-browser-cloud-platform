import { wrapHandler, ValidationError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { setConfig, getConfig, refreshCache, dumpConfigForAdmin } from '@/lib/config-cache'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// GET /api/platform/config — list all config grouped by category
export const GET = wrapHandler(async () => {
  await requireAdmin()
  await refreshCache()
  const all = dumpConfigForAdmin()
  // Also include the raw DB rows so admins see descriptions
  const rows = await db.systemConfig.findMany({ orderBy: { category: 'asc' } })
  const byCategory = new Map<string, unknown[]>()
  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, [])
    byCategory.get(r.category)!.push({
      key: r.key,
      valueJson: r.valueJson,
      description: r.description,
      updatedAt: r.updatedAt,
      source: all.find((c) => c.key === r.key)?.source ?? 'db',
    })
  }
  // Also surface defaults that have no DB row yet
  for (const entry of all) {
    if (!rows.some((r) => r.key === entry.key)) {
      const cat = entry.key.split('.')[0] || 'general'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push({
        key: entry.key,
        valueJson: JSON.stringify(entry.value),
        description: null,
        updatedAt: null,
        source: entry.source,
      })
    }
  }
  return { categories: Array.from(byCategory.entries()).map(([category, items]) => ({ category, items })) }
})

// PUT /api/platform/config — update a config key (creates ConfigVersion)
const UpdateBodySchema = z.object({
  key: z.string().min(1).max(255),
  value: z.unknown(),
  description: z.string().max(1024).optional(),
  reason: z.string().max(500).optional(),
})

export const PUT = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, UpdateBodySchema)

  const before = await getConfig(body.key)
  await setConfig(body.key, body.value, admin.uid, {
    description: body.description,
    reason: body.reason,
  })

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'update',
    resourceType: 'config',
    resourceId: body.key,
    req,
    beforeJson: before ?? null,
    afterJson: body.value,
  })

  return { key: body.key, before, after: body.value }
})
