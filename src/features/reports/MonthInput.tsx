import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'

interface Props {
  /** "YYYY-MM" */
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Month picker in the app's own language: month name + year, with ◀ ▶ to
 * step. The native `<input type="month">` renders in the browser's locale
 * ("September 2026") and is unstyled — the same reason DateInput exists.
 */
export function MonthInput({ value, onChange, disabled, className }: Props) {
  const { t } = useTranslation()
  const months = t('date.months', { returnObjects: true }) as unknown as string[]
  const now = new Date()
  const [y, m] = value && /^\d{4}-\d{2}/.test(value) ? [Number(value.slice(0, 4)), Number(value.slice(5, 7))] : [now.getFullYear(), now.getMonth() + 1]
  const set = (yy: number, mm: number) => {
    if (mm < 1) { yy -= 1; mm = 12 }
    if (mm > 12) { yy += 1; mm = 1 }
    onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  }
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 5 + i)
  if (!years.includes(y)) years.push(y)
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button type="button" aria-label="◀" disabled={disabled} onClick={() => set(y, m - 1)}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50">
        <ChevronLeft size={16} />
      </button>
      <Select
        value={String(m)}
        onChange={(e) => set(y, Number(e.target.value))}
        options={months.map((name, i) => ({ value: String(i + 1), label: cap(name) }))}
        disabled={disabled}
        wrapperClassName="min-w-[140px] flex-1"
      />
      <Select
        value={String(y)}
        onChange={(e) => set(Number(e.target.value), m)}
        options={years.sort((a, b) => a - b).map((yy) => ({ value: String(yy), label: String(yy) }))}
        disabled={disabled}
        wrapperClassName="w-[104px]"
      />
      <button type="button" aria-label="▶" disabled={disabled} onClick={() => set(y, m + 1)}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
