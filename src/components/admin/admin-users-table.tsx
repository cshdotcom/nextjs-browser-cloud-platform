'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Search, RefreshCw, Loader2, KeyRound, ShieldCheck, Smartphone, Power, AlertTriangle, Trash2, Clock, UserCog, CheckSquare, X, ScrollText } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { UserTimelineSheet } from './user-timeline-sheet'

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  status: string
  emailVerified: boolean
  twoFactorEnabled: boolean
  groupId: string | null
  groupName: string | null
  groupEnforceTwoFactor: boolean
  failedLoginAttempts: number
  lockedUntil: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
}

export function AdminUsersTable() {
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [twoFactorFilter, setTwoFactorFilter] = React.useState('all')
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [detailUser, setDetailUser] = React.useState<AdminUser | null>(null)
  const [backupCodes, setBackupCodes] = React.useState<{ user: AdminUser; codes: string[] } | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = React.useState(false)
  const [timelineUser, setTimelineUser] = React.useState<{ id: string; email: string } | null>(null)

  const pageSize = 20

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (q) params.set('q', q)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (twoFactorFilter !== 'all') params.set('twoFactor', twoFactorFilter)
      const d = await jsonFetch(`/api/admin/users?${params}`)
      setUsers(d.users || [])
      setTotal(d.total || 0)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, q, statusFilter, twoFactorFilter])

  React.useEffect(() => { load() }, [load])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === users.length) return new Set()
      return new Set(users.map((u) => u.id))
    })
  }

  async function batchAct(action: 'forcePasswordChange' | 'disable' | 'enable' | 'forceLogout' | 'clearLockout') {
    if (selectedIds.size === 0) return toast.error('请先选择用户')
    setBatchLoading(true)
    try {
      const d = await jsonFetch('/api/admin/users/batch', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      })
      toast.success(`批量操作完成，影响 ${d.affected} 个用户`)
      setSelectedIds(new Set())
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '批量操作失败')
    } finally {
      setBatchLoading(false)
    }
  }

  async function act(userId: string, action: string, body?: Record<string, unknown>) {
    setActionLoading(`${userId}:${action}`)
    try {
      if (action === 'patch') {
        await jsonFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else if (action === '2fa-reset') {
        await jsonFetch(`/api/admin/users/${userId}/2fa-reset`, { method: 'POST' })
      } else if (action === 'force-2fa') {
        await jsonFetch(`/api/admin/users/${userId}/force-2fa`, { method: 'POST', body: JSON.stringify(body) })
      } else if (action === 'trusted-devices-clear') {
        await jsonFetch(`/api/admin/users/${userId}/trusted-devices-clear`, { method: 'POST' })
      } else if (action === 'backup-codes-reset') {
        const d = await jsonFetch(`/api/admin/users/${userId}/backup-codes-reset`, { method: 'POST' })
        const user = users.find((u) => u.id === userId)!
        setBackupCodes({ user, codes: d.backupCodes })
      } else if (action === 'sessions-kill') {
        await jsonFetch(`/api/admin/users/${userId}/sessions`, { method: 'DELETE' })
      }
      toast.success('操作成功')
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">用户列表 <Badge variant="secondary" className="text-[10px] ml-1">{total}</Badge></CardTitle>
              <CardDescription>管理用户状态、2FA、会话与安全策略</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="搜索邮箱/姓名" className="h-8 w-44 pl-8 text-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="suspended">暂停</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
              <Select value={twoFactorFilter} onValueChange={(v) => { setTwoFactorFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部 2FA</SelectItem>
                  <SelectItem value="on">已开启</SelectItem>
                  <SelectItem value="off">未开启</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />)}</div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">暂无用户</div>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5 flex-wrap">
                  <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-medium">已选择 {selectedIds.size} 个用户</span>
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchAct('forcePasswordChange')} disabled={batchLoading}>
                      <KeyRound className="h-3 w-3 mr-1" />批量强制改密
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchAct('forceLogout')} disabled={batchLoading}>
                      <Power className="h-3 w-3 mr-1" />批量强制下线
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600 hover:text-amber-600" onClick={() => batchAct('disable')} disabled={batchLoading}>
                      <AlertTriangle className="h-3 w-3 mr-1" />批量禁用
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 hover:text-emerald-600" onClick={() => batchAct('enable')} disabled={batchLoading}>
                      <ShieldCheck className="h-3 w-3 mr-1" />批量启用
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchAct('clearLockout')} disabled={batchLoading}>
                      <Clock className="h-3 w-3 mr-1" />批量解锁
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedIds(new Set())} disabled={batchLoading}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={users.length > 0 && selectedIds.size === users.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>最近登录</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} data-selected={selectedIds.has(u.id)} className={selectedIds.has(u.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(u.id)}
                          onCheckedChange={() => toggleSelect(u.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{u.name || u.email}</span>
                          <span className="text-[11px] text-muted-foreground">{u.email}</span>
                          {!u.emailVerified && <Badge variant="outline" className="text-[9px] w-fit mt-0.5 text-amber-500">未验证</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'superadmin' ? 'default' : u.role === 'admin' ? 'secondary' : 'outline'} className="text-[10px]">
                          {u.role === 'superadmin' ? '超级管理员' : u.role === 'admin' ? '管理员' : '用户'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                          <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />已锁定</Badge>
                        ) : u.status === 'active' ? (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">正常</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">{u.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.twoFactorEnabled ? (
                          <Badge variant="secondary" className="text-[10px] gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-2.5 w-2.5" />已开启</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">未开启</Badge>
                        )}
                        {u.groupEnforceTwoFactor && <div className="text-[10px] text-muted-foreground mt-0.5">组强制</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-[11px] text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('zh-CN') : '从未'}
                          {u.lastLoginIp && <div>{u.lastLoginIp}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!!actionLoading}>
                              {actionLoading?.startsWith(u.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">安全操作</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setDetailUser(u)}>
                              <UserCog className="h-3.5 w-3.5 mr-2" /> 查看详情
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTimelineUser({ id: u.id, email: u.email })}>
                              <ScrollText className="h-3.5 w-3.5 mr-2" /> 查看安全时间线
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => act(u.id, '2fa-reset')} className="text-destructive focus:text-destructive">
                              <Power className="h-3.5 w-3.5 mr-2" /> 重置 2FA（清密钥/备份码/设备）
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => act(u.id, 'backup-codes-reset')}>
                              <KeyRound className="h-3.5 w-3.5 mr-2" /> 重新生成备份码
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => act(u.id, 'trusted-devices-clear')}>
                              <Smartphone className="h-3.5 w-3.5 mr-2" /> 清空受信任设备
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => act(u.id, 'force-2fa', { enabled: !u.twoFactorEnabled })}>
                              <ShieldCheck className="h-3.5 w-3.5 mr-2" /> {u.twoFactorEnabled ? '取消强制 2FA' : '强制启用 2FA'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => act(u.id, 'sessions-kill')} className="text-destructive focus:text-destructive">
                              <Power className="h-3.5 w-3.5 mr-2" /> 强制全部设备下线
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => act(u.id, 'patch', { status: u.status === 'active' ? 'disabled' : 'active' })} className={u.status === 'active' ? 'text-destructive focus:text-destructive' : ''}>
                              <Power className="h-3.5 w-3.5 mr-2" /> {u.status === 'active' ? '禁用账号' : '启用账号'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => act(u.id, 'patch', { clearLockout: true })}>
                              <Clock className="h-3.5 w-3.5 mr-2" /> 解除锁定
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => act(u.id, 'patch', { forcePasswordChange: true })} className="text-amber-600 focus:text-amber-600 dark:text-amber-400">
                              <KeyRound className="h-3.5 w-3.5 mr-2" /> 强制下次登录改密
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
          {total > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">第 {page} / {Math.ceil(total / pageSize)} 页</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / pageSize) || loading} onClick={() => setPage((p) => p + 1)}>下一页</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} onAction={act} />

      <Dialog open={!!backupCodes} onOpenChange={(o) => { if (!o) setBackupCodes(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {backupCodes?.user.email} 的新备份码
            </DialogTitle>
            <DialogDescription>请将这些一次性备份码安全地交付给该用户，关闭后无法再次查看</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
            {backupCodes?.codes.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-medium tracking-wider">{c}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={() => { if (backupCodes) { navigator.clipboard.writeText(backupCodes.codes.join('\n')); toast.success('已复制') } }}>
            复制全部
          </Button>
        </DialogContent>
      </Dialog>

      <UserTimelineSheet
        userId={timelineUser?.id ?? null}
        userEmail={timelineUser?.email ?? null}
        open={!!timelineUser}
        onOpenChange={(o) => { if (!o) setTimelineUser(null) }}
      />
    </div>
  )
}

function UserDetailDialog({ user, onClose, onAction }: { user: AdminUser | null; onClose: () => void; onAction: (id: string, action: string, body?: Record<string, unknown>) => void }) {
  const [sessions, setSessions] = React.useState<unknown[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    setLoading(true)
    setSessions([])
    jsonFetch(`/api/admin/users/${user.id}/sessions`).then((d) => setSessions(d.sessions || [])).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  if (!user) return null

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            {user.name || user.email}
          </DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="角色" value={user.role} />
            <Info label="状态" value={user.status} />
            <Info label="2FA" value={user.twoFactorEnabled ? '已开启' : '未开启'} />
            <Info label="邮箱验证" value={user.emailVerified ? '已验证' : '未验证'} />
            <Info label="登录失败次数" value={String(user.failedLoginAttempts)} />
            <Info label="用户组" value={user.groupName || '无'} />
            <Info label="注册时间" value={new Date(user.createdAt).toLocaleString('zh-CN')} />
            <Info label="最近登录" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '从未'} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">活跃会话 ({sessions.length})</span>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => onAction(user.id, 'sessions-kill')}>强制全部下线</Button>
            </div>
            {loading ? <div className="h-12 bg-muted/40 animate-pulse rounded" /> : sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">无活跃会话</div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                {(sessions as Array<{ id: string; ipAddress: string; lastActiveAt: string; deviceLabel?: string }>).map((s) => (
                  <div key={s.id} className="text-[11px] border border-border/60 rounded px-2 py-1.5 flex justify-between">
                    <span>{s.deviceLabel || s.ipAddress}</span>
                    <span className="text-muted-foreground">{new Date(s.lastActiveAt).toLocaleString('zh-CN')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  )
}
