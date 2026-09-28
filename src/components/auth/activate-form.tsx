'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { jsonFetch } from '@/lib/auth-client'
import { toast } from 'sonner'

export function ActivateForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || code.length !== 6) return toast.error('请填写邮箱与验证码')
    setLoading(true)
    try {
      await jsonFetch('/api/auth/activate', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      })
      toast.success('账号激活成功，请登录')
      onBack()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '激活失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="a-email">邮箱</Label>
        <Input id="a-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label>激活验证码</Label>
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup className="w-full justify-between">
            <InputOTPSlot index={0} className="flex-1" />
            <InputOTPSlot index={1} className="flex-1" />
            <InputOTPSlot index={2} className="flex-1" />
            <InputOTPSlot index={3} className="flex-1" />
            <InputOTPSlot index={4} className="flex-1" />
            <InputOTPSlot index={5} className="flex-1" />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        激活账号
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        返回登录
      </Button>
    </form>
  )
}
