'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/shared/page-header'
import {
  KeyRound, ShieldCheck, QrCode, Copy, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, Power, Smartphone, Lock,
} from 'lucide-react'
import { jsonFetch, useAuth } from '@/lib/auth-client'
import { toast } from 'sonner'

interface SetupData {
  secret: string
  qr: string
  uri: string
}

export function TwoFactorView() {
  const { user, fetchMe } = useAuth()
  const [setupOpen, setSetupOpen] = React.useState(false)
  const [disableOpen, setDisableOpen] = React.useState(false)
  const [backupRegenOpen, setBackupRegenOpen] = React.useState(false)

  const enabled = user?.twoFactorEnabled

  return (
    <div>
      <PageHeader
        title="双因素认证 (2FA)"
        description="基于 TOTP 的二次身份验证，保护您的账号免受密码泄露风险。"
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          enabled ? (
            <Badge variant="default" className="bg-emerald-500 text-white gap-1">
              <CheckCircle2 className="h-3 w-3" />
              已开启
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              未开启
            </Badge>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={enabled ? 'border-emerald-500/40' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {enabled ? '2FA 已启用' : '开启 2FA 保护'}
            </CardTitle>
            <CardDescription>
              {enabled
                ? '您的账号已绑定 TOTP 验证器。登录时需输入动态验证码或使用一次性备份码。'
                : '使用 Google Authenticator / Authy / 1Password 等扫码绑定，登录时需二次验证。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enabled ? (
              <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                <Power className="h-4 w-4 mr-1.5" />
                关闭 2FA
              </Button>
            ) : (
              <Button onClick={() => setSetupOpen(true)}>
                <KeyRound className="h-4 w-4 mr-1.5" />
                立即开启
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-primary" />
              备份恢复码
            </CardTitle>
            <CardDescription>
              {enabled
                ? '当您丢失验证器时，可使用 10 组一次性备份码登录。建议安全离线保存。'
                : '开启 2FA 后将生成 10 组备份恢复码，请妥善保存。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled={!enabled} onClick={() => setBackupRegenOpen(true)}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              重新生成备份码
            </Button>
          </CardContent>
        </Card>
      </div>

      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} onDone={fetchMe} />
      <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} onDone={fetchMe} />
      <BackupRegenDialog open={backupRegenOpen} onOpenChange={setBackupRegenOpen} />
    </div>
  )
}

function SetupDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [step, setStep] = React.useState<'loading' | 'qr' | 'verify' | 'done'>('loading')
  const [data, setData] = React.useState<SetupData | null>(null)
  const [code, setCode] = React.useState('')
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setStep('loading'); setCode(''); setBackupCodes(null); setData(null)
    ;(async () => {
      try {
        const d = await jsonFetch('/api/2fa/setup', { method: 'POST' })
        setData(d)
        setStep('qr')
      } catch (err: unknown) {
        const e = err as { message?: string }
        toast.error(e.message || '生成失败')
        onOpenChange(false)
      }
    })()
  }, [open, onOpenChange])

  async function verify() {
    if (code.length !== 6) return toast.error('请输入 6 位验证码')
    setLoading(true)
    try {
      const d = await jsonFetch('/api/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) })
      setBackupCodes(d.backupCodes)
      setStep('done')
      toast.success('2FA 已开启')
      onDone()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '验证失败')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  function copySecret() {
    if (!data) return
    navigator.clipboard.writeText(data.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function close() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {step === 'done' ? '2FA 开启成功' : '设置双因素认证'}
          </DialogTitle>
          <DialogDescription>
            {step === 'qr' && '使用验证器 App 扫描下方二维码，或手动输入密钥'}
            {step === 'verify' && '请输入验证器 App 显示的 6 位动态验证码以确认绑定'}
            {step === 'done' && '请立即保存您的备份恢复码，丢失将无法找回'}
          </DialogDescription>
        </DialogHeader>

        {step === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {step === 'qr' && data && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-xl border border-border/60 bg-white p-3">
                <img src={data.qr} alt="2FA QR Code" className="h-44 w-44" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">无法扫码？手动输入密钥</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                  {data.secret}
                </code>
                <Button size="sm" variant="outline" onClick={copySecret}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={() => setStep('verify')}>
              已扫码，下一步
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button className="w-full" onClick={verify} disabled={loading || code.length !== 6}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              确认绑定
            </Button>
          </div>
        )}

        {step === 'done' && backupCodes && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                这是一次性显示。请立即将这 10 组备份码离线保存（如打印或密码管理器）。每枚备份码只能使用一次，丢失后只能重新生成。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
              {backupCodes.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                  <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-medium tracking-wider">{c}</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join('\n'))
                toast.success('已复制全部备份码')
              }}
              variant="outline"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              复制全部备份码
            </Button>
            <DialogFooter>
              <Button onClick={close} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                我已保存，关闭
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DisableDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [type, setType] = React.useState<'totp' | 'backup'>('totp')
  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function submit() {
    if (!code) return toast.error('请输入验证码')
    setLoading(true)
    try {
      await jsonFetch('/api/2fa/disable', { method: 'POST', body: JSON.stringify({ code, type }) })
      toast.success('2FA 已关闭')
      onDone()
      onOpenChange(false)
      setCode('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '验证失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Power className="h-5 w-5" />
            关闭双因素认证
          </DialogTitle>
          <DialogDescription>
            关闭后您的账号将失去 2FA 保护。请输入当前 TOTP 动态码或一次性备份码以确认操作。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={type === 'totp' ? 'default' : 'outline'} onClick={() => setType('totp')}>动态码</Button>
            <Button size="sm" variant={type === 'backup' ? 'default' : 'outline'} onClick={() => setType('backup')}>备份码</Button>
          </div>
          {type === 'totp' ? (
            <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
              <InputOTPGroup>
                <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          ) : (
            <Input placeholder="XXXXX-XXXXX" className="font-mono uppercase tracking-wider text-center" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button variant="destructive" onClick={submit} disabled={loading || !code}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            确认关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BackupRegenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [type, setType] = React.useState<'totp' | 'backup'>('totp')
  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [codes, setCodes] = React.useState<string[] | null>(null)

  React.useEffect(() => {
    if (!open) { setCode(''); setCodes(null); setType('totp') }
  }, [open])

  async function submit() {
    if (!code) return toast.error('请输入验证码')
    setLoading(true)
    try {
      const d = await jsonFetch('/api/2fa/backup-codes', { method: 'POST', body: JSON.stringify({ code, type }) })
      setCodes(d.backupCodes)
      toast.success('备份码已重新生成')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e.message || '验证失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            重新生成备份恢复码
          </DialogTitle>
          <DialogDescription>
            {codes ? '请保存新的备份码（旧的备份码已全部作废）' : '为安全起见，请输入当前 TOTP 动态码或未使用的备份码以确认操作。'}
          </DialogDescription>
        </DialogHeader>
        {codes ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
              {codes.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-background/60 px-2 py-1.5">
                  <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-medium tracking-wider">{c}</span>
                </div>
              ))}
            </div>
            <Button className="w-full" variant="outline" onClick={() => { navigator.clipboard.writeText(codes.join('\n')); toast.success('已复制') }}>
              <Copy className="h-4 w-4 mr-1.5" /> 复制全部
            </Button>
            <Button className="w-full" onClick={() => onOpenChange(false)}>完成</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={type === 'totp' ? 'default' : 'outline'} onClick={() => setType('totp')}>动态码</Button>
                <Button size="sm" variant={type === 'backup' ? 'default' : 'outline'} onClick={() => setType('backup')}>备份码</Button>
              </div>
              {type === 'totp' ? (
                <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
                  <InputOTPGroup>
                    <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                    <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              ) : (
                <Input placeholder="XXXXX-XXXXX" className="font-mono uppercase tracking-wider text-center" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
              <Button onClick={submit} disabled={loading || !code}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                确认重新生成
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
