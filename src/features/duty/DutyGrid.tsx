import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { monthTitle } from '@/lib/format'
import {
  useScheduleMutations,
  type DutyMember,
  type ScheduleDay,
  type Shift,
} from './useDuty'

/**
 * The monthly duty roster: employees down, days across, one click per cell.
 *
 * Two modes share the grid because the stored row is the same `WorkScheduleDay`
 * either way — only the cycle differs:
 *
 *   department (no shifts) — empty → K (day) → T (night) → D (day off) → empty
 *   group (1..5 shifts)    — empty → 1 → 2 … → D (only with 2+ shifts) → empty
 *
 * Times are written into the row, not just a label: attendance is computed from
 * them, so the autofill slots below MUST stay identical to what a manual click
 * writes or the same cell would count differently depending on how it was set.
 */

const DAY_START = '09:00:00'
const DAY_END = '21:00:00'
const NIGHT_START = '21:00:00'
const NIGHT_END = '09:00:00'

type DeptCode = 'day' | 'night' | 'dam' | null

const DEPT_CYCLE: { code: DeptCode; label: string; token: string; dayOff: boolean }[] = [
  { code: null, label: '', token: '', dayOff: false },
  { code: 'day', label: 'K', token: '--chart-2', dayOff: false },
  { code: 'night', label: 'T', token: '--chart-4', dayOff: false },
  { code: 'dam', label: 'D', token: '--chart-6', dayOff: true },
]

/** Shift colours cycle through the chart ramp — same palette as every chart. */
const SHIFT_TOKENS = ['--chart-5', '--chart-2', '--chart-4', '--chart-1', '--chart-3']
const DAM_TOKEN = '--chart-6'

const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : '')
const toSec = (v?: string | null) => (v ? (String(v).length === 5 ? `${v}:00` : String(v)) : null)

const entryToCode = (e?: ScheduleDay | null): DeptCode => {
  if (!e) return null
  if (e.is_day_off) return 'dam'
  return (e.schedule_type as DeptCode) ?? null
}

/** Saturday and Sunday, from the ISO date string alone. */
const isWeekend = (dateStr: string) => {
  const d = dayjs(dateStr).day()
  return d === 0 || d === 6
}

/** Fisher–Yates — randomises the order among equally loaded employees. */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const cellVar = (token: string) => `rgb(var(${token}))`

export function DutyGrid({
  readOnly,
  members,
  loadingMembers,
  map,
  month,
  onMonthChange,
  shifts,
  weekdays,
  canAutoFill,
  onReload,
}: {
  readOnly?: boolean
  members: DutyMember[]
  loadingMembers?: boolean
  map: Record<string, ScheduleDay>
  month: Dayjs
  onMonthChange: (m: Dayjs) => void
  /** Group mode when non-empty; department K/T/D mode otherwise. */
  shifts?: Shift[] | null
  /** ISO weekday numbers (0=Mon … 6=Sun) the group works. */
  weekdays?: number[] | null
  canAutoFill?: boolean
  onReload: () => void | Promise<unknown>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useScheduleMutations()
  const [saving, setSaving] = useState<string | null>(null)
  const [filling, setFilling] = useState(false)
  const [confirmFill, setConfirmFill] = useState<{ rows: Record<string, unknown>[]; spread: string } | null>(null)

  const groupMode = Array.isArray(shifts) && shifts.length > 0
  const shiftList = groupMode ? (shifts as Shift[]) : []
  const weekdaySet = Array.isArray(weekdays) && weekdays.length ? new Set(weekdays) : null
  /** "Day off" only makes sense once there is more than one shift to rest from. */
  const hasDam = groupMode && shiftList.length >= 2
  const DAM_STATE = shiftList.length

  const today = dayjs().format('YYYY-MM-DD')
  const days = useMemo(() => {
    const n = month.daysInMonth()
    return Array.from({ length: n }, (_, i) => {
      const d = month.date(i + 1)
      return { day: i + 1, dateStr: d.format('YYYY-MM-DD') }
    })
  }, [month])

  /** dayjs 0=Sun…6=Sat; the group stores 0=Mon…6=Sun. */
  const isGroupDay = (dateStr: string) => {
    if (!weekdaySet) return true
    return weekdaySet.has((dayjs(dateStr).day() + 6) % 7)
  }

  /**
   * Which shift a stored row represents, matched on its times. A row whose
   * times match nothing (the group was edited after the roster was written)
   * still shows as shift 1 rather than vanishing.
   */
  const shiftIndexOf = (e?: ScheduleDay | null) => {
    if (!e || !groupMode) return -1
    if (e.is_day_off) return DAM_STATE
    const i = shiftList.findIndex(
      (sh) => hhmm(sh.start) === hhmm(e.working_hours_start) && hhmm(sh.end) === hhmm(e.working_hours_end),
    )
    return i >= 0 ? i : 0
  }

  const write = async (
    key: string,
    existing: ScheduleDay | undefined,
    body: Record<string, unknown> | null,
    subject?: string | null,
  ) => {
    // Cycling a cell is instant; only the step that DELETES a saved day asks.
    if (body === null && existing?.id && !(await confirm({ kind: 'delete', subject }))) return
    setSaving(key)
    try {
      if (body === null) {
        if (existing?.id) await mut.remove.mutateAsync(existing.id)
      } else if (existing?.id) {
        await mut.update.mutateAsync({ id: existing.id, body, notify: groupMode })
      } else {
        await mut.create.mutateAsync({ body, notify: groupMode })
      }
      await onReload()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setSaving(null)
    }
  }

  const clickCell = async (emp: DutyMember, dateStr: string) => {
    if (readOnly) return
    if (groupMode && !isGroupDay(dateStr)) return
    const key = `${emp.id}_${dateStr}`
    const existing = map[key]

    if (groupMode) {
      const cur = existing ? shiftIndexOf(existing) : -1
      const last = hasDam ? DAM_STATE : shiftList.length - 1
      const next = cur + 1
      if (next > last) return write(key, existing, null, `${emp.legal_name ?? ''} · ${dateStr}`)
      const isDam = hasDam && next === DAM_STATE
      const sh = isDam ? null : shiftList[next]
      return write(key, existing, {
        employee_id: emp.id,
        schedule_date: dateStr,
        schedule_type: isDam ? null : sh?.name || 'navbat',
        working_hours_start: isDam ? null : toSec(sh?.start),
        working_hours_end: isDam ? null : toSec(sh?.end),
        // No `lunch_*` keys anywhere on this board: `WorkScheduleDayBase` has
        // no such fields and the server now rejects undeclared keys — the
        // department K/T/D board (v1's two-shift 12-hour duty) and both
        // auto-fills answered 422 on every save (2026-09-28).
        is_day_off: isDam,
      })
    }

    const cur = entryToCode(existing)
    const idx = DEPT_CYCLE.findIndex((c) => c.code === cur)
    const next = DEPT_CYCLE[(idx + 1) % DEPT_CYCLE.length]
    if (next.code === null) return write(key, existing, null, `${emp.legal_name ?? ''} · ${dateStr}`)
    const night = next.code === 'night'
    return write(key, existing, {
      employee_id: emp.id,
      schedule_date: dateStr,
      schedule_type: next.dayOff ? null : next.code,
      working_hours_start: next.dayOff ? null : night ? NIGHT_START : DAY_START,
      working_hours_end: next.dayOff ? null : night ? NIGHT_END : DAY_END,
      is_day_off: next.dayOff,
    })
  }

  /**
   * Fill the EMPTY cells only, spread evenly.
   *
   * Marks already on the board are never touched, but they do count as load —
   * so the month still ends up balanced (max/min ≤ 1 duty apart). Nobody is put
   * on two duties in one day, and each slot goes to the least-loaded employee,
   * ties broken by who has been off duty longest, then at random.
   */
  const buildPlan = (): Record<string, unknown>[] => {
    const load = new Map<number, number>()
    const lastDuty = new Map<number, string>()
    members.forEach((m) => { load.set(m.id, 0); lastDuty.set(m.id, '') })

    const busy = new Map<string, Set<number>>()
    const taken = new Map<string, Set<string | number>>()
    days.forEach(({ dateStr }) => { busy.set(dateStr, new Set()); taken.set(dateStr, new Set()) })

    members.forEach((emp) => {
      days.forEach(({ dateStr }) => {
        const e = map[`${emp.id}_${dateStr}`]
        if (!e) return
        busy.get(dateStr)!.add(emp.id)
        if (e.is_day_off) return
        taken.get(dateStr)!.add(groupMode ? shiftIndexOf(e) : entryToCode(e) === 'night' ? 'night' : 'day')
        load.set(emp.id, (load.get(emp.id) ?? 0) + 1)
        if (dateStr > (lastDuty.get(emp.id) ?? '')) lastDuty.set(emp.id, dateStr)
      })
    })

    const slots: { dateStr: string; shiftIndex?: number; dept?: 'day' | 'night' }[] = []
    days.forEach(({ dateStr }) => {
      if (groupMode && !isGroupDay(dateStr)) return
      const has = taken.get(dateStr)!
      if (groupMode) shiftList.forEach((_, i) => { if (!has.has(i)) slots.push({ dateStr, shiftIndex: i }) })
      else (['day', 'night'] as const).forEach((c) => { if (!has.has(c)) slots.push({ dateStr, dept: c }) })
    })

    const order = shuffled(members)
    const plan: Record<string, unknown>[] = []
    slots.forEach((slot) => {
      const busySet = busy.get(slot.dateStr)!
      let pick: { emp: DutyMember; load: number; last: string } | null = null
      order.forEach((emp) => {
        if (busySet.has(emp.id)) return
        const l = load.get(emp.id) ?? 0
        const last = lastDuty.get(emp.id) ?? ''
        if (!pick || l < pick.load || (l === pick.load && last < pick.last)) pick = { emp, load: l, last }
      })
      if (!pick) return
      const chosen = pick as { emp: DutyMember; load: number; last: string }
      busySet.add(chosen.emp.id)
      load.set(chosen.emp.id, chosen.load + 1)
      lastDuty.set(chosen.emp.id, slot.dateStr)

      if (groupMode) {
        const sh = shiftList[slot.shiftIndex!]
        plan.push({
          employee_id: chosen.emp.id,
          schedule_date: slot.dateStr,
          schedule_type: sh?.name || 'navbat',
          working_hours_start: toSec(sh?.start),
          working_hours_end: toSec(sh?.end),
          is_day_off: false,
        })
      } else {
        const night = slot.dept === 'night'
        plan.push({
          employee_id: chosen.emp.id,
          schedule_date: slot.dateStr,
          schedule_type: slot.dept,
          working_hours_start: night ? NIGHT_START : DAY_START,
          working_hours_end: night ? NIGHT_END : DAY_END,
          is_day_off: false,
        })
      }
    })
    return plan
  }

  const startAutoFill = () => {
    if (readOnly || filling) return
    if (!members.length) return toast.error(t('duty.noMembers'))
    if (groupMode && !weekdaySet) return toast.error(t('duty.noWeekdays'))
    const rows = buildPlan()
    if (!rows.length) return toast.error(t('duty.nothingToFill'))
    const per = new Map<number, number>()
    rows.forEach((r) => per.set(r.employee_id as number, (per.get(r.employee_id as number) ?? 0) + 1))
    const counts = members.map((m) => per.get(m.id) ?? 0)
    setConfirmFill({ rows, spread: `${Math.min(...counts)}–${Math.max(...counts)}` })
  }

  const runAutoFill = async () => {
    if (!confirmFill) return
    const { rows } = confirmFill
    setConfirmFill(null)
    setFilling(true)
    try {
      await mut.bulk.mutateAsync(rows)
      await onReload()
      toast.ok(t('duty.filled', { count: rows.length }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setFilling(false)
    }
  }

  const legend = groupMode
    ? [
        ...shiftList.map((sh, i) => ({
          key: `s${i}`,
          label: shiftList.length > 1 ? String(i + 1) : '✓',
          token: SHIFT_TOKENS[i % SHIFT_TOKENS.length],
          text: `${shiftList.length > 1 ? sh.name : t('duty.onDuty')} · ${hhmm(sh.start)}–${hhmm(sh.end)}`,
        })),
        ...(hasDam ? [{ key: 'dam', label: 'D', token: DAM_TOKEN, text: t('duty.dayOff') }] : []),
      ]
    : DEPT_CYCLE.slice(1).map((c) => ({
        key: c.code as string,
        label: c.label,
        token: c.token,
        text: c.code === 'day' ? t('duty.shiftDay') : c.code === 'night' ? t('duty.shiftNight') : t('duty.dayOff'),
      }))

  const hint = groupMode
    ? shiftList.length > 1
      ? `${t('duty.blankCell')} → ${shiftList.map((_, i) => i + 1).join(' → ')}${hasDam ? ' → D' : ''} → ${t('duty.blankCell')}`
      : t('duty.hintSingle')
    : `${t('duty.blankCell')} → K → T → D → ${t('duty.blankCell')}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-ui border-b border-line px-3 py-2.5">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {legend.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: cellVar(l.token) }}>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-[var(--r-xs)] text-[10px] font-bold"
                style={{ background: `rgb(var(${l.token}) / 0.18)`, border: `1px solid rgb(var(${l.token}) / 0.45)` }}
              >
                {l.label}
              </span>
              {l.text}
            </span>
          ))}
          {!readOnly && <span className="text-[10.5px] text-fg-subtle">{hint}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!readOnly && canAutoFill && (
            <Button size="sm" variant="secondary" leftIcon={<Shuffle size={13} />} loading={filling} onClick={startAutoFill}>
              {t('duty.autoFill')}
            </Button>
          )}
          <div className="flex items-center gap-1">
            <IconButton size="sm" label={t('duty.prevMonth')} onClick={() => onMonthChange(month.subtract(1, 'month'))}>
              <ChevronLeft size={15} />
            </IconButton>
            <span className="w-32 text-center text-[13px] font-semibold capitalize text-fg tabular-nums">
              {monthTitle(month)}
            </span>
            <IconButton size="sm" label={t('duty.nextMonth')} onClick={() => onMonthChange(month.add(1, 'month'))}>
              <ChevronRight size={15} />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {loadingMembers ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : members.length === 0 ? (
          <EmptyState title={t('duty.noMembers')} description={t('duty.noMembersHint')} />
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-[34px] border-b border-r border-line bg-surface px-2 py-2 text-center text-[11px] font-semibold text-fg-muted">
                  №
                </th>
                <th className="sticky left-[34px] z-20 min-w-[190px] border-b border-r border-line bg-surface px-3 py-2 text-left text-[11px] font-semibold text-fg-muted">
                  {t('duty.colName')}
                </th>
                {days.map(({ day, dateStr }) => (
                  <th
                    key={day}
                    className={cn(
                      'min-w-[32px] border-b border-l border-line px-0 py-1.5 text-center text-[10.5px] font-bold tabular-nums',
                      isWeekend(dateStr) ? 'bg-brand-soft text-brand-strong' : 'bg-surface text-fg-muted',
                      // Today, so «who is on duty tomorrow» is found without counting.
                      dateStr === today && 'bg-brand text-fg-on-brand',
                    )}
                    aria-current={dateStr === today ? 'date' : undefined}
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((emp, i) => (
                <tr key={emp.id} className="border-b border-line/60 hover:bg-surface-2/50">
                  <td className="sticky left-0 z-10 border-r border-line bg-surface-2 px-2 py-2 text-center text-[11px] tabular-nums text-fg-subtle">
                    {i + 1}
                  </td>
                  <td className="sticky left-[34px] z-10 border-r border-line bg-surface-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar src={emp.photo_thumb_path} fallbackSrc={emp.photo_path} name={emp.legal_name ?? '?'} size={26} />
                      <div className="min-w-0">
                        <div className="max-w-[150px] truncate text-[12.5px] font-medium text-fg">{emp.legal_name}</div>
                        {emp.phone_number && <div className="truncate text-[10.5px] text-fg-subtle">{emp.phone_number}</div>}
                      </div>
                    </div>
                  </td>
                  {days.map(({ dateStr }) => {
                    const key = `${emp.id}_${dateStr}`
                    const entry = map[key]
                    const busy = saving === key
                    const inDay = !groupMode || isGroupDay(dateStr)

                    let token = ''
                    let label = ''
                    let title = ''
                    if (groupMode) {
                      const state = entry ? shiftIndexOf(entry) : -1
                      const isDam = hasDam && state === DAM_STATE
                      const isShift = state >= 0 && !isDam
                      if (isDam) { token = DAM_TOKEN; label = 'D'; title = t('duty.dayOff') }
                      else if (isShift) {
                        token = SHIFT_TOKENS[state % SHIFT_TOKENS.length]
                        label = shiftList.length > 1 ? String(state + 1) : '✓'
                        title = `${shiftList[state]?.name ?? ''} ${hhmm(shiftList[state]?.start)}–${hhmm(shiftList[state]?.end)}`
                      } else title = inDay ? t('duty.setOnDuty') : t('duty.notGroupDay')
                    } else {
                      const code = entryToCode(entry)
                      const meta = DEPT_CYCLE.find((c) => c.code === code && c.code !== null)
                      if (meta) { token = meta.token; label = meta.label }
                      else if (entry && !entry.is_day_off) {
                        // A row written by a GROUP roster shows up here too —
                        // its `schedule_type` is the shift name, not K/T/D, and
                        // without this branch the cell read as empty.
                        token = SHIFT_TOKENS[0]
                        label = '✓'
                        title = `${entry.schedule_type ?? t('duty.onDuty')} ${hhmm(entry.working_hours_start)}–${hhmm(entry.working_hours_end)}`
                      }
                    }

                    const disabled = !!readOnly || busy || !inDay
                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          'border-l border-line/60 p-0.5',
                          !inDay ? 'bg-surface-2/70' : isWeekend(dateStr) ? 'bg-brand-soft/40' : '',
                          dateStr === today && 'bg-brand/[0.07]',
                        )}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          title={title}
                          aria-label={`${emp.legal_name ?? ''} ${dateStr}${title ? ` — ${title}` : ''}`}
                          onClick={() => clickCell(emp, dateStr)}
                          className={cn(
                            'flex h-[34px] w-full items-center justify-center rounded-[var(--r-xs)] text-[11px] font-bold transition-all',
                            disabled ? 'cursor-default' : 'hover:brightness-110 active:scale-95',
                            busy && 'opacity-50',
                            !inDay && 'opacity-40',
                          )}
                          style={
                            token
                              ? {
                                  background: `rgb(var(${token}) / 0.18)`,
                                  border: `1px solid rgb(var(${token}) / 0.45)`,
                                  color: cellVar(token),
                                }
                              : {
                                  background: 'transparent',
                                  border: `1px solid ${inDay ? 'rgb(var(--border))' : 'transparent'}`,
                                }
                          }
                        >
                          {busy ? '·' : label}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmFill}
        onClose={() => setConfirmFill(null)}
        onConfirm={runAutoFill}
        title={t('duty.autoFill')}
        description={t('duty.autoFillConfirm', {
          month: monthTitle(month),
          cells: confirmFill?.rows.length ?? 0,
          people: members.length,
          spread: confirmFill?.spread ?? '',
        })}
        confirmLabel={t('duty.fill')}
      />
    </div>
  )
}
