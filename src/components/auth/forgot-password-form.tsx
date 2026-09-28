'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Eye, EyeOff, Loader2, Mail, Send, Timer, KeyRound } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'
import { CaptchaWidget } from './captcha-widget'

export function ForgotPasswordForm({ onBack, captchaEnabled }: { onBack: () => void; captchaEnabled: boolean }) {
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)
  const [captchaToken, setCaptchaToken] = React.useState('')
  const [captchaAnswer, setCaptchaAnswer] = React.useState('')

  React.useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function sendCode() {
    if (!email) return toast.error('请输入邮箱')
    if (captchaEnabled && captchaAnswer.length !== 5) return toast.error('请先输入图形验证码')
    setSending(true)
    try {
      await jsonFetch('/api/auth/login-code', {
        method: 'POST',
        body: JSON.stringify({ email, purpose: 'forgot-password', captchaToken, captchaAnswer }),
      })
      setCountdown(60)
      toast.success('重置验证码已发送')
      setCaptchaAnswer('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '发送失败')
      setCaptchaAnswer('')
    } finally {
      setSending(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || code.length !== 6 || !newPassword) return toast.error('请填写完整信息')
    setLoading(true)
    try {
      await jsonFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword }),
      })
      toast.success('密码已重置，请使用新密码登录')
      onBack()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '重置失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fp-email">邮箱</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="fp-email"
            type="email"
            placeholder="you@example.com"
            className="pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {captchaEnabled && (
        <CaptchaWidget
          token={captchaToken}
          answer={captchaAnswer}
          onTokenChange={setCaptchaToken}
          onAnswerChange={setCaptchaAnswer}
          disabled={loading || sending}
        />
      )}

      <div className="space-y-2">
        <Label>验证码</Label>
        <div className="flex gap-2">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup className="flex-1 justify-between">
              <InputOTPSlot index={0} className="flex-1" />
              <InputOTPSlot index={1} className="flex-1" />
              <InputOTPSlot index={2} className="flex-1" />
              <InputOTPSlot index={3} className="flex-1" />
              <InputOTPSlot index={4} className="flex-1" />
              <InputOTPSlot index={5} className="flex-1" />
            </InputOTPGroup>
          </InputOTP>
          <Button type="button" variant="outline" onClick={sendCode} disabled={sending || countdown > 0} className="shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : countdown > 0 ? <Timer className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {countdown > 0 ? `${countdown}s` : '获取'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fp-new">新密码</Label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="fp-new"
            type={show ? 'text' : 'password'}
            placeholder="设置新密码"
            className="pl-9 pr-9"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        重置密码
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        返回登录
      </Button>
    </form>
  )
}
