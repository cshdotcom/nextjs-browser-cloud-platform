'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2, Mail, Send, Timer, ArrowRight } from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

export function ChangeEmailForm({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth()
  const [newEmail, setNewEmail] = React.useState('')
  const [oldCode, setOldCode] = React.useState('')
  const [newCode, setNewCode] = React.useState('')
  const [stage, setStage] = React.useState<'init' | 'verify'>('init')
  const [loading, setLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)

  React.useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function initiate() {
    if (!newEmail) return toast.error('请输入新邮箱')
    if (newEmail === user?.email) return toast.error('新邮箱不能与当前邮箱相同')
    setSending(true)
    try {
      await jsonFetch('/api/account/email/initiate', {
        method: 'POST',
        body: JSON.stringify({ newEmail }),
      })
      setStage('verify')
      setCountdown(60)
      toast.success('验证码已发送至旧邮箱与新邮箱')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '发起失败')
    } finally {
      setSending(false)
    }
  }

  async function confirm() {
    if (oldCode.length !== 6 || newCode.length !== 6) return toast.error('请输入两个验证码')
    setLoading(true)
    try {
      await jsonFetch('/api/account/email/confirm', {
        method: 'POST',
        body: JSON.stringify({ oldCode, newCode }),
      })
      toast.success('邮箱更换成功')
      onChanged()
      setStage('init'); setNewEmail(''); setOldCode(''); setNewCode('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '验证失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">当前邮箱：</span>
        <span className="font-medium">{user?.email}</span>
      </div>

      {stage === 'init' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="ce-new">新邮箱</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="ce-new" type="email" placeholder="new@example.com" className="pl-9" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={sending} />
            </div>
          </div>
          <Button onClick={initiate} disabled={sending || !newEmail}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            发送双验证码
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-400">
            我们已分别向<b>旧邮箱</b>与<b>新邮箱</b>发送了验证码，请同时输入两个验证码以完成更换。
          </div>
          <div className="space-y-2">
            <Label>旧邮箱验证码（{user?.email}）</Label>
            <InputOTP maxLength={6} value={oldCode} onChange={setOldCode} containerClassName="justify-start">
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="space-y-2">
            <Label>新邮箱验证码（{newEmail}）</Label>
            <InputOTP maxLength={6} value={newCode} onChange={setNewCode} containerClassName="justify-start">
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={loading || oldCode.length !== 6 || newCode.length !== 6}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
              确认更换
            </Button>
            <Button variant="ghost" onClick={() => setStage('init')} disabled={loading}>
              返回
            </Button>
            <Button variant="outline" size="sm" className="ml-auto" onClick={initiate} disabled={sending || countdown > 0}>
              {countdown > 0 ? <Timer className="h-3.5 w-3.5 mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              {countdown > 0 ? `${countdown}s` : '重发'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
