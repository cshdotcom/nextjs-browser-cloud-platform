'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Users as UsersIcon, Search, RefreshCw, Loader2, Plus, MoreHorizontal, Power, KeyRound, UserCog, Upload, Download,
} from 'lucide-react'
import { pfFetch, usePlatformFetch, type ListResp } from '@/lib/platform-client'
import { toast } from 'sonner'
import { EmptyState, LoadingState, ErrorState } from './shared/empty-state'
import { UserDetailSheet } from './user-detail-sheet'
import { ImportUsersDialog } from './import-users-dialog'

interface PlatformUser {
  id: string
  username: string
  email: string
  displayName: string | null
  role: string
  status: string
  mustChangePassword: boolean
  twoFactorEnabled: boolean
  groupId: string | null
  groupName: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'bg-primary/10 text-primary',
  admin: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  user: 'bg-muted text-muted-foreground',
}

export function UsersView() {
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(20)
  const [q, setQ] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [detailUserId, setDetailUserId] = React.useState<string | null>(null)

  const listUrl = React.useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (q) p.set('q', q)
    if (roleFilter !== 'all') p.set('role', roleFilter)
    if (statusFilter !== 'all') p.set('status', statusFilter)
    return `/api/platform/users?${p.toString()}`
  }, [page, pageSize, q, roleFilter, statusFilter])

  const { data, loading, error, reload } = usePlatformFetch<ListResp<PlatformUser>>(listUrl)

  async function handleAction(id: string, action: string, body?: Record<string, unknown>) {
    setActionLoading(`${id}:${action}`)
    try {
      await pfFetch(`/api/platform/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      toast.success('操作成功')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  function exportCsv() {
    const a = document.createElement('a')
    a.href = '/api/platform/users/export'
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('正在导出 CSV')
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-primary" />
          用户管理
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">管理平台用户、角色权限、账号状态。支持搜索、筛选、批量操作、CSV 导入导出。</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="搜索用户名/邮箱/显示名" className="h-8 w-52 pl-8 text-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
              </div>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  <SelectItem value="superadmin">超级管理员</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="suspended">暂停</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />导出</Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5 mr-1" />导入</Button>
              <Button size="sm" variant="outline" onClick={reload} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />新建用户</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (!data || data.items.length === 0) ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={<UsersIcon className="h-8 w-8" />} title="暂无用户" description="点击右上角「新建用户」创建" />
          ) : (
            <>
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>2FA</TableHead>
                      <TableHead>所属组</TableHead>
                      <TableHead>最近登录</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((u) => (
                      <TableRow key={u.id} className="cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDetailUserId(u.id)}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm text-primary">{u.displayName || u.username}</span>
                            <span className="text-[11px] text-muted-foreground">{u.email}</span>
                            {u.mustChangePassword && <Badge variant="outline" className="text-[9px] w-fit mt-0.5 text-amber-500">需改密</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] ${ROLE_BADGE[u.role] || ''}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.status === 'active' ? (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">正常</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">{u.status === 'suspended' ? '暂停' : '禁用'}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.twoFactorEnabled ? (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">已开启</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">未开启</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.groupName || '—'}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN') : '从未'}
                          {u.lastLoginIp && <div>{u.lastLoginIp}</div>}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!!actionLoading?.startsWith(u.id)}>
                                {actionLoading?.startsWith(u.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handleAction(u.id, 'toggle-status', { status: u.status === 'active' ? 'disabled' : 'active' })}>
                                <Power className="h-3.5 w-3.5 mr-2" /> {u.status === 'active' ? '禁用账号' : '启用账号'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAction(u.id, 'force-password', { mustChangePassword: true })}>
                                <KeyRound className="h-3.5 w-3.5 mr-2" /> 强制下次登录改密
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleAction(u.id, 'delete', {})}>
                                <UserCog className="h-3.5 w-3.5 mr-2" /> 删除用户
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {data.total > pageSize && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">共 {data.total} 条 · 第 {page}/{Math.ceil(data.total / pageSize)} 页</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                    <Button size="sm" variant="outline" disabled={page >= Math.ceil(data.total / pageSize) || loading} onClick={() => setPage((p) => p + 1)}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={reload} />
      <UserDetailSheet userId={detailUserId} open={!!detailUserId} onOpenChange={(o) => { if (!o) setDetailUserId(null) }} onChanged={reload} />
      <ImportUsersDialog open={importOpen} onOpenChange={setImportOpen} onImported={reload} />
    </div>
  )
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [username, setUsername] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState('user')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!username || !email || !password) return toast.error('请填写完整信息')
    setLoading(true)
    try {
      await pfFetch('/api/platform/users', {
        method: 'POST',
        body: JSON.stringify({ username, email, displayName: displayName || undefined, password, role, groupIds: [] }),
      })
      toast.success('用户创建成功')
      setUsername(''); setEmail(''); setDisplayName(''); setPassword(''); setRole('user')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>创建平台用户账号，密码使用 bcrypt 哈希存储</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">用户名</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-64 字符" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">邮箱</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">显示名（可选）</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="将在审计日志中展示" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">初始密码</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">角色</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">普通用户</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="superadmin">超级管理员</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading || !username || !email || !password}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
