'use client'

import * as React from 'react'
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
import { pfFetch, usePlatformFetch, parseTags, formatRel, type ProxyNode } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Network, Plus, Trash2, RefreshCw, Loader2, Activity, Server, ExternalLink } from 'lucide-react'
import { usePlatformView } from '@/lib/platform-client'

interface ListResp<T> { items: T[]; total: number }

export function ProxyView() {
  const { setView, setCtx } = usePlatformView()
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [testId, setTestId] = React.useState<string | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (typeFilter) p.set('type', typeFilter)
    if (statusFilter) p.set('status', statusFilter)
    return `/api/platform/proxy-nodes?${p.toString()}`
  }, [page, pageSize, search, typeFilter, statusFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<ProxyNode>>(path)

  async function test(id: string) {
    setTestId(id)
    try {
      const res = await pfFetch<{ latency?: number }>(`/api/platform/proxy-nodes/${id}/test`, { method: 'POST' })
      toast.success(`探测成功，延迟 ${res?.latency ?? '?'}ms`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '探测失败')
    } finally {
      setTestId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await pfFetch(`/api/platform/proxy-nodes/${deleteId}`, { method: 'DELETE' })
      toast.success('代理节点已删除')
      setDeleteId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const columns: Column<ProxyNode>[] = [
    {
      key: 'name', header: '名称', sortable: true,
      cell: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          {p.tags && parseTags(Array.isArray(p.tags) ? JSON.stringify(p.tags) : (p.tags as unknown as string)).length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {parseTags(Array.isArray(p.tags) ? JSON.stringify(p.tags) : (p.tags as unknown as string)).slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="text-[9px] px-1 py-0 h-4">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      ),
    },
    { key: 'type', header: '类型', cell: (p) => <StatusBadge status={p.type} /> },
    { key: 'status', header: '状态', cell: (p) => <StatusBadge status={p.status} dot /> },
    {
      key: 'latency', header: '延迟',
      cell: (p) => (
        <span className="text-xs tabular-nums">
          {p.healthLatency !== null && p.healthLatency !== undefined ? (
            <span className={p.healthLatency > 500 ? 'text-amber-500' : 'text-emerald-500'}>
              {p.healthLatency.toFixed(3)} ms
            </span>
          ) : '—'}
        </span>
      ),
    },
    { key: 'weight', header: '权重', cell: (p) => <span className="tabular-nums">{p.weight}</span> },
    {
      key: 'addr', header: '地址',
      cell: (p) => (
        <div className="text-xs font-mono">
          {p.socksAddress && <div>socks: {p.socksAddress}</div>}
          {p.httpAddress && <div>http: {p.httpAddress}</div>}
          {!p.socksAddress && !p.httpAddress && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'link', header: '关联',
      cell: (p) =>
        p.type === 'internal_singbox' && p.singboxInstanceId ? (
          <Button size="sm" variant="link" className="h-7 px-1 text-xs" onClick={() => { setCtx({ singboxInstanceId: p.singboxInstanceId }); setView('singbox') }}>
            <Server className="h-3 w-3" />
            {p.singboxInstanceName || p.singboxInstanceId.slice(0, 8)}
            <ExternalLink className="h-3 w-3" />
          </Button>
        ) : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: 'createdAt', header: '创建时间', sortable: true, cell: (p) => <span className="text-xs text-muted-foreground">{formatRel(p.createdAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="探测" disabled={testId === p.id} onClick={() => test(p.id)}>
            {testId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(p.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="代理节点"
        description="外部代理与内置 Sing-Box 代理池统一管理。延迟精度 0.001 ms。"
        icon={<Network className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              添加代理
            </Button>
          </div>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(p) => p.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索代理名称…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filters={[
          { key: 'type', label: '类型', options: [
            { value: 'external', label: '外部代理' },
            { value: 'internal_singbox', label: '内置 Sing-Box' },
          ] },
          { key: 'status', label: '状态', options: [
            { value: 'active', label: '活跃' },
            { value: 'draining', label: '排空中' },
            { value: 'offline', label: '离线' },
            { value: 'error', label: '异常' },
          ] },
        ]}
        filterValues={{ type: typeFilter, status: statusFilter }}
        onFilterChange={(k, v) => {
          if (k === 'type') { setTypeFilter(v); setPage(1) }
          if (k === 'status') { setStatusFilter(v); setPage(1) }
        }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无代理节点"
        emptyDescription="添加外部代理或新建 Sing-Box 实例自动生成内置代理"
        emptyAction={{ label: '添加外部代理', onClick: () => setCreateOpen(true) }}
      />

      <CreateProxyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除代理节点？"
        description="若是内置 Sing-Box 类型，请前往 Sing-Box 实例页面销毁。外部代理可直接删除。"
        confirmText="确认删除"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function CreateProxyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = React.useState('')
  const [socksAddress, setSocksAddress] = React.useState('')
  const [httpAddress, setHttpAddress] = React.useState('')
  const [weight, setWeight] = React.useState(1)
  const [tags, setTags] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!name.trim()) return toast.error('请输入代理名称')
    if (!socksAddress.trim() && !httpAddress.trim()) return toast.error('至少填写一个 Socks 或 HTTP 地址')
    setLoading(true)
    try {
      await pfFetch('/api/platform/proxy-nodes', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type: 'external',
          socksAddress: socksAddress || undefined,
          httpAddress: httpAddress || undefined,
          weight,
          tags: tags ? tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        }),
      })
      toast.success('代理节点已添加')
      setName(''); setSocksAddress(''); setHttpAddress(''); setWeight(1); setTags('')
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加外部代理节点</DialogTitle>
          <DialogDescription>内置 Sing-Box 类型的代理节点由实例创建时自动生成，无需手动添加</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>代理名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} /></div>
          <div className="space-y-1.5"><Label>Socks 地址</Label><Input value={socksAddress} onChange={(e) => setSocksAddress(e.target.value)} placeholder="host:port" disabled={loading} /></div>
          <div className="space-y-1.5"><Label>HTTP 地址</Label><Input value={httpAddress} onChange={(e) => setHttpAddress(e.target.value)} placeholder="host:port" disabled={loading} /></div>
          <div className="space-y-1.5"><Label>权重</Label><NumberInput value={weight} onValueChange={(v) => setWeight(v ?? 1)} min={1} max={1000} step={1} /></div>
          <div className="space-y-1.5"><Label>标签</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="逗号分隔" disabled={loading} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
