import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/platform-auth'
import { platformAudit, operatorDisplayName } from '@/lib/platform-audit'
import { wrapHandler } from '@/lib/errors'

// GET /api/platform/users/export — stream CSV download
//   Query params: same filters as list (?q=&role=&status=&groupId=)
export const GET = wrapHandler(async (req: Request) => {
  const admin = await requireAdmin()
  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const role = url.searchParams.get('role') || ''
  const status = url.searchParams.get('status') || ''
  const groupId = url.searchParams.get('groupId') || ''

  const where = {
    deletedAt: null,
    ...(q
      ? { OR: [{ email: { contains: q } }, { username: { contains: q } }, { displayName: { contains: q } }] }
      : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(groupId ? { groupId } : {}),
  }

  const users = await db.user.findMany({
    where,
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  })

  const headers = ['id', 'username', 'email', 'displayName', 'role', 'status', 'twoFactorEnabled', 'groupName', 'lastLoginAt', 'createdAt']
  const csvLines: string[] = [headers.join(',')]
  for (const u of users) {
    const row = [
      u.id,
      csvEscape(u.username),
      csvEscape(u.email),
      csvEscape(u.displayName ?? ''),
      u.role,
      u.status,
      String(u.twoFactorEnabled),
      csvEscape(u.group?.name ?? ''),
      u.lastLoginAt ? u.lastLoginAt.toISOString() : '',
      u.createdAt.toISOString(),
    ]
    csvLines.push(row.join(','))
  }
  const csv = csvLines.join('\n')

  const adminUser = await db.user.findUnique({
    where: { id: admin.uid },
    select: { displayName: true, username: true, email: true },
  })
  await platformAudit({
    operatorId: admin.uid,
    operatorName: operatorDisplayName(adminUser),
    operationType: 'export',
    resourceType: 'user',
    req,
    afterJson: { count: users.length },
  })

  // Return as a CSV file download
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="users-${Date.now()}.csv"`,
    },
  })
})

function csvEscape(s: string): string {
  if (s == null) return ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
