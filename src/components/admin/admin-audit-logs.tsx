'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ScrollText, RefreshCw, Loader2, Globe, Clock, Filter, Search, Download, FileJson, FileSpreadsheet } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

const EVENT_LABELS: Record<string, string> = {
  login_success: '登录成功', login_failed: '登录失败', password_error: '密码错误',
  email_code_error: '验证码错误', twofa_verify_success: '2FA 验证通过', twofa_verify_failed: '2FA 验证失败',
  twofa_enable: '开启 2FA', twofa_disable: '关闭 2FA', twofa_reset_by_admin: '管理员重置 2FA',
  backup_code_used: '备份码使用', backup_code_regenerated: '备份码重生成',
  trusted_device_added: '受信设备新增', trusted_device_revoked: '受信设备撤销',
  password_change: '密码修改', email_change: '邮箱变更', device_logout: '设备下线', all_devices_logout: '全部下线',
  register: '注册', account_locked: '账号锁定', account_unlocked: '账号解锁',
  admin_force_logout: '管理员强制下线', admin_reset_2fa: '管理员重置 2FA',
  admin_user_disable: '管理员禁用账号', admin_security_setting_change: '安全配置变更',
  api_token_created: 'Token 创建', api_token_revoked: 'Token 撤销', api_token_auto_revoked: 'Token 自动撤销',
  forgot_password_requested: '找回密码请求', password_reset: '密码重置',
  anomaly_login_alert: '异地登录告警', rate_limit_hit: '触发限流',
}
const SEVERITY_COLOR: Record<string, string> = {
  info: 'bg-primary/10 text-primary', warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

interface LogGeo {
  country: string | null
  countryName: string | null
  city: string | null
  flag: string | null
  isPrivate: boolean
  asn: string | null
}

interface Log {
  id: string; userId: string | null; actorId: string | null; eventType: string; severity: string
  ipAddress: string | null; geo?: LogGeo; userAgent: string | null; metadata: Record<string, unknown> | null; createdAt: string
}

export function AdminAuditLogs() {
  const [logs, setLogs] = React.useState<Log[]>([])
  const [loading, setLoading] = React.useState(true)
  const [severity, setSeverity] = React.useState('all')
  const [eventType, setEventType] = React.useState('all')
  const [userId, setUserId] = React.useState('')
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)

  const load = React.useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (severity !== 'all') params.set('severity', severity)
      if (eventType !== 'all') params.set('eventType', eventType)
      if (userId) params.set('userId', userId)
      if (!reset && nextCursor) params.set('cursor', nextCursor)
      const d = await jsonFetch(`/api/admin/audit-logs?${params}`)
      setLogs(reset ? d.logs : (prev) => [...prev, ...d.logs])
      setNextCursor(d.nextCursor)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [severity, eventType, userId, nextCursor])

  React.useEffect(() => { load(true) }, [load])

  function exportLogs(format: 'csv' | 'json') {
    const params = new URLSearchParams({ format })
    if (severity !== 'all') params.set('severity', severity)
    if (eventType !== 'all') params.set('eventType', eventType)
    if (userId) params.set('userId', userId)
    // Trigger download via hidden link (cookies sent automatically)
    const a = document.createElement('a')
    a.href = `/api/admin/audit-logs/export?${params}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success(`正在导出 ${format.toUpperCase()} 文件`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">安全审计日志</CardTitle>
            <CardDescription>全平台所有安全事件记录</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="用户 ID" className="h-8 w-44 pl-8 text-xs" value={userId} onChange={(e) => setUserId(e.target.value)} />
            </div>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="info">信息</SelectItem>
                <SelectItem value="warning">警告</SelectItem>
                <SelectItem value="critical">严重</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">全部事件</SelectItem>
                {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportLogs('csv')}
                disabled={loading || logs.length === 0}
                title="导出 CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="hidden lg:inline ml-1">CSV</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportLogs('json')}
                disabled={loading || logs.length === 0}
                title="导出 JSON"
              >
                <FileJson className="h-3.5 w-3.5" />
                <span className="hidden lg:inline ml-1">JSON</span>
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && logs.length === 0 ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-40" />暂无日志
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[36rem] overflow-y-auto scrollbar-thin pr-1">
            {logs.map((l) => (
              <div key={l.id} className="rounded-lg border border-border/60 p-3 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="secondary" className={`text-[10px] ${SEVERITY_COLOR[l.severity] || ''}`}>
                    {l.severity === 'critical' ? '严重' : l.severity === 'warning' ? '警告' : '信息'}
                  </Badge>
                  <span className="font-medium text-sm">{EVENT_LABELS[l.eventType] || l.eventType}</span>
                  {l.actorId && <Badge variant="outline" className="text-[9px]">管理员操作</Badge>}
                  <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
                    <Clock className="h-3 w-3" />{new Date(l.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                  {l.userId && <span>用户: <code className="font-mono">{l.userId.slice(0, 8)}…</code></span>}
                  {l.ipAddress && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {l.geo?.flag && <span className="text-sm leading-none">{l.geo.flag}</span>}
                      {l.ipAddress}
                      {l.geo?.countryName && <span className="text-muted-foreground/70">· {l.geo.countryName}</span>}
                    </span>
                  )}
                  {l.userAgent && <span className="truncate max-w-md">{l.userAgent}</span>}
                </div>
                {l.metadata && Object.keys(l.metadata).length > 0 && (
                  <div className="mt-1.5 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 truncate">
                    {JSON.stringify(l.metadata)}
                  </div>
                )}
              </div>
            ))}
            {nextCursor && (
              <Button variant="outline" className="w-full mt-2" onClick={() => load(false)} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}加载更多
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
