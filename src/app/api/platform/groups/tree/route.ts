import { wrapHandler } from '@/lib/errors'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'

// GET /api/platform/groups/tree — assembled tree JSON
export const GET = wrapHandler(async () => {
  await requireAdmin()
  const all = await db.userGroup.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, parentId: true, enabled: true, description: true },
  })
  const byParent = new Map<string | null, typeof all>()
  for (const g of all) {
    const k = g.parentId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(g)
  }
  const build = (parentId: string | null): unknown[] => {
    const children = byParent.get(parentId) ?? []
    return children.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      enabled: g.enabled,
      description: g.description,
      children: build(g.id),
    }))
  }
  return { tree: build(null) }
})
