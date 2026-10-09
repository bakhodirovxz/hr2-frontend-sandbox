import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { formatAppDate, inTashkent } from '@/lib/format'
import { useTripAttendance } from './useLetters'

/** Timesheet statuses this panel can meet, mapped to a badge tone. */
const TONE: Record<string, BadgeTone> = {
  present: 'success',
  business_trip: 'brand',
  late: 'warning',
  absent: 'danger',
  annual_leave: 'neutral',
  day_off: 'neutral',
}

/**
 * DID THE TRIP ACTUALLY HAPPEN?
 *
 * KADR answers that from two things at once: the timesheet rows for the trip
 * days, and the raw turnstile passes in the same window — from the home branch
 * AND the destination, because a traveller shows up on both. v2 could open a
 * trip but never see either, so a trip could be approved and paid without
 * anyone being able to check it against the terminals.
 */
export function TripAttendancePanel({ letterId }: { letterId: number }) {
  const { t } = useTranslation()
  const { data, loading } = useTripAttendance(letterId)

  if (loading) return <Skeleton className="h-40 w-full" />
  const days = data?.days ?? []
  const events = data?.events ?? []
  if (!days.length && !events.length) {
    return <EmptyState title={t('letters.attendanceEmpty')} />
  }

  return (
    <div className="space-y-5">
      <Card className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-fg">{t('letters.attendanceDays')}</h3>
          {data?.date_from && (
            <p className="mt-0.5 text-xs text-fg-subtle">
              {formatAppDate(data.date_from)} — {data.date_to ? formatAppDate(data.date_to) : '—'}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('letters.colDate')}</th>
                <th className={TH}>{t('letters.colStatus')}</th>
                <th className={TH}>{t('letters.colIn')}</th>
                <th className={TH}>{t('letters.colOut')}</th>
                <th className={TH}>{t('letters.colHours')}</th>
                <th className={TH}>{t('letters.colBranch')}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className={TD}>{formatAppDate(d.date)}</td>
                  <td className={TD_COMPACT}>
                    {d.status ? (
                      <Badge tone={TONE[d.status] ?? 'neutral'}>{d.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={TD_COMPACT}>{d.first_entrance ? inTashkent(d.first_entrance).format('HH:mm') : '—'}</td>
                  <td className={TD_COMPACT}>{d.last_exit ? inTashkent(d.last_exit).format('HH:mm') : '—'}</td>
                  <td className={TD_COMPACT}>{d.work_hours ? d.work_hours.toFixed(1) : '—'}</td>
                  <td className={TD}>{(d.branch_names ?? []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {events.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-fg">{t('letters.attendanceEvents')}</h3>
          </div>
          <div className="scroll-thin max-h-[380px] overflow-y-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('letters.colTime')}</th>
                  <th className={TH}>{t('letters.colDirection')}</th>
                  <th className={TH}>{t('letters.colTurnstile')}</th>
                  <th className={TH}>{t('letters.colBranch')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className={TD_COMPACT}>{inTashkent(e.happen_time).format('DD.MM.YYYY HH:mm')}</td>
                    <td className={TD_COMPACT}>
                      {e.direction_type === 'exit' ? t('letters.dirExit') : t('letters.dirEntrance')}
                    </td>
                    <td className={TD}>{e.turnstile_name || '—'}</td>
                    <td className={TD}>{e.branch_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
