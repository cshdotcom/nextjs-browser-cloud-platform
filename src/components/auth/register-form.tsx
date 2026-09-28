'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, Mail, User } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

export function RegisterForm({ onActivate }: { onActivate: (email?: string) => void }) {
  const [email, setEmail] = React.useState('')
  const [name, setName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('请填写邮箱与密码')
      return
    }
    setLoading(true)
    try {
      const data = await jsonFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      })
      if (data.stage === 'activation_required') {
        toast.success('注册成功，请激活账号')
        onActivate(email)
      } else if (data.stage === 'success') {
        toast.success('注册成功，请登录')
        onActivate(undefined)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="r-name">姓名（可选）</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="r-name"
            placeholder="您的姓名"
            className="pl-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="r-email">邮箱</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="r-email"
            type="email"
            placeholder="you@example.com"
            className="pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="r-password">密码</Label>
        <div className="relative">
          <Input
            id="r-password"
            type={show ? 'text' : 'password'}
            placeholder="至少 8 位，含大小写/数字/符号"
            className="pr-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">密码复杂度由管理员统一配置，禁止使用弱密码。</p>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        创建账号
      </Button>
    </form>
  )
}
