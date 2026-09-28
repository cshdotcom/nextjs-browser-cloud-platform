'use client'

import * as React from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, Loader2, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react'
import { pfFetch } from '@/lib/platform-client'
import { toast } from 'sonner'

interface ImportRow {
  username: string
  email: string
  displayName?: string
  password: string
  role?: string
}

interface RowResult {
  row: number
  username: string
  email: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

const TEMPLATE = `username,email,displayName,password,role
john,john@example.com,John Doe,SecurePass@123,user
jane,jane@example.com,Jane Smith,SecurePass@456,user`

export function ImportUsersDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onImported: () => void
}) {
  const [fileName, setFileName] = React.useState('')
  const [rows, setRows] = React.useState<ImportRow[]>([])
  const [mode, setMode] = React.useState<'skip' | 'update'>('skip')
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<RowResult[] | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setFileName('')
      setRows([])
      setResults(null)
      setMode('skip')
    }
  }, [open])

  function parseCsv(text: string): ImportRow[] {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) throw new Error('CSV 文件至少需要标题行 + 1 行数据')
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const required = ['username', 'email', 'password']
    for (const r of required) {
      if (!headers.includes(r)) throw new Error(`CSV 缺少必需列：${r}`)
    }
    const parsed: ImportRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length < headers.length) continue
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => { obj[h] = (parts[idx] || '').trim() })
      if (!obj.username || !obj.email) continue
      parsed.push({
        username: obj.username,
        email: obj.email,
        displayName: obj.displayname || obj.display_name || undefined,
        password: obj.password,
        role: obj.role || 'user',
      })
    }
    return parsed
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResults(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '')
        const parsed = parseCsv(text)
        if (parsed.length === 0) {
          toast.error('CSV 文件中没有有效数据行')
          return
        }
        setRows(parsed)
        toast.success(`已解析 ${parsed.length} 行数据`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'CSV 解析失败')
        setRows([])
      }
    }
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'users-template.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('模板已下载')
  }

  async function submit() {
    if (rows.length === 0) return toast.error('请先选择 CSV 文件')
    setLoading(true)
    setResults(null)
    try {
      const data = await pfFetch<{ results: RowResult[]; summary: { created: number; updated: number; skipped: number; errored: number } }>('/api/platform/users/import', {
        method: 'POST',
        body: JSON.stringify({ rows, mode }),
      })
      setResults(data.results)
      const s = data.summary
      toast.success(`导入完成：${s.created} 创建 / ${s.updated} 更新 / ${s.skipped} 跳过 / ${s.errored} 错误`)
      onImported()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败')
    } finally {
      setLoading(false)
    }
  }

  const summary = React.useMemo(() => {
    if (!results) return null
    return {
      created: results.filter((r) => r.status === 'created').length,
      updated: results.filter((r) => r.status === 'updated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errored: results.filter((r) => r.status === 'error').length,
    }
  }, [results])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            CSV 批量导入用户
          </DialogTitle>
          <DialogDescription>
            上传 CSV 文件批量创建/更新用户。密码使用 bcrypt 哈希存储，不会明文保存。
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4">
            {/* File upload */}
            <div
              className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary/40') }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary/40') }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-primary/40')
                const file = e.dataTransfer.files[0]
                if (file) {
                  const dt = new DataTransfer()
                  dt.items.add(file)
                  if (fileInputRef.current) {
                    fileInputRef.current.files = dt.files
                    fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
                  }
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
              />
              {fileName ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">{fileName}</span>
                  <span className="text-xs text-muted-foreground">{rows.length} 行数据已解析</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">点击或拖拽 CSV 文件到此处</span>
                  <span className="text-[11px] text-muted-foreground/70">支持 .csv 格式</span>
                </div>
              )}
            </div>

            {/* Mode + template */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">重复处理：</Label>
                <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
                  <button
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'skip' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setMode('skip')}
                  >跳过</button>
                  <button
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${mode === 'update' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => setMode('update')}
                  >更新</button>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={downloadTemplate}>
                <Download className="h-3 w-3 mr-1" />下载模板
              </Button>
            </div>

            {/* Preview rows */}
            {rows.length > 0 && (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <div className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 border-b border-border/60 bg-muted/40 text-muted-foreground">
                  预览（前 5 行）
                </div>
                <div className="overflow-x-auto scrollbar-thin max-h-40">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/20 sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">用户名</th>
                        <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">邮箱</th>
                        <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">显示名</th>
                        <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">角色</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t border-border/40">
                          <td className="px-3 py-1.5 font-mono">{r.username}</td>
                          <td className="px-3 py-1.5">{r.email}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.displayName || '—'}</td>
                          <td className="px-3 py-1.5"><Badge variant="outline" className="text-[9px]">{r.role}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 5 && (
                  <div className="text-[10px] text-muted-foreground px-3 py-1.5 border-t border-border/40 text-center">
                    还有 {rows.length - 5} 行未显示
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2">
              <SummaryBox icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="创建" value={summary!.created} color="emerald" />
              <SummaryBox icon={<CheckCircle2 className="h-4 w-4 text-sky-500" />} label="更新" value={summary!.updated} color="sky" />
              <SummaryBox icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} label="跳过" value={summary!.skipped} color="amber" />
              <SummaryBox icon={<XCircle className="h-4 w-4 text-red-500" />} label="错误" value={summary!.errored} color="red" />
            </div>

            {/* Detailed results */}
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 border-b border-border/60 bg-muted/40 text-muted-foreground">
                导入明细（{results.length} 条）
              </div>
              <div className="overflow-y-auto scrollbar-thin max-h-60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">行</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">用户名</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">邮箱</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">状态</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{r.row}</td>
                        <td className="px-3 py-1.5 font-mono">{r.username}</td>
                        <td className="px-3 py-1.5">{r.email}</td>
                        <td className="px-3 py-1.5">
                          <Badge variant="outline" className={`text-[9px] ${
                            r.status === 'created' ? 'text-emerald-500 bg-emerald-500/10' :
                            r.status === 'updated' ? 'text-sky-500 bg-sky-500/10' :
                            r.status === 'skipped' ? 'text-amber-500 bg-amber-500/10' :
                            'text-red-500 bg-red-500/10'
                          }`}>
                            {r.status === 'created' ? '创建' : r.status === 'updated' ? '更新' : r.status === 'skipped' ? '跳过' : '错误'}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-red-500 text-[10px]">{r.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <Button className="w-full" onClick={() => onOpenChange(false)}>完成</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
              <Button onClick={submit} disabled={loading || rows.length === 0}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                导入 {rows.length > 0 ? `${rows.length} 条` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/5 border-emerald-500/20',
    sky: 'bg-sky-500/5 border-sky-500/20',
    amber: 'bg-amber-500/5 border-amber-500/20',
    red: 'bg-red-500/5 border-red-500/20',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[color]}`}>
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
