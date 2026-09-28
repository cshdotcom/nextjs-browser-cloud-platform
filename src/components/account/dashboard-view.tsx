'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth, jsonFetch } from '@/lib/auth-client'
import { PageHeader, StatCard } from '@/components/shared/page-header'
import {
  LayoutDashboard,
  ShieldCheck,
  KeyRound,
  Smartphone,
  AlertTriangle,
  Activity,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'

interface DashboardData {
  metrics: {
    totalUsers: number
    activeUsers: number
    lockedUsers: number
    disabledUsers: number
    twoFactorUsers: number
    twoFactorRate: number
    activeSessions: number
    activeApiTokens: number
    loginSuccess24h: number
    loginFailed24h: number
    auditLogs24h: number
  } | null
}

export function DashboardView() {
  const { user, setView, needsTwoFactorSetup, passwordInfo } = useAuth()
  const [data, setData] = React.useState<DashboardData['metrics'] | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await jsonFetch('/api/auth/me')
        // user data is already in store
      } catch {}
      // Only admins can fetch dashboard metrics
      if (user?.role === 'admin' || user?.role === 'superadmin') {
        try {
          const d = await jsonFetch('/api/admin/dashboard')
          if (!cancelled) setData(d.metrics)
        } catch {}
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role])

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <div>
      <PageHeader
        title={`欢迎回来，${user?.name || user?.email?.split('@')[0] || '用户'}`}
        description="您的账号安全概览与快速操作"
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      {needsTwoFactorSetup && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">系统要求您开启双因素认证</div>
              <div className="text-xs text-muted-foreground">为了您的账号安全，请尽快完成 2FA 设置。</div>
            </div>
            <Button size="sm" onClick={() => setView('twofactor')}>
              立即设置
            </Button>
          </CardContent>
        </Card>
      )}

      {passwordInfo?.expiringSoon && !passwordInfo.expired && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">密码即将过期</div>
              <div className="text-xs text-muted-foreground">
                您的密码将在 <b className="text-amber-600 dark:text-amber-400">{passwordInfo.daysUntilExpiry} 天</b> 后过期，请尽快修改以避免登录中断。
              </div>
            </div>
            <Button size="sm" onClick={() => setView('account-security')}>
              立即修改
            </Button>
          </CardContent>
        </Card>
      )}

      {passwordInfo?.mustChange && (
        <Card className="mb-6 border-red-500/40 bg-red-500/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm text-red-600 dark:text-red-400">管理员要求您修改密码</div>
              <div className="text-xs text-muted-foreground">您的账号已被标记为必须修改密码，请立即处理。</div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => setView('account-security')}>
              立即修改
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Personal security snapshot */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="双因素认证"
          value={user?.twoFactorEnabled ? '已开启' : '未开启'}
          icon={<KeyRound className="h-4 w-4" />}
          accent={user?.twoFactorEnabled ? 'emerald' : 'amber'}
          trend={user?.twoFactorEnabled ? '账号已加固' : '建议立即开启'}
        />
        <StatCard
          label="邮箱验证"
          value={user?.emailVerified ? '已验证' : '未验证'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent={user?.emailVerified ? 'emerald' : 'red'}
        />
        <StatCard
          label="账号状态"
          value={user?.status === 'active' ? '正常' : user?.status}
          icon={<ShieldCheck className="h-4 w-4" />}
          accent={user?.status === 'active' ? 'emerald' : 'red'}
        />
        <StatCard
          label="密码状态"
          value={
            passwordInfo?.mustChange ? '需修改'
            : passwordInfo?.expiringSoon ? `${passwordInfo.daysUntilExpiry}天后过期`
            : passwordInfo?.expiryDays && passwordInfo.expiryDays > 0 ? '有效'
            : '无过期限制'
          }
          icon={<Lock className="h-4 w-4" />}
          accent={passwordInfo?.mustChange ? 'red' : passwordInfo?.expiringSoon ? 'amber' : 'emerald'}
          trend={passwordInfo?.changedAt ? `上次修改 ${new Date(passwordInfo.changedAt).toLocaleDateString('zh-CN')}` : undefined}
        />
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <QuickAction
          title="修改密码"
          description="校验旧密码后设置新密码，自动踢出其他设备"
          icon={<KeyRound className="h-4 w-4" />}
          onClick={() => setView('account-security')}
        />
        <QuickAction
          title="管理登录设备"
          description="查看活跃会话、下线可疑设备"
          icon={<Smartphone className="h-4 w-4" />}
          onClick={() => setView('sessions')}
        />
        <QuickAction
          title="查看安全日志"
          description="登录、密码修改、2FA 等所有事件"
          icon={<Clock className="h-4 w-4" />}
          onClick={() => setView('security-logs')}
        />
      </div>

      {/* Admin metrics */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-2 mb-4 mt-8">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">管理员概览</h2>
            <Badge variant="secondary" className="text-[10px]">最近 24 小时</Badge>
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="总用户数" value={data.totalUsers} icon={<Activity className="h-4 w-4" />} trend={`活跃 ${data.activeUsers}`} />
              <StatCard label="已开启 2FA" value={data.twoFactorUsers} icon={<KeyRound className="h-4 w-4" />} accent="emerald" trend={`覆盖率 ${data.twoFactorRate}%`} />
              <StatCard label="锁定账号" value={data.lockedUsers} icon={<AlertTriangle className="h-4 w-4" />} accent={data.lockedUsers > 0 ? 'amber' : 'primary'} trend={`禁用 ${data.disabledUsers}`} />
              <StatCard label="活跃会话" value={data.activeSessions} icon={<Smartphone className="h-4 w-4" />} trend={`API Token ${data.activeApiTokens}`} />
              <StatCard label="登录成功" value={data.loginSuccess24h} icon={<CheckCircle2 className="h-4 w-4" />} accent="emerald" trend="24h" />
              <StatCard label="登录失败" value={data.loginFailed24h} icon={<XCircle className="h-4 w-4" />} accent={data.loginFailed24h > 10 ? 'red' : 'amber'} trend="24h" />
              <StatCard label="审计事件" value={data.auditLogs24h} icon={<Clock className="h-4 w-4" />} trend="24h" />
              <StatCard label="2FA 覆盖率" value={`${data.twoFactorRate}%`} icon={<TrendingUp className="h-4 w-4" />} accent={data.twoFactorRate >= 50 ? 'emerald' : 'amber'} />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function QuickAction({
  title,
  description,
  icon,
  onClick,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-border/60 bg-card p-4 text-left hover:border-primary/40 hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {icon}
        </span>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </button>
  )
}
