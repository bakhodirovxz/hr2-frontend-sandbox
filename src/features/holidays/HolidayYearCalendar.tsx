import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { fetchAllPages } from '@/api/fetchAll'
import { HOLIDAYS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import { holidayOn, type Holiday } from './useHolidays'

/**
 * THE YEAR AT A GLANCE — twelve months with every day off and every
 * transferred working day marked (redesign 2026-09-24, calendar layouts on
 * Refero). A table of 18 rows cannot answer «is the 2nd of January a working
 * day, and which Saturday replaces it» — a calendar answers it by looking.
 *
 * Only the shown YEAR is loaded (2026-09-25; it used to load every holiday
 * ever entered). A repeatable one (Navro'z) is stored with the year it was
 * first entered, and the server matches it by month+day for any requested
 * range (`HolidayService.list_holidays`), so the year query includes it.
 */
export function HolidayYearCalendar({ onPick }: { onPick: (h: Holiday) => void }) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [year, setYear] = useState(() => dayjs().year())
  const q = useQuery({
    queryKey: ['holidays', 'year', branchId, year],
    queryFn: () =>
      fetchAllPages<Holiday>(
        HOLIDAYS_LIST,
        { organization_branch_id: branchId || undefined, date_from: `${year}-01-01`, date_to: `${year}-12-31` },
        100,
        20,
      ),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  })
  const all = q.data ?? []
  const workdays = useMemo(() => all.filter((h) => h.kind === 'workday'), [all])
  const workdayOn = (d: Dayjs) => {
    const iso = d.format('YYYY-MM-DD')
    return workdays.find((h) => iso >= h.date_from && iso <= h.date_to)
  }
  const months = t('date.months', { returnObjects: true }) as string[]
  const short = t('date.weekdaysShort', { returnObjects: true }) as string[]

  const counts = useMemo(() => {
    let off = 0
    let work = 0
    for (let d = dayjs(`${year}-01-01`); d.year() === year; d = d.add(1, 'day')) {
      if (holidayOn(all, d)) off++
      else if (workdayOn(d)) work++
    }
    return { off, work }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, year])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconButton size="sm" label={t('holidays.prevYear')} onClick={() => setYear((y) => y - 1)}><ChevronLeft size={16} /></IconButton>
        <span className="text-[20px] font-extrabold tabular-nums text-fg">{year}</span>
        <IconButton size="sm" label={t('holidays.nextYear')} onClick={() => setYear((y) => y + 1)}><ChevronRight size={16} /></IconButton>
        <span className="ml-2 inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <span className="h-3 w-3 rounded-[4px] bg-[#E5484D]" /> {t('holidays.legendOff', { count: counts.off })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <span className="h-3 w-3 rounded-[4px] bg-[#22C55E]" /> {t('holidays.legendWork', { count: counts.work })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <span className="h-3 w-3 rounded-[4px] bg-fg/10" /> {t('holidays.legendWeekend')}
        </span>
      </div>

      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-60 rounded-card" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, m) => {
            const first = dayjs(`${year}-${String(m + 1).padStart(2, '0')}-01`)
            const lead = (first.day() + 6) % 7
            const cells: (Dayjs | null)[] = [...Array(lead).fill(null), ...Array.from({ length: first.daysInMonth() }, (_, i) => first.date(i + 1))]
            const names = new Map<number, Holiday>()
            return (
              <Card key={m} className={cn('p-3', dayjs().year() === year && dayjs().month() === m && 'ring-1 ring-brand/40')}>
                <p className="mb-2 text-[14px] font-bold capitalize text-fg">{months[m]}</p>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {short.map((w, i) => (
                    <span key={w} className={cn('py-0.5 text-[10.5px] font-semibold', i >= 5 ? 'text-danger/70' : 'text-fg-subtle')}>{w}</span>
                  ))}
                  {cells.map((d, i) => {
                    if (!d) return <span key={`e${i}`} />
                    const off = holidayOn(all, d)
                    const work = !off ? workdayOn(d) : undefined
                    const h = off ?? work
                    if (h) names.set(h.id, h)
                    const weekend = d.day() === 0 || d.day() === 6
                    const today = d.isSame(dayjs(), 'day')
                    return (
                      <button
                        key={d.date()}
                        type="button"
                        disabled={!h}
                        onClick={() => h && onPick(h)}
                        title={h ? h.name : undefined}
                        className={cn(
                          'grid h-7 place-items-center rounded-md text-[12px] tabular-nums transition-colors',
                          off ? 'bg-[#E5484D] font-bold text-white hover:bg-[#d13c41]' : work ? 'bg-[#22C55E] font-bold text-white hover:bg-[#16a34a]' : weekend ? 'bg-fg/[0.06] text-fg-subtle' : 'text-fg',
                          today && 'ring-2 ring-brand ring-offset-1 ring-offset-surface',
                          !h && 'cursor-default',
                        )}
                      >
                        {d.date()}
                      </button>
                    )
                  })}
                </div>
                {names.size > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2">
                    {[...names.values()].map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => onPick(h)} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', h.kind === 'workday' ? 'bg-[#22C55E]' : 'bg-[#E5484D]')} />
                          <span className="min-w-0 truncate">{h.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
