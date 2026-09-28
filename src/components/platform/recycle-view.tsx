'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { JsonDiffViewer } from './shared/json-diff-viewer'
import { pfFetch, usePlatformFetch, formatRel, formatDateTime, type RecycleBinItem } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Trash2, RotateCcw, RefreshCw, Loader2, Eye, Clock, Timer } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

const TYPE_LABELS: Record<string, string> = {
  workspace: '工作区',
  singbox: 'Sing-Box 实例',
  proxy: '代理节点',
  template: '模板',
  file: '文件',
  token: 'API Token',
  script: '脚本',
  user: '用户',
}

export function RecycleView() {
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [restoreId, setRestoreId] = React.useState<string | null>(null)
  const [purgeId, setPurgeId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<RecycleBinItem | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (typeFilter) p.set('resourceType', typeFilter)
    return `/api/platform/recycle-bin?${p.toString()}`
  }, [page, pageSize, search, typeFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<RecycleBinItem>>(path)

  async function restore(id: string) {
    setBusy(id)
    try {
      await pfFetch(`/api/platform/recycle-bin/${id}/restore`, { method: 'POST' })
      toast.success('资源已恢复')
      setRestoreId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败')
    } finally {
      setBusy(null)
    }
  }

  async function purge(id: string) {
    setBusy(id)
    try {
      await pfFetch(`/api/platform/recycle-bin/${id}`, { method: 'DELETE' })
      toast.success('已物理清除')
      setPurgeId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '清除失败')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<RecycleBinItem>[] = [
    {
      key: 'resourceType', header: '资源类型',
      cell: (r) => <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[r.resourceType] || r.resourceType}</Badge>,
    },
    {
      key: 'resourceId', header: '资源ID',
      cell: (r) => <code className="text-[10px] font-mono">{r.resourceId.slice(0, 12)}</code>,
    },
    {
      key: 'deletedBy', header: '删除人',
      cell: (r) => <span className="text-xs">{r.deletedByUser?.displayName || r.deletedByUser?.email || r.deletedBy?.slice(0, 8) || '系统'}</span>,
    },
    { key: 'deletedAt', header: '删除时间', sortable: true, cell: (r) => <span className="text-xs text-muted-foreground">{formatRel(r.deletedAt)}</span> },
    {
      key: 'expiresAt', header: '自动清除',
      cell: (r) => {
        const ms = new Date(r.expiresAt).getTime() - Date.now()
        const days = Math.floor(ms / 86400000)
        const hours = Math.floor((ms % 86400000) / 3600000)
        return (
          <span className={`text-xs ${ms < 86400000 ? 'text-red-500' : 'text-amber-500'}`}>
            <Clock className="h-3 w-3 inline mr-0.5" />
            {days > 0 ? `${days}天${hours}小时` : `${hours}小时`}后
          </span>
        )
      },
    },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="查看快照" onClick={() => setDetail(r)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" title="恢复" disabled={busy === r.id} onClick={() => setRestoreId(r.id)}>
            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="立即清除" onClick={() => setPurgeId(r.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="回收站"
        description="所有删除操作进入回收站封存。自动过期物理清除前可恢复。"
        icon={<Trash2 className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-3 flex items-start gap-2">
        <Timer className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          回收站保留期由系统配置 <code className="font-mono">recycle.retentionDays</code> 控制。到期后系统将物理清除对应数据。
          管理员可单独开启/关闭用户自主恢复权限。
        </p>
      </div>

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索资源ID…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filters={[{ key: 'type', label: '资源类型', options: Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })) }]}
        filterValues={{ type: typeFilter }}
        onFilterChange={(_, v) => { setTypeFilter(v); setPage(1) }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="回收站为空"
        emptyDescription="删除的资源将在此处显示，到期前可恢复"
      />

      <Drawer open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              资源快照 — {detail ? (TYPE_LABELS[detail.resourceType] || detail.resourceType) : ''}
            </DrawerTitle>
            <DrawerDescription>
              {detail && (
                <span className="flex flex-wrap gap-2 text-xs mt-1">
                  <span>资源ID: <code className="font-mono">{detail.resourceId}</code></span>
                  <span>删除: {formatDateTime(detail.deletedAt)}</span>
                  <span>清除: {formatDateTime(detail.expiresAt)}</span>
                </span>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto scrollbar-thin">
            {detail && <JsonDiffViewer beforeJson={detail.resourceSnapshot} afterJson={null} />}
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={!!restoreId}
        onOpenChange={(o) => !o && setRestoreId(null)}
        title="恢复该资源？"
        description="资源将从回收站恢复到原列表。若同名资源已存在，可能需要重命名。"
        confirmText="确认恢复"
        onConfirm={() => { if (restoreId) restore(restoreId) }}
      />
      <ConfirmDialog
        open={!!purgeId}
        onOpenChange={(o) => !o && setPurgeId(null)}
        title="立即物理清除？"
        description="此操作不可撤销。资源数据将被永久删除。"
        confirmText="确认清除"
        destructive
        confirmTextMatch="清除"
        onConfirm={() => { if (purgeId) purge(purgeId) }}
      />
    </div>
  )
}
