'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { ScrollText, RefreshCw, Loader2, Globe, Clock, Filter } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface LogGeo {
  country: string | null
  countryName: string | null
  city: string | null
  flag: string | null
  isPrivate: boolean
}

interface Log {
  id: string
  eventType: string
  severity: string
  ipAddress: string | null
  geo?: LogGeo
  userAgent: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const EVENT_LABELS: Record<string, string> = {
  login_success: '登录成功',
  login_failed: '登录失败',
  password_error: '密码错误',
  email_code_error: '验证码错误',
  twofa_verify_success: '2FA 验证通过',
  twofa_verify_failed: '2FA 验证失败',
  twofa_enable: '开启 2FA',
  twofa_disable: '关闭 2FA',
  twofa_reset_by_admin: '管理员重置 2FA',
  backup_code_used: '备份码使用',
  backup_code_regenerated: '备份码重新生成',
  trusted_device_added: '受信任设备新增',
  trusted_device_revoked: '受信任设备撤销',
  password_change: '密码修改',
  email_change: '邮箱变更',
  device_logout: '设备下线',
  all_devices_logout: '全部设备下线',
  register: '注册',
  account_locked: '账号锁定',
  account_unlocked: '账号解锁',
  admin_force_logout: '管理员强制下线',
  admin_reset_2fa: '管理员重置 2FA',
  admin_user_disable: '管理员禁用账号',
  admin_security_setting_change: '安全配置变更',
  api_token_created: 'API Token 创建',
  api_token_revoked: 'API Token 撤销',
  api_token_auto_revoked: 'API Token 自动撤销',
  forgot_password_requested: '找回密码请求',
  password_reset: '密码重置',
  anomaly_login_alert: '异地登录告警',
  rate_limit_hit: '触发限流',
}

const SEVERITY_COLOR: Record<string, string> = {
  info: 'bg-primary/10 text-primary',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

export function SecurityLogsView() {
  const [logs, setLogs] = React.useState<Log[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<string>('all')
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)

  const load = React.useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const url = `/api/account/security-logs?limit=50${reset ? '' : `&cursor=${nextCursor || ''}`}`
      const d = await jsonFetch(url)
      if (reset) setLogs(d.logs)
      else setLogs((prev) => [...prev, ...d.logs])
      setNextCursor(d.nextCursor)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [nextCursor])

  React.useEffect(() => { load(true) }, [])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.severity === filter)

  return (
    <div>
      <PageHeader
        title="安全日志"
        description="您账号的全部安全事件记录：登录、密码、2FA、邮箱、设备等。"
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">事件列表</CardTitle>
              <CardDescription>按时间倒序，最多展示最近 200 条</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="info">信息</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="critical">严重</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">暂无安全事件</div>
          ) : (
            <div className="space-y-1.5 max-h-[32rem] overflow-y-auto scrollbar-thin pr-1">
              {filtered.map((l) => (
                <div key={l.id} className="rounded-lg border border-border/60 p-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="secondary" className={`text-[10px] ${SEVERITY_COLOR[l.severity] || ''}`}>
                      {l.severity === 'critical' ? '严重' : l.severity === 'warning' ? '警告' : '信息'}
                    </Badge>
                    <span className="font-medium text-sm">{EVENT_LABELS[l.eventType] || l.eventType}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(l.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    {l.ipAddress && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{l.geo?.flag && <span className="text-sm leading-none">{l.geo.flag}</span>}{l.ipAddress}{l.geo?.countryName && <span className="text-muted-foreground/70">· {l.geo.countryName}</span>}</span>}
                    {l.userAgent && <span className="truncate max-w-md">{l.userAgent}</span>}
                  </div>
                  {l.metadata && Object.keys(l.metadata).length > 0 && (
                    <div className="mt-1.5 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 truncate">
                      {JSON.stringify(l.metadata)}
                    </div>
                  )}
                </div>
              ))}
              {nextCursor && filter === 'all' && (
                <Button variant="outline" className="w-full mt-2" onClick={() => load(false)} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  加载更多
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
