'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatRel, formatDateTime, type ApiToken } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { UserCircle, KeyRound, Save, Loader2, Copy, Check, Trash2, Smartphone, ShieldCheck, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-client'

interface ListResp<T> { items: T[]; total: number }

export function AccountView() {
  return (
    <div>
      <PageHeader
        title="个人中心"
        description="管理个人资料、密码、API Token、登录设备与界面偏好。"
        icon={<UserCircle className="h-5 w-5" />}
      />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">个人资料</TabsTrigger>
          <TabsTrigger value="password">密码</TabsTrigger>
          <TabsTrigger value="tokens">API Token</TabsTrigger>
          <TabsTrigger value="sessions">登录设备</TabsTrigger>
          <TabsTrigger value="prefs">偏好</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-3"><ProfileTab /></TabsContent>
        <TabsContent value="password" className="mt-3"><PasswordTab /></TabsContent>
        <TabsContent value="tokens" className="mt-3"><TokensTab /></TabsContent>
        <TabsContent value="sessions" className="mt-3"><SessionsTab /></TabsContent>
        <TabsContent value="prefs" className="mt-3"><PrefsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function ProfileTab() {
  const { user, setUser } = useAuth()
  const [displayName, setDisplayName] = React.useState(user?.name || '')
  const [loading, setLoading] = React.useState(false)

  async function save() {
    setLoading(true)
    try {
      await pfFetch('/api/account/profile', {
        method: 'PUT',
        body: JSON.stringify({ displayName }),
      })
      toast.success('资料已更新')
      if (user) setUser({ ...user, name: displayName })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">个人资料</CardTitle>
        <CardDescription>显示名将在共享工作区、审计日志中展示</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div className="space-y-1.5">
          <Label>邮箱</Label>
          <Input value={user?.email || ''} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>角色</Label>
          <Input value={user?.role === 'superadmin' ? '超级管理员' : user?.role === 'admin' ? '管理员' : '普通用户'} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>显示名</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </CardContent>
    </Card>
  )
}

function PasswordTab() {
  const [oldPwd, setOldPwd] = React.useState('')
  const [newPwd, setNewPwd] = React.useState('')
  const [confirmPwd, setConfirmPwd] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!oldPwd || !newPwd) return toast.error('请填写完整')
    if (newPwd !== confirmPwd) return toast.error('两次密码不一致')
    if (newPwd.length < 8) return toast.error('密码长度至少 8 位')
    setLoading(true)
    try {
      await pfFetch('/api/account/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      })
      toast.success('密码已更新，其他设备会话将自动失效')
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">修改密码</CardTitle>
        <CardDescription>修改后所有 RefreshToken 失效，需重新登录其他设备</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div className="space-y-1.5"><Label>当前密码</Label><Input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>新密码</Label><Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>确认新密码</Label><Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} /></div>
        <Button onClick={submit} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          提交修改
        </Button>
      </CardContent>
    </Card>
  )
}

function TokensTab() {
  const { data, loading, error, reload } = usePlatformFetch<ListResp<ApiToken>>('/api/platform/tokens')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newToken, setNewToken] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [revokeId, setRevokeId] = React.useState<string | null>(null)

  async function revoke(id: string) {
    setRevokeId(id)
    try {
      await pfFetch(`/api/platform/tokens/${id}`, { method: 'DELETE' })
      toast.success('Token 已撤销')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setRevokeId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" />API Token</CardTitle>
            <CardDescription>用于 MCP / OpenAPI / 外部调用。不受 2FA 限制，请妥善保管。</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            新建 Token
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : error ? (
          <div className="text-destructive text-sm">{error.message}</div>
        ) : !data?.items || data.items.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">暂无 API Token</div>
        ) : (
          <div className="space-y-2">
            {data.items.map((t) => (
              <div key={t.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <code className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">zai_{t.prefix}…</code>
                  <span className="font-medium text-sm flex-1 truncate">{t.name}</span>
                  {t.enabled ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">启用</Badge> : <Badge variant="secondary">禁用</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                  <span>创建于 {formatRel(t.createdAt)}</span>
                  {t.lastUsedAt && <span>最近使用 {formatRel(t.lastUsedAt)}</span>}
                  <span>累计调用 {t.totalCalls}</span>
                  {t.expireAt && <span className="text-amber-500">{formatRel(t.expireAt)}过期</span>}
                </div>
                <div className="flex justify-end mt-2">
                  <Button size="sm" variant="ghost" className="text-destructive h-7" disabled={revokeId === t.id} onClick={() => revoke(t.id)}>
                    {revokeId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    撤销
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewToken(null) }}
        onCreated={(token) => { setNewToken(token); reload() }}
      />

      <Dialog open={!!newToken} onOpenChange={(o) => !o && setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600"><Check className="h-5 w-5" />Token 创建成功</DialogTitle>
            <DialogDescription>请立即复制保存，关闭后将永远无法再次查看明文。</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <code className="font-mono text-xs break-all">{newToken}</code>
          </div>
          <Button className="w-full" onClick={() => {
            if (newToken) {
              navigator.clipboard.writeText(newToken)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }
          }}>
            {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? '已复制' : '复制 Token'}
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CreateTokenDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (token: string) => void }) {
  const [name, setName] = React.useState('')
  const [scopes, setScopes] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!name.trim()) return toast.error('请输入 Token 名称')
    setLoading(true)
    try {
      const d = await pfFetch<{ token: string }>('/api/platform/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          scopes: scopes ? scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        }),
      })
      onCreated(d.token)
      setName(''); setScopes('')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建 API Token</DialogTitle>
          <DialogDescription>用于程序化调用的专用凭据</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} /></div>
          <div className="space-y-1.5"><Label>权限范围（逗号分隔）</Label><Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="read,write" disabled={loading} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading || !name}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SessionsTab() {
  // Reuses /api/sessions endpoint (kept from existing auth module) and /api/2fa/trusted-devices
  const [sessions, setSessions] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [revokingId, setRevokingId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/sessions', { credentials: 'include' }).then((r) => r.json())
      setSessions(d.sessions || [])
    } catch (e) {
      // graceful — endpoint may not exist yet
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    setRevokingId(id)
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE', credentials: 'include' })
      toast.success('已下线该设备')
      load()
    } catch (e) {
      toast.error('操作失败')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" />登录设备</CardTitle>
            <CardDescription>当前活跃的会话列表</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">暂无活跃会话</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className={`rounded-lg border p-3 ${s.current ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm flex-1">{s.deviceLabel || s.userAgent?.slice(0, 40) || 'Unknown'}</span>
                  {s.current && <Badge className="bg-primary/15 text-primary">当前</Badge>}
                  {s.isTrusted && <Badge variant="secondary" className="gap-0.5"><ShieldCheck className="h-2.5 w-2.5" />受信任</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                  <span>{s.ipAddress}</span>
                  <span>{formatRel(s.lastActiveAt)}活跃</span>
                  <span>{formatRel(s.createdAt)}登录</span>
                </div>
                {!s.current && (
                  <div className="flex justify-end mt-2">
                    <Button size="sm" variant="ghost" className="text-destructive h-7" disabled={revokingId === s.id} onClick={() => revoke(s.id)}>
                      {revokingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '下线'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrefsTab() {
  const [prefs, setPrefs] = React.useState({
    compactMode: false,
    autoRefresh: true,
    tablePageSize: 20,
    defaultWorkspaceMode: 'cdp_light',
  })
  const [loading, setLoading] = React.useState(false)

  async function save() {
    setLoading(true)
    try {
      await pfFetch('/api/account/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      })
      toast.success('偏好已保存')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">界面偏好</CardTitle>
        <CardDescription>存储于用户 preferences JSON 字段</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label>紧凑模式</Label>
            <p className="text-xs text-muted-foreground">减小表格行高与卡片间距</p>
          </div>
          <Switch checked={prefs.compactMode} onCheckedChange={(v) => setPrefs((s) => ({ ...s, compactMode: v }))} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>自动刷新</Label>
            <p className="text-xs text-muted-foreground">列表页每 30 秒自动刷新</p>
          </div>
          <Switch checked={prefs.autoRefresh} onCheckedChange={(v) => setPrefs((s) => ({ ...s, autoRefresh: v }))} />
        </div>
        <div className="space-y-1.5">
          <Label>默认每页条数</Label>
          <Input type="number" value={prefs.tablePageSize} onChange={(e) => setPrefs((s) => ({ ...s, tablePageSize: Number(e.target.value) || 20 }))} />
        </div>
        <div className="space-y-1.5">
          <Label>默认工作区模式</Label>
          <Input value={prefs.defaultWorkspaceMode} onChange={(e) => setPrefs((s) => ({ ...s, defaultWorkspaceMode: e.target.value }))} />
        </div>
        <Button onClick={save} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存偏好
        </Button>
      </CardContent>
    </Card>
  )
}
