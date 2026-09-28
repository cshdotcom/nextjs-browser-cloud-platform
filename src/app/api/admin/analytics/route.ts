import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { apiOk } from '@/lib/api'
import { requireAdmin } from '@/lib/session'
import { lookupGeo } from '@/lib/geoip'

// GET /api/admin/analytics — aggregated risk analytics for charts
// Supports `days` param (7/30/90, default 7).
// Returns: login trends, severity distribution, event-type breakdown,
// 2FA coverage, lockout stats, top IPs, geo distribution, session trend.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  void admin
  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7'), 1), 90)
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000)

  // 1. Login success/fail trend (daily buckets)
  const loginAttempts = await db.loginAttempt.findMany({
    where: { createdAt: { gt: since } },
    select: { success: true, createdAt: true, ipAddress: true },
  })
  const trendMap = new Map<string, { date: string; success: number; failed: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    trendMap.set(key, { date: key, success: 0, failed: 0 })
  }
  for (const la of loginAttempts) {
    const d = la.createdAt
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    const bucket = trendMap.get(key)
    if (bucket) {
      if (la.success) bucket.success++
      else bucket.failed++
    }
  }
  const loginTrend = Array.from(trendMap.values())

  // 2. Severity distribution
  const allLogs = await db.securityAuditLog.findMany({
    where: { createdAt: { gt: since } },
    select: { severity: true, eventType: true, ipAddress: true },
  })
  const severityCount = { info: 0, warning: 0, critical: 0 }
  const eventTypeCount: Record<string, number> = {}
  for (const l of allLogs) {
    severityCount[l.severity as keyof typeof severityCount]++
    eventTypeCount[l.eventType] = (eventTypeCount[l.eventType] || 0) + 1
  }
  const severityDist = [
    { name: '信息', value: severityCount.info, color: 'oklch(0.55 0.13 165)' },
    { name: '警告', value: severityCount.warning, color: 'oklch(0.76 0.18 70)' },
    { name: '严重', value: severityCount.critical, color: 'oklch(0.58 0.24 27)' },
  ]
  const eventTypeDist = Object.entries(eventTypeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ eventType: k, count: v }))

  // 3. 2FA coverage
  const totalUsers = await db.user.count()
  const twoFactorUsers = await db.user.count({ where: { twoFactorEnabled: true } })
  const twoFactorCoverage = [
    { name: '已开启 2FA', value: twoFactorUsers, color: 'oklch(0.55 0.13 165)' },
    { name: '未开启', value: totalUsers - twoFactorUsers, color: 'oklch(0.7 0.02 180)' },
  ]

  // 4. Top IPs (by attempt count)
  const ipMap: Record<string, number> = {}
  for (const la of loginAttempts) {
    ipMap[la.ipAddress] = (ipMap[la.ipAddress] || 0) + 1
  }
  const topIps = Object.entries(ipMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ip, count]) => {
      const geo = lookupGeo(ip)
      return { ip, count, country: geo.countryName, flag: geo.flag, isPrivate: geo.isPrivate }
    })

  // 5. Geo distribution (by login attempt count per country)
  const geoMap: Record<string, { country: string; flag: string; count: number }> = {}
  for (const la of loginAttempts) {
    const geo = lookupGeo(la.ipAddress)
    const key = geo.countryName || (geo.isPrivate ? '内网' : '未知')
    if (!geoMap[key]) geoMap[key] = { country: key, flag: geo.flag || '🌐', count: 0 }
    geoMap[key].count++
  }
  const geoDist = Object.values(geoMap).sort((a, b) => b.count - a.count).slice(0, 8)

  // 6. Account status breakdown
  const activeUsers = await db.user.count({ where: { status: 'active' } })
  const lockedUsers = await db.user.count({ where: { lockedUntil: { gt: now } } })
  const disabledUsers = await db.user.count({ where: { status: { in: ['disabled', 'suspended'] } } })
  const accountStatus = [
    { name: '正常', value: activeUsers, color: 'oklch(0.55 0.13 165)' },
    { name: '锁定', value: lockedUsers, color: 'oklch(0.76 0.18 70)' },
    { name: '禁用', value: disabledUsers, color: 'oklch(0.58 0.24 27)' },
  ]

  // 7. Session creation trend
  const sessionsSince = await db.session.findMany({
    where: { createdAt: { gt: since } },
    select: { createdAt: true },
  })
  const sessionTrendMap = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    sessionTrendMap.set(key, 0)
  }
  for (const s of sessionsSince) {
    const key = `${s.createdAt.getMonth() + 1}/${s.createdAt.getDate()}`
    if (sessionTrendMap.has(key)) sessionTrendMap.set(key, (sessionTrendMap.get(key) || 0) + 1)
  }
  const sessionTrend = Array.from(sessionTrendMap.entries()).map(([date, count]) => ({ date, count }))

  return apiOk({
    loginTrend,
    severityDist,
    eventTypeDist,
    twoFactorCoverage,
    topIps,
    geoDist,
    accountStatus,
    sessionTrend,
    days,
    summary: {
      totalLogs: allLogs.length,
      totalAttempts: loginAttempts.length,
      successRate: loginAttempts.length > 0 ? Math.round((loginAttempts.filter((l) => l.success).length / loginAttempts.length) * 100) : 0,
      uniqueCountries: geoDist.length,
    },
  })
}
