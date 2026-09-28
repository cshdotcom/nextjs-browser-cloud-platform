import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'

// GET /api/admin/users — list users with pagination + filters
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1)
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '20'), 100)
  const q = url.searchParams.get('q') || ''
  const status = url.searchParams.get('status') || ''
  const twoFactor = url.searchParams.get('twoFactor') // 'on' | 'off'

  const where = {
    ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}),
    ...(status ? { status } : {}),
    ...(twoFactor === 'on' ? { twoFactorEnabled: true } : twoFactor === 'off' ? { twoFactorEnabled: false } : {}),
  }

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { group: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return apiOk({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerified,
      twoFactorEnabled: u.twoFactorEnabled,
      groupId: u.groupId,
      groupName: u.group?.name ?? null,
      groupEnforceTwoFactor: u.group?.enforceTwoFactor ?? false,
      failedLoginAttempts: u.failedLoginAttempts,
      lockedUntil: u.lockedUntil,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      createdAt: u.createdAt,
    })),
    total,
    page,
    pageSize,
  })
}
