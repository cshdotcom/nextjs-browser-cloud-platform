'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard } from './shared/stat-card'
import { EmptyState, LoadingState, ErrorState } from './shared/empty-state'
import { usePlatformView, usePlatformFetch, formatRel, formatDateTime, type ViewId } from '@/lib/platform-client'
import {
  Boxes, Server, Network, BellRing, Activity, ArrowRight, Plus,
  Gauge, Cpu, Globe, Zap, ShieldCheck, Rocket, FileText,
} from 'lucide-react'

interface DashboardData {
  activeWorkspaces: number
  singboxInstances: number
  proxyNodes: number
  todayAlerts: number
  totalUsers: number
  todayAuditEvents: number
  cpuUsedPct?: number
  memUsedPct?: number
  recentActivity?: Array<{
    id: string
    operatorName: string
    operationType: string
    resourceType: string
    createdAt: string
  }>
  recentAlerts?: Array<{
    id: string
    title: string
    level: string
    triggerAt: string
  }>
}

export function Dashboard() {
  const { setView } = usePlatformView()
  const { data, loading, error, reload } = usePlatformFetch<DashboardData>('/api/platform/dashboard')

  const quickActions = [
    { label: '新建工作区', icon: Boxes, view: 'workspaces' as const, accent: 'primary' },
    { label: 'Sing-Box 实例', icon: Server, view: 'singbox' as const, accent: 'emerald' },
    { label: '代理节点', icon: Network, view: 'proxy' as const, accent: 'sky' },
    { label: '查看告警', icon: BellRing, view: 'alerts' as const, accent: 'amber' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">平台总览</h2>
        <p className="text-sm text-muted-foreground mt-0.5">实时掌握浏览器工作区、Sing-Box 实例与系统资源占用情况</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="活跃工作区" value={data?.activeWorkspaces ?? 0} icon={<Boxes className="h-4 w-4" />} loading={loading} accent="primary" trend="运行中的浏览器会话" />
        <StatCard label="Sing-Box 实例" value={data?.singboxInstances ?? 0} icon={<Server className="h-4 w-4" />} loading={loading} accent="emerald" trend="内置代理实例数" />
        <StatCard label="代理节点" value={data?.proxyNodes ?? 0} icon={<Network className="h-4 w-4" />} loading={loading} accent="sky" trend="外部+内置代理" />
        <StatCard label="今日告警" value={data?.todayAlerts ?? 0} icon={<BellRing className="h-4 w-4" />} loading={loading} accent="amber" trend="最近24小时触发" />
      </div>

      {/* Resource util + quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> 资源水位
              <Badge variant="outline" className="text-[9px] ml-auto">0.001 精度</Badge>
            </CardTitle>
            <CardDescription>全局 CPU/内存使用率概览</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResourceBar
              label="CPU 使用率"
              icon={<Cpu className="h-3.5 w-3.5" />}
              pct={data?.cpuUsedPct ?? 0}
              loading={loading}
            />
            <ResourceBar
              label="内存使用率"
              icon={<Gauge className="h-3.5 w-3.5" />}
              pct={data?.memUsedPct ?? 0}
              loading={loading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" /> 快速操作
            </CardTitle>
            <CardDescription>常用入口</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {quickActions.map((a) => {
              const Icon = a.icon
              return (
                <Button
                  key={a.label}
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-1.5"
                  onClick={() => setView(a.view)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{a.label}</span>
                </Button>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity + alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> 最近活动
              </CardTitle>
              <CardDescription>最近的操作审计记录</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView('audit')}>
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error.message} onRetry={reload} />
            ) : !data?.recentActivity || data.recentActivity.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="暂无活动" description="最近没有可显示的审计事件" />
            ) : (
              <ul className="space-y-2">
                {data.recentActivity.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm rounded-md border border-border/40 px-2.5 py-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{a.operationType}</span>
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-foreground/80">{a.operatorName}</span>
                      <span className="text-muted-foreground mx-1">·</span>
                      <span className="text-muted-foreground">{a.resourceType}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatRel(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4 w-4 text-amber-500" /> 最近告警
              </CardTitle>
              <CardDescription>未处理的高优先级告警</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView('alerts')}>
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingState />
            ) : !data?.recentAlerts || data.recentAlerts.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="一切正常" description="目前没有未处理告警" />
            ) : (
              <ul className="space-y-2">
                {data.recentAlerts.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm rounded-md border border-border/40 px-2.5 py-2">
                    <Badge
                      variant="outline"
                      className={
                        a.level === 'critical'
                          ? 'text-red-500 border-red-500/30 bg-red-500/10'
                          : a.level === 'warning'
                            ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                            : 'text-sky-500 border-sky-500/30 bg-sky-500/10'
                      }
                    >
                      {a.level}
                    </Badge>
                    <span className="flex-1 min-w-0 truncate">{a.title}</span>
                    <span className="text-[10px] text-muted-foreground">{formatRel(a.triggerAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System health */}
      <SystemHealthCard loading={loading} stats={data ? {
        activeWorkspaces: data.activeWorkspaces,
        singboxInstances: data.singboxInstances,
        proxyNodes: data.proxyNodes,
        activeSessions: data.activeSessions ?? 0,
        todayAlerts: data.todayAlerts,
        todayAuditEvents: data.todayAuditEvents ?? 0,
        cpuUsedPct: data.cpuUsedPct ?? 0,
        memUsedPct: data.memUsedPct ?? 0,
      } : null} setView={setView} />
    </div>
  )
}

function SystemHealthCard({ loading, stats, setView }: {
  loading: boolean
  stats: {
    activeWorkspaces: number
    singboxInstances: number
    proxyNodes: number
    activeSessions: number
    todayAlerts: number
    todayAuditEvents: number
    cpuUsedPct: number
    memUsedPct: number
  } | null
  setView: (v: ViewId) => void
}) {
  const healthItems = [
    { label: '工作区引擎', ok: true, detail: stats ? `${stats.activeWorkspaces} 个活跃` : '—', icon: <Boxes className="h-3.5 w-3.5" />, view: 'workspaces' as ViewId },
    { label: 'Sing-Box 编排', ok: true, detail: stats ? `${stats.singboxInstances} 个实例` : '—', icon: <Server className="h-3.5 w-3.5" />, view: 'singbox' as ViewId },
    { label: '代理网络', ok: true, detail: stats ? `${stats.proxyNodes} 个节点` : '—', icon: <Network className="h-3.5 w-3.5" />, view: 'proxy' as ViewId },
    { label: 'CPU 水位', ok: (stats?.cpuUsedPct ?? 0) < 80, detail: stats ? `${stats.cpuUsedPct.toFixed(1)}%` : '—', icon: <Gauge className="h-3.5 w-3.5" />, view: 'dashboard' as ViewId },
    { label: '内存水位', ok: (stats?.memUsedPct ?? 0) < 80, detail: stats ? `${stats.memUsedPct.toFixed(1)}%` : '—', icon: <Gauge className="h-3.5 w-3.5" />, view: 'dashboard' as ViewId },
    { label: '告警系统', ok: (stats?.todayAlerts ?? 0) === 0, detail: stats ? `${stats.todayAlerts} 条今日` : '—', icon: <BellRing className="h-3.5 w-3.5" />, view: 'alerts' as ViewId },
  ]
  const allOk = healthItems.every((h) => h.ok)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className={`h-4 w-4 ${allOk ? 'text-emerald-500' : 'text-amber-500'}`} />
              系统健康监控
            </CardTitle>
            <CardDescription>各子系统运行状态概览</CardDescription>
          </div>
          <Badge variant="secondary" className={`text-[10px] ${allOk ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
            {allOk ? '● 全部正常' : '● 需关注'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {healthItems.map((h) => {
              return (
                <button
                  key={h.label}
                  onClick={() => setView(h.view)}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 p-2.5 hover:border-primary/40 hover:bg-accent/20 transition-all text-left group"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${h.ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {h.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{h.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{h.detail}</div>
                  </div>
                  <span className={`h-1.5 w-1.5 rounded-full ${h.ok ? 'bg-emerald-500' : 'bg-amber-500'} group-hover:scale-150 transition-transform`} />
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResourceBar({ label, icon, pct, loading }: { label: string; icon: React.ReactNode; pct: number; loading?: boolean }) {
  const v = Math.max(0, Math.min(100, pct || 0))
  const tone = v > 85 ? 'from-red-500 to-red-400' : v > 60 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400'
  const ringTone = v > 85 ? 'text-red-500' : v > 60 ? 'text-amber-500' : 'text-emerald-500'
  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className={ringTone}>{icon}</span>{label}
        </span>
        <span className="font-medium tabular-nums">{loading ? '—' : `${v.toFixed(3)}%`}</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden relative">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500 ease-out group-hover:brightness-110`}
          style={{ width: loading ? '0%' : `${v}%` }}
        >
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" style={{ animationDuration: '2s' }} />
        </div>
      </div>
    </div>
  )
}
