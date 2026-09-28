'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable, type Column } from './shared/data-table'
import { StatusBadge } from './shared/status-badge'
import { ConfirmDialog } from './shared/confirm-dialog'
import { NumberInput } from './shared/number-input'
import { pfFetch, usePlatformFetch, formatRel, formatDateTime, parseTags, type Workspace, type Template, type ProxyNode } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Boxes, Plus, Play, Square, Trash2, Share2, RefreshCw, Loader2, ExternalLink } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function WorkspacesView() {
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [modeFilter, setModeFilter] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<Record<string, boolean>>({})

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (statusFilter) p.set('status', statusFilter)
    if (modeFilter) p.set('mode', modeFilter)
    return `/api/platform/workspaces?${p.toString()}`
  }, [page, pageSize, search, statusFilter, modeFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<Workspace>>(path)

  async function action(id: string, action: 'start' | 'stop' | 'delete' | 'share') {
    setBusy((s) => ({ ...s, [id]: true }))
    try {
      await pfFetch(`/api/platform/workspaces/${id}/${action}`, { method: 'POST' })
      toast.success(`操作已执行: ${action}`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy((s) => ({ ...s, [id]: false }))
    }
  }

  async function batch(ids: string[], action: 'stop' | 'delete') {
    try {
      await pfFetch('/api/platform/workspaces/batch', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      })
      toast.success(`批量${action === 'stop' ? '停止' : '删除'}完成 (${ids.length})`)
      setSelectedIds([])
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量操作失败')
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await action(deleteId, 'delete')
    setDeleteId(null)
  }

  const columns: Column<Workspace>[] = [
    {
      key: 'name', header: '名称', sortable: true,
      cell: (w) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{w.name}</div>
          {w.tags && w.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {parseTags(Array.isArray(w.tags) ? JSON.stringify(w.tags) : (w.tags as unknown as string)).slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 h-4">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      ),
    },
    { key: 'mode', header: '模式', cell: (w) => <StatusBadge status={w.mode} /> },
    { key: 'status', header: '状态', cell: (w) => <StatusBadge status={w.status} dot /> },
    {
      key: 'proxy', header: '代理',
      cell: (w) => w.proxyNodeName || w.singboxInstanceName || <span className="text-muted-foreground text-xs">直连</span>,
    },
    { key: 'ttl', header: 'TTL/闲置', cell: (w) => <span className="text-xs tabular-nums">{w.ttlMinutes}分钟 / {w.idleTimeoutMinutes}分钟</span> },
    { key: 'createdAt', header: '创建时间', sortable: true, cell: (w) => <span className="text-xs text-muted-foreground">{formatRel(w.createdAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (w) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="打开" onClick={() => window.open(`/api/platform/workspaces/${w.id}/open`, '_blank')}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          {w.status !== 'running' ? (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" title="启动" disabled={busy[w.id]} onClick={() => action(w.id, 'start')}>
              {busy[w.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500" title="停止" disabled={busy[w.id]} onClick={() => action(w.id, 'stop')}>
              {busy[w.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" title="共享" onClick={() => action(w.id, 'share')}>
            <Share2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(w.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="浏览器工作区"
        description="管理基于 Steel-Browser 的 CDP/NoVNC 浏览器会话。支持创建、启停、共享、批量操作。"
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              新建工作区
            </Button>
          </div>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(w) => w.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索工作区名称…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filters={[
          { key: 'status', label: '状态', options: [
            { value: 'running', label: '运行中' },
            { value: 'idle', label: '闲置' },
            { value: 'stopped', label: '已停止' },
            { value: 'error', label: '异常' },
            { value: 'expired', label: '已过期' },
          ] },
          { key: 'mode', label: '模式', options: [
            { value: 'cdp_light', label: 'CDP 轻量' },
            { value: 'novnc_full', label: 'NoVNC 重度' },
          ] },
        ]}
        filterValues={{ status: statusFilter, mode: modeFilter }}
        onFilterChange={(k, v) => {
          if (k === 'status') { setStatusFilter(v); setPage(1) }
          if (k === 'mode') { setModeFilter(v); setPage(1) }
        }}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        batchActions={[
          { label: '批量停止', onClick: (ids) => batch(ids, 'stop'), variant: 'outline' },
          { label: '批量删除', onClick: (ids) => batch(ids, 'delete'), variant: 'destructive' },
        ]}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无浏览器工作区"
        emptyDescription="点击右上角「新建工作区」开始创建您的第一个浏览器会话"
        emptyAction={{ label: '立即创建', onClick: () => setCreateOpen(true) }}
      />

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除工作区？"
        description="该操作将停止 Steel-Browser 会话并清理关联 profile 与下载文件。不可恢复。"
        confirmText="确认删除"
        destructive
        confirmTextMatch="删除"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function CreateWorkspaceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = React.useState('')
  const [mode, setMode] = React.useState<'cdp_light' | 'novnc_full'>('cdp_light')
  const [templateId, setTemplateId] = React.useState<string>('')
  const [proxyNodeId, setProxyNodeId] = React.useState<string>('')
  const [ttl, setTtl] = React.useState<number>(60)
  const [idleTimeout, setIdleTimeout] = React.useState<number>(15)
  const [tags, setTags] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const { data: tplData } = usePlatformFetch<ListResp<Template>>('/api/platform/templates?pageSize=100')
  const { data: proxyData } = usePlatformFetch<ListResp<ProxyNode>>('/api/platform/proxy-nodes?pageSize=100')

  async function submit() {
    if (!name.trim()) return toast.error('请输入工作区名称')
    setLoading(true)
    try {
      await pfFetch('/api/platform/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          mode,
          templateId: templateId || undefined,
          proxyNodeId: proxyNodeId || undefined,
          ttlMinutes: ttl,
          idleTimeoutMinutes: idleTimeout,
          tags: tags ? tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        }),
      })
      toast.success('工作区创建成功')
      setName(''); setTags(''); setTtl(60); setIdleTimeout(15); setTemplateId(''); setProxyNodeId('')
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建浏览器工作区</DialogTitle>
          <DialogDescription>选择模式与代理，TTL 到期自动回收</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>工作区名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：自动化测试 #1" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label>会话模式</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'cdp_light' | 'novnc_full')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cdp_light">CDP 轻量</SelectItem>
                <SelectItem value="novnc_full">NoVNC 重度</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>模板</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="不使用模板" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">不使用模板</SelectItem>
                {(tplData?.items || []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>代理节点</Label>
            <Select value={proxyNodeId} onValueChange={setProxyNodeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="直连 (不使用代理)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">直连</SelectItem>
                {(proxyData?.items || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} · {p.type === 'internal_singbox' ? '内置' : '外部'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>TTL（分钟）</Label>
            <NumberInput value={ttl} onValueChange={(v) => setTtl(v ?? 60)} min={1} max={1440} unit="min" />
          </div>
          <div className="space-y-1.5">
            <Label>闲置超时（分钟）</Label>
            <NumberInput value={idleTimeout} onValueChange={(v) => setIdleTimeout(v ?? 15)} min={1} max={1440} unit="min" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>标签（逗号分隔）</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例如：prod, automation" disabled={loading} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
