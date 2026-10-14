import { useTranslation } from 'react-i18next'
import { ln } from '@/i18n/display'
import { Building2, CheckCircle2, Clock, DoorOpen, XCircle } from 'lucide-react'
import { formatTime, getDisplayStatus, isInside, jobTitle } from '@/features/dashboard/attendance'
import type { StatusCounts } from '@/features/dashboard/attendance'
import type { AttendanceRow } from '@/types/dashboard'
import { useOpenPerson } from './EmployeeCalendarModal'
import { DrillEmpty, DrillModal, DrillPill, PersonRow, matchNeedle } from './boardDrill'


/* ════════════════════════════════════════════════════════════════════════════
 * ATTENDANCE — who is behind «Kelganlar / Kech qoldi / Kelmadi»
 *
 * Built from the SAME `dash.rows` the tiles count (`countByStatus`), so a tab
 * always holds exactly the number on its tile. A row opens the existing
 * colleague card (status, gate, phone, month tabel).
 * ══════════════════════════════════════════════════════════════════════════ */

export type AttendanceTab = 'arrived' | 'inside' | 'late' | 'absent' | 'other'
const OTHER: AttendanceRow['category'][] = ['vacation', 'trip', 'sick', 'leave', 'dekret']
const inTab = (r: AttendanceRow, tab: AttendanceTab) =>
  tab === 'arrived'
    ? r.category === 'present' || r.category === 'late'
    : tab === 'inside'
      ? isInside(r)
      : tab === 'other'
        ? OTHER.includes(r.category)
        : r.category === tab

export function AttendanceModal({
  rows,
  counts,
  tab,
  onTab,
  onClose,
}: {
  rows: AttendanceRow[]
  counts: StatusCounts
  tab: AttendanceTab | null
  onTab: (t: AttendanceTab) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const meta = {
    arrived: { icon: CheckCircle2, tone: 'success' as const },
    inside: { icon: DoorOpen, tone: 'success' as const },
    late: { icon: Clock, tone: 'warning' as const },
    absent: { icon: XCircle, tone: 'danger' as const },
    other: { icon: Building2, tone: 'brand' as const },
  }
  if (!tab) return null
  const list = rows.filter((r) => inTab(r, tab))
  return (
    <>
      <DrillModal
        open
        onClose={onClose}
        icon={meta[tab].icon}
        tone={meta[tab].tone}
        title={t('dashboard.drill.attendanceTitle')}
        subtitle={t('dashboard.drill.attendanceSub', { count: counts.total })}
        tabs={[
          { key: 'arrived', label: t('dashboard.donut.present'), count: counts.arrived },
          { key: 'inside', label: t('dashboard.insideNow'), count: counts.inside },
          { key: 'late', label: t('dashboard.donut.late'), count: counts.late },
          { key: 'absent', label: t('dashboard.donut.absent'), count: counts.absent },
          { key: 'other', label: t('dashboard.drill.otherReason'), count: counts.other },
        ]}
        active={tab}
        onTab={(k) => onTab(k as AttendanceTab)}
      >
        {(needle) => {
          const shown = list.filter((r) =>
            matchNeedle(needle, r.employee.legal_name, r.employee.department?.name, jobTitle(r.employee)),
          )
          if (shown.length === 0) return <DrillEmpty text={t('dashboard.drill.empty')} />
          return (
            <div className="flex flex-col">
              {shown.map((r) => {
                const st = getDisplayStatus(r)
                const time = formatTime(r.entry?.happen_time)
                return (
                  <PersonRow
                    key={r.id}
                    name={r.employee.legal_name ?? t('common.unknown')}
                    meta={[jobTitle(r.employee), ln(r.employee.department)].filter(Boolean).join(' · ')}
                    photo={r.employee.photo_thumb_path}
                    onClick={() => {
                      onClose()
                      openPerson({
                        id: r.employee.id,
                        name: r.employee.legal_name,
                        photo: r.employee.photo_thumb_path,
                        position: jobTitle(r.employee),
                        department: ln(r.employee.department) || undefined,
                      })
                    }}
                    right={
                      <>
                        {r.entry && <span className="text-[13px] font-bold tabular-nums text-fg">{time}</span>}
                        <DrillPill tone={st.tone === 'danger' ? 'danger' : r.category === 'late' ? 'warning' : st.tone === 'success' ? 'success' : 'neutral'}>
                          {r.category === 'late' ? t('dashboard.donut.late') : t(`status.${st.key}` as never)}
                        </DrillPill>
                      </>
                    }
                  />
                )
              })}
            </div>
          )
        }}
      </DrillModal>
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * IJRO INTIZOMI — the tallies open who each task belongs to
 * ══════════════════════════════════════════════════════════════════════════ */
