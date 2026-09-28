'use client'

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCard, PageHeader } from '@/components/shared/page-header'
import { Activity, KeyRound, AlertTriangle, Smartphone, CheckCircle2, XCircle, Clock, TrendingUp, Users } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

interface Metrics {
  totalUsers: number; activeUsers: number; lockedUsers: number; disabledUsers: number
  twoFactorUsers: number; twoFactorRate: number
  activeSessions: number; activeApiTokens: number
  loginSuccess24h: number; loginFailed24h: number; auditLogs24h: number
}

export function AdminDashboard() {
  const [m, setM] = React.useState<Metrics | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch('/api/admin/dashboard')
      setM(d.metrics)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  if (loading || !m) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[...Array(8)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />)}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">平台安全指标（最近 24 小时）</h2>
        <Button size="sm" variant="outline" onClick={load}>刷新</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="总用户" value={m.totalUsers} icon={<Users className="h-4 w-4" />} trend={`活跃 ${m.activeUsers}`} />
        <StatCard label="2FA 覆盖" value={`${m.twoFactorRate}%`} icon={<KeyRound className="h-4 w-4" />} accent={m.twoFactorRate >= 50 ? 'emerald' : 'amber'} trend={`${m.twoFactorUsers} 人已开启`} />
        <StatCard label="锁定账号" value={m.lockedUsers} icon={<AlertTriangle className="h-4 w-4" />} accent={m.lockedUsers > 0 ? 'red' : 'primary'} trend={`禁用 ${m.disabledUsers}`} />
        <StatCard label="活跃会话" value={m.activeSessions} icon={<Smartphone className="h-4 w-4" />} trend={`API Token ${m.activeApiTokens}`} />
        <StatCard label="登录成功" value={m.loginSuccess24h} icon={<CheckCircle2 className="h-4 w-4" />} accent="emerald" trend="24h" />
        <StatCard label="登录失败" value={m.loginFailed24h} icon={<XCircle className="h-4 w-4" />} accent={m.loginFailed24h > 10 ? 'red' : 'amber'} trend="24h" />
        <StatCard label="审计事件" value={m.auditLogs24h} icon={<Clock className="h-4 w-4" />} trend="24h" />
        <StatCard label="2FA 安全态势" value={m.twoFactorRate >= 80 ? '优秀' : m.twoFactorRate >= 50 ? '良好' : '需改进'} icon={<TrendingUp className="h-4 w-4" />} accent={m.twoFactorRate >= 80 ? 'emerald' : 'amber'} />
      </div>
      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          提示：建议定期检查「审计日志」与「在线会话」标签，发现可疑活动应立即冻结账号并强制下线。
        </CardContent>
      </Card>
    </div>
  )
}
