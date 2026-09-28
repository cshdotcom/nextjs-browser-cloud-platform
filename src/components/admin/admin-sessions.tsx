'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Smartphone, Monitor, RefreshCw, Loader2, Power, ShieldCheck, Clock, Globe } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface SessGeo {
  country: string | null
  countryName: string | null
  city: string | null
  flag: string | null
  isPrivate: boolean
  asn: string | null
}

interface Sess {
  id: string; userId: string; userEmail: string; userName: string | null; userRole: string
  deviceLabel: string; ipAddress: string; geo?: SessGeo; isTrusted: boolean; remember: boolean
  createdAt: string; lastActiveAt: string; expiresAt: string
}

export function AdminSessions() {
  const [sessions, setSessions] = React.useState<Sess[]>([])
  const [loading, setLoading] = React.useState(true)
  const [revoking, setRevoking] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch('/api/admin/sessions')
      setSessions(d.sessions || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    setRevoking(id)
    try {
      await jsonFetch(`/api/admin/sessions/${id}`, { method: 'DELETE' })
      toast.success('已强制下线')
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '操作失败')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />全部在线会话 <Badge variant="secondary" className="text-[10px]">{sessions.length}</Badge>
            </CardTitle>
            <CardDescription>跨所有用户的活跃会话，最多展示最近 200 条</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-40" />暂无活跃会话
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin max-h-[36rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>设备</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近活跃</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{s.userName || s.userEmail}</div>
                      <div className="text-[11px] text-muted-foreground">{s.userEmail}</div>
                    </TableCell>
                    <TableCell><span className="text-xs">{s.deviceLabel}</span></TableCell>
                    <TableCell>
                      <span className="text-xs flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {s.geo?.flag && <span className="text-sm leading-none">{s.geo.flag}</span>}
                        {s.ipAddress}
                        {s.geo?.countryName && <span className="text-muted-foreground/70">· {s.geo.countryName}</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {s.isTrusted && <Badge variant="secondary" className="text-[9px] w-fit gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-2.5 w-2.5" />受信</Badge>}
                        {s.remember && <Badge variant="outline" className="text-[9px] w-fit">记住</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(s.lastActiveAt).toLocaleString('zh-CN')}</span></TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7" onClick={() => revoke(s.id)} disabled={revoking === s.id}>
                        {revoking === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
