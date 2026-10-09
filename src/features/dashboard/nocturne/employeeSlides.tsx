import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Briefcase, UserRound } from 'lucide-react'
import type { LeaveRequest } from '@/features/leave/useLeave'
import { Donut, DonutLegend, type DonutSlice } from './Donut'
import { PanelEmpty } from './Panel'
import { IconCell, ListRow, RowList, StatusPill, type RowTone } from './rows'
import type { TabelTally } from './useEmployeeBoard'

type RequestRow = LeaveRequest & { statusKey: 'pending' | 'signed' | 'rejected' }

const STATUS_TONE: Record<RequestRow['statusKey'], RowTone> = {
  pending: 'warning',
  signed: 'success',
  rejected: 'danger',
}

/* ── So'rovlarim ────────────────────────────────────────────────────────── */

export function RequestsFace({ requests }: { requests: RequestRow[] }) {
  const { t } = useTranslation()
  if (requests.length === 0) return <PanelEmpty text={t('leave.empty')} />
  return (
    <RowList className="pt-1">
      {requests.map((r) => {
        const work = (r.type ?? '').toLowerCase() === 'work'
        const period =
          r.start_date === r.end_date
            ? dayjs(r.start_date).format('DD.MM.YYYY')
            : `${dayjs(r.start_date).format('DD.MM')} — ${dayjs(r.end_date).format('DD.MM.YYYY')}`
        return (
          <ListRow key={r.id} filled className="max-h-[58px]">
            <IconCell icon={work ? Briefcase : UserRound} tone={work ? 'info' : 'brand'} size={30} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium text-fg">
                {work ? t('leave.typeWork') : t('leave.typePersonal')}
              </span>
              <span className="truncate text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                {period}
              </span>
            </span>
            <StatusPill tone={STATUS_TONE[r.statusKey]}>
              {t(
                r.statusKey === 'pending'
                  ? 'leave.statusPending'
                  : r.statusKey === 'signed'
                    ? 'leave.statusSigned'
                    : 'leave.statusRejected',
              )}
            </StatusPill>
          </ListRow>
        )
      })}
    </RowList>
  )
}

/* ── Tabel (joriy oy) ───────────────────────────────────────────────────── */

/**
 * The month as the tabel keeps it: how many of the days that COUNT were
 * actually worked. Weekends and holidays are excluded from both the ring and
 * its denominator — a 21-day month must not read as 70% because it has ten
 * days off in it.
 */
export function TabelFace({ tabel }: { tabel: TabelTally }) {
  const { t } = useTranslation()
  const slices: DonutSlice[] = [
    { key: 'present', label: t('attendance.stPresent'), value: tabel.present, token: '--chart-1' },
    { key: 'late', label: t('attendance.stLate'), value: tabel.late, token: '--chart-2' },
    { key: 'absent', label: t('attendance.stAbsent'), value: tabel.absent, token: '--chart-3' },
    { key: 'leave', label: t('attendance.stLeave'), value: tabel.leave, token: '--chart-4' },
    { key: 'trip', label: t('attendance.stTrip'), value: tabel.trip, token: '--chart-5' },
    { key: 'sick', label: t('attendance.stSick'), value: tabel.sick, token: '--chart-6' },
  ].filter((s) => s.value > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-5 px-4 pb-3 pt-2 sm:flex-row sm:px-5">
      <Donut
        slices={slices.length ? slices : [{ key: 'none', label: '', value: 0, token: '--chart-6' }]}
        total={`${tabel.present + tabel.late}/${tabel.counted}`}
        caption={t('dashboard.board.workDays')}
      />
      {slices.length ? (
        <DonutLegend slices={slices} />
      ) : (
        <PanelEmpty text={t('dashboard.board.tabelEmpty')} />
      )}
    </div>
  )
}
