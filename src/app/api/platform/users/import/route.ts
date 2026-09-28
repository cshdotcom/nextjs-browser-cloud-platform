import { wrapHandler, ValidationError, BizError } from '@/lib/errors'
import { db } from '@/lib/db'
import { z } from 'zod'
import { hashPassword } from '@/lib/crypto'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { parseBody } from '@/lib/platform-helpers'

// POST /api/platform/users/import — CSV upload parse + bulk insert
// Accepts JSON: { rows: [{ username, email, displayName?, password, role?, groupId? }] }
const ImportRowSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  displayName: z.string().max(128).optional(),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'admin', 'superadmin']).default('user'),
  groupId: z.string().optional(),
})
const ImportBodySchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(1000),
  mode: z.enum(['skip', 'update']).default('skip'),
})

interface RowResult { row: number; username: string; email: string; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }

export const POST = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const body = await parseBody(req, ImportBodySchema)

  const results: RowResult[] = []
  let created = 0
  let updated = 0
  let skipped = 0
  let errored = 0

  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i]
    try {
      const existing = await db.user.findFirst({
        where: { OR: [{ email: row.email }, { username: row.username }], deletedAt: null },
      })
      if (existing) {
        if (body.mode === 'skip') {
          results.push({ row: i + 1, username: row.username, email: row.email, status: 'skipped' })
          skipped++
          continue
        }
        const passwordHash = await hashPassword(row.password)
        const updated_ = await db.user.update({
          where: { id: existing.id },
          data: {
            displayName: row.displayName ?? existing.displayName,
            passwordHash,
            role: row.role,
            groupId: row.groupId ?? existing.groupId,
          },
        })
        results.push({ row: i + 1, username: updated_.username, email: updated_.email, status: 'updated' })
        updated++
      } else {
        const passwordHash = await hashPassword(row.password)
        const created_ = await db.user.create({
          data: {
            username: row.username,
            email: row.email,
            displayName: row.displayName ?? null,
            passwordHash,
            role: row.role,
            groupId: row.groupId ?? null,
          },
        })
        results.push({ row: i + 1, username: created_.username, email: created_.email, status: 'created' })
        created++
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ row: i + 1, username: row.username, email: row.email, status: 'error', error: msg })
      errored++
    }
  }

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'import',
    resourceType: 'user',
    req,
    afterJson: { mode: body.mode, totalRows: body.rows.length, created, updated, skipped, errored },
  })

  if (errored > 0 && created + updated === 0) {
    throw new BizError('全部行导入失败', {
      code: 'VALIDATION_FAILED',
      httpStatus: 422,
      data: { results, summary: { created, updated, skipped, errored } },
    })
  }

  return { summary: { created, updated, skipped, errored, total: body.rows.length }, results }
})
