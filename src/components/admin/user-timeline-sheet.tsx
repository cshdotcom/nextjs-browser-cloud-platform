'use client'

import * as React from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Globe, Clock, ScrollText, Activity, AlertTriangle, ShieldCheck, Filter } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface TimelineLog {
  id: string
  eventType: string
  severity: string
  ipAddress: string | null
  geo?: {
    country: string | null
    countryName: string | null
    city: string | null
    flag: string | null
    isPrivate: boolean
  }
  userAgent: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const EVENT_LABELS: Record<string, string> = {
  login_success: '登录成功', login_failed: '登录失败', password_error: '密码错误',
  email_code_error: '验证码错误', twofa_verify_success: '2FA 验证通过', twofa_verify_failed: '2FA 验证失败',
  twofa_enable: '开启 2FA', twofa_disable: '关闭 2FA', twofa_reset_by_admin: '管理员重置 2FA',
  backup_code_used: '备份码使用', backup_code_regenerated: '备份码重生成',
  trusted_device_added: '受信设备新增', trusted_device_revoked: '受信设备撤销',
  password_change: '密码修改', email_change: '邮箱变更', device_logout: '设备下线',
  all_devices_logout: '全部下线', register: '注册', account_locked: '账号锁定',
  account_unlocked: '账号解锁', admin_force_logout: '管理员强制下线',
  admin_reset_2fa: '管理员重置 2FA', admin_user_disable: '管理员禁用账号',
  admin_security_setting_change: '安全配置变更', api_token_created: 'Token 创建',
  api_token_revoked: 'Token 撤销', api_token_auto_revoked: 'Token 自动撤销',
  forgot_password_requested: '找回密码', password_reset: '密码重置',
  anomaly_login_alert: '异地告警', rate_limit_hit: '触发限流',
  password_change_required: '强制改密',
}

const SEVERITY_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  info: { color: 'text-primary', bg: 'bg-primary/10', icon: <Activity className="h-3.5 w-3.5" /> },
  warning: { color: 'text-amber-500', bg: 'bg-amber-500/10', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  critical: { color: 'text-red-500', bg: 'bg-red-500/10', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
}

export function UserTimelineSheet({
  userId,
  userEmail,
  open,
  onOpenChange,
}: {
  userId: string | null
  userEmail: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [logs, setLogs] = React.useState<TimelineLog[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState<string>('all')

  const load = React.useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const d = await jsonFetch(`/api/admin/audit-logs?userId=${userId}&limit=100`)
      setLogs(d.logs || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [userId])

  React.useEffect(() => {
    if (open && userId) load()
  }, [open, userId, load])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.severity === filter)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-card/50 sticky top-0 z-10 backdrop-blur">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ScrollText className="h-5 w-5 text-primary" />
            安全事件时间线
          </SheetTitle>
          <SheetDescription>
            {userEmail} · 最近 {logs.length} 条事件
          </SheetDescription>
          <div className="flex items-center gap-2 mt-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-muted/30">
              {[
                { v: 'all', label: '全部' },
                { v: 'info', label: '信息' },
                { v: 'warning', label: '警告' },
                { v: 'critical', label: '严重' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setFilter(opt.v)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filter === opt.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={load} disabled={loading}>
              <Loader2 className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="px-6 py-4">
          {loading && logs.length === 0 ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              暂无安全事件
            </div>
          ) : (
            <div className="relative">
              {/* vertical timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />
              <div className="space-y-3">
                {filtered.map((l, i) => {
                  const style = SEVERITY_STYLE[l.severity] || SEVERITY_STYLE.info
                  const isLast = i === filtered.length - 1
                  return (
                    <div key={l.id} className="relative flex gap-3 group">
                      {/* timeline dot */}
                      <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${style.bg} ${style.color} shrink-0 mt-0.5 ring-4 ring-background`}>
                        {style.icon}
                      </div>
                      {/* content card */}
                      <div className="flex-1 min-w-0 rounded-lg border border-border/60 p-2.5 group-hover:border-border transition-colors bg-card">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">{EVENT_LABELS[l.eventType] || l.eventType}</span>
                          <Badge variant="secondary" className={`text-[9px] ${style.bg} ${style.color}`}>
                            {l.severity === 'critical' ? '严重' : l.severity === 'warning' ? '警告' : '信息'}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1 whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            {timeAgo(l.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                          {l.ipAddress && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {l.geo?.flag && <span className="text-sm leading-none">{l.geo.flag}</span>}
                              {l.ipAddress}
                              {l.geo?.countryName && <span className="text-muted-foreground/70">· {l.geo.countryName}</span>}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60">{new Date(l.createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                        {l.metadata && Object.keys(l.metadata).length > 0 && (
                          <div className="mt-1.5 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 truncate group-hover:whitespace-normal group-hover:break-all transition-all">
                            {JSON.stringify(l.metadata)}
                          </div>
                        )}
                      </div>
                      {isLast && <div className="absolute left-[15px] -bottom-3 h-1 w-1 rounded-full bg-border/60" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

void ShieldCheck
