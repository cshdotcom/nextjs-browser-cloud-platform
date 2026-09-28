'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Numeric input honoring the 0.001 granularity requirement.
export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | null
  onValueChange: (v: number | null) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  precision?: number
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, step = 0.001, min, max, unit, precision, className, ...rest },
  ref,
) {
  const [draft, setDraft] = React.useState<string>(() => (value === null ? '' : String(value)))
  React.useEffect(() => {
    const cur = value === null ? '' : String(value)
    if (cur !== draft && !(draft === '' && value === null)) setDraft(cur)
  }, [value, draft])

  function commit(raw: string) {
    if (raw.trim() === '') {
      onValueChange(null)
      return
    }
    let n = Number(raw)
    if (Number.isNaN(n)) {
      onValueChange(null)
      return
    }
    if (typeof min === 'number' && n < min) n = min
    if (typeof max === 'number' && n > max) n = max
    if (typeof precision === 'number') n = Number(n.toFixed(precision))
    onValueChange(n)
    setDraft(String(n))
  }

  return (
    <div className="relative flex items-center">
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
        }}
        className={cn(unit && 'pr-12', className)}
        {...rest}
      />
      {unit && (
        <span className="absolute right-3 text-xs text-muted-foreground pointer-events-none">{unit}</span>
      )}
    </div>
  )
})
