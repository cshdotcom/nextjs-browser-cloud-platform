'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Users, Plus, Loader2 } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface Group {
  id: string; name: string; description: string | null
  enforceTwoFactor: boolean; inheritGlobalTwoFactor: boolean; userCount: number; createdAt: string
}

export function AdminUserGroups() {
  const [groups, setGroups] = React.useState<Group[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch('/api/user-groups')
      setGroups(d.groups || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />用户组 <Badge variant="secondary" className="text-[10px]">{groups.length}</Badge></CardTitle>
            <CardDescription>用户组级别 2FA 强制策略（与全局策略独立配置）</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />新建用户组
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />暂无用户组
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">{g.name}</div>
                    <div className="text-[11px] text-muted-foreground">{g.description || '无描述'}</div>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{g.userCount} 人</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {g.enforceTwoFactor && <Badge variant="default" className="text-[9px] gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">组强制 2FA</Badge>}
                  {g.inheritGlobalTwoFactor && <Badge variant="outline" className="text-[9px]">继承全局</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </Card>
  )
}

function CreateGroupDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [enforce, setEnforce] = React.useState(false)
  const [inherit, setInherit] = React.useState(true)
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!name) return toast.error('请输入名称')
    setLoading(true)
    try {
      await jsonFetch('/api/user-groups', {
        method: 'POST',
        body: JSON.stringify({ name, description, enforceTwoFactor: enforce, inheritGlobalTwoFactor: inherit }),
      })
      toast.success('用户组已创建')
      onCreated()
      onOpenChange(false)
      setName(''); setDescription(''); setEnforce(false); setInherit(true)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建用户组</DialogTitle>
          <DialogDescription>用户组可单独开启 2FA 强制策略</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>组名</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} placeholder="例如：核心开发组" />
          </div>
          <div className="space-y-1.5">
            <Label>描述</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">强制开启 2FA</div>
              <div className="text-[11px] text-muted-foreground">组内用户登录后必须完成 2FA</div>
            </div>
            <Switch checked={enforce} onCheckedChange={setEnforce} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">继承全局策略</div>
              <div className="text-[11px] text-muted-foreground">同时受全局强制 2FA 影响</div>
            </div>
            <Switch checked={inherit} onCheckedChange={setInherit} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading || !name}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
