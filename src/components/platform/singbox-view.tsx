'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from './shared/data-table'
import { StatusBadge } from './shared/status-badge'
import { ConfirmDialog } from './shared/confirm-dialog'
import { NumberInput } from './shared/number-input'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from 'next-themes'
import { pfFetch, usePlatformFetch, parseJson, formatRel, formatBytes, type SingboxInstance, type HostNode } from '@/lib/platform-client'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { Server, Plus, Play, Square, FlaskConical, ScrollText, Trash2, RefreshCw, Loader2, Cpu, MemoryStick } from 'lucide-react'

interface ListResp<T> { items: T[]; total: number }

export function SingboxView() {
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<Record<string, boolean>>({})
  const [logsInstance, setLogsInstance] = React.useState<SingboxInstance | null>(null)

  const path = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.set('q', search)
    if (statusFilter) p.set('status', statusFilter)
    return `/api/platform/singbox-instances?${p.toString()}`
  }, [page, pageSize, search, statusFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<SingboxInstance>>(path)

  async function action(id: string, action: 'start' | 'stop' | 'test' | 'delete') {
    setBusy((s) => ({ ...s, [id]: true }))
    try {
      const res = await pfFetch(`/api/platform/singbox-instances/${id}/${action}`, { method: 'POST' })
      if (action === 'test' && res) {
        toast.success(`测试完成：${JSON.stringify(res).slice(0, 60)}`)
      } else {
        toast.success(`操作已执行: ${action}`)
      }
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy((s) => ({ ...s, [id]: false }))
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await action(deleteId, 'delete')
    setDeleteId(null)
  }

  const columns: Column<SingboxInstance>[] = [
    {
      key: 'name', header: '名称', sortable: true,
      cell: (s) => (
        <div>
          <div className="font-medium">{s.name}</div>
          {s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}
        </div>
      ),
    },
    { key: 'status', header: '状态', cell: (s) => <StatusBadge status={s.status} dot /> },
    {
      key: 'resource', header: 'CPU/内存',
      cell: (s) => (
        <div className="text-xs tabular-nums">
          <div className="flex items-center gap-1"><Cpu className="h-3 w-3" />{s.cpuUsed ?? 0} / {s.cpuLimit.toFixed(3)} 核</div>
          <div className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{(s.memoryUsed ?? 0).toFixed(0)} / {s.memoryLimit.toFixed(3)} MB</div>
        </div>
      ),
    },
    {
      key: 'socks', header: 'Socks 地址',
      cell: (s) => s.socksAddress ? <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{s.socksAddress}</code> : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: 'maxSessions', header: '最大会话', cell: (s) => <span className="tabular-nums">{s.maxSessions}</span> },
    {
      key: 'traffic', header: '流量',
      cell: (s) => (
        <div className="text-[11px] tabular-nums">
          <div>↓ {formatBytes(s.trafficIn * 1024 * 1024)}</div>
          <div>↑ {formatBytes(s.trafficOut * 1024 * 1024)}</div>
        </div>
      ),
    },
    { key: 'createdAt', header: '创建时间', sortable: true, cell: (s) => <span className="text-xs text-muted-foreground">{formatRel(s.createdAt)}</span> },
    {
      key: 'actions', header: '操作', align: 'right',
      cell: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" title="连通性测试" disabled={busy[s.id]} onClick={() => action(s.id, 'test')}>
            {busy[s.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="日志" onClick={() => setLogsInstance(s)}>
            <ScrollText className="h-3.5 w-3.5" />
          </Button>
          {s.status === 'running' ? (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500" title="停止" disabled={busy[s.id]} onClick={() => action(s.id, 'stop')}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-500" title="启动" disabled={busy[s.id]} onClick={() => action(s.id, 'start')}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
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
        title="Sing-Box 实例"
        description="内置 Sing-Box 容器编排：可视化配置、热重载、与代理池自动联动。CPU/内存精度 0.001。"
        icon={<Server className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              新建实例
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
        searchPlaceholder="搜索实例名称…"
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        filters={[{ key: 'status', label: '状态', options: [
          { value: 'running', label: '运行中' },
          { value: 'stopped', label: '已停止' },
          { value: 'error', label: '异常' },
          { value: 'creating', label: '创建中' },
        ] }]}
        filterValues={{ status: statusFilter }}
        onFilterChange={(_, v) => { setStatusFilter(v); setPage(1) }}
        pagination={{ page, pageSize, total: data?.total || 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
        emptyTitle="暂无 Sing-Box 实例"
        emptyDescription="点击右上角「新建实例」创建您的第一个内置代理实例"
        emptyAction={{ label: '立即创建', onClick: () => setCreateOpen(true) }}
      />

      <CreateSingboxDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <LogsDialog instance={logsInstance} onClose={() => setLogsInstance(null)} />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="销毁该 Sing-Box 实例？"
        description="若仍有活跃浏览器工作区在使用此实例，操作将被拒绝。容器将被销毁，数据库记录软删除。"
        confirmText="确认销毁"
        destructive
        confirmTextMatch="销毁"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

interface SingboxForm {
  name: string
  description: string
  cpuLimit: number
  memoryLimit: number
  maxSessions: number
  hostNodeId: string
  outboundType: string
  outboundServer: string
  outboundPort: number
  outboundPassword: string
  outboundUuid: string
  transport: string
  dnsServer: string
  routeMode: string
}

function CreateSingboxDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  const [form, setForm] = React.useState<SingboxForm>({
    name: '', description: '', cpuLimit: 1.0, memoryLimit: 512.0, maxSessions: 64,
    hostNodeId: '', outboundType: 'vless', outboundServer: '', outboundPort: 443,
    outboundPassword: '', outboundUuid: '', transport: 'tcp', dnsServer: 'https://1.1.1.1/dns-query', routeMode: 'global',
  })
  const [loading, setLoading] = React.useState(false)
  const { data: hostData } = usePlatformFetch<ListResp<HostNode>>('/api/platform/host-nodes?pageSize=100')

  // preview config (server-side generates the real one — this is a client-side mirror for UX)
  const previewConfig = React.useMemo(() => ({
    log: { level: 'info' },
    dns: {
      servers: [{ tag: 'cloudflare', address: form.dnsServer || 'https://1.1.1.1/dns-query' }],
      final: 'cloudflare',
    },
    inbounds: [{
      type: 'socks', tag: 'socks-in', listen: '0.0.0.0', listen_port: 1080,
    }],
    outbounds: [
      {
        type: form.outboundType, tag: 'proxy',
        server: form.outboundServer, server_port: form.outboundPort,
        ...(form.outboundType === 'vless' ? { uuid: form.outboundUuid || '<uuid>' } : {}),
        ...(form.outboundType === 'trojan' || form.outboundType === 'ss' ? { password: form.outboundPassword || '<password>' } : {}),
        ...(form.transport !== 'tcp' ? {
          transport: { type: form.transport, ...(form.transport === 'ws' ? { path: '/ws' } : {}) },
        } : {}),
        tls: { enabled: true, server_name: form.outboundServer || '' },
      },
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
    ],
    route: {
      rules: form.routeMode === 'global' ? [{ outbound: 'proxy' }] : [
        { domain_suffix: ['.cn'], outbound: 'direct' },
        { outbound: 'proxy' },
      ],
      final: 'proxy',
    },
  }), [form])

  function set<K extends keyof SingboxForm>(k: K, v: SingboxForm[K]) {
    setForm((s) => ({ ...s, [k]: v }))
  }

  async function submit() {
    if (!form.name.trim()) return toast.error('请输入实例名称')
    if (!form.outboundServer.trim()) return toast.error('请填写出站服务器')
    setLoading(true)
    try {
      await pfFetch('/api/platform/singbox-instances', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      toast.success('Sing-Box 实例创建成功')
      setForm((s) => ({ ...s, name: '', description: '', outboundServer: '' }))
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建 Sing-Box 实例</DialogTitle>
          <DialogDescription>表单参数在后端内存组装为完整 JSON 配置，不落地磁盘，通过容器环境变量传入</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="basic">基础</TabsTrigger>
            <TabsTrigger value="outbound">出站</TabsTrigger>
            <TabsTrigger value="preview">配置预览</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>实例名称</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={loading} /></div>
              <div className="space-y-1.5"><Label>宿主机</Label>
                <Select value={form.hostNodeId} onValueChange={(v) => set('hostNodeId', v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="自动选择" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">自动选择</SelectItem>
                    {(hostData?.items || []).map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>CPU 上限 (核)</Label><NumberInput value={form.cpuLimit} onValueChange={(v) => set('cpuLimit', v ?? 1)} min={0.001} max={64} precision={3} unit="核" /></div>
              <div className="space-y-1.5"><Label>内存上限 (MB)</Label><NumberInput value={form.memoryLimit} onValueChange={(v) => set('memoryLimit', v ?? 512)} min={0.001} max={65536} precision={3} unit="MB" /></div>
              <div className="space-y-1.5"><Label>最大会话数</Label><NumberInput value={form.maxSessions} onValueChange={(v) => set('maxSessions', v ?? 64)} min={1} max={4096} step={1} unit="会话" /></div>
              <div className="space-y-1.5"><Label>路由模式</Label>
                <Select value={form.routeMode} onValueChange={(v) => set('routeMode', v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">全局代理</SelectItem>
                    <SelectItem value="gfwlist">国内直连 / 国外代理</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>备注</Label><Input value={form.description} onChange={(e) => set('description', e.target.value)} disabled={loading} /></div>
            </div>
          </TabsContent>

          <TabsContent value="outbound" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>出站协议</Label>
                <Select value={form.outboundType} onValueChange={(v) => set('outboundType', v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vless">VLESS</SelectItem>
                    <SelectItem value="vmess">VMess</SelectItem>
                    <SelectItem value="trojan">Trojan</SelectItem>
                    <SelectItem value="socks">SOCKS</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="direct">直连</SelectItem>
                    <SelectItem value="block">阻断</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>传输层</Label>
                <Select value={form.transport} onValueChange={(v) => set('transport', v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="ws">WebSocket</SelectItem>
                    <SelectItem value="grpc">gRPC</SelectItem>
                    <SelectItem value="httpupgrade">HTTP Upgrade</SelectItem>
                    <SelectItem value="quic">QUIC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>服务器地址</Label><Input value={form.outboundServer} onChange={(e) => set('outboundServer', e.target.value)} placeholder="example.com" disabled={loading} /></div>
              <div className="space-y-1.5"><Label>端口</Label><NumberInput value={form.outboundPort} onValueChange={(v) => set('outboundPort', v ?? 443)} min={1} max={65535} step={1} /></div>
              {(form.outboundType === 'vless' || form.outboundType === 'vmess') && (
                <div className="space-y-1.5"><Label>UUID</Label><Input value={form.outboundUuid} onChange={(e) => set('outboundUuid', e.target.value)} disabled={loading} /></div>
              )}
              {(form.outboundType === 'trojan' || form.outboundType === 'ss') && (
                <div className="space-y-1.5"><Label>密码</Label><Input value={form.outboundPassword} onChange={(e) => set('outboundPassword', e.target.value)} type="password" disabled={loading} /></div>
              )}
              <div className="col-span-2 space-y-1.5"><Label>DNS 服务器</Label><Input value={form.dnsServer} onChange={(e) => set('dnsServer', e.target.value)} disabled={loading} /></div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-3">
            <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/30">
              <div className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1.5 border-b border-border/60 bg-muted/40 text-muted-foreground flex items-center justify-between">
                <span>组装后 JSON 配置预览（仅用于参考，最终以后端组装为准）</span>
                <Badge variant="outline" className="text-[9px]">{previewConfig.outbounds.length} outbound(s)</Badge>
              </div>
              <SyntaxHighlighter
                language="json"
                style={isDark ? vscDarkPlus : oneLight}
                customStyle={{ margin: 0, background: 'transparent', padding: '0.75rem', fontSize: '11px' }}
                wrapLongLines
              >
                {JSON.stringify(previewConfig, null, 2)}
              </SyntaxHighlighter>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            创建实例
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LogsDialog({ instance, onClose }: { instance: SingboxInstance | null; onClose: () => void }) {
  const { data, loading, error, reload } = usePlatformFetch<{ logs: string }>(
    instance ? `/api/platform/singbox-instances/${instance.id}/logs?tail=200` : null,
  )
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  return (
    <Dialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            实例日志 — {instance?.name}
          </DialogTitle>
          <DialogDescription>从 Docker API 拉取最近 200 行容器日志</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border/60 overflow-hidden bg-muted/30 max-h-[55vh] overflow-y-auto scrollbar-thin">
          <SyntaxHighlighter
            language="log"
            style={isDark ? vscDarkPlus : oneLight}
            customStyle={{ margin: 0, background: 'transparent', padding: '0.75rem', fontSize: '11px' }}
            wrapLongLines
          >
            {loading ? '加载中…' : error ? `日志加载失败: ${error.message}` : (data?.logs || '（空）')}
          </SyntaxHighlighter>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新日志
          </Button>
          <Button size="sm" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
