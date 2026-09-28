'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/shared/page-header'
import { KeyRound, Plus, Copy, Check, Trash2, Loader2, RefreshCw, Clock, AlertCircle } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface Token {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export function ApiTokensView() {
  const [tokens, setTokens] = React.useState<Token[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [revokeId, setRevokeId] = React.useState<string | null>(null)
  const [newToken, setNewToken] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch('/api/account/api-tokens')
      setTokens(d.tokens || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    setRevokeId(id)
    try {
      await jsonFetch(`/api/account/api-tokens/${id}`, { method: 'DELETE' })
      toast.success('Token 已撤销')
      load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '撤销失败')
    } finally {
      setRevokeId(null)
    }
  }

  function copyToken() {
    if (!newToken) return
    navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <PageHeader
        title="API Token"
        description="用于 MCP / OpenAPI / 外部调用。Token 调用不走账号密码登录流程，不受 2FA 限制。"
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建 Token
          </Button>
        }
      />

      <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            API Token 用于程序化调用，<b>不受 2FA 限制</b>。请妥善保管，明文仅在创建时显示一次。当管理员重置您的密码或重置 2FA 时不会自动删除 Token（除非开启「账号安全变更自动作废 Token」策略）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            我的 API Tokens <Badge variant="secondary" className="text-[10px]">{tokens.length}</Badge>
          </CardTitle>
          <CardDescription>当前有效的 API 调用凭据</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <KeyRound className="h-10 w-10 mx-auto mb-2 opacity-40" />
              暂无 API Token
              <p className="text-[11px] mt-1">点击右上角「新建 Token」创建</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="font-mono text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">zai_{t.prefix}…</code>
                    <span className="font-medium text-sm flex-1 truncate">{t.name}</span>
                    {t.scopes?.length > 0 && t.scopes.map((sc) => (
                      <Badge key={sc} variant="outline" className="text-[9px]">{sc}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />创建于 {new Date(t.createdAt).toLocaleString('zh-CN')}</span>
                    {t.lastUsedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />最近使用 {new Date(t.lastUsedAt).toLocaleString('zh-CN')}</span>}
                    {t.expiresAt && <span className="flex items-center gap-1 text-amber-500"><Clock className="h-3 w-3" />{new Date(t.expiresAt).toLocaleString('zh-CN')} 过期</span>}
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7" onClick={() => revoke(t.id)} disabled={revokeId === t.id}>
                      {revokeId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                      撤销
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewToken(null) }}
        onCreated={(token) => { setNewToken(token); load() }}
      />

      <AlertDialog open={!!revokeId && !newToken} onOpenChange={(o) => { if (!o) setRevokeId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销该 API Token？</AlertDialogTitle>
            <AlertDialogDescription>撤销后使用该 Token 的所有调用将立即失败，且不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => revokeId && revoke(revokeId)}>
              确认撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Display new token dialog */}
      <Dialog open={!!newToken} onOpenChange={(o) => { if (!o) setNewToken(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Check className="h-5 w-5" />
              Token 创建成功
            </DialogTitle>
            <DialogDescription>请立即复制保存，关闭后将永远无法再次查看明文。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <code className="font-mono text-xs break-all">{newToken}</code>
            </div>
            <Button className="w-full" onClick={copyToken}>
              {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {copied ? '已复制' : '复制 Token'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)} className="w-full">我已保存，关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateTokenDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (token: string) => void }) {
  const [name, setName] = React.useState('')
  const [scopes, setScopes] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!name) return toast.error('请输入 Token 名称')
    setLoading(true)
    try {
      const d = await jsonFetch('/api/account/api-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name,
          scopes: scopes ? scopes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        }),
      })
      onCreated(d.token)
      setName(''); setScopes('')
      onOpenChange(false)
      toast.success('Token 已创建')
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
          <DialogTitle>新建 API Token</DialogTitle>
          <DialogDescription>为程序化调用创建专用凭据</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tok-name">名称</Label>
            <Input id="tok-name" placeholder="例如：CI/CD 部署" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tok-scopes">权限范围（可选，逗号分隔）</Label>
            <Input id="tok-scopes" placeholder="read,write" value={scopes} onChange={(e) => setScopes(e.target.value)} disabled={loading} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading || !name}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
