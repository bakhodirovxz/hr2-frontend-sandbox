import { useTranslation } from 'react-i18next'
import { Select } from './Select'
import { cn } from '@/lib/cn'

type Props = {
  /** "HH:MM", or '' for "not set". */
  value: string
  onChange: (value: string) => void
  /** Label of the empty option — e.g. "Umumiy" for "inherit the global value". */
  emptyLabel?: string
  className?: string
  id?: string
}

/**
 * Hour-first clock picker: an hour dropdown plus a minute dropdown.
 *
 * WHY NOT A TEXT/TIME FIELD: these branch settings are picked, not typed — the
 * person setting them knows "we open at eight", not "08:00". A dropdown of the
 * 24 hours makes the whole range visible and unambiguous, and unlike
 * <input type="time"> it cannot render as AM/PM on a 12-hour machine.
 *
 * Minutes stay available (09:30 shifts exist) but are a coarse 5-minute list,
 * so the hour is the decision and the minute is the exception.
 */
export function ClockSelect({ value, onChange, emptyLabel, className, id }: Props) {
  const { t } = useTranslation()
  const [h = '', m = ''] = value ? value.split(':') : []

  const hours = Array.from({ length: 24 }, (_, i) => {
    const v = String(i).padStart(2, '0')
    return { value: v, label: `${v}:00` }
  })
  const minutes = Array.from({ length: 12 }, (_, i) => {
    const v = String(i * 5).padStart(2, '0')
    return { value: v, label: v }
  })

  // Choosing an hour with no minute yet means ":00" — nobody wants to make two
  // choices to say "eight o'clock". Clearing the hour clears the whole value.
  const setHour = (nh: string) => onChange(nh ? `${nh}:${m || '00'}` : '')
  const setMinute = (nm: string) => onChange(`${h || '00'}:${nm || '00'}`)

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select
        id={id}
        value={h}
        onChange={(e) => setHour(e.target.value)}
        options={hours}
        placeholder={emptyLabel ?? t('common.choose')}
        aria-label={t('tabel.clockHour')}
        wrapperClassName="w-[104px]"
      />
      <span className="text-fg-subtle">:</span>
      <Select
        value={m}
        onChange={(e) => setMinute(e.target.value)}
        options={minutes}
        placeholder="00"
        aria-label={t('tabel.clockMinute')}
        wrapperClassName="w-[84px]"
        disabled={!h}
      />
    </div>
  )
}
