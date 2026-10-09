import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { CONTROL_PAD, control } from './control'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** Strip the field chrome — for a time typed INSIDE another control
   *  (the duty-roster cells render two of these in one bordered box). */
  bare?: boolean
}

/**
 * 24-hour time field.
 *
 * A native <input type="time"> renders in the BROWSER's locale, so it shows
 * AM/PM for anyone whose browser is set to a 12-hour locale — there is no
 * attribute that reliably forces 24h across engines. This is a masked text
 * field instead: digits only, auto-inserted colon, hours clamped to 00–23 and
 * minutes to 00–59. Always 24h, everywhere, and it keeps the app's own styling.
 */
export function TimeInput({ value, onChange, className, onBlur, invalid, bare, ...rest }: Props) {
  const [focused, setFocused] = useState(false)

  const handle = (raw: string) => {
    let digits = raw.replace(/\D/g, '')
    if (!digits) return onChange('')
    // A first digit of 3–9 can only be a one-digit hour: «930» is 09:30. It
    // used to read «93» as the hour, clamp it to 23 and end as 23:00.
    if (/^[3-9]/.test(digits)) digits = `0${digits}`
    digits = digits.slice(0, 4)
    let h = digits.slice(0, 2)
    const m = digits.slice(2, 4)
    if (h.length === 2 && Number(h) > 23) h = '23'
    onChange(m ? `${h}:${m}` : h)
  }

  /** Pad/clamp to a full HH:MM once the user leaves the field. */
  const normalize = () => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return onChange('')
    const h = Math.min(23, Number(digits.slice(0, 2) || 0))
    const m = Math.min(59, Number(digits.slice(2, 4).padEnd(2, '0') || 0))
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => handle(e.target.value)}
      onFocus={(e) => {
        setFocused(true)
        rest.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        normalize()
        onBlur?.(e)
      }}
      inputMode="numeric"
      placeholder={focused ? 'HH:MM' : rest.placeholder ?? '—'}
      maxLength={5}
      spellCheck={false}
      aria-invalid={invalid || undefined}
      // Self-styled from control(): call sites used to paste the whole
      // `h-10 w-full rounded-lg border …` string, so they all drifted apart.
      className={cn(
        bare
          ? 'bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle'
          : cn(control({ invalid }), CONTROL_PAD.plain, 'w-full'),
        'tabular-nums',
        className,
      )}
    />
  )
}
