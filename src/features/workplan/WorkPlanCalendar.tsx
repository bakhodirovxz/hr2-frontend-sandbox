import { useMemo } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { monthTitle } from '@/lib/format'
import { PRIORITIES, priorityOf, type Priority, type WorkPlan } from './useWorkPlan'

/*
 * TZ K2 «Система отображает календарь планирования»: the plan's tasks on a
 * calendar. Month — a day grid (each day lists the tasks that cover it);
 * quarter / year — a compact timeline (row = task, column = week / month).
 * Dates are local `YYYY-MM-DD` strings, the same shape the list uses.
 */

export type CalendarScale = 'month' | 'quarter' | 'year'
export const CALENDAR_SCALES: CalendarScale[] = ['month', 'quarter', 'year']

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDate = (s?: string | null): Date | null => {
  if (!s) return null
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const dayIndex = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000)
const dm = (s?: string | null) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '')

/** The request range of a calendar view. Month: Monday-to-Sunday weeks around it. */
export function calendarRange(scale: CalendarScale, anchor: Date): { from: Date; to: Date } {
  const y = anchor.getFullYear()
  if (scale === 'year') return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) }
  if (scale === 'quarter') {
    const q = Math.floor(anchor.getMonth() / 3)
    return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) }
  }
  const first = new Date(y, anchor.getMonth(), 1)
  const last = new Date(y, anchor.getMonth() + 1, 0)
  return { from: addDays(first, -((first.getDay() + 6) % 7)), to: addDays(last, (7 - last.getDay()) % 7) }
}

function shiftAnchor(scale: CalendarScale, a: Date, dir: number): Date {
  if (scale === 'year') return new Date(a.getFullYear() + dir, 0, 1)
  if (scale === 'quarter') return new Date(a.getFullYear(), a.getMonth() + 3 * dir, 1)
  return new Date(a.getFullYear(), a.getMonth() + dir, 1)
}

/** Priority colours — tokens only. */
export const PRIORITY_CLS: Record<Priority, { chip: string; bar: string }> = {
  low: { chip: 'bg-surface-2 text-fg-muted', bar: 'border-line-strong' },
  medium: { chip: 'bg-warning-soft text-warning', bar: 'border-warning' },
  high: { chip: 'bg-danger-soft text-danger', bar: 'border-danger' },
}

export function PriorityChip({ value }: { value: Priority }) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11.5px] font-semibold', PRIORITY_CLS[value].chip)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t(`workPlan.priority_${value}`)}
    </span>
  )
}

/** Done — dimmed, cancelled — struck through (the legend says so). */
const stateCls = (status?: string | null) =>
  status === 'cancelled' ? 'line-through opacity-50' : status === 'done' ? 'opacity-60' : ''

function useTaskTitle() {
  const { t } = useTranslation()
  return (r: WorkPlan, statusLabel: (v: string) => string) =>
    [r.title || '—', `${dm(r.start_date)} — ${dm(r.end_date)}`, r.status ? statusLabel(r.status) : '', r.employee_name || r.department_name || '']
      .filter(Boolean)
      .join(' · ') || t('workPlan.colTitle')
}

const MAX_PER_DAY = 3

function MonthGrid({ items, anchor, onOpen, statusLabel }: GridProps) {
  const { t } = useTranslation()
  const title = useTaskTitle()
  const { from, to } = calendarRange('month', anchor)
  const fromT = from.getTime()
  const toT = to.getTime()
  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = new Date(fromT); d.getTime() <= toT; d = addDays(d, 1)) out.push(d)
    return out
  }, [fromT, toT])
  const byDay = useMemo(() => {
    const map: Record<string, WorkPlan[]> = {}
    for (const r of items) {
      const s = parseDate(r.start_date) ?? parseDate(r.end_date)
      const e = parseDate(r.end_date) ?? s
      if (!s || !e) continue
      const a = s.getTime() < fromT ? new Date(fromT) : s
      const b = e.getTime() > toT ? new Date(toT) : e
      for (let d = a; d <= b; d = addDays(d, 1)) (map[isoDate(d)] ??= []).push(r)
    }
    return map
  }, [items, fromT, toT])
  const today = isoDate(new Date())
  const weekdays = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-line">
          {weekdays.map((w) => (
            <div key={w} className="px-2 py-2 text-[11px] font-semibold uppercase text-fg-subtle">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = isoDate(d)
            const list = byDay[k] ?? []
            const inMonth = d.getMonth() === anchor.getMonth()
            return (
              <div key={k} className={cn('flex min-h-[104px] flex-col gap-[3px] border-b border-r border-line/60 p-1.5', !inMonth && 'bg-surface-2/40')}>
                <span
                  className={cn(
                    'self-end rounded px-1.5 text-[11.5px] tabular-nums',
                    k === today ? 'bg-brand font-bold text-fg-on-brand' : inMonth ? 'text-fg-muted' : 'text-fg-subtle/60',
                  )}
                >
                  {d.getDate()}
                </span>
                {list.slice(0, MAX_PER_DAY).map((r) => {
                  const p = PRIORITY_CLS[priorityOf(r)]
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onOpen(r)}
                      title={title(r, statusLabel)}
                      className={cn('w-full truncate rounded-[3px] border-l-[3px] px-1.5 py-px text-left text-[11px] leading-4 hover:brightness-110', p.chip, p.bar, stateCls(r.status))}
                    >
                      {r.title || '—'}
                    </button>
                  )
                })}
                {list.length > MAX_PER_DAY && (
                  <span className="px-1 text-[10.5px] text-fg-subtle" title={list.slice(MAX_PER_DAY).map((r) => r.title).join('\n')}>
                    {t('workPlan.calMore', { count: list.length - MAX_PER_DAY })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Timeline({ items, scale, anchor, onOpen, statusLabel }: GridProps & { scale: CalendarScale }) {
  const { t } = useTranslation()
  const title = useTaskTitle()
  const { from, to } = calendarRange(scale, anchor)
  const fromT = from.getTime()
  const toT = to.getTime()
  const cols = useMemo(() => {
    const f = new Date(fromT)
    const tt = new Date(toT)
    if (scale === 'year') {
      return Array.from({ length: 12 }, (_, i) => ({
        key: String(i),
        label: String(t(`date.month_${i + 1}` as never)).slice(0, 3),
        from: new Date(f.getFullYear(), i, 1),
        to: new Date(f.getFullYear(), i + 1, 0),
      }))
    }
    const out: { key: string; label: string; from: Date; to: Date }[] = []
    for (let s = addDays(f, -((f.getDay() + 6) % 7)); s <= tt; s = addDays(s, 7)) {
      out.push({ key: isoDate(s), label: `${pad(s.getDate())}.${pad(s.getMonth() + 1)}`, from: s, to: addDays(s, 6) })
    }
    return out
  }, [scale, fromT, toT, t])

  const colOf = (d: Date) => {
    const i = cols.findIndex((c) => d >= c.from && d <= c.to)
    if (i >= 0) return i
    return d < cols[0].from ? 0 : cols.length - 1
  }
  const now = new Date()
  const todayCol = now >= from && now <= to ? colOf(now) : -1
  const sorted = [...items].sort((a, b) => String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')))
  const template = `minmax(180px, 240px) repeat(${cols.length}, minmax(${scale === 'year' ? 56 : 44}px, 1fr))`

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid border-b border-line" style={{ gridTemplateColumns: template }}>
          <div className="px-2.5 py-2 text-[11px] font-semibold uppercase text-fg-subtle">{t('workPlan.colTitle')}</div>
          {cols.map((c, i) => (
            <div key={c.key} className={cn('py-2 text-center text-[11px] font-semibold tabular-nums', i === todayCol ? 'text-brand' : 'text-fg-subtle')}>
              {c.label}
            </div>
          ))}
        </div>
        {sorted.length === 0 && <div className="px-3 py-7 text-center text-[13px] text-fg-subtle">{t('workPlan.empty')}</div>}
        {sorted.map((r) => {
          const s = parseDate(r.start_date) ?? parseDate(r.end_date)
          const e = parseDate(r.end_date) ?? s
          if (!s || !e) return null
          const a = colOf(s < from ? from : s)
          const b = colOf(e > to ? to : e)
          const p = PRIORITY_CLS[priorityOf(r)]
          return (
            <div key={r.id} className="grid border-b border-line/60 hover:bg-surface-2/50" style={{ gridTemplateColumns: template }}>
              <button type="button" onClick={() => onOpen(r)} className="truncate px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:text-brand" title={r.title ?? ''}>
                {r.title || '—'}
                <span className="block truncate text-[10.5px] text-fg-subtle">{r.employee_name || lt(r.department_name)}</span>
              </button>
              <div className="relative py-2" style={{ gridColumn: `${a + 2} / ${b + 3}` }}>
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  title={`${title(r, statusLabel)} · ${t('workPlan.calDays', { count: dayIndex(s, e) + 1 })}`}
                  className={cn('h-[22px] w-full truncate rounded border px-1.5 text-left text-[11px] hover:brightness-110', p.chip, p.bar, stateCls(r.status))}
                >
                  {dm(r.start_date)} — {dm(r.end_date)}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GridProps {
  items: WorkPlan[]
  anchor: Date
  onOpen: (r: WorkPlan) => void
  statusLabel: (v: string) => string
}

export function WorkPlanCalendar({
  items,
  scale,
  anchor,
  onScale,
  onAnchor,
  onOpen,
  loading,
  statusLabel,
}: GridProps & {
  scale: CalendarScale
  onScale: (s: CalendarScale) => void
  onAnchor: (d: Date) => void
  loading?: boolean
}) {
  const { t } = useTranslation()
  const heading =
    scale === 'year'
      ? String(anchor.getFullYear())
      : scale === 'quarter'
        ? t('workPlan.calQuarterTitle', { year: anchor.getFullYear(), q: Math.floor(anchor.getMonth() / 3) + 1 })
        : monthTitle(isoDate(anchor))
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <IconButton size="sm" label={t('workPlan.calPrev')} onClick={() => onAnchor(shiftAnchor(scale, anchor, -1))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton size="sm" label={t('workPlan.calNext')} onClick={() => onAnchor(shiftAnchor(scale, anchor, 1))}>
          <ChevronRight size={16} />
        </IconButton>
        <Button size="sm" variant="outline" onClick={() => onAnchor(new Date())}>{t('workPlan.calToday')}</Button>
        <span className="ml-1.5 text-[14px] font-semibold text-fg">{heading}</span>
        {loading && <span className="text-[12px] text-fg-subtle">{t('common.loading')}</span>}
        <div className="ml-auto" aria-label={t('workPlan.calScale')} role="group">
          <Segmented
            size="sm"
            value={scale}
            onChange={onScale}
            options={CALENDAR_SCALES.map((s) => ({ value: s, label: t(`workPlan.period_${s}`) }))}
          />
        </div>
      </div>
      {scale === 'month' ? (
        <MonthGrid items={items} anchor={anchor} onOpen={onOpen} statusLabel={statusLabel} />
      ) : (
        <Timeline items={items} scale={scale} anchor={anchor} onOpen={onOpen} statusLabel={statusLabel} />
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2 text-[11.5px] text-fg-muted">
        <span>{t('workPlan.colPriority')}:</span>
        {PRIORITIES.map((p) => <PriorityChip key={p} value={p} />)}
        <span className="ml-2">{t('workPlan.calLegend')}</span>
      </div>
    </div>
  )
}
