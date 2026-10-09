import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/Checkbox'
import { TimeInput } from '@/components/ui/TimeInput'
import { cn } from '@/lib/cn'

export { cycleWeekOf, mondayOf } from '@/lib/workCycle'

/**
 * Per-weekday working window for part-time staff (stavka < 1).
 *
 * WHY THIS IS NOT COSMETIC. The backend measures attendance against this map,
 * not against the single `working_hours_*` pair: `_resolve_day_window` ranks
 * navbatchilik > weekly_schedule > the single window, and `working_days` is
 * derived from these keys when the schedule is present. v2 sent `stavka` and
 * never `weekly_schedule`, so a half-rate employee created here was judged
 * against a full day and collected invented lateness and absences.
 *
 * Keys are Python `date.weekday()` — Monday is "0" — so the order below is the
 * wire format, not a display choice. A missing key means a rest day.
 */
export interface DayWindow {
  start: string
  end: string
}
export type WeeklySchedule = Record<string, DayWindow>

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/**
 * Hours in a day, lunch (13:00–14:00) subtracted where it overlaps — the same
 * arithmetic the server and v1 use, so the total shown here is the total that
 * will be recorded.
 */
export function computeDayHours(start?: string, end?: string): number {
  if (!start || !end) return 0
  const toMin = (t: string) => {
    const [h, m] = String(t).split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const s = toMin(start)
  const e = toMin(end)
  if (e <= s) return 0
  const lunchOverlap = Math.max(0, Math.min(e, 14 * 60) - Math.max(s, 13 * 60))
  return Math.max(0, e - s - lunchOverlap) / 60
}

/**
 * Default window per rate, lunch already accounted for: 0.75 → 6h, 0.5 → 4h,
 * 0.25 → 2h. Before v1 fixed this every rate opened at 09:00–13:00, so picking
 * 0.75 still produced a four-hour day that HR had to correct by hand.
 */
const STAVKA_DEFAULT_DAY: Record<string, DayWindow> = {
  '0.75': { start: '09:00', end: '16:00' },
  '0.5': { start: '09:00', end: '13:00' },
  '0.25': { start: '09:00', end: '11:00' },
}
const defaultDayForStavka = (stavka: number): DayWindow =>
  STAVKA_DEFAULT_DAY[String(stavka)] ?? { start: '09:00', end: '13:00' }

export function WeeklyScheduleEditor({
  value,
  onChange,
  stavka,
  title,
}: {
  value: WeeklySchedule
  onChange: (next: WeeklySchedule) => void
  stavka: number
  /** Header override — «1-hafta» / «2-hafta» in a two-week cycle. */
  title?: string
}) {
  const { t } = useTranslation()
  const setDay = (wd: number, cfg: DayWindow | null) => {
    const next = { ...value }
    if (cfg) next[String(wd)] = cfg
    else delete next[String(wd)]
    onChange(next)
  }
  const weeklyTotal = WEEKDAY_KEYS.reduce((sum, _k, wd) => {
    const c = value[String(wd)]
    return sum + (c ? computeDayHours(c.start, c.end) : 0)
  }, 0)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-elevated p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-fg">{title ?? t('employees.weeklyScheduleTitle')}</span>
        <span className="text-[12px] text-fg-muted">
          {t('employees.weeklyDays', { count: Object.keys(value).length })} ·{' '}
          {t('employees.weeklyTotal')}{' '}
          <b className="text-fg">{Math.round(weeklyTotal * 10) / 10}</b> {t('employees.hoursPerWeek')}
        </span>
      </div>
      {WEEKDAY_KEYS.map((key, wd) => {
        const cfg = value[String(wd)]
        return (
          <div
            key={key}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5',
              cfg ? 'bg-brand-soft' : 'bg-transparent',
            )}
          >
            <Checkbox
              className="w-[112px] shrink-0"
              label={t(`employees.weekday_${key}` as never)}
              checked={!!cfg}
              onChange={(e) => setDay(wd, e.target.checked ? defaultDayForStavka(stavka) : null)}
            />
            {cfg ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <div className="w-[104px] shrink-0">
                  <TimeInput value={cfg.start} onChange={(v) => setDay(wd, { ...cfg, start: v })} />
                </div>
                <span className="shrink-0 text-fg-muted">–</span>
                <div className="w-[104px] shrink-0">
                  <TimeInput value={cfg.end} onChange={(v) => setDay(wd, { ...cfg, end: v })} />
                </div>
                <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] font-medium text-fg-muted">
                  {computeDayHours(cfg.start, cfg.end)} {t('employees.hoursShort')}
                </span>
              </div>
            ) : (
              <span className="text-[11px] italic text-fg-subtle">{t('employees.restDay')}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
