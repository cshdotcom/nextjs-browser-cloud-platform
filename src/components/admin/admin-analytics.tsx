'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line,
} from 'recharts'
import {
  RefreshCw, Loader2, TrendingUp, TrendingDown, Activity, ShieldCheck,
  AlertTriangle, Globe, BarChart3, PieChart as PieIcon, LineChart as LineIcon,
} from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface AnalyticsData {
  loginTrend: { date: string; success: number; failed: number }[]
  severityDist: { name: string; value: number; color: string }[]
  eventTypeDist: { eventType: string; count: number }[]
  twoFactorCoverage: { name: string; value: number; color: string }[]
  topIps: { ip: string; count: number; country?: string | null; flag?: string | null; isPrivate?: boolean }[]
  geoDist: { country: string; flag: string; count: number }[]
  accountStatus: { name: string; value: number; color: string }[]
  sessionTrend: { date: string; count: number }[]
  days: number
  summary: { totalLogs: number; totalAttempts: number; successRate: number; uniqueCountries: number }
}

const EVENT_LABELS: Record<string, string> = {
  login_success: '登录成功', login_failed: '登录失败', password_error: '密码错误',
  email_code_error: '验证码错误', twofa_verify_success: '2FA通过', twofa_verify_failed: '2FA失败',
  twofa_enable: '开启2FA', twofa_disable: '关闭2FA', twofa_reset_by_admin: '管理员重置2FA',
  backup_code_used: '备份码使用', backup_code_regenerated: '备份码重生成',
  trusted_device_added: '受信设备新增', trusted_device_revoked: '受信设备撤销',
  password_change: '密码修改', email_change: '邮箱变更', device_logout: '设备下线',
  all_devices_logout: '全部下线', register: '注册', account_locked: '账号锁定',
  account_unlocked: '账号解锁', admin_force_logout: '管理员强制下线',
  admin_reset_2fa: '管理员重置2FA', admin_user_disable: '管理员禁用账号',
  admin_security_setting_change: '安全配置变更', api_token_created: 'Token创建',
  api_token_revoked: 'Token撤销', api_token_auto_revoked: 'Token自动撤销',
  forgot_password_requested: '找回密码', password_reset: '密码重置',
  anomaly_login_alert: '异地告警', rate_limit_hit: '触发限流',
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--popover-foreground)',
}

export function AdminAnalytics() {
  const [data, setData] = React.useState<AnalyticsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [days, setDays] = React.useState(7)
  const [autoRefresh, setAutoRefresh] = React.useState(false)

  const load = React.useCallback(async (d: number) => {
    setLoading(true)
    try {
      const res = await jsonFetch(`/api/admin/analytics?days=${d}`)
      setData(res)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load(days) }, [load, days])

  // auto-refresh every 30s when enabled
  React.useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => load(days), 30000)
    return () => clearInterval(t)
  }, [autoRefresh, days, load])

  const handleDaysChange = (d: number) => {
    setDays(d)
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2">{[...Array(4)].map((_, i) => <div key={i} className="h-72 rounded-xl bg-muted/40 animate-pulse" />)}</div>
      </div>
    )
  }

  if (!data) return null

  const total2fa = data.twoFactorCoverage.reduce((s, x) => s + x.value, 0)
  const totalStatus = data.accountStatus.reduce((s, x) => s + x.value, 0)

  return (
    <div className="space-y-4">
      {/* Summary header with time range selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">风控分析看板</h2>
          <Badge variant="secondary" className="text-[10px]">最近 {data.days} 天</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 bg-muted/30">
            {[
              { d: 7, label: '7天' },
              { d: 30, label: '30天' },
              { d: 90, label: '90天' },
            ].map((opt) => (
              <button
                key={opt.d}
                onClick={() => handleDaysChange(opt.d)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${days === opt.d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Auto-refresh toggle */}
          <Button
            size="sm"
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh((v) => !v)}
            title="每 30 秒自动刷新"
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline ml-1">自动刷新</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => load(days)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="登录尝试"
          value={data.summary.totalAttempts}
          icon={<Activity className="h-4 w-4" />}
          sub={`成功率 ${data.summary.successRate}%`}
          accent="primary"
        />
        <KpiCard
          label="审计事件"
          value={data.summary.totalLogs}
          icon={<ShieldCheck className="h-4 w-4" />}
          sub={`${data.days} 天总量`}
          accent="emerald"
        />
        <KpiCard
          label="严重事件"
          value={data.severityDist.find((s) => s.name === '严重')?.value || 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          sub="需立即关注"
          accent="red"
        />
        <KpiCard
          label="2FA 覆盖率"
          value={`${total2fa > 0 ? Math.round((data.twoFactorCoverage[0].value / total2fa) * 100) : 0}%`}
          icon={<ShieldCheck className="h-4 w-4" />}
          sub={`${data.twoFactorCoverage[0].value} / ${total2fa} 用户`}
          accent={data.twoFactorCoverage[0].value / Math.max(total2fa, 1) >= 0.5 ? 'emerald' : 'amber'}
        />
      </div>

      {/* Login trend — area chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-primary" />
           登录趋势（成功 / 失败）
          </CardTitle>
          <CardDescription>最近 7 天每日登录成功与失败次数</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.loginTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.58 0.24 27)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.58 0.24 27)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="success" name="成功" stroke="oklch(0.55 0.13 165)" strokeWidth={2} fill="url(#gSuccess)" />
              <Area type="monotone" dataKey="failed" name="失败" stroke="oklch(0.58 0.24 27)" strokeWidth={2} fill="url(#gFailed)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Severity distribution — donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-primary" />
              事件严重程度分布
            </CardTitle>
            <CardDescription>按严重等级统计安全事件</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.severityDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {data.severityDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 2FA coverage — donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              2FA 覆盖率
            </CardTitle>
            <CardDescription>已开启与未开启双因素认证的用户占比</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.twoFactorCoverage}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  stroke="var(--background)"
                  strokeWidth={2}
                  label={({ value }) => value}
                  labelLine={false}
                >
                  {data.twoFactorCoverage.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Event type breakdown — horizontal bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              事件类型 Top 8
            </CardTitle>
            <CardDescription>出现频次最高的安全事件类型</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.eventTypeDist.map((e) => ({ name: EVENT_LABELS[e.eventType] || e.eventType, count: e.count }))} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--accent)', fillOpacity: 0.3 }} />
                <Bar dataKey="count" name="次数" fill="oklch(0.55 0.13 165)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top IPs + geo distribution + account status */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                高频登录 IP Top 5
              </CardTitle>
              <CardDescription>最近 {data.days} 天登录尝试最多的 IP 与归属地</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.topIps.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">暂无数据</div>
              ) : (
                data.topIps.map((ip, i) => {
                  const max = data.topIps[0].count || 1
                  const pct = (ip.count / max) * 100
                  return (
                    <div key={ip.ip} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      {ip.flag && <span className="text-sm leading-none">{ip.flag}</span>}
                      <code className="text-xs font-mono w-28 truncate">{ip.ip}</code>
                      {ip.country && <span className="text-[10px] text-muted-foreground w-12 truncate">{ip.country}</span>}
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-8 text-right">{ip.count}</span>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                登录地区分布
              </CardTitle>
              <CardDescription>最近 {data.days} 天登录尝试来源国家/地区</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.geoDist.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">暂无数据</div>
              ) : (
                data.geoDist.map((g, i) => {
                  const max = data.geoDist[0].count || 1
                  const pct = (g.count / max) * 100
                  return (
                    <div key={g.country} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-sm leading-none w-5">{g.flag}</span>
                      <span className="text-xs w-20 truncate">{g.country}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-8 text-right">{g.count}</span>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                账号状态分布
              </CardTitle>
              <CardDescription>正常 / 锁定 / 禁用</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data.accountStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    paddingAngle={3}
                    stroke="var(--background)"
                    strokeWidth={2}
                    label={({ value }) => value > 0 ? value : ''}
                    labelLine={false}
                  >
                    {data.accountStatus.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Session creation trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            新增会话趋势
          </CardTitle>
          <CardDescription>最近 7 天每日新建登录会话数</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.sessionTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="count" name="新增会话" stroke="oklch(0.6 0.118 184)" strokeWidth={2.5} dot={{ r: 3, fill: 'oklch(0.6 0.118 184)' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label, value, icon, sub, accent = 'primary',
}: {
  label: string; value: React.ReactNode; icon: React.ReactNode; sub?: string
  accent?: 'primary' | 'emerald' | 'amber' | 'red'
}) {
  const accentMap = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentMap[accent]}`}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

void TrendingDown
