import { textMatches } from '@/i18n/translit'
import { useMemo, useState } from 'react'
import { dayMonth } from '@/lib/format'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { control, filterChip } from '@/components/ui/control'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { formatTime, getDisplayStatus, isInside, jobTitle } from '@/features/dashboard/attendance'
import type { StatusCounts } from '@/features/dashboard/attendance'
import type { AttendanceRow } from '@/types/dashboard'
import { Eyebrow, PanelEmpty } from './Panel'
import { PersonCell, StatusPill, type RowTone } from './rows'
import { EmployeeCalendarModal } from './EmployeeCalendarModal'
import { PassDetailModal } from './PassDetailModal'

/** «Hozir ishda» filter (2026-09-30): who is in the building right now. */
type Presence = 'all' | 'inside' | 'left' | 'absent' | 'other'
/** «Boshqa» — away for a documented reason: sick leave, maternity, vacation,
 *  business trip, other approved leave (the same set the HR drill calls OTHER). */
const OTHER_CATEGORIES: AttendanceRow['category'][] = ['vacation', 'trip', 'sick', 'leave', 'dekret']
const hasLeft = (r: AttendanceRow) => (r.category === 'present' || r.category === 'late') && r.hasExited
const PRESENCE_TEST: Record<Presence, (r: AttendanceRow) => boolean> = {
  all: () => true,
  inside: isInside,
  left: hasLeft,
  absent: (r) => r.category === 'absent',
  other: (r) => OTHER_CATEGORIES.includes(r.category),
}

const TONE: Record<string, RowTone> = {
  present: 'success',
  arrived: 'success',
  left: 'neutral',
  absent: 'danger',
  denied: 'danger',
  vacation: 'brand',
  trip: 'info',
  sick: 'neutral',
  leave: 'brand',
  dekret: 'brand',
}

/**
 * DAVOMAT STATISTIKASI — the branch roster, as an employee reads it.
 *
 * It used to live behind a second tab with two scope pills beside it. Both are
 * gone: the roster is the board's main block now, and "my department" is simply
 * another face of the same window — the carousel already turns between faces,
 * so a filter that only ever had two values does not need its own row of
 * buttons (and a long department name no longer squeezes the search box).
 *
 * `scope` is therefore a PROP, not local state: the carousel decides which face
 * is showing, this component only draws it.
 *
 * TODAY ONLY, on purpose. The categorized-roster endpoint this reads has no
 * date parameter — it answers for the current day — so rather than draw day
 * arrows that would quietly show today's data under yesterday's label, the
 * date is stated and history stays where it is answerable (Davomat sahifasi).
 */
export function AttendanceStatsList({
  rows,
  counts,
  loading,
  scope = 'all',
  className,
}: {
  rows: AttendanceRow[]
  counts: StatusCounts
  loading?: boolean
  /** 'all' — the whole branch; 'dept' — only the viewer's own department. */
  scope?: 'all' | 'dept'
  className?: string
}) {
  const { t } = useTranslation()
  const weekdays = t('date.weekdays', { returnObjects: true })
  const [q, setQ] = useState('')
  const [presence, setPresence] = useState<Presence>('all')
  /* v1 lets any role click a colleague; v2's rows were inert, so an ordinary
     employee could not look anyone up — not their phone, not whether they are
     in today. The card is built from what THEY may read (see ColleagueModal). */
  const [opened, setOpened] = useState<AttendanceRow | null>(null)
  const [pass, setPass] = useState<AttendanceRow | null>(null)

  const user = useAuthStore((s) => s.user)
  const branches = useBranchStore((s) => s.branches)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const branchName =
    branches.find((b) => b.id === selectedBranchId)?.name ?? t('dashboard.branchFallback')

  const myDept = user?.employee?.department
  const myDeptId = typeof myDept === 'object' && myDept ? myDept.id : undefined
  const myDeptName = typeof myDept === 'object' && myDept ? (myDept.name ?? '') : ''

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (scope === 'dept') {
        const d = r.employee.department
        const id = typeof d === 'object' && d ? d.id : undefined
        if (!myDeptId || id !== myDeptId) return false
      }
      if (needle && !textMatches(r.employee.legal_name, needle)) return false
      return true
    })
  }, [rows, scope, myDeptId, q])

  // Counts follow the scope and the search, so each chip says how many rows
  // it will leave on screen.
  const presenceCounts = useMemo(() => {
    const c: Record<Presence, number> = { all: 0, inside: 0, left: 0, absent: 0, other: 0 }
    for (const r of shown) {
      c.all++
      if (PRESENCE_TEST.inside(r)) c.inside++
      else if (PRESENCE_TEST.left(r)) c.left++
      else if (PRESENCE_TEST.absent(r)) c.absent++
      else if (PRESENCE_TEST.other(r)) c.other++
    }
    return c
  }, [shown])
  const listed = useMemo(() => shown.filter(PRESENCE_TEST[presence]), [shown, presence])

  const today = dayjs()

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5">
          <Eyebrow className="mr-auto">
            {t('dashboard.board.branchLabel', { name: branchName })}
            {scope === 'dept' && myDeptName ? ` · ${myDeptName}` : ''}
          </Eyebrow>

          <span className="rounded-pill bg-fg/[0.06] px-3 py-1.5 text-[12px] font-semibold text-fg-muted [font-variant-numeric:tabular-nums]">
            {t('date.today')}, {dayMonth(today)} · {weekdays[today.day()]}
          </span>

          <div className="relative w-full sm:w-[220px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('dashboard.searchEmployee')}
              aria-label={t('dashboard.searchEmployee')}
              className={cn(control({ size: 'sm' }), 'w-full pl-8 pr-3')}
            />
          </div>
        </div>

        <div
          role="group"
          aria-label={t('dashboard.presenceFilter.label')}
          className="scroll-thin flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-2.5"
        >
          {(
            [
              ['all', t('dashboard.presenceFilter.all')],
              ['inside', t('dashboard.insideNow')],
              ['left', t('dashboard.presenceFilter.left')],
              ['absent', t('dashboard.presenceFilter.absent')],
              ['other', t('dashboard.presenceFilter.other')],
            ] as [Presence, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={presence === key}
              onClick={() => setPresence(key)}
              className={filterChip(presence === key)}
            >
              {label}
              <span className="tabular-nums text-fg-subtle">{presenceCounts[key]}</span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 bg-fg/[0.03] px-4 py-2 text-[11.5px] font-semibold text-fg-subtle">
          <span className="hidden w-7 sm:block">{t('dashboard.colNo')}</span>
          <span className="min-w-0 flex-[3]">{t('dashboard.colEmployee')}</span>
          {/* v1 ning ikki ustuni: ichki raqam va o'tilgan KPP. Ikkalasi ham
              qatorda ALLAQACHON bor edi (`internal_phone_number`, `turnstile`),
              faqat chizilmasdi. */}
          <span className="hidden w-[72px] text-center sm:block">{t('dashboard.colInternal')}</span>
          <span className="hidden min-w-0 flex-1 2xl:block">{t('dashboard.colGate')}</span>
          <span className="hidden min-w-0 flex-1 2xl:block">{t('employees.colDepartment')}</span>
          <span className="w-[48px] text-center sm:w-[64px]">{t('dashboard.colIn')}</span>
          <span className="hidden w-[64px] text-center sm:block">{t('dashboard.colOut')}</span>
          <span className="w-[84px] text-center sm:w-[96px]">{t('dashboard.colStatus')}</span>
        </div>

        {listed.length === 0 ? (
          <PanelEmpty text={loading ? t('common.loading') : t('dashboard.emptyTable')} />
        ) : (
          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3 pt-1.5">
            {listed.map((r, i) => {
              const status = getDisplayStatus(r)
              const d = r.employee.department
              const deptName = typeof d === 'object' && d ? (d.name ?? '') : ''
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  aria-label={r.employee.legal_name ?? t('common.unknown')}
                  onClick={() => setOpened(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpened(r)
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-2 transition-colors hover:bg-fg/[0.05] focus-visible:bg-fg/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className="hidden w-7 text-[12px] text-fg-subtle [font-variant-numeric:tabular-nums] sm:block">
                    {i + 1}.
                  </span>
                  <span className="flex min-w-0 flex-[3] items-center gap-2.5">
                    <PersonCell
                      name={r.employee.legal_name ?? t('common.unknown')}
                      sub={jobTitle(r.employee)}
                      photo={r.employee.photo_thumb_path}
                      photoFull={r.employee.photo_path}
                      // Photo → the pass and its map; the row → the tabel.
                      onPhotoClick={() => setPass(r)}
                    />
                  </span>
                  <span className="hidden w-[72px] text-center text-[12px] font-semibold tracking-wider text-brand-strong [font-variant-numeric:tabular-nums] sm:block">
                    {r.employee.internal_phone_number || '—'}
                  </span>
                  {/* The gate is «—» for almost every row while the NAME was cut to
                      «Ag'zam…» at 1366 px (audit 2026-09-22): the name takes 3
                      shares and the gate shows only on very wide screens. */}
                  <span className="hidden min-w-0 flex-1 truncate text-[12px] text-fg-muted 2xl:block">
                    {r.turnstile || '—'}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-[12px] text-fg-muted 2xl:block">
                    {deptName}
                  </span>
                  <span
                    className={cn(
                      'w-[48px] text-center text-[12.5px] [font-variant-numeric:tabular-nums] sm:w-[64px]',
                      r.category === 'late' ? 'text-warning' : 'text-fg-muted',
                    )}
                  >
                    {formatTime(r.entry?.happen_time)}
                  </span>
                  <span className="hidden w-[64px] text-center text-[12.5px] text-fg-muted [font-variant-numeric:tabular-nums] sm:block">
                    {formatTime(r.exit?.happen_time)}
                  </span>
                  <span className="flex w-[84px] justify-center sm:w-[96px]">
                    <StatusPill tone={TONE[status.key] ?? 'neutral'}>
                      {t(`status.${status.key}` as never)}
                    </StatusPill>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex shrink-0 flex-wrap gap-4 bg-fg/[0.03] px-4 py-2.5 text-[12px] text-fg-subtle">
          <Total label={t('dashboard.totalRowPrefix')} value={counts.total} />
          <Total label={t('dashboard.donut.present')} value={counts.arrived} tone="text-success" />
          <Total label={t('dashboard.insideNow')} value={counts.inside} tone="text-success" />
          <Total label={t('dashboard.gate.late')} value={counts.late} tone="text-warning" />
          <Total label={t('dashboard.gate.absent')} value={counts.absent} tone="text-danger" />
          <Total label={t('dashboard.presenceFilter.other')} value={counts.other} tone="text-brand-strong" />
      </div>

      {/* The user's call (2026-09-24): a person opens their month — v1's
          «Davomat statistikasi» calendar — with any day's passes beside it. */}
      <EmployeeCalendarModal
        person={
          opened
            ? {
                id: opened.employee.id,
                name: opened.employee.legal_name,
                photo: opened.employee.photo_thumb_path,
                position: jobTitle(opened.employee),
                department: opened.employee.department?.name,
              }
            : null
        }
        onClose={() => setOpened(null)}
      />
      <PassDetailModal row={pass} onClose={() => setPass(null)} />
    </div>
  )
}

function Total({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span>
      {label}{' '}
      <span className={cn('font-semibold [font-variant-numeric:tabular-nums]', tone ?? 'text-fg')}>
        {value}
      </span>
    </span>
  )
}
