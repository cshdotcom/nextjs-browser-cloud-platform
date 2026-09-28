'use client'

import * as React from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Users as UsersIcon, Loader2, KeyRound, Power, Shield, Boxes, FileText, Clock, RefreshCw, Network, Smartphone,
} from 'lucide-react'
import { pfFetch, usePlatformFetch } from '@/lib/platform-client'
import { toast } from 'sonner'
import { EmptyState, LoadingState, ErrorState } from './shared/empty-state'

interface UserDetail {
  id: string
  username: string
  email: string
  displayName: string | null
  role: string
  status: string
  mustChangePassword: boolean
  twoFactorEnabled: boolean
  preferences: Record<string, unknown> | null
  primaryGroup: { id: string; name: string } | null
  groups: Array<{ id: string; name: string; role: string }>
  tokens: Array<{ id: string; name: string; prefix: string; expireAt: string | null; enabled: boolean }>
  counts: { sessions: number; workspaces: number; files: number }
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
}

export function UserDetailSheet({
  userId,
  open,
  onOpenChange,
  onChanged,
}: {
  userId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged: () => void
}) {
  const { data, loading, error, reload } = usePlatformFetch<UserDetail>(userId && open ? `/api/platform/users/${userId}` : null)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  async function handleAction(action: string, body?: Record<string, unknown>) {
    if (!userId) return
    setActionLoading(action)
    try {
      await pfFetch(`/api/platform/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      toast.success('操作成功')
      reload()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-card/50 sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                  {(data?.displayName || data?.username || '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-lg">{data?.displayName || data?.username || '加载中…'}</SheetTitle>
                <SheetDescription className="mt-0.5">{data?.email}</SheetDescription>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-7" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="px-6 py-4">
          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : data ? (
            <div className="space-y-4">
              {/* Quick stats */}
              <div className="grid grid-cols-4 gap-2">
                <StatBox icon={<Smartphone className="h-3.5 w-3.5" />} label="会话" value={data.counts.sessions} />
                <StatBox icon={<Boxes className="h-3.5 w-3.5" />} label="工作区" value={data.counts.workspaces} />
                <StatBox icon={<FileText className="h-3.5 w-3.5" />} label="文件" value={data.counts.files} />
                <StatBox icon={<KeyRound className="h-3.5 w-3.5" />} label="Token" value={data.tokens.length} />
              </div>

              {/* Status badges + actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={`text-[10px] ${data.role === 'superadmin' ? 'bg-primary/10 text-primary' : data.role === 'admin' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {ROLE_LABELS[data.role] || data.role}
                </Badge>
                <Badge variant={data.status === 'active' ? 'secondary' : 'destructive'} className={`text-[10px] ${data.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {data.status === 'active' ? '正常' : data.status === 'suspended' ? '暂停' : '禁用'}
                </Badge>
                {data.twoFactorEnabled && <Badge variant="secondary" className="text-[10px] gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Shield className="h-2.5 w-2.5" />2FA</Badge>}
                {data.mustChangePassword && <Badge variant="outline" className="text-[10px] text-amber-500">需改密</Badge>}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction('toggle-status', { status: data.status === 'active' ? 'disabled' : 'active' })} disabled={!!actionLoading}>
                  <Power className="h-3 w-3 mr-1" />{data.status === 'active' ? '禁用' : '启用'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction('force-password', { mustChangePassword: true })} disabled={!!actionLoading}>
                  <KeyRound className="h-3 w-3 mr-1" />强制改密
                </Button>
              </div>

              <Tabs defaultValue="info">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="info" className="text-xs gap-1"><UsersIcon className="h-3 w-3" />信息</TabsTrigger>
                  <TabsTrigger value="groups" className="text-xs gap-1">用户组</TabsTrigger>
                  <TabsTrigger value="tokens" className="text-xs gap-1">API Token</TabsTrigger>
                </TabsList>

                {/* Info tab */}
                <TabsContent value="info" className="mt-3">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">用户信息</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <InfoRow label="用户 ID" value={data.id} mono />
                      <InfoRow label="用户名" value={data.username} />
                      <InfoRow label="邮箱" value={data.email} />
                      <InfoRow label="显示名" value={data.displayName || '—'} />
                      <InfoRow label="主组" value={data.primaryGroup?.name || '无'} />
                      <InfoRow label="最近登录" value={data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString('zh-CN') : '从未'} />
                      <InfoRow label="最近 IP" value={data.lastLoginIp || '—'} mono />
                      <InfoRow label="注册时间" value={new Date(data.createdAt).toLocaleString('zh-CN')} />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Groups tab */}
                <TabsContent value="groups" className="mt-3">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">所属用户组（{data.groups.length}）</CardTitle></CardHeader>
                    <CardContent>
                      {data.groups.length === 0 ? (
                        <EmptyState icon={<UsersIcon className="h-6 w-6" />} title="未加入任何组" description="该用户不属于任何用户组" small />
                      ) : (
                        <div className="space-y-1.5">
                          {data.groups.map((g) => (
                            <div key={g.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                              <UsersIcon className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium flex-1">{g.name}</span>
                              <Badge variant="outline" className="text-[9px]">{g.role === 'admin' ? '组管理员' : g.role === 'owner' ? '组主' : '成员'}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tokens tab */}
                <TabsContent value="tokens" className="mt-3">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">API Token（{data.tokens.length}）</CardTitle></CardHeader>
                    <CardContent>
                      {data.tokens.length === 0 ? (
                        <EmptyState icon={<KeyRound className="h-6 w-6" />} title="暂无 Token" description="该用户没有 API Token" small />
                      ) : (
                        <div className="space-y-1.5">
                          {data.tokens.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                              <KeyRound className="h-3.5 w-3.5 text-primary" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{t.name}</div>
                                <code className="text-[10px] text-muted-foreground font-mono">zai_{t.prefix}…</code>
                              </div>
                              <Badge variant={t.enabled ? 'secondary' : 'destructive'} className={`text-[9px] ${t.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}`}>
                                {t.enabled ? '启用' : '禁用'}
                              </Badge>
                              {t.expireAt && <span className="text-[10px] text-muted-foreground">{new Date(t.expireAt).toLocaleDateString('zh-CN')}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-2.5 text-center">
      <div className="flex items-center justify-center text-muted-foreground mb-1">{icon}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/40 pb-1.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
    </div>
  )
}

void Clock
void Network
void Loader2
