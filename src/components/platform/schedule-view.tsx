'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatRel, formatDateTime, type ScheduleTask, type ScheduleTaskLog } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Clock, Play, RefreshCw, Loader2, History, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function ScheduleView() {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [runId, setRunId] = React.useState<string | null>(null)
  const [toggleId, setToggleId] = React.useState<string | null>(null)
  const [logsTask, setLogsTask] = React.useState<ScheduleTask | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    return `/api/platform/schedule-tasks?${p.toString()}`
  }, [page, pageSize])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<ScheduleTask>>(path)

  async function toggle(task: ScheduleTask) {
    setToggleId(task.id)
    try {
      await pfFetch(`/api/platform/schedule-tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !task.enabled }),
      })
      toast.success(`${task.name} 已${!task.enabled ? '启用' : '禁用'}`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setToggleId(null)
    }
  }

  async function runOnce(id: string) {
    setRunId(id)
    try {
      await pfFetch(`/api/platform/schedule-tasks/${id}/run`, { method: 'POST' })
      toast.success('任务已触发执行')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败')
    } finally {
      setRunId(null)
    }
  }

  const columns: Column<ScheduleTask>[] = [
    {
      key: 'name', header: '任务名称', sortable: true,
      cell: (t) => (
        <div>
          <div className="font-medium font-mono text-sm">{t.name}</div>
          <div className="text-[11px] text-muted-foreground">{t.cronExpr}</div>
        </div>
      ),
    },
    {
      key: 'enabled', header: '启用',
      cell: (t) => (
        <Switch checked={t.enabled} onCheckedChange={() => toggle(t)} disabled={toggleId === t.id} />
      ),
    },
    {
      key: 'lastExecuteAt', header: '上次执行',
      cell: (t) => (
        <span className="text-xs text-muted-foreground">
          {t.lastExecuteAt ? formatRel(t.lastExecuteAt) : '—'}
        </span>
      ),
    },
    {
      key: 'nextExecuteAt', header: '下次执行',
      cell: (t) => (
        <span className="text-xs text-muted-foreground">
          {t.nextExecuteAt ? formatRel(t.nextExecuteAt) : '—'}
        </span>
      ),
    },
    {
      key: 'lastResult', header: '结果',
      cell: (t) =>
        t.lastError ? (
          <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30 bg-red-500/10">失败</Badge>
        ) : t.lastResult ? (
          <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">成功</Badge>
        ) : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: 'failures', header: '连续失败',
      cell: (t) => (
        <span className={`tabular-nums text-xs ${t.consecutiveFailures > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {t.consecutiveFailures}
        </span>
      ),
    },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="执行日志" onClick={() => setLogsTask(t)}>
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" title="手动执行" disabled={runId === t.id} onClick={() => runOnce(t.id)}>
            {runId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="定时任务"
        description="外部 cron 触发受保护 Route Handler；内存锁防止并发重入。连续失败达阈值自动告警。"
        icon={<Clock className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(t) => t.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无定时任务"
        emptyDescription="系统内置任务在初始化时自动注册"
      />

      <LogsDrawer task={logsTask} onClose={() => setLogsTask(null)} />
    </div>
  )
}

function LogsDrawer({ task, onClose }: { task: ScheduleTask | null; onClose: () => void }) {
  const { data, loading, error } = usePlatformFetch<{ items: ScheduleTaskLog[] }>(
    task ? `/api/platform/schedule-tasks/${task.id}/logs?pageSize=50` : null,
  )

  return (
    <Drawer open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            执行日志 — <code className="font-mono text-sm">{task?.name}</code>
          </DrawerTitle>
          <DrawerDescription>每次执行的开始/结束/结果，APPEND-ONLY 不可修改</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded bg-muted/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-destructive">{error.message}</div>
          ) : !data?.items || data.items.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">暂无执行记录</div>
          ) : (
            <div className="space-y-2">
              {data.items.map((l) => (
                <div key={l.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {l.errorStack ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    <span className="text-xs text-muted-foreground">开始: {formatDateTime(l.startedAt)}</span>
                    <span className="text-xs text-muted-foreground">结束: {l.finishedAt ? formatDateTime(l.finishedAt) : '进行中…'}</span>
                  </div>
                  {l.result && (
                    <div className="text-xs font-mono rounded bg-muted/40 p-2 mt-1 break-all">{l.result}</div>
                  )}
                  {l.errorStack && (
                    <details className="mt-1">
                      <summary className="text-[11px] text-red-500 cursor-pointer">展开错误堆栈</summary>
                      <pre className="text-[10px] font-mono text-red-500 bg-red-500/5 p-2 rounded mt-1 whitespace-pre-wrap break-all">{l.errorStack}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
