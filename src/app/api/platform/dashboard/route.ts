import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, wrapHandler } from '@/lib/errors'
import { requireAuth } from '@/lib/platform-auth'

// GET /api/platform/dashboard — aggregated overview stats for the platform shell dashboard
// Returns data nested under `data` field (matching the {ok,code,msg,data,traceId} envelope).
export const GET = wrapHandler(async () => {
  const admin = await requireAuth()
  void admin
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 3600 * 1000)

  const [
    activeWorkspaces,
    singboxInstances,
    proxyNodes,
    todayAlerts,
    totalUsers,
    activeSessions,
    todayAuditEvents,
    recentLogs,
    recentAlerts,
  ] = await Promise.all([
    db.browserWorkspace.count({ where: { status: { in: ['running', 'active'] }, deletedAt: null } }),
    db.singboxInstance.count({ where: { deletedAt: null } }),
    db.proxyNode.count({ where: { deletedAt: null } }),
    db.alert.count({ where: { triggerAt: { gt: last24h } } }),
    db.user.count({ where: { deletedAt: null } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    db.auditLog.count({ where: { createdAt: { gt: last24h } } }),
    db.auditLog.findMany({
      where: { createdAt: { gt: last24h } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, operationType: true, resourceType: true, operatorName: true, clientIp: true, createdAt: true },
    }),
    db.alert.findMany({
      where: { handleStatus: 'pending' },
      orderBy: { triggerAt: 'desc' },
      take: 5,
      select: { id: true, title: true, level: true, triggerAt: true },
    }),
  ])

  // Resource usage (approximate from host nodes)
  const hosts = await db.hostNode.findMany({ where: { deletedAt: null }, select: { cpuUsed: true, cpuTotal: true, memoryUsed: true, memoryTotal: true } })
  const totalCpu = hosts.reduce((s, h) => s + (h.cpuTotal || 0), 0)
  const usedCpu = hosts.reduce((s, h) => s + (h.cpuUsed || 0), 0)
  const totalMem = hosts.reduce((s, h) => s + (h.memoryTotal || 0), 0)
  const usedMem = hosts.reduce((s, h) => s + (h.memoryUsed || 0), 0)

  return ok({
    activeWorkspaces,
    singboxInstances,
    proxyNodes,
    todayAlerts,
    totalUsers,
    activeSessions,
    todayAuditEvents,
    cpuUsedPct: totalCpu > 0 ? (usedCpu / totalCpu) * 100 : 0,
    memUsedPct: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
    recentActivity: recentLogs,
    recentAlerts,
  })
})

void NextResponse
