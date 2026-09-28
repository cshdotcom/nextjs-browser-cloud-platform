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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatRel, type Template } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { LayoutTemplate, Plus, Trash2, RefreshCw, Loader2, Pencil, Copy, Eye } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function TemplatesView() {
  const [search, setSearch] = React.useState('')
  const [visibility, setVisibility] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTpl, setEditTpl] = React.useState<Template | null>(null)
  const [viewTpl, setViewTpl] = React.useState<Template | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (visibility) p.set('visibility', visibility)
    return `/api/platform/templates?${p.toString()}`
  }, [page, pageSize, search, visibility])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<Template>>(path)

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await pfFetch(`/api/platform/templates/${deleteId}`, { method: 'DELETE' })
      toast.success('模板已删除')
      setDeleteId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function duplicate(t: Template) {
    try {
      await pfFetch('/api/platform/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: `${t.name} (副本)`,
          visibility: t.visibility,
          config: t.config,
          parentId: t.parentId,
        }),
      })
      toast.success('模板已复制')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复制失败')
    }
  }

  const columns: Column<Template>[] = [
    {
      key: 'name', header: '名称', sortable: true,
      cell: (t) => (
        <div>
          <div className="font-medium">{t.name}</div>
          {t.parentId && <div className="text-[11px] text-muted-foreground">继承自: {t.parentId.slice(0, 8)}</div>}
        </div>
      ),
    },
    { key: 'visibility', header: '可见性', cell: (t) => <Badge variant="outline" className={
      t.visibility === 'global' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
        : t.visibility === 'group' ? 'text-sky-500 border-sky-500/30 bg-sky-500/10'
        : 'text-muted-foreground'
    }>{t.visibility === 'global' ? '全局' : t.visibility === 'group' ? '组共享' : '私有'}</Badge> },
    { key: 'owner', header: '所有者', cell: (t) => <span className="text-sm">{t.ownerName || t.ownerId.slice(0, 8)}</span> },
    { key: 'updatedAt', header: '更新时间', sortable: true, cell: (t) => <span className="text-xs text-muted-foreground">{formatRel(t.updatedAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="查看配置" onClick={() => setViewTpl(t)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="编辑" onClick={() => setEditTpl(t)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="复制" onClick={() => duplicate(t)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(t.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="浏览器模板"
        description="模板体系：私有 / 组共享 / 全局。支持继承、复制、JSON 导入导出。"
        icon={<LayoutTemplate className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              新建模板
            </Button>
          </div>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(t) => t.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索模板名称…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filters={[{ key: 'visibility', label: '可见性', options: [
          { value: 'private', label: '私有' },
          { value: 'group', label: '组共享' },
          { value: 'global', label: '全局' },
        ] }]}
        filterValues={{ visibility }}
        onFilterChange={(_, v) => { setVisibility(v); setPage(1) }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无浏览器模板"
        emptyDescription="创建一个模板来沉淀浏览器指纹、UA、注入脚本等配置"
        emptyAction={{ label: '立即创建', onClick: () => setCreateOpen(true) }}
      />

      <TemplateFormDialog
        open={createOpen || !!editTpl}
        template={editTpl}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTpl(null) } }}
        onSaved={reload}
      />

      <ViewTemplateDialog template={viewTpl} onClose={() => setViewTpl(null)} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除模板？"
        description="模板将被软删除。引用此模板的工作区不受影响。"
        confirmText="确认删除"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function TemplateFormDialog({
  open, template, onOpenChange, onSaved,
}: { open: boolean; template: Template | null; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [name, setName] = React.useState('')
  const [visibility, setVisibility] = React.useState<'private' | 'group' | 'global'>('private')
  const [config, setConfig] = React.useState('{}')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (template) {
      setName(template.name)
      setVisibility(template.visibility)
      setConfig(template.config || '{}')
    } else {
      setName(''); setVisibility('private'); setConfig('{\n  "ua": "",\n  "scripts": [],\n  "modifyRules": []\n}')
    }
  }, [template, open])

  async function submit() {
    if (!name.trim()) return toast.error('请输入模板名称')
    try {
      JSON.parse(config)
    } catch {
      return toast.error('配置 JSON 格式错误')
    }
    setLoading(true)
    try {
      if (template) {
        await pfFetch(`/api/platform/templates/${template.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), visibility, config }),
        })
        toast.success('模板已更新')
      } else {
        await pfFetch('/api/platform/templates', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), visibility, config }),
        })
        toast.success('模板已创建')
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
          <DialogTitle>{template ? '编辑模板' : '新建模板'}</DialogTitle>
          <DialogDescription>模板配置为 JSON 结构，可包含 UA、脚本注入、修改规则等字段</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>模板名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} /></div>
          <div className="space-y-1.5"><Label>可见性</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as 'private' | 'group' | 'global')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">私有（仅自己）</SelectItem>
                <SelectItem value="group">组共享</SelectItem>
                <SelectItem value="global">全局（所有人）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>配置 JSON</Label>
            <Textarea value={config} onChange={(e) => setConfig(e.target.value)} rows={12} className="font-mono text-xs" disabled={loading} />
          </div>
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

function ViewTemplateDialog({ template, onClose }: { template: Template | null; onClose: () => void }) {
  if (!template) return null
  let pretty = template.config
  try { pretty = JSON.stringify(JSON.parse(template.config), null, 2) } catch {}
  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>模板配置 — {template.name}</DialogTitle>
          <DialogDescription>只读查看</DialogDescription>
        </DialogHeader>
        <pre className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs font-mono overflow-auto max-h-[60vh] scrollbar-thin">{pretty}</pre>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
