'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatRel, formatDateTime, type Alert, type Notice } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { BellRing, RefreshCw, CheckCheck, Loader2, AlertTriangle, Info, ShieldAlert, BellOff, Mail, MailOpen } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

const LEVEL_ICON: Record<string, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-sky-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  critical: <ShieldAlert className="h-4 w-4 text-red-500" />,
}

const LEVEL_BADGE_CLASS: Record<string, string> = {
  info: 'text-sky-500 border-sky-500/30 bg-sky-500/10',
  warning: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
  critical: 'text-red-500 border-red-500/30 bg-red-500/10',
}

export function AlertsView() {
  return (
    <div>
      <PageHeader
        title="告警与通知中心"
        description="系统告警处理与站内消息管理。所有告警同步写入审计日志。"
        icon={<BellRing className="h-5 w-5" />}
      />
      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">告警</TabsTrigger>
          <TabsTrigger value="notices">站内消息</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts" className="mt-3"><AlertsTab /></TabsContent>
        <TabsContent value="notices" className="mt-3"><NoticesTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function AlertsTab() {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [statusFilter, setStatusFilter] = React.useState('')
  const [handleId, setHandleId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (statusFilter) p.set('handleStatus', statusFilter)
    return `/api/platform/alerts?${p.toString()}`
  }, [page, pageSize, statusFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<Alert>>(path)

  async function handle(id: string) {
    setBusy(id)
    try {
      await pfFetch(`/api/platform/alerts/${id}/handle`, { method: 'POST' })
      toast.success('已标记为已处理')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<Alert>[] = [
    {
      key: 'level', header: '级别',
      cell: (a) => (
        <div className="flex items-center gap-1.5">
          {LEVEL_ICON[a.level] || <Info className="h-4 w-4 text-muted-foreground" />}
          <Badge variant="outline" className={`text-[10px] ${LEVEL_BADGE_CLASS[a.level]}`}>{a.level}</Badge>
        </div>
      ),
    },
    {
      key: 'title', header: '标题',
      cell: (a) => (
        <div>
          <div className="font-medium">{a.title}</div>
          {a.content && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{a.content}</div>}
          {a.resourceType && <div className="text-[10px] text-muted-foreground mt-0.5">资源: {a.resourceType}{a.resourceId ? ` · ${a.resourceId.slice(0, 10)}` : ''}</div>}
        </div>
      ),
    },
    { key: 'triggerAt', header: '触发时间', cell: (a) => <span className="text-xs text-muted-foreground">{formatRel(a.triggerAt)}</span> },
    {
      key: 'status', header: '处理状态',
      cell: (a) => (
        <Badge variant="outline" className={
          a.handleStatus === 'handled' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
          : a.handleStatus === 'ignored' ? 'text-muted-foreground'
          : 'text-amber-500 border-amber-500/30 bg-amber-500/10'
        }>
          {a.handleStatus === 'handled' ? '已处理' : a.handleStatus === 'ignored' ? '已忽略' : '待处理'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (a) => (
        <Button
          size="sm" variant="ghost" className="h-7 text-xs"
          disabled={a.handleStatus === 'handled' || busy === a.id}
          onClick={() => { setHandleId(a.id); handle(a.id) }}
        >
          {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
          标记已处理
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      rows={data?.items || []}
      columns={columns}
      rowKey={(a) => a.id}
      loading={loading}
      error={error?.message || null}
      onRetry={reload}
      filters={[{ key: 'status', label: '状态', options: [
        { value: 'pending', label: '待处理' },
        { value: 'handled', label: '已处理' },
        { value: 'ignored', label: '已忽略' },
      ] }]}
      filterValues={{ status: statusFilter }}
      onFilterChange={(_, v) => { setStatusFilter(v); setPage(1) }}
      pagination={{ page, pageSize, total: data?.total || 0 }}
      onPageChange={setPage}
      onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      emptyTitle="暂无告警"
      emptyDescription="一切正常。新告警会在此处显示"
      emptyIcon={<BellOff className="h-5 w-5" />}
    />
  )
}

function NoticesTab() {
  const { data, loading, error, reload } = usePlatformFetch<ListResp<Notice>>('/api/platform/notices')
  const [markingAll, setMarkingAll] = React.useState(false)

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await pfFetch('/api/platform/notices/read-all', { method: 'POST' })
      toast.success('已全部标记为已读')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setMarkingAll(false)
    }
  }

  const items = data?.items || []
  const unread = items.filter((n) => !n.read).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            站内消息
            {unread > 0 && <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">{unread} 未读</Badge>}
          </CardTitle>
          <CardDescription>系统与告警推送的站内消息</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={markAllRead} disabled={markingAll || unread === 0}>
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            全部已读
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">{error.message}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
            暂无站内消息
          </div>
        ) : (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto scrollbar-thin">
            {items.map((n) => (
              <div key={n.id} className={`rounded-lg border p-3 flex items-start gap-2 ${n.read ? 'border-border/40 bg-card' : 'border-primary/30 bg-primary/5'}`}>
                <span className="mt-0.5">{n.read ? <MailOpen className="h-4 w-4 text-muted-foreground" /> : <Mail className="h-4 w-4 text-primary" />}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.content && <div className="text-[11px] text-muted-foreground mt-0.5">{n.content}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</div>
                </div>
                {!n.read && <Badge className="text-[9px] bg-primary/15 text-primary">未读</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
