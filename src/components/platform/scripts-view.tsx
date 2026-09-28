'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from 'next-themes'
import { pfFetch, usePlatformFetch, formatRel, type ScriptTemplate } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Code2, Plus, Trash2, RefreshCw, Loader2, Eye, Pencil } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function ScriptsView() {
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editScr, setEditScr] = React.useState<ScriptTemplate | null>(null)
  const [viewScr, setViewScr] = React.useState<ScriptTemplate | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    return `/api/platform/scripts?${p.toString()}`
  }, [page, pageSize, search])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<ScriptTemplate>>(path)

  async function toggle(s: ScriptTemplate) {
    setBusy(s.id)
    try {
      await pfFetch(`/api/platform/scripts/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !s.enabled }),
      })
      toast.success(`${s.name} 已${!s.enabled ? '启用' : '禁用'}`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await pfFetch(`/api/platform/scripts/${deleteId}`, { method: 'DELETE' })
      toast.success('脚本已删除')
      setDeleteId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const columns: Column<ScriptTemplate>[] = [
    {
      key: 'name', header: '脚本名称', sortable: true,
      cell: (s) => (
        <div>
          <div className="font-medium font-mono text-sm">{s.name}</div>
          <div className="text-[11px] text-muted-foreground">v{s.version}</div>
        </div>
      ),
    },
    {
      key: 'boundDomains', header: '绑定域名',
      cell: (s) => s.boundDomains && s.boundDomains.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {s.boundDomains.slice(0, 3).map((d) => <Badge key={d} variant="outline" className="text-[9px] px-1 py-0 h-4">{d}</Badge>)}
          {s.boundDomains.length > 3 && <span className="text-[10px] text-muted-foreground">+{s.boundDomains.length - 3}</span>}
        </div>
      ) : <span className="text-muted-foreground text-xs">全局</span>,
    },
    {
      key: 'enabled', header: '状态',
      cell: (s) => <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} disabled={busy === s.id} />,
    },
    { key: 'updatedAt', header: '更新时间', sortable: true, cell: (s) => <span className="text-xs text-muted-foreground">{formatRel(s.updatedAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="查看源码" onClick={() => setViewScr(s)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="编辑" onClick={() => setEditScr(s)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(s.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="脚本市场"
        description="管理员维护可注入到浏览器会话的 JS 脚本模板。支持版本管理、域名绑定。"
        icon={<Code2 className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              新建脚本
            </Button>
          </div>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(s) => s.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索脚本名称…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无脚本模板"
        emptyDescription="管理员可上传 JS 脚本供浏览器会话使用"
        emptyAction={{ label: '立即创建', onClick: () => setCreateOpen(true) }}
      />

      <ScriptFormDialog
        open={createOpen || !!editScr}
        script={editScr}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditScr(null) } }}
        onSaved={reload}
      />

      <ViewScriptDialog script={viewScr} onClose={() => setViewScr(null)} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除脚本？"
        description="脚本将被软删除。引用此脚本的工作区不受影响。"
        confirmText="确认删除"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ScriptFormDialog({
  open, script, onOpenChange, onSaved,
}: { open: boolean; script: ScriptTemplate | null; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [name, setName] = React.useState('')
  const [version, setVersion] = React.useState('1.0.0')
  const [boundDomains, setBoundDomains] = React.useState('')
  const [sourceCode, setSourceCode] = React.useState('// 在浏览器会话启动时自动执行\n(function() {\n  console.log("script injected");\n})();')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (script) {
      setName(script.name)
      setVersion(script.version)
      setBoundDomains(script.boundDomains ? script.boundDomains.join(', ') : '')
      setSourceCode(script.sourceCode)
    } else {
      setName(''); setVersion('1.0.0'); setBoundDomains(''); setSourceCode('// 在浏览器会话启动时自动执行\n(function() {\n  console.log("script injected");\n})();')
    }
  }, [script, open])

  async function submit() {
    if (!name.trim()) return toast.error('请输入脚本名称')
    if (!sourceCode.trim()) return toast.error('请填写脚本源码')
    setLoading(true)
    try {
      const body = {
        name: name.trim(),
        version,
        sourceCode,
        boundDomains: boundDomains ? boundDomains.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      }
      if (script) {
        await pfFetch(`/api/platform/scripts/${script.id}`, { method: 'PUT', body: JSON.stringify(body) })
        toast.success('脚本已更新')
      } else {
        await pfFetch('/api/platform/scripts', { method: 'POST', body: JSON.stringify(body) })
        toast.success('脚本已创建')
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{script ? '编辑脚本' : '新建脚本'}</DialogTitle>
          <DialogDescription>支持版本管理与域名绑定。会话创建时由业务网关注入到底层浏览器</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>脚本名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} /></div>
          <div className="space-y-1.5"><Label>版本</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} disabled={loading} /></div>
          <div className="col-span-2 space-y-1.5"><Label>绑定域名（逗号分隔，留空表示全局）</Label><Input value={boundDomains} onChange={(e) => setBoundDomains(e.target.value)} placeholder="example.com, *.test.com" disabled={loading} /></div>
          <div className="col-span-2 space-y-1.5"><Label>脚本源码 (JavaScript)</Label><Textarea value={sourceCode} onChange={(e) => setSourceCode(e.target.value)} rows={12} className="font-mono text-xs" disabled={loading} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ViewScriptDialog({ script, onClose }: { script: ScriptTemplate | null; onClose: () => void }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  if (!script) return null
  return (
    <Dialog open={!!script} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>脚本源码 — {script.name} <Badge variant="outline" className="text-[10px]">v{script.version}</Badge></DialogTitle>
          <DialogDescription>只读查看</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/60 overflow-hidden bg-muted/30 max-h-[60vh] overflow-y-auto scrollbar-thin">
          <SyntaxHighlighter
            language="javascript"
            style={isDark ? vscDarkPlus : oneLight}
            customStyle={{ margin: 0, background: 'transparent', padding: '0.75rem', fontSize: '11px' }}
            wrapLongLines
          >
            {script.sourceCode}
          </SyntaxHighlighter>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
