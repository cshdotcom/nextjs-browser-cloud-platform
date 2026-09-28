'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { UsersRound, RefreshCw, Loader2, Plus, MoreHorizontal } from 'lucide-react'
import { pfFetch, usePlatformFetch, type ListResp } from '@/lib/platform-client'
import { toast } from 'sonner'
import { EmptyState, LoadingState, ErrorState } from './shared/empty-state'
import { GroupDetailSheet } from './group-detail-sheet'

interface PlatformGroup {
  id: string
  name: string
  description: string | null
  parentId: string | null
  enabled: boolean
  counts: {
    groupUsers: number
    children: number
    proxyNodes: number
    browserWorkspaces: number
  }
  createdAt: string
}

export function GroupsView() {
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(20)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailGroupId, setDetailGroupId] = React.useState<string | null>(null)

  const listUrl = `/api/platform/groups?page=${page}&pageSize=${pageSize}`
  const { data, loading, error, reload } = usePlatformFetch<ListResp<PlatformGroup>>(listUrl)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          用户组管理
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">管理用户组、层级关系、配额继承、代理绑定。点击组名查看详情。</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">用户组列表</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />新建用户组
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (!data || data.items.length === 0) ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={<UsersRound className="h-8 w-8" />} title="暂无用户组" description="点击右上角「新建用户组」创建" />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>组名</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>成员数</TableHead>
                    <TableHead>子组数</TableHead>
                    <TableHead>绑定代理</TableHead>
                    <TableHead>工作区</TableHead>
                    <TableHead>创建时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((g) => (
                    <TableRow key={g.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDetailGroupId(g.id)}>
                      <TableCell className="font-medium text-sm text-primary">{g.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{g.description || '—'}</TableCell>
                      <TableCell>
                        {g.enabled ? (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">启用</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">禁用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{g.counts.groupUsers}</TableCell>
                      <TableCell className="text-xs">{g.counts.children}</TableCell>
                      <TableCell className="text-xs">{g.counts.proxyNodes}</TableCell>
                      <TableCell className="text-xs">{g.counts.browserWorkspaces}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">{new Date(g.createdAt).toLocaleDateString('zh-CN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <GroupDetailSheet groupId={detailGroupId} open={!!detailGroupId} onOpenChange={(o) => { if (!o) setDetailGroupId(null) }} onChanged={reload} />
    </div>
  )
}

function CreateGroupDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!name) return toast.error('请输入组名')
    setLoading(true)
    try {
      await pfFetch('/api/platform/groups', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined }),
      })
      toast.success('用户组创建成功')
      setName(''); setDescription('')
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户组</DialogTitle>
          <DialogDescription>创建用户组，支持层级关系与配额继承</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">组名</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：核心开发组" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">描述（可选）</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="组用途说明" disabled={loading} />
          </div>
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
