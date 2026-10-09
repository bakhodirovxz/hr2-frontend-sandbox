import { useTranslation } from 'react-i18next'
import { Donut, DonutLegend, type DonutSlice } from './Donut'
import { PanelEmpty } from './Panel'
import type { TabelTally } from './useEmployeeBoard'

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
