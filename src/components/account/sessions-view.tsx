'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/shared/page-header'
import { Smartphone, Monitor, Tablet, ShieldCheck, LogOut, Trash2, RefreshCw, Loader2, Clock, Globe } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface SessionGeo {
  country: string | null
  countryName: string | null
  city: string | null
  flag: string | null
  isPrivate: boolean
}

interface Session {
  id: string
  current: boolean
  deviceLabel: string
  userAgent: string
  ipAddress: string
  geo?: SessionGeo
  isTrusted: boolean
  remember: boolean
  createdAt: string
  lastActiveAt: string
  expiresAt: string
}

interface TrustedDevice {
  id: string
  deviceId: string
  label: string
  userAgent: string
  ipAddress: string
  expiresAt: string
  createdAt: string
}

export function SessionsView() {
  const [sessions, setSessions] = React.useState<Session[]>([])
  const [devices, setDevices] = React.useState<TrustedDevice[]>([])
  const [loading, setLoading] = React.useState(true)
  const [killAllOpen, setKillAllOpen] = React.useState(false)
  const [revokingId, setRevokingId] = React.useState<string | null>(null)
  const [revokingDeviceId, setRevokingDeviceId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        jsonFetch('/api/sessions'),
        jsonFetch('/api/2fa/trusted-devices'),
      ])
      setSessions(s.sessions || [])
      setDevices(d.devices || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function revokeSession(id: string) {
    setRevokingId(id)
    try {
      await jsonFetch(`/api/sessions/${id}`, { method: 'DELETE' })
      toast.success('已下线该设备')
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '操作失败')
    } finally {
      setRevokingId(null)
    }
  }

  async function killAllOthers() {
    setKillAllOpen(false)
    try {
      const d = await jsonFetch('/api/sessions/all-others', { method: 'DELETE' })
      toast.success(`已下线 ${d.revoked} 个其他设备`)
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '操作失败')
    }
  }

  async function revokeDevice(id: string) {
    setRevokingDeviceId(id)
    try {
      await jsonFetch(`/api/2fa/trusted-devices/${id}`, { method: 'DELETE' })
      toast.success('已撤销受信任设备')
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '操作失败')
    } finally {
      setRevokingDeviceId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="登录设备与会话"
        description="管理您的活跃登录会话与受信任设备。可疑设备可一键下线。"
        icon={<Smartphone className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setKillAllOpen(true)} disabled={sessions.filter((s) => !s.current).length === 0}>
              <LogOut className="h-3.5 w-3.5" />
              下线其他设备
            </Button>
          </div>
        }
      />

      {/* Active sessions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            活跃会话 <Badge variant="secondary" className="text-[10px]">{sessions.length}</Badge>
          </CardTitle>
          <CardDescription>当前登录的所有设备与会话信息</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">暂无活跃会话</div>
          ) : (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto scrollbar-thin pr-1">
              {sessions.map((s) => (
                <div key={s.id} className={`rounded-lg border p-3 flex items-center gap-3 ${s.current ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                  <DeviceIcon ua={s.userAgent} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.deviceLabel}</span>
                      {s.current && <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">当前</Badge>}
                      {s.isTrusted && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 gap-0.5"><ShieldCheck className="h-2.5 w-2.5" />受信任</Badge>}
                      {s.remember && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">记住</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{s.geo?.flag && <span className="text-sm leading-none">{s.geo.flag}</span>}{s.ipAddress}{s.geo?.countryName && <span className="text-muted-foreground/70">· {s.geo.countryName}</span>}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRel(s.lastActiveAt)}活跃</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRel(s.createdAt)}登录</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRel(s.expiresAt)}过期</span>
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revokeSession(s.id)} disabled={revokingId === s.id}>
                      {revokingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trusted devices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            受信任设备 <Badge variant="secondary" className="text-[10px]">{devices.length}</Badge>
          </CardTitle>
          <CardDescription>这些设备在 30 天内可跳过 2FA 二次验证。如不再信任可随时撤销。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
              暂无受信任设备
              <p className="text-[11px] mt-1">登录时勾选「信任此设备」即可加入</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
              {devices.map((d) => (
                <div key={d.id} className="rounded-lg border border-border/60 p-3 flex items-center gap-3">
                  <DeviceIcon ua={d.userAgent} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{d.label}</div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{d.ipAddress}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRel(d.createdAt)}添加</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRel(d.expiresAt)}过期</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => revokeDevice(d.id)} disabled={revokingDeviceId === d.id}>
                    {revokingDeviceId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={killAllOpen} onOpenChange={setKillAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>下线全部其他设备？</AlertDialogTitle>
            <AlertDialogDescription>
              这将立即撤销您除当前会话外的所有活跃登录。该操作不可撤销，受信任设备不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={killAllOthers} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认下线
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DeviceIcon({ ua }: { ua: string }) {
  if (/iPhone|iPad|Android|Mobile/.test(ua)) {
    return /iPad|Tablet/.test(ua) ? <Tablet className="h-5 w-5 text-primary" /> : <Smartphone className="h-5 w-5 text-primary" />
  }
  return <Monitor className="h-5 w-5 text-primary" />
}

function formatRel(iso: string): string {
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const suffix = diff >= 0 ? '后' : '前'
  if (days > 0) return `${days}天${suffix}`
  if (hours > 0) return `${hours}小时${suffix}`
  if (mins > 0) return `${mins}分钟${suffix}`
  return `${Math.floor(abs / 1000)}秒${suffix}`
}
