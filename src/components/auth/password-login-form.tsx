'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, EyeOff, KeyRound, Loader2, Mail, ShieldAlert } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'
import { CaptchaWidget } from './captcha-widget'

export function PasswordLoginForm({ onForgot, captchaEnabled }: { onForgot: () => void; captchaEnabled: boolean }) {
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [remember, setRemember] = React.useState(false)
  const [show, setShow] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [captchaToken, setCaptchaToken] = React.useState('')
  const [captchaAnswer, setCaptchaAnswer] = React.useState('')

  const { setPending2fa, setPendingPasswordChange, fetchMe } = useAuth()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!identifier || !password) {
      toast.error('请输入账号和密码')
      return
    }
    if (captchaEnabled && captchaAnswer.length !== 5) {
      toast.error('请输入图形验证码')
      return
    }
    setLoading(true)
    try {
      const data = await jsonFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, remember, captchaToken, captchaAnswer }),
      })
      if (data.stage === 'twofa_required') {
        setPending2fa({ email: data.email, forceTwoFactor: data.forceTwoFactor })
        toast.info('请完成双因素验证')
      } else if (data.stage === 'password_change_required') {
        setPendingPasswordChange({ email: data.email, reason: data.reason })
        toast.warning('密码已过期或被管理员要求修改，请先设置新密码')
      } else if (data.stage === 'success') {
        if (data.passwordExpiringSoon) {
          toast.warning(`您的密码将在 ${data.daysUntilExpiry} 天后过期，请尽快修改`)
        }
        toast.success('登录成功')
        await fetchMe()
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string }
      if (e.status === 423) toast.error('账号已被临时锁定，请稍后再试')
      else if (e.status === 403) toast.error(e.message || '账号状态异常')
      else if (e.status === 429) toast.error('请求过于频繁，请稍后再试')
      else toast.error(e.message || '账号或密码错误')
      // refresh captcha on failure
      setCaptchaAnswer('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="pl-9"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">密码</Label>
          <button
            type="button"
            onClick={onForgot}
            className="text-xs text-primary hover:underline"
          >
            忘记密码？
          </button>
        </div>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="pl-9 pr-9"
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
      </div>

      {captchaEnabled && (
        <CaptchaWidget
          token={captchaToken}
          answer={captchaAnswer}
          onTokenChange={setCaptchaToken}
          onAnswerChange={setCaptchaAnswer}
          disabled={loading}
        />
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember"
          checked={remember}
          onCheckedChange={(v) => setRemember(!!v)}
        />
        <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
          记住我（延长会话有效期）
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        登录
      </Button>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
        <span>连续密码错误达到阈值将临时锁定账号；所有登录尝试均记录审计日志并触发风控检测。</span>
      </div>
    </form>
  )
}
