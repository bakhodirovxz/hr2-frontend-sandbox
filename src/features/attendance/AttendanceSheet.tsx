import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Download, ExternalLink, PencilLine } from 'lucide-react'
import dayjs from 'dayjs'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile } from '@/lib/download'
import { formatAppDate } from '@/lib/format'
import { useBranchStore } from '@/store/branchStore'
import { ProfileTabelTab } from '@/features/employees/profile/ProfileTabs'
import { CalendarStrip } from './CalendarStrip'
import type { AttendanceRow } from './useAttendance'

/**
 * One person's timesheet, opened from a row of the attendance list — v1's
 * `EmployeeAttendanceDetailDrawer`.
 *
 * The row used to navigate to the profile's «Tabel» tab: the list, its
 * filters and its scroll were gone, and «back» from the profile landed on the
 * employees page. The sheet keeps the list in place behind it; the profile is
 * still one click away (a real link — it opens in a new tab too).
 */
export function AttendanceSheet({
  row,
  from,
  to,
  onClose,
  onCorrect,
}: {
  row: AttendanceRow | null
  from: string
  to: string
  onClose: () => void
  /** HR only: the manual day correction (TZ I2). */
  onCorrect?: (row: AttendanceRow) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [exporting, setExporting] = useState(false)
  if (!row) return null

  const a = row.attendance
  const job = typeof row.job_position === 'string' ? row.job_position : row.job_position?.name
  const early = Object.entries(a.daily_early_leave ?? {}).sort(([x], [y]) => x.localeCompare(y))

  const exportOne = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: 'turnstile-attendance-events/normalized/export-excel',
        params: {
          employee_id: row.id,
          date_from: from,
          date_to: to,
          organization_branch_id: branchId || undefined,
        },
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${t('attendance.title')}_${(row.legal_name ?? '').replace(/\s+/g, '_')}_${from}_${to}.xlsx`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setExporting(false)
    }
  }

  const stats: [string, string, string][] = [
    [t('attendance.colPresent'), `${a.present_days_count ?? 0} ${t('attendance.daysUnit')}`, 'text-success'],
    [t('attendance.colAbsent'), `${a.absent_days_count ?? 0} ${t('attendance.daysUnit')}`, 'text-warning'],
    [t('attendance.colLate'), `${a.late_days_count ?? 0} ${t('attendance.timesUnit')}`, 'text-danger'],
    [
      t('attendance.colHours'),
      `${(a.work_duration_hours ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${t('attendance.hoursUnit')}`,
      'text-fg',
    ],
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
          {onCorrect && (
            <Button variant="secondary" leftIcon={<PencilLine size={14} />} onClick={() => onCorrect(row)}>
              {t('manual.action')}
            </Button>
          )}
          <Link
            to={`/employees/${row.id}?tab=tabel`}
            className="inline-flex h-btn items-center gap-1.5 rounded-btn bg-brand px-4 text-btn font-medium text-fg-on-brand transition-colors hover:bg-brand/90"
          >
            {t('attendance.openProfile')}
            <ExternalLink size={14} />
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name ?? ''} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{row.department?.name ?? '—'}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-muted">
              <CalendarDays size={13} className="shrink-0 text-brand" />
              {formatAppDate(from)} — {formatAppDate(to)}
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

        {early.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-info">
              {t('attendance.colEarly')}: {early.length} {t('attendance.timesUnit')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {early.map(([date, v]) => (
                <span
                  key={date}
                  title={t('attendance.earlyWorkEnd', { time: v?.work_end ?? '' })}
                  className="tabnum inline-flex items-center gap-1 rounded-inner border border-info/30 bg-info/10 px-2 py-0.5 text-[11.5px] text-info"
                >
                  <span className="text-fg-muted">{dayjs(date).format('DD.MM')}</span>
                  <b>{v?.left_at}</b>
                  {v?.work_end && <span className="text-fg-subtle">({v.work_end})</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-inner border border-line p-3">
          <CalendarStrip calendar={a.calendar ?? {}} from={from} to={to} />
        </div>

        <ProfileTabelTab employeeId={row.id} initialMonth={to} showLegend={false} />
      </div>
    </Modal>
  )
}
