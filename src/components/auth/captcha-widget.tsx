'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Loader2, ShieldCheck } from 'lucide-react'

interface CaptchaWidgetProps {
  token: string
  answer: string
  onTokenChange: (token: string) => void
  onAnswerChange: (answer: string) => void
  disabled?: boolean
}

// Fetches a captcha from /api/captcha and renders the SVG image + input.
// The parent form holds token/answer state and submits them with the form.
export function CaptchaWidget({ token, answer, onTokenChange, onAnswerChange, disabled }: CaptchaWidgetProps) {
  const [svg, setSvg] = React.useState<string>('')
  const [loading, setLoading] = React.useState(true)

  // Use refs to avoid re-fetching on every parent render (inline callbacks change identity each render)
  const onTokenChangeRef = React.useRef(onTokenChange)
  const onAnswerChangeRef = React.useRef(onAnswerChange)
  onTokenChangeRef.current = onTokenChange
  onAnswerChangeRef.current = onAnswerChange

  const fetchCaptcha = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/captcha')
      const data = await res.json()
      if (data.ok) {
        setSvg(data.svg)
        onTokenChangeRef.current(data.token)
        onAnswerChangeRef.current('')
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        图形验证码
      </Label>
      <div className="flex gap-2">
        <div className="flex h-10 w-32 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 overflow-hidden">
          {loading || !svg ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span
              className="captcha-svg"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
        <Input
          type="text"
          placeholder="5位字符"
          className="flex-1 uppercase font-mono tracking-widest"
          maxLength={5}
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          disabled={disabled || loading}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={fetchCaptcha}
          disabled={disabled || loading}
          title="刷新验证码"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">不区分大小写，5 分钟内有效</p>
    </div>
  )
}
