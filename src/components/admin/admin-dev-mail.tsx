'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Mail, Search, RefreshCw, Loader2, Clock, Copy } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

interface Mail {
  id: string; email: string; code: string; purpose: string; expiresAt: string; consumed: boolean; attempts: number; createdAt: string
}

const PURPOSE_LABEL: Record<string, string> = {
  login: '登录', register: '注册', 'forgot-password': '找回密码', 'change-email': '更换邮箱',
}

export function AdminDevMail() {
  const [mails, setMails] = React.useState<Mail[]>([])
  const [loading, setLoading] = React.useState(true)
  const [q, setQ] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await jsonFetch(`/api/dev-mail${q ? `?email=${encodeURIComponent(q)}` : ''}`)
      setMails(d.mails || [])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q])

  React.useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-primary" />验证码邮箱（开发用）</CardTitle>
            <CardDescription>当前环境未配置真实 SMTP，验证码在此展示便于测试。生产环境请接入邮件服务。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="按邮箱搜索" className="h-8 w-44 pl-8 text-xs" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div>
        ) : mails.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Mail className="h-10 w-10 mx-auto mb-2 opacity-40" />暂无邮件
          </div>
        ) : (
          <div className="space-y-2 max-h-[36rem] overflow-y-auto scrollbar-thin pr-1">
            {mails.map((m) => (
              <div key={m.id} className="rounded-lg border border-border/60 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="secondary" className="text-[10px]">{PURPOSE_LABEL[m.purpose] || m.purpose}</Badge>
                    {m.consumed ? <Badge variant="outline" className="text-[9px] text-muted-foreground">已使用</Badge> : <Badge variant="default" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">有效</Badge>}
                    {m.attempts > 0 && <Badge variant="destructive" className="text-[9px]">尝试 {m.attempts} 次</Badge>}
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" />{new Date(m.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                <code className="font-mono text-lg font-bold tracking-widest text-primary bg-primary/10 px-3 py-1 rounded">{m.code}</code>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => { navigator.clipboard.writeText(m.code); toast.success('已复制验证码') }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
