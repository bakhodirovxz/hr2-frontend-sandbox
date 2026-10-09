import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  List as ListIcon,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { FormError } from '@/components/ui/FormError'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { TimeInput } from '@/components/ui/TimeInput'
import { DateInput } from '@/components/ui/DateInput'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { PageContainer } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { Segmented } from '@/components/ui/Segmented'
import { useChairmanMutations, useChairmanRange, type ChairmanTask } from '@/features/chairman/useChairmanTasks'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'

/**
 * Rais kun tartibi — the chairman's agenda as a CALENDAR (redesign 2026-09-24,
 * ideas from ClickUp's Calendar/Timeline views).
 *
 * An agenda is read against the clock, so events sit on a time grid: their
 * height IS their length, overlapping meetings stand side by side, a red line
 * marks «now», and a gap in the day is visibly a free slot. Three readings of
 * the same events: DAY (the grid + the day's list), WEEK (seven columns) and
 * LIST (the coming two weeks, day by day). A small month calendar marks the
 * days that have anything on them.
 *
 * The secretariat plans here (the server's `_assert_can_manage`): a click on
 * an empty slot creates an event at that time, an event is dragged to another
 * hour or day (confirmed first — it moves the chairman's day), and one is
 * duplicated to another date for recurring meetings. Everyone else reads.
 */

type View = 'day' | 'week' | 'list'
const HOUR_PX = 56
const SNAP = 15 // minutes
const DEFAULT_LEN = 30 // an event with no end is drawn half an hour long
const SWATCHES = ['#7C3AED', '#0A70C2', '#0891B2', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#64748B']

const toMin = (t?: string | null) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const iso = (d: Dayjs) => d.format('YYYY-MM-DD')
/** Monday of the week a date belongs to (weeks start on Monday here). */
const weekStart = (d: Dayjs) => d.subtract((d.day() + 6) % 7, 'day').startOf('day')
const colorOf = (t: ChairmanTask) => (t.color && /^#[0-9a-f]{3,8}$/i.test(t.color) ? t.color : '#7C3AED')
const span = (t: ChairmanTask) => {
  const s = toMin(t.start_time)
  if (s == null) return null
  const e = toMin(t.end_time)
  return { s, e: e != null && e > s ? e : s + DEFAULT_LEN }
}

/**
 * Overlapping events share the width: each takes the lowest free lane, and a
 * cluster of overlapping events is divided into as many lanes as it needs.
 */
function layoutDay(tasks: ChairmanTask[]) {
  const timed = tasks
    .map((t) => ({ t, ...span(t)! }))
    .filter((x) => x.s != null)
    .sort((a, b) => a.s - b.s || b.e - a.e)
  const out: { t: ChairmanTask; s: number; e: number; lane: number; lanes: number }[] = []
  let cluster: typeof out = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    cluster.forEach((c) => (c.lanes = lanes))
    out.push(...cluster)
    cluster = []
  }
  for (const x of timed) {
    if (x.s >= clusterEnd && cluster.length) flush()
    const laneEnds: number[] = []
    cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.e)))
    let lane = laneEnds.findIndex((end) => end <= x.s)
    if (lane < 0) lane = laneEnds.length
    cluster.push({ ...x, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, x.e)
  }
  if (cluster.length) flush()
  return out
}

/** Busy minutes in a day, overlaps counted once. */
function busyMinutes(tasks: ChairmanTask[]) {
  const iv = tasks.map(span).filter((x): x is { s: number; e: number } => !!x).sort((a, b) => a.s - b.s)
  let total = 0
  let cur: { s: number; e: number } | null = null
  for (const x of iv) {
    if (!cur || x.s > cur.e) {
      if (cur) total += cur.e - cur.s
      cur = { ...x }
    } else cur.e = Math.max(cur.e, x.e)
  }
  if (cur) total += cur.e - cur.s
  return total
}

export function ChairmanTasksPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((st) => st.user)
  const { filters, setFilter, setFilters } = useListParams(['date', 'view'])
  const phone = !useMediaQuery('(min-width: 768px)')
  const date = filters.date || iso(dayjs())
  const d = dayjs(date)
  // A week of seven columns does not fit a phone; the day grid does.
  const view: View = (filters.view as View) || (phone ? 'day' : 'week')

  // ⚠️ CRUD only for the SECRETARIAT and the site master admin (server:
  // `_assert_can_manage` → 403). Everyone else who reaches the page reads.
  const canManage = roles.isSecretariat(user) || roles.isSiteMasterAdmin(user)

  const range = useMemo(() => {
    if (view === 'day') return { from: d, to: d }
    if (view === 'week') { const s = weekStart(d); return { from: s, to: s.add(6, 'day') } }
    return { from: d, to: d.add(13, 'day') }
  }, [view, date]) // eslint-disable-line react-hooks/exhaustive-deps
  const { tasks, loading } = useChairmanRange(iso(range.from), iso(range.to))
  const monthStart = d.startOf('month')
  const month = useChairmanRange(iso(weekStart(monthStart)), iso(weekStart(monthStart).add(41, 'day')))
  const mut = useChairmanMutations()

  const byDay = useMemo(() => {
    const m = new Map<string, ChairmanTask[]>()
    for (const x of tasks) {
      const k = x.task_date ?? ''
      m.set(k, [...(m.get(k) ?? []), x])
    }
    return m
  }, [tasks])

  const [form, setForm] = useState<{ task: ChairmanTask | null; preset?: Partial<ChairmanTask> } | null>(null)
  const [viewing, setViewing] = useState<ChairmanTask | null>(null)
  const [deleting, setDeleting] = useState<ChairmanTask | null>(null)
  const [copying, setCopying] = useState<ChairmanTask | null>(null)

  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      mut.invalidate()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const step = (dir: -1 | 1) => setFilter('date', iso(d.add(view === 'day' ? dir : view === 'week' ? 7 * dir : 14 * dir, 'day')))
  const rangeLabel = (() => {
    const months = t('date.months', { returnObjects: true }) as string[]
    const f = range.from
    const to = range.to
    if (view === 'day') return `${f.date()}-${months[f.month()]} ${f.year()}`
    return f.month() === to.month()
      ? `${f.date()}–${to.date()} ${months[f.month()]} ${f.year()}`
      : `${f.date()} ${months[f.month()]} – ${to.date()} ${months[to.month()]} ${to.year()}`
  })()

  /** Drop onto a day column → keep the length, move the start (confirmed). */
  const reschedule = async (task: ChairmanTask, day: string, startMin: number) => {
    const sp = span(task)
    const len = sp ? sp.e - sp.s : 60
    const s = Math.max(0, Math.min(24 * 60 - SNAP, startMin))
    const e = Math.min(24 * 60 - 1, s + len)
    if (task.task_date === day && sp?.s === s) return
    const ok = await confirm({
      kind: 'status',
      subject: task.title ?? '',
      title: t('chairman.moveTitle'),
      description: t('chairman.moveConfirm', { date: dayjs(day).format('DD.MM.YYYY'), time: `${hhmm(s)}–${hhmm(e)}` }),
      confirmLabel: t('chairman.move'),
    })
    if (!ok) return
    await run(mut.update.mutateAsync({ id: task.id, body: { task_date: day, start_time: hhmm(s), end_time: task.end_time || sp ? hhmm(e) : null } }), t('chairman.updated'))
  }

  const today = iso(dayjs())
  const dayTasks = byDay.get(date) ?? []
  const sel = view === 'day' ? dayTasks : (month.tasks.filter((x) => x.task_date === date))

  return (
    <PageContainer className="max-w-none">
      {/* ── header: title, views, the date navigator, the one primary action ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] text-fg">{t('chairman.title')}</h1>
          <p className="text-[13px] text-fg-muted">{t('chairman.subtitle')}</p>
        </div>
        <Segmented
          variant="brand"
          aria-label={t('chairman.view')}
          value={view}
          onChange={(v) => setFilter('view', v)}
          options={[
            { value: 'day', icon: <CalendarDays size={14} />, label: t('chairman.viewDay') },
            { value: 'week', icon: <CalendarRange size={14} />, label: t('chairman.viewWeek') },
            { value: 'list', icon: <ListIcon size={14} />, label: t('chairman.viewList') },
          ]}
        />
        {canManage && (
          <Button leftIcon={<Plus size={16} />} onClick={() => setForm({ task: null, preset: { task_date: date } })}>
            {t('chairman.create')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)]">
        {/* ── the month + the day's figures ── */}
        <aside className="flex flex-col gap-4 max-lg:hidden">
          <MiniMonth
            value={d}
            tasks={month.tasks}
            onPick={(x) => setFilter('date', iso(x))}
            onMonth={(dir) => setFilter('date', iso(d.add(dir, 'month').startOf('month')))}
          />
          <DaySummary date={d} tasks={sel} onOpen={setViewing} />
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <IconButton size="sm" label={t('chairman.prev')} onClick={() => step(-1)}><ChevronLeft size={16} /></IconButton>
            <IconButton size="sm" label={t('chairman.next')} onClick={() => step(1)}><ChevronRight size={16} /></IconButton>
            <Button size="sm" variant={date === today ? 'secondary' : 'ghost'} onClick={() => setFilter('date', today)}>{t('chairman.today')}</Button>
            <h2 className="m-0 ml-1 text-[16px] font-bold first-letter:uppercase text-fg">{rangeLabel}</h2>
            <span className="ml-auto text-[12px] tabular-nums text-fg-subtle">{t('chairman.eventCount', { count: tasks.length })}</span>
          </div>

          {loading ? (
            <Skeleton className="h-[560px] w-full rounded-card" />
          ) : view === 'list' ? (
            <AgendaList from={range.from} days={14} byDay={byDay} onOpen={setViewing} />
          ) : (
            <TimeGrid
              days={view === 'day' ? [d] : Array.from({ length: 7 }, (_, i) => range.from.add(i, 'day'))}
              byDay={byDay}
              canManage={canManage}
              onOpen={setViewing}
              onDayClick={(x) => setFilters({ date: iso(x), view: 'day' })}
              onCreateAt={(day, m) => setForm({ task: null, preset: { task_date: day, start_time: hhmm(m), end_time: hhmm(Math.min(m + 60, 24 * 60 - 1)) } })}
              onDrop={reschedule}
            />
          )}
        </section>
      </div>

      <EventModal
        task={viewing}
        canManage={canManage}
        onClose={() => setViewing(null)}
        onEdit={(x) => { setViewing(null); setForm({ task: x }) }}
        onCopy={(x) => { setViewing(null); setCopying(x) }}
        onDelete={(x) => { setViewing(null); setDeleting(x) }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const x = deleting
          setDeleting(null)
          if (x) await run(mut.remove.mutateAsync(x.id), t('chairman.deleted'))
        }}
        danger
        title={t('chairman.deleteTitle')}
        description={t('chairman.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />

      <CopyModal
        task={copying}
        onClose={() => setCopying(null)}
        onSubmit={async (day) => {
          const x = copying!
          setCopying(null)
          await run(
            mut.create.mutateAsync({
              title: x.title, description: x.description ?? null, participants: x.participants ?? null,
              task_date: day, start_time: x.start_time ?? null, end_time: x.end_time ?? null, color: x.color ?? null,
            }),
            t('chairman.copied'),
          )
        }}
      />

      <TaskModal
        open={!!form}
        task={form?.task ?? null}
        preset={form?.preset}
        loading={mut.create.isPending || mut.update.isPending}
        onClose={() => setForm(null)}
        onSubmit={async (body) => {
          const editing = form?.task
          if (editing && !(await confirm({ kind: 'action', subject: editing.title ?? '', confirmLabel: t('common.save') }))) return
          setForm(null)
          await run(editing ? mut.update.mutateAsync({ id: editing.id, body }) : mut.create.mutateAsync(body), editing ? t('chairman.updated') : t('chairman.created'))
        }}
      />
    </PageContainer>
  )
}

/* ───────────────────────────── the time grid ───────────────────────────── */

function TimeGrid({
  days,
  byDay,
  canManage,
  onOpen,
  onDayClick,
  onCreateAt,
  onDrop,
}: {
  days: Dayjs[]
  byDay: Map<string, ChairmanTask[]>
  canManage: boolean
  onOpen: (t: ChairmanTask) => void
  onDayClick: (d: Dayjs) => void
  onCreateAt: (day: string, minute: number) => void
  onDrop: (t: ChairmanTask, day: string, minute: number) => void
}) {
  const { t } = useTranslation()
  const lv = useLowVisionScale()
  const hourPx = HOUR_PX * lv
  const short = t('date.weekdaysShort', { returnObjects: true }) as string[]
  const all = days.flatMap((x) => byDay.get(iso(x)) ?? [])
  // The grid always shows the working day, and stretches to any event outside it.
  const spans = all.map(span).filter((x): x is { s: number; e: number } => !!x)
  const startH = Math.min(8, ...spans.map((x) => Math.floor(x.s / 60)))
  const endH = Math.max(19, ...spans.map((x) => Math.ceil(x.e / 60)))
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const [now, setNow] = useState(() => dayjs())
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000)
    return () => clearInterval(id)
  }, [])
  const nowMin = now.hour() * 60 + now.minute()
  const dragId = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<{ day: string; m: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Open the grid at the morning, not at midnight.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = Math.max(0, (Math.min(nowMin / 60, 9) - startH - 0.5) * hourPx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length])

  const minuteAt = (e: MouseEvent | DragEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top
    const m = startH * 60 + (y / hourPx) * 60
    return Math.round(m / SNAP) * SNAP
  }
  const allDay = days.some((x) => (byDay.get(iso(x)) ?? []).some((k) => !k.start_time))
  const single = days.length === 1

  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('scroll-thin overflow-x-auto', !single && 'max-md:[&>div]:min-w-[760px]')}>
        <div>
          {/* day headers */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
            <span />
            {days.map((x) => {
              const isToday = x.isSame(dayjs(), 'day')
              return (
                <button
                  key={iso(x)}
                  type="button"
                  onClick={() => onDayClick(x)}
                  className="flex flex-col items-center gap-0.5 border-l border-line py-2 transition-colors hover:bg-surface-2/60"
                >
                  <span className={cn('text-[11.5px] font-semibold', isToday ? 'text-brand-strong' : 'text-fg-subtle')}>{short[(x.day() + 6) % 7]}</span>
                  <span className={cn('grid h-8 w-8 place-items-center rounded-full text-[15px] font-bold tabular-nums', isToday ? 'bg-brand text-fg-on-brand' : 'text-fg')}>{x.date()}</span>
                </button>
              )
            })}
          </div>

          {/* events with no time */}
          {allDay && (
            <div className="grid border-b border-line bg-surface-2/40" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
              <span className="px-1 py-2 text-right text-[10.5px] leading-tight text-fg-subtle">{t('chairman.allDay')}</span>
              {days.map((x) => (
                <div key={iso(x)} className="flex flex-col gap-1 border-l border-line p-1">
                  {(byDay.get(iso(x)) ?? []).filter((k) => !k.start_time).map((k) => (
                    <button key={k.id} type="button" onClick={() => onOpen(k)} className="truncate rounded-md px-2 py-1 text-left text-[12px] font-semibold text-white" style={{ background: colorOf(k) }}>
                      {k.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* the grid */}
          <div ref={scroller} className="scroll-thin relative max-h-[calc(100dvh-17rem)] min-h-[420px] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
              <div className="relative">
                {hours.map((h) => (
                  <div key={h} className="relative border-b border-transparent pr-2 text-right" style={{ height: hourPx }}>
                    <span className="-translate-y-1/2 absolute right-2 top-0 text-[11px] tabular-nums text-fg-subtle">{h === startH ? '' : `${String(h).padStart(2, '0')}:00`}</span>
                  </div>
                ))}
              </div>
              {days.map((x) => {
                const day = iso(x)
                const items = layoutDay(byDay.get(day) ?? [])
                const isToday = x.isSame(dayjs(), 'day')
                const past = x.isBefore(dayjs(), 'day')
                return (
                  <div
                    key={day}
                    className={cn('relative border-l border-line', past && 'bg-fg/[0.015]', canManage && 'cursor-cell')}
                    style={{ height: hours.length * hourPx }}
                    onClick={(e) => {
                      if (!canManage || e.target !== e.currentTarget) return
                      onCreateAt(day, Math.floor(minuteAt(e, e.currentTarget) / 30) * 30)
                    }}
                    onDragOver={(e) => {
                      if (dragId.current == null) return
                      e.preventDefault()
                      const m = minuteAt(e, e.currentTarget)
                      if (dropAt?.day !== day || dropAt.m !== m) setDropAt({ day, m })
                    }}
                    onDragLeave={() => setDropAt(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = dragId.current
                      dragId.current = null
                      setDropAt(null)
                      const task = (byDay.get(day) ?? []).concat(...days.map((z) => byDay.get(iso(z)) ?? [])).find((k) => k.id === id)
                      if (task) onDrop(task, day, minuteAt(e, e.currentTarget))
                    }}
                  >
                    {hours.map((h, i) => (
                      <div key={h} className={cn('pointer-events-none absolute inset-x-0 border-t', i === 0 ? 'border-transparent' : 'border-line/70')} style={{ top: i * hourPx }}>
                        <div className="absolute inset-x-0 border-t border-dashed border-line/40" style={{ top: hourPx / 2 }} />
                      </div>
                    ))}
                    {dropAt?.day === day && (
                      <div className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-brand bg-brand-soft/60 px-1.5 text-[11px] font-bold text-brand-strong" style={{ top: ((dropAt.m - startH * 60) / 60) * hourPx, height: hourPx / 2 }}>
                        {hhmm(dropAt.m)}
                      </div>
                    )}
                    {items.map(({ t: k, s, e, lane, lanes }) => {
                      const top = ((s - startH * 60) / 60) * hourPx
                      const h = Math.max(((e - s) / 60) * hourPx, 22)
                      const c = colorOf(k)
                      const done = past || (isToday && e < nowMin)
                      return (
                        <button
                          key={k.id}
                          type="button"
                          draggable={canManage}
                          onDragStart={(ev) => { dragId.current = k.id; ev.dataTransfer.effectAllowed = 'move' }}
                          onDragEnd={() => { dragId.current = null; setDropAt(null) }}
                          onClick={() => onOpen(k)}
                          title={`${hhmm(s)}–${hhmm(e)} · ${k.title}`}
                          className={cn(
                            'group absolute overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left shadow-xs transition-[box-shadow,transform] hover:z-20 hover:shadow-md',
                            done && 'opacity-60',
                          )}
                          style={{
                            top: top + 1,
                            height: h - 2,
                            left: `calc(${(lane / lanes) * 100}% + 3px)`,
                            width: `calc(${100 / lanes}% - 6px)`,
                            background: `${c}1f`,
                            borderLeftColor: c,
                          }}
                        >
                          <span className="block truncate text-[12px] font-bold leading-tight text-fg">{k.title}</span>
                          {h > 34 && (
                            <span className="block truncate text-[11px] tabular-nums text-fg-muted">
                              {hhmm(s)}–{hhmm(e)}
                            </span>
                          )}
                          {h > 60 && k.participants && (
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fg-muted"><Users size={11} className="shrink-0" />{k.participants}</span>
                          )}
                        </button>
                      )
                    })}
                    {isToday && nowMin >= startH * 60 && nowMin <= endH * 60 && (
                      <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: ((nowMin - startH * 60) / 60) * hourPx }}>
                        <div className="relative h-[2px] bg-danger">
                          <span className="absolute -left-[5px] -top-[4px] h-[10px] w-[10px] rounded-full bg-danger" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {canManage && <p className="border-t border-line px-3 py-2 text-[11.5px] text-fg-subtle">{t('chairman.gridHint')}</p>}
    </Card>
  )
}

/* ────────────────────────────── list view ──────────────────────────────── */

function AgendaList({ from, days, byDay, onOpen }: { from: Dayjs; days: number; byDay: Map<string, ChairmanTask[]>; onOpen: (t: ChairmanTask) => void }) {
  const { t } = useTranslation()
  const weekdays = t('date.weekdays', { returnObjects: true }) as string[]
  const months = t('date.months', { returnObjects: true }) as string[]
  const list = Array.from({ length: days }, (_, i) => from.add(i, 'day')).filter((x) => (byDay.get(iso(x)) ?? []).length > 0)
  if (!list.length) {
    return <Card className="p-8"><EmptyState icon={<CalendarDays size={22} />} title={t('chairman.emptyRange')} description={t('chairman.emptyHint')} /></Card>
  }
  return (
    <div className="flex flex-col gap-4">
      {list.map((x) => {
        const items = byDay.get(iso(x)) ?? []
        const isToday = x.isSame(dayjs(), 'day')
        return (
          <section key={iso(x)} className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0">
              <span className={cn('text-[26px] font-extrabold leading-none tabular-nums', isToday ? 'text-brand-strong' : 'text-fg')}>{x.date()}</span>
              <span className="text-[12.5px] font-semibold first-letter:uppercase text-fg-muted">{weekdays[x.day()]}, {months[x.month()]}</span>
              {isToday && <span className="mt-1 w-fit rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-strong">{t('chairman.today')}</span>}
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((k) => {
                const sp = span(k)
                return (
                  <li key={k.id}>
                    <button type="button" onClick={() => onOpen(k)} className="flex w-full items-stretch gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow] hover:border-brand/40 hover:shadow-sm">
                      <span className="w-1 shrink-0 rounded-full" style={{ background: colorOf(k) }} />
                      <span className="w-[92px] shrink-0 text-[13px] font-bold tabular-nums text-fg">
                        {sp ? `${hhmm(sp.s)}–${hhmm(sp.e)}` : t('chairman.allDay')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-fg">{k.title}</span>
                        {k.participants && <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-muted"><Users size={12} />{k.participants}</span>}
                        {k.description && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-subtle">{k.description}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/* ───────────────────────────── the sidebar ─────────────────────────────── */

function MiniMonth({ value, tasks, onPick, onMonth }: { value: Dayjs; tasks: ChairmanTask[]; onPick: (d: Dayjs) => void; onMonth: (dir: -1 | 1) => void }) {
  const { t } = useTranslation()
  const short = t('date.weekdaysShort', { returnObjects: true }) as string[]
  const months = t('date.months', { returnObjects: true }) as string[]
  const start = weekStart(value.startOf('month'))
  const cells = Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
  const dots = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const k of tasks) m.set(k.task_date ?? '', [...(m.get(k.task_date ?? '') ?? []), colorOf(k)])
    return m
  }, [tasks])
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="pl-1 text-[14px] font-bold first-letter:uppercase text-fg">{months[value.month()]} {value.year()}</span>
        <span className="flex">
          <IconButton size="sm" label={t('chairman.prevMonth')} onClick={() => onMonth(-1)}><ChevronLeft size={15} /></IconButton>
          <IconButton size="sm" label={t('chairman.nextMonth')} onClick={() => onMonth(1)}><ChevronRight size={15} /></IconButton>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {short.map((w) => <span key={w} className="py-1 text-[10.5px] font-semibold text-fg-subtle">{w}</span>)}
        {cells.map((c) => {
          const k = iso(c)
          const sel = c.isSame(value, 'day')
          const isToday = c.isSame(dayjs(), 'day')
          const other = c.month() !== value.month()
          const ds = dots.get(k) ?? []
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(c)}
              aria-pressed={sel}
              aria-label={`${c.format('DD.MM.YYYY')}${ds.length ? ` · ${ds.length}` : ''}`}
              className={cn(
                'mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[12.5px] tabular-nums transition-colors',
                sel ? 'bg-brand font-bold text-fg-on-brand' : isToday ? 'font-bold text-brand-strong ring-1 ring-brand/50' : other ? 'text-fg-subtle/60' : 'text-fg hover:bg-surface-2',
              )}
            >
              {c.date()}
              <span className="flex h-1 gap-0.5">
                {ds.slice(0, 3).map((col, i) => <span key={i} className="h-1 w-1 rounded-full" style={{ background: sel ? 'currentColor' : col }} />)}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function DaySummary({ date, tasks, onOpen }: { date: Dayjs; tasks: ChairmanTask[]; onOpen: (t: ChairmanTask) => void }) {
  const { t } = useTranslation()
  const weekdays = t('date.weekdays', { returnObjects: true }) as string[]
  const busy = busyMinutes(tasks)
  const nowMin = dayjs().hour() * 60 + dayjs().minute()
  const isToday = date.isSame(dayjs(), 'day')
  const next = tasks.map((k) => ({ k, sp: span(k) })).filter((x) => x.sp && (!isToday || x.sp.e > nowMin)).sort((a, b) => a.sp!.s - b.sp!.s)[0]
  return (
    <Card className="p-4">
      <p className="text-[12px] font-semibold first-letter:uppercase text-fg-subtle">{weekdays[date.day()]}, {date.format('DD.MM.YYYY')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat icon={<CalendarDays size={14} />} label={t('chairman.statEvents')} value={String(tasks.length)} />
        <Stat icon={<Timer size={14} />} label={t('chairman.statBusy')} value={busy ? `${Math.floor(busy / 60)}:${String(busy % 60).padStart(2, '0')}` : '0:00'} />
      </div>
      {next && (
        <button type="button" onClick={() => onOpen(next.k)} className="mt-3 w-full rounded-inner border border-line bg-surface-2/50 p-3 text-left transition-colors hover:border-brand/40">
          <span className="text-[11.5px] font-semibold text-fg-subtle">{isToday ? t('chairman.nextUp') : t('chairman.firstUp')}</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(next.k) }} />
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg">{next.k.title}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] tabular-nums text-fg-muted"><Clock size={12} />{hhmm(next.sp!.s)}–{hhmm(next.sp!.e)}</span>
        </button>
      )}
    </Card>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-inner bg-surface-2/60 p-2.5">
      <span className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">{icon}{label}</span>
      <span className="mt-0.5 block text-[20px] font-extrabold tabular-nums text-fg">{value}</span>
    </div>
  )
}

/* ─────────────────────────────── modals ──────────────────────────────── */

function EventModal({ task, canManage, onClose, onEdit, onCopy, onDelete }: {
  task: ChairmanTask | null
  canManage: boolean
  onClose: () => void
  onEdit: (t: ChairmanTask) => void
  onCopy: (t: ChairmanTask) => void
  onDelete: (t: ChairmanTask) => void
}) {
  const { t } = useTranslation()
  if (!task) return null
  const sp = span(task)
  const weekdays = t('date.weekdays', { returnObjects: true }) as string[]
  const day = dayjs(task.task_date)
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: colorOf(task) }} />
          {task.title}
        </span>
      }
      footer={
        canManage ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={() => onDelete(task)}>{t('common.delete')}</Button>
            <span className="flex-1" />
            <Button variant="secondary" leftIcon={<Copy size={15} />} onClick={() => onCopy(task)}>{t('chairman.copy')}</Button>
            <Button leftIcon={<Pencil size={15} />} onClick={() => onEdit(task)}>{t('common.edit')}</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      <dl className="m-0 grid gap-3 text-[13.5px]">
        <Row icon={<CalendarDays size={15} />} label={t('chairman.fieldDate')}>
          <span className="first-letter:uppercase">{weekdays[day.day()]}</span>, {day.format('DD.MM.YYYY')}
        </Row>
        <Row icon={<Clock size={15} />} label={t('chairman.time')}>
          {sp ? <span className="font-semibold tabular-nums">{hhmm(sp.s)} – {hhmm(sp.e)} <span className="font-normal text-fg-subtle">({sp.e - sp.s} {t('chairman.min')})</span></span> : t('chairman.allDay')}
        </Row>
        {task.participants && (
          <Row icon={<Users size={15} />} label={t('chairman.fieldParticipants')}>
            <span className="flex flex-wrap gap-1.5">
              {task.participants.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean).map((p) => (
                <span key={p} className="rounded-pill border border-line bg-surface-2 px-2 py-0.5 text-[12.5px]">{p}</span>
              ))}
            </span>
          </Row>
        )}
        {task.description && (
          <Row icon={<ListIcon size={15} />} label={t('chairman.fieldDescription')}>
            <span className="whitespace-pre-wrap text-fg-muted">{task.description}</span>
          </Row>
        )}
      </dl>
    </Modal>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
      <dt className="flex items-center gap-2 text-fg-subtle">{icon}{label}</dt>
      <dd className="m-0 text-fg">{children}</dd>
    </div>
  )
}

function CopyModal({ task, onClose, onSubmit }: { task: ChairmanTask | null; onClose: () => void; onSubmit: (day: string) => void }) {
  const { t } = useTranslation()
  const [day, setDay] = useState('')
  useEffect(() => { if (task) setDay(iso(dayjs(task.task_date).add(7, 'day'))) }, [task])
  return (
    <Modal
      open={!!task}
      onClose={onClose}
      size="sm"
      title={t('chairman.copyTitle')}
      description={task?.title ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!day} onClick={() => onSubmit(day)} leftIcon={<Copy size={15} />}>{t('chairman.copy')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('chairman.copyTo')}>
          <DateInput value={day} onChange={setDay} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[1, 7, 14].map((n) => task && (
            <button key={n} type="button" onClick={() => setDay(iso(dayjs(task.task_date).add(n, 'day')))} className="rounded-pill border border-line px-2.5 py-1 text-[12px] text-fg-muted hover:border-brand/40 hover:text-fg">
              {t('chairman.copyPlus', { count: n })}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function TaskModal({ open, task, preset, loading, onClose, onSubmit }: {
  open: boolean
  task: ChairmanTask | null
  preset?: Partial<ChairmanTask>
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [participants, setParticipants] = useState('')
  const [taskDate, setTaskDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const src = task ?? preset ?? {}
    setTitle(src.title ?? '')
    setDescription(src.description ?? '')
    setParticipants(src.participants ?? '')
    setTaskDate(src.task_date ?? iso(dayjs()))
    setStart(src.start_time?.slice(0, 5) ?? '')
    setEnd(src.end_time?.slice(0, 5) ?? '')
    setColor(src.color ?? SWATCHES[0])
    setError('')
  }, [open, task, preset])

  const submit = () => {
    if (!title.trim()) return setError(t('chairman.titleRequired'))
    if (start && end && end <= start) return setError(t('chairman.endBeforeStart'))
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      participants: participants.trim() || null,
      task_date: taskDate,
      start_time: start || null,
      end_time: end || null,
      color,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? t('chairman.editTitle') : t('chairman.createTitle')} footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={submit} loading={loading}>{t('common.save')}</Button>
      </>
    }>
      <div className="space-y-4">
        <Field label={t('chairman.fieldTitle')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('chairman.fieldTitle')} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('chairman.fieldDate')}>
            <DateInput value={taskDate} onChange={setTaskDate} aria-label={t('chairman.fieldDate')} />
          </Field>
          <Field label={t('chairman.fieldStart')}>
            <TimeInput value={start} onChange={setStart} aria-label={t('chairman.fieldStart')} />
          </Field>
          <Field label={t('chairman.fieldEnd')}>
            <TimeInput value={end} onChange={setEnd} aria-label={t('chairman.fieldEnd')} />
          </Field>
        </div>
        <Field label={t('chairman.fieldParticipants')}>
          <Input value={participants} onChange={(e) => setParticipants(e.target.value)} aria-label={t('chairman.fieldParticipants')} placeholder={t('chairman.participantsHint')} />
        </Field>
        <Field label={t('chairman.fieldDescription')}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} aria-label={t('chairman.fieldDescription')} />
        </Field>
        <Field label={t('chairman.fieldColor')}>
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn('h-7 w-7 rounded-full border-2 transition-transform', color.toLowerCase() === c.toLowerCase() ? 'scale-110 border-fg' : 'border-transparent')}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t('chairman.fieldColor')} className="h-7 w-9 cursor-pointer rounded-md border border-ctl-line bg-ctl-bg" />
          </div>
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}
