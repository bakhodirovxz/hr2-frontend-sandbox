import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CalendarClock, Clock, LogIn, TimerOff } from 'lucide-react'
import { useAttendance } from '@/features/attendance/useAttendance'
import { cn } from '@/lib/cn'

/**
 * THIS MONTH, AT THE TOP OF THE PROFILE (redesign 2026-09-24).
 *
 * The overview tab showed six fields and a screen of empty space; the first
 * thing a manager opening a card wants is «how is this person doing lately».
 * Same source as «Davomatim» (the attendance summary, month to today — asking
 * past today would count future days as absent). Each figure opens the
 * personal tabel for the detail.
 */
export function ProfileMonthStrip({ employeeId, onOpenTabel }: { employeeId: number; onOpenTabel: () => void }) {
  const { t } = useTranslation()
  const from = dayjs().startOf('month').format('YYYY-MM-DD')
  const to = dayjs().format('YYYY-MM-DD')
  const { rows, loading } = useAttendance({ from, to, page: 1, size: 1, employeeId })
  const me = rows.find((r) => r.id === employeeId)
  const a = me?.attendance
  if (!loading && !a) return null
  const months = t('date.months', { returnObjects: true }) as string[]
  const items = [
    { icon: <LogIn size={16} />, tone: 'from-[#34D399] to-[#059669]', label: t('myAttendance.present'), value: a?.present_days_count },
    { icon: <Clock size={16} />, tone: 'from-[#FCD34D] to-[#F59E0B]', label: t('myAttendance.late'), value: a?.late_days_count },
    { icon: <TimerOff size={16} />, tone: 'from-[#FB7185] to-[#E11D48]', label: t('myAttendance.absent'), value: a?.absent_days_count },
    { icon: <CalendarClock size={16} />, tone: 'from-[#8B5CF6] to-[#6D28D9]', label: t('myAttendance.hours'), value: a ? Math.round(a.work_duration_hours ?? 0) : undefined },
  ]
  return (
    <div className="mb-4">
      <p className="mb-2 text-[12.5px] font-semibold text-fg-muted first-letter:uppercase">{t('employeeProfile.thisMonth', { month: months[dayjs().month()] })}</p>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={onOpenTabel}
            className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-sm transition-[transform,border-color] hover:-translate-y-0.5 hover:border-brand/40"
          >
            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', it.tone)}>{it.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-fg-muted">{it.label}</span>
              <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{loading ? '…' : (it.value ?? 0)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
