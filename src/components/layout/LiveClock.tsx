import { useEffect, useState } from 'react'
import { dayMonth, inTashkent } from '@/lib/format'
import { useTranslation } from 'react-i18next'

/**
 * The gate clock.
 *
 * Everything this product records is stamped with a time, so the time leads
 * and the date sits under it in the muted voice. Seconds run because this is a
 * board people watch a turnstile through — but they are set at the same size
 * as the rest, tabular, so a digit changing every second never shifts the row.
 *
 * Toshkent vaqti — brauzer zonasi emas: ro'yxatlardagi vaqtlar ham Toshkentda
 * (`inTashkent`), UTC'dagi kompyuterda soat 5 soat farq qilardi.
 */
export function LiveClock() {
  const { t } = useTranslation()
  const weekdays = t('date.weekdays', { returnObjects: true })
  const [now, setNow] = useState(() => inTashkent())
  useEffect(() => {
    const id = setInterval(() => setNow(inTashkent()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div data-lv-clock className="hidden flex-col items-end leading-[1.25] sm:flex">
      <span className="text-[16px] font-semibold text-fg [font-variant-numeric:tabular-nums]">
        {now.format('HH:mm:ss')}
      </span>
      <span className="text-[11px] text-fg-subtle">
        {dayMonth(now)} {now.year()} · {weekdays[now.day()]}
      </span>
    </div>
  )
}
