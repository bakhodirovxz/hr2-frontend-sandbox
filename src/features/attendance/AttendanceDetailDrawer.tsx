import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CalendarDays, Clock, Download, ExternalLink, PencilLine } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { TURNSTILE_ATTENDANCE_EVENTS } from '@/api/endpoints'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { isScheduledWeekday } from '@/lib/workCycle'
import { CAL_COLOR, CAL_LABEL, mapCalStatus } from './attendanceStatus'
import { ManualRecordsList } from './ManualRecordsList'
import { MonthCalendar } from './MonthCalendar'
import { daysBetween, dmy, formatHours } from './period'
import { useManualRows } from './useManualAttendance'
import type { AttendanceRow } from './useAttendance'

/**
 * BITTA XODIMNING DAVOMATI — ro'yxat qatoridan ochiladigan yon panel (v1
 * `EmployeeAttendanceDetailDrawer`): davr ko'rsatkichlari, davr kalendari,
 * oylik kalendar (kun tafsiloti bilan), shu davrda qo'lda kiritilgan kunlar,
 * bitta xodim tabeli Excel'da. Ro'yxat, filtrlar va aylantirish orqada
 * joyida qoladi.
 */
export function AttendanceDetailDrawer({
  row,
  from,
  to,
  canCorrect,
  onClose,
  onCorrect,
}: {
  row: AttendanceRow | null
  from: string
  to: string
  /** `attendance >= edit` — qo'lda tuzatish va tuzatishlar ro'yxati. */
  canCorrect: boolean
  onClose: () => void
  onCorrect: (row: AttendanceRow) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [month, setMonth] = useState(() => dayjs(to).startOf('month'))
  useEffect(() => setMonth(dayjs(to).startOf('month')), [to, row?.id])
  const { rows: manualRows } = useManualRows(row?.id ?? null, { from, to }, canCorrect && !!row)

  if (!row) return null

  const a = row.attendance
  const calendar = a.calendar ?? {}
  const job = typeof row.job_position === 'string' ? row.job_position : row.job_position?.name
  const early = Object.values(calendar).filter((v) => mapCalStatus(v) === 'early_leave').length
  // Kelmagan kunlar kalendardan, faqat xodimning ISH kunlarida (v1 bilan bir xil).
  const absent = Object.entries(calendar).filter(
    ([d, v]) => mapCalStatus(v) === 'absent' && isScheduledWeekday(row, d),
  ).length

  const exportOne = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: `${TURNSTILE_ATTENDANCE_EVENTS}/employees/${row.id}/export-excel`,
        params: { date_from: from, date_to: to, _no_branch_inject: true },
        mime: XLSX_MIME,
        filename: `Davomat_${(row.legal_name ?? 'xodim').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '_')}_${dmy(from)}-${dmy(to)}.xlsx`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('davomat.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const stats: [string, string, string][] = [
    [t('davomat.colPresent'), t('davomat.nDays', { n: a.present_days_count ?? 0 }), 'text-success'],
    [t('davomat.colAbsent'), t('davomat.nDays', { n: absent }), 'text-warning'],
    [t('davomat.colLate'), t('davomat.nTimes', { n: a.late_days_count ?? 0 }), 'text-danger'],
    [t('davomat.colHours'), t('davomat.nHours', { n: formatHours(a.work_duration_hours) }), 'text-fg'],
  ]

  return (
    <Modal
      open
      onClose={onClose}
      placement="right"
      size="md"
      title={row.legal_name ?? ''}
      description={job ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canCorrect && (
            <Button variant="secondary" leftIcon={<PencilLine size={14} />} onClick={() => onCorrect(row)}>
              {t('davomat.manualAction')}
            </Button>
          )}
          <Link
            to={`/employees/${row.id}`}
            className="inline-flex h-btn items-center gap-1.5 rounded-btn bg-brand px-4 text-btn font-medium text-fg-on-brand transition-colors hover:bg-brand/90"
          >
            {t('davomat.openProfile')}
            <ExternalLink size={14} />
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name ?? ''} size={56} />
          <div className="min-w-0 flex-1">
            <Badge tone="brand" className="max-w-full truncate">
              {row.department?.name ?? '—'}
            </Badge>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-muted">
              <CalendarDays size={13} className="shrink-0 text-brand" />
              {dmy(from)} — {dmy(to)}
            </p>
          </div>
          <Button size="sm" variant="secondary" leftIcon={<Download size={14} />} loading={exporting} onClick={exportOne}>
            Excel
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {stats.map(([label, value, tone]) => (
            <div key={label} className="rounded-inner border border-line bg-surface-2/60 px-3 py-2">
              <p className="text-[11px] text-fg-muted">{label}</p>
              <p className={`tabnum text-[16px] font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        {early > 0 && (
          <p className="text-[12px] font-medium text-info">
            {t('davomat.colEarly')}: {t('davomat.nTimes', { n: early })}
          </p>
        )}

        <PeriodCalendar calendar={calendar} from={from} to={to} />

        <div className="rounded-inner border border-line p-3">
          <MonthCalendar employee={row} month={month} onMonthChange={setMonth} compact />
        </div>

        {canCorrect && manualRows.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-fg">
              <Clock size={13} className="text-brand" />
              {t('davomat.manualDays')}
            </p>
            <ManualRecordsList rows={manualRows} compact />
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Davrning har kuni — nuqta va sana raqami (v1 «Davr bo'yicha»). */
function PeriodCalendar({ calendar, from, to }: { calendar: Record<string, string>; from: string; to: string }) {
  const { t } = useTranslation()
  const days = daysBetween(from, to)
  return (
    <div className="rounded-inner border border-line p-3">
      <p className="mb-2 text-[11.5px] font-semibold text-fg-muted">{t('davomat.byPeriod')}</p>
      <div className="flex flex-wrap gap-1">
        {days.map((d) => {
          const s = mapCalStatus(calendar[d])
          return (
            <Tooltip key={d} text={`${dmy(d)} — ${t(`attendance.${CAL_LABEL[s]}`)}`}>
              <span className="flex w-[18px] flex-col items-center gap-0.5">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `rgb(var(${CAL_COLOR[s]}))` }} />
                <span className="text-[8.5px] leading-none text-fg-subtle">{d.slice(8)}</span>
              </span>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
