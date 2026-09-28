'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer'
import { DataTable, type Column } from './shared/data-table'
import { JsonDiffViewer } from './shared/json-diff-viewer'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatDateTime, type AuditLog } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { ScrollText, Download, RefreshCw, Loader2, Eye, Search } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function AuditView() {
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState('')
  const [operator, setOperator] = React.useState('')
  const [resourceId, setResourceId] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [detail, setDetail] = React.useState<AuditLog | null>(null)
  const [exporting, setExporting] = React.useState(false)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (typeFilter) p.set('operationType', typeFilter)
    if (operator) p.set('operator', operator)
    if (resourceId) p.set('resourceId', resourceId)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return `/api/platform/audit-logs?${p.toString()}`
  }, [page, pageSize, search, typeFilter, operator, resourceId, from, to])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<AuditLog>>(path)

  async function exportCsv() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (typeFilter) params.set('operationType', typeFilter)
      if (operator) params.set('operator', operator)
      if (resourceId) params.set('resourceId', resourceId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const url = `/api/platform/audit-logs/export?${params.toString()}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`导出失败 (${res.status})`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `audit-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(objUrl)
      toast.success('CSV 已导出')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt', header: '时间', sortable: true, width: '160px',
      cell: (a) => <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(a.createdAt)}</span>,
    },
    {
      key: 'operationType', header: '操作',
      cell: (a) => <Badge variant="outline" className="text-[10px] font-mono">{a.operationType}</Badge>,
    },
    { key: 'resourceType', header: '资源类型', cell: (a) => <span className="text-xs">{a.resourceType}</span> },
    {
      key: 'resourceId', header: '资源ID',
      cell: (a) => a.resourceId ? <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">{a.resourceId.slice(0, 10)}</code> : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: 'operatorName', header: '操作人', cell: (a) => <span className="text-sm">{a.operatorName}</span> },
    { key: 'clientIp', header: '客户端IP', cell: (a) => <span className="text-xs font-mono">{a.clientIp || '—'}</span> },
    {
      key: 'trace', header: 'TraceId',
      cell: (a) => a.traceId ? <code className="text-[10px] font-mono text-muted-foreground" title={a.traceId}>{a.traceId.slice(0, 8)}</code> : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: 'actions', header: '', align: 'right', width: '60px',
      cell: (a) => (
        <Button size="icon" variant="ghost" className="h-7 w-7" title="查看详情" onClick={() => setDetail(a)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="审计日志"
        description="全平台操作审计，数据库层面禁止 update/delete。支持时间范围、操作人、资源过滤与 CSV 导出。"
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              导出 CSV
            </Button>
          </div>
        }
      />

      <div className="rounded-lg border border-border/60 bg-card p-3 mb-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px] space-y-1">
            <Label className="text-xs text-muted-foreground">关键词</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="搜索操作人/资源类型…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">操作类型</Label>
            <Input placeholder="create / update / delete" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }} className="h-8 w-36 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">操作人</Label>
            <Input placeholder="用户名/邮箱" value={operator} onChange={(e) => { setOperator(e.target.value); setPage(1) }} className="h-8 w-40 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">资源ID</Label>
            <Input placeholder="精确ID" value={resourceId} onChange={(e) => { setResourceId(e.target.value); setPage(1) }} className="h-8 w-40 text-sm font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">起始</Label>
            <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">截止</Label>
            <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="h-8 text-sm" />
          </div>
          {(search || typeFilter || operator || resourceId || from || to) && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => {
              setSearch(''); setTypeFilter(''); setOperator(''); setResourceId(''); setFrom(''); setTo(''); setPage(1)
            }}>清除</Button>
          )}
        </div>
      </div>

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(a) => a.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无审计记录"
        emptyDescription="调整筛选条件或稍后再试"
      />

      <Drawer open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              审计详情 — {detail?.operationType}
            </DrawerTitle>
            <DrawerDescription>
              {detail && (
                <span className="flex flex-wrap gap-2 text-xs mt-1">
                  <span>资源: <code className="font-mono">{detail.resourceType}</code></span>
                  {detail.resourceId && <span>ID: <code className="font-mono">{detail.resourceId}</code></span>}
                  <span>操作人: {detail.operatorName}</span>
                  <span>IP: <code className="font-mono">{detail.clientIp || '—'}</code></span>
                  {detail.traceId && <span>TraceId: <code className="font-mono">{detail.traceId}</code></span>}
                  <span>时间: {formatDateTime(detail.createdAt)}</span>
                </span>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto scrollbar-thin">
            {detail && <JsonDiffViewer beforeJson={detail.beforeJson} afterJson={detail.afterJson} />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
