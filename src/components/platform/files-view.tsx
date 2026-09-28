'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DataTable, type Column } from './shared/data-table'
import { ConfirmDialog } from './shared/confirm-dialog'
import { pfFetch, usePlatformFetch, formatBytes, formatRel, type FileMeta } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { FileText, Upload, Download, Trash2, RefreshCw, Loader2, Paperclip } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function FilesView() {
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = React.useState(false)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    return `/api/platform/files?${p.toString()}`
  }, [page, pageSize, search])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<FileMeta>>(path)

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await pfFetch(`/api/platform/files/${deleteId}`, { method: 'DELETE' })
      toast.success('文件已删除')
      setDeleteId(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  function download(f: FileMeta) {
    const a = document.createElement('a')
    a.href = `/api/platform/files/${f.id}/download`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  const columns: Column<FileMeta>[] = [
    {
      key: 'name', header: '文件名', sortable: true,
      cell: (f) => (
        <div className="min-w-0">
          <div className="font-medium truncate flex items-center gap-1.5">
            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
            {f.name}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{f.mime}</div>
        </div>
      ),
    },
    {
      key: 'size', header: '大小', sortable: true,
      cell: (f) => <span className="tabular-nums text-xs">{formatBytes(f.size)}</span>,
    },
    { key: 'owner', header: '所有者', cell: (f) => <span className="text-xs">{f.ownerName || f.userId?.slice(0, 8) || '—'}</span> },
    {
      key: 'session', header: '关联会话',
      cell: (f) => f.sessionId ? <code className="text-[10px] font-mono">{f.sessionId.slice(0, 10)}</code> : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      key: 'expireAt', header: '过期时间',
      cell: (f) => f.expireAt ? <span className="text-xs text-amber-500">{formatRel(f.expireAt)}</span> : <span className="text-muted-foreground text-xs">永久</span>,
    },
    { key: 'createdAt', header: '上传时间', sortable: true, cell: (f) => <span className="text-xs text-muted-foreground">{formatRel(f.createdAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (f) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="下载" onClick={() => download(f)}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="删除" onClick={() => setDeleteId(f.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="文件管理"
        description="浏览器会话下载文件、Profile 快照与上传文件统一管理。本地磁盘或 S3 兼容存储。"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              上传文件
            </Button>
          </div>
        }
      />

      <DataTable
        rows={data?.items || []}
        columns={columns}
        rowKey={(f) => f.id}
        loading={loading}
        error={error?.message || null}
        onRetry={reload}
        searchable
        searchValue={search}
        searchPlaceholder="搜索文件名…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无文件"
        emptyDescription="通过工作区下载或手动上传文件"
        emptyAction={{ label: '立即上传', onClick: () => setUploadOpen(true) }}
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={reload} />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="删除文件？"
        description="文件元数据软删除，存储实体异步清理。若开启文件备份，将先复制到备份目录。"
        confirmText="确认删除"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function UploadDialog({ open, onOpenChange, onUploaded }: { open: boolean; onOpenChange: (o: boolean) => void; onUploaded: () => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [sessionId, setSessionId] = React.useState('')
  const [progress, setProgress] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  async function upload() {
    if (!file) return toast.error('请选择文件')
    setUploading(true)
    setProgress(0)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (sessionId) formData.append('sessionId', sessionId)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/platform/files')
        xhr.withCredentials = true
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const b = JSON.parse(xhr.responseText)
              if (b.ok === false) reject(new Error(b.msg || '上传失败'))
              else resolve()
            } catch {
              resolve()
            }
          } else reject(new Error(`上传失败 (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('网络错误'))
        xhr.send(formData)
      })
      toast.success(`上传成功: ${file.name}`)
      setFile(null); setSessionId(''); setProgress(0)
      onOpenChange(false)
      onUploaded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>上传文件</DialogTitle>
          <DialogDescription>支持任意类型文件，后端会做后缀与魔数校验</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>选择文件</Label>
            <Input type="file" onChange={onPick} disabled={uploading} />
            {file && <p className="text-[11px] text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>关联会话 ID（可选）</Label>
            <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="workspace id" disabled={uploading} />
          </div>
          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-[11px] text-muted-foreground text-right">{progress}%</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>取消</Button>
          <Button onClick={upload} disabled={!file || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
