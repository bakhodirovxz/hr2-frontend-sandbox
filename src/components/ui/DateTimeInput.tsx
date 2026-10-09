import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { DateInput } from './DateInput'
import { TimeInput } from './TimeInput'

/**
 * Date + 24-hour time, as one value.
 *
 * A native <input type="datetime-local"> renders in the BROWSER's locale — an
 * en-US browser shows mm/dd/yyyy with an AM/PM clock and a foreign-looking
 * picker — which is exactly why DateInput and TimeInput exist. This composes
 * those two so a datetime field looks and behaves like every other control in
 * the app instead of being the one screen that looks different.
 *
 * Value is the same `YYYY-MM-DDTHH:mm` string `datetime-local` produces, so
 * callers and the API payload are unchanged.
 *
 * The two halves are held LOCALLY rather than derived from `value` on every
 * render. Deriving them meant a half-finished pair could not exist: with the
 * date still empty there was nothing to emit, so the time input threw away
 * every keystroke and looked frozen.
 */
export function DateTimeInput({
  value,
  onChange,
  invalid,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const { t } = useTranslation()
  const [datePart, setDatePart] = useState(() => String(value || '').split('T')[0] ?? '')
  const [timePart, setTimePart] = useState(() => String(value || '').split('T')[1] ?? '')

  // Follow external changes (form reset, edit-mode prefill) without fighting
  // what the user is currently typing.
  useEffect(() => {
    const [d = '', tm = ''] = String(value || '').split('T')
    setDatePart((prev) => (d === prev ? prev : d))
    setTimePart((prev) => (tm === prev ? prev : tm))
  }, [value])

  /** Emit only a complete pair; a half-filled field stays local. */
  const emit = (d: string, tm: string) => {
    const next = d && tm ? `${d}T${tm}` : d ? d : ''
    if (next !== value) onChange(next)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <DateInput
        className="min-w-0 flex-1"
        value={datePart}
        onChange={(d) => {
          setDatePart(d)
          emit(d, timePart)
        }}
        invalid={invalid}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <TimeInput
        className="w-[96px] shrink-0 text-center"
        value={timePart}
        onChange={(tm) => {
          setTimePart(tm)
          emit(datePart, tm)
        }}
        invalid={invalid}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} — ${t('date.time')}` : t('date.time')}
      />
    </div>
  )
}
