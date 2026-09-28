'use client'

import * as React from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  UsersRound, Loader2, UserPlus, Trash2, Shield, Network, Boxes, Clock, RefreshCw,
} from 'lucide-react'
import { pfFetch, usePlatformFetch } from '@/lib/platform-client'
import { toast } from 'sonner'
import { EmptyState, LoadingState, ErrorState } from './shared/empty-state'

interface GroupDetail {
  id: string
  name: string
  description: string | null
  parentId: string | null
  parent: { id: string; name: string } | null
  children: Array<{ id: string; name: string; enabled: boolean }>
  enabled: boolean
  enforceTwoFactor: boolean
  admins: string[]
  quota: Record<string, unknown> | null
  members: Array<{
    id: string
    username: string
    email: string
    displayName: string | null
    role: string
  }>
  counts: {
    proxyNodes: number
    browserWorkspaces: number
    browserTemplates: number
    webhookRules: number
  }
  createdAt: string
}

export function GroupDetailSheet({
  groupId,
  open,
  onOpenChange,
  onChanged,
}: {
  groupId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged: () => void
}) {
  const { data, loading, error, reload } = usePlatformFetch<GroupDetail>(groupId && open ? `/api/platform/groups/${groupId}` : null)

  const handleMemberRemoved = React.useCallback(() => {
    reload()
    onChanged()
  }, [reload, onChanged])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-card/50 sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2 text-lg">
                <UsersRound className="h-5 w-5 text-primary" />
                {data?.name || '加载中…'}
              </SheetTitle>
              <SheetDescription className="mt-1">{data?.description || '用户组详情'}</SheetDescription>
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
                <StatBox icon={<UsersRound className="h-3.5 w-3.5" />} label="成员" value={data.members.length} />
                <StatBox icon={<Boxes className="h-3.5 w-3.5" />} label="子组" value={data.children.length} />
                <StatBox icon={<Network className="h-3.5 w-3.5" />} label="代理" value={data.counts.proxyNodes} />
                <StatBox icon={<Clock className="h-3.5 w-3.5" />} label="工作区" value={data.counts.browserWorkspaces} />
              </div>

              {/* Status + parent */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant={data.enabled ? 'secondary' : 'destructive'} className={`text-[10px] ${data.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {data.enabled ? '启用' : '禁用'}
                </Badge>
                {data.enforceTwoFactor && <Badge variant="secondary" className="text-[10px] gap-0.5"><Shield className="h-2.5 w-2.5" />强制 2FA</Badge>}
                {data.parent && <Badge variant="outline" className="text-[10px]">父组: {data.parent.name}</Badge>}
                <Badge variant="outline" className="text-[10px]">创建于 {new Date(data.createdAt).toLocaleDateString('zh-CN')}</Badge>
              </div>

              <Tabs defaultValue="members">
                <TabsList className="grid w-full grid-cols-4 h-auto">
                  <TabsTrigger value="members" className="text-xs gap-1"><UsersRound className="h-3 w-3" />成员</TabsTrigger>
                  <TabsTrigger value="children" className="text-xs gap-1"><Boxes className="h-3 w-3" />子组</TabsTrigger>
                  <TabsTrigger value="quota" className="text-xs gap-1">配额</TabsTrigger>
                  <TabsTrigger value="info" className="text-xs gap-1">信息</TabsTrigger>
                </TabsList>

                {/* Members tab */}
                <TabsContent value="members" className="mt-3">
                  <MembersTab groupId={data.id} members={data.members} onChanged={handleMemberRemoved} />
                </TabsContent>

                {/* Children tab */}
                <TabsContent value="children" className="mt-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">子组列表（{data.children.length}）</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.children.length === 0 ? (
                        <EmptyState icon={<Boxes className="h-6 w-6" />} title="暂无子组" description="该组没有子级用户组" small />
                      ) : (
                        <div className="space-y-1.5">
                          {data.children.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                              <Boxes className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium flex-1">{c.name}</span>
                              <Badge variant={c.enabled ? 'secondary' : 'destructive'} className={`text-[9px] ${c.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''}`}>
                                {c.enabled ? '启用' : '禁用'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Quota tab */}
                <TabsContent value="quota" className="mt-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">配额配置</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {data.quota ? (
                        <pre className="text-[11px] font-mono bg-muted/40 rounded p-2.5 overflow-x-auto scrollbar-thin">{JSON.stringify(data.quota, null, 2)}</pre>
                      ) : (
                        <EmptyState icon={<Boxes className="h-6 w-6" />} title="未配置配额" description="该组继承父组或全局配额" small />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Info tab */}
                <TabsContent value="info" className="mt-3">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">组信息</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <InfoRow label="组 ID" value={data.id} mono />
                      <InfoRow label="组名" value={data.name} />
                      <InfoRow label="描述" value={data.description || '—'} />
                      <InfoRow label="父组" value={data.parent?.name || '无（顶级组）'} />
                      <InfoRow label="强制 2FA" value={data.enforceTwoFactor ? '是' : '否'} />
                      <InfoRow label="管理员 ID" value={data.admins.length > 0 ? data.admins.join(', ') : '无'} mono />
                      <InfoRow label="创建时间" value={new Date(data.createdAt).toLocaleString('zh-CN')} />
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

function MembersTab({ groupId, members, onChanged }: { groupId: string; members: GroupDetail['members']; onChanged: () => void }) {
  const [addOpen, setAddOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  async function removeMember(userId: string) {
    setRemoving(userId)
    try {
      await pfFetch(`/api/platform/groups/${groupId}/members?userId=${userId}`, { method: 'DELETE' })
      toast.success('成员已移除')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移除失败')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">组成员（{members.length}）</CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-3 w-3 mr-1" />添加成员
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <EmptyState icon={<UsersRound className="h-6 w-6" />} title="暂无成员" description="点击右上角添加成员" small />
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 hover:bg-accent/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.displayName || m.username}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                </div>
                <Badge variant="outline" className="text-[9px]">{m.role === 'admin' ? '组管理员' : m.role === 'owner' ? '组主' : '成员'}</Badge>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeMember(m.id)} disabled={removing === m.id}>
                  {removing === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddMemberDialog groupId={groupId} open={addOpen} onOpenChange={setAddOpen} onAdded={onChanged} />
    </Card>
  )
}

function AddMemberDialog({ groupId, open, onOpenChange, onAdded }: { groupId: string; open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [userId, setUserId] = React.useState('')
  const [role, setRole] = React.useState('member')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!userId.trim()) return toast.error('请输入用户 ID')
    setLoading(true)
    try {
      await pfFetch(`/api/platform/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ members: [{ userId: userId.trim(), role }] }),
      })
      toast.success('成员已添加')
      setUserId('')
      onOpenChange(false)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-6">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" />添加成员</SheetTitle>
          <SheetDescription>输入用户 ID 将用户加入此组</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">用户 ID</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="cuid 格式的用户 ID" disabled={loading} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">组内角色</Label>
            <div className="flex gap-2">
              {[
                { v: 'member', label: '成员' },
                { v: 'admin', label: '组管理员' },
                { v: 'owner', label: '组主' },
              ].map((r) => (
                <Button key={r.v} size="sm" variant={role === r.v ? 'default' : 'outline'} className="flex-1 text-xs" onClick={() => setRole(r.v)}>
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={loading || !userId.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            确认添加
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
