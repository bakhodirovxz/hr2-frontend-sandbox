import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadError } from '@/components/data/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { formatAppDate } from '@/lib/format'

interface Checkup {
  id: number
  checkup_date?: string | null
  specialty_name?: string | null
  conclusion?: string | null
  status?: string | null
  doctor_name?: string | null
  note?: string | null
}
interface AnnualIndex {
  id: number
  year?: number | null
  health_index?: string | null
  index_note?: string | null
  set_by_name?: string | null
  set_at?: string | null
}

/** The health index is a verdict, so it gets a verdict's colour. */
const INDEX_TONE: Record<string, BadgeTone> = {
  excellent: 'success',
  good: 'success',
  satisfactory: 'warning',
  poor: 'danger',
  unfit: 'danger',
}

/**
 * THE PERSON'S MEDICAL RECORD, as their card shows it.
 *
 * Two different things live here and they are not interchangeable: the
 * individual examinations (what happened, when, what the doctor concluded) and
 * the ANNUAL health index, which is one summary verdict per year and is what
 * the personnel office actually reports on. v2 showed neither, so a medical
 * examination could be recorded and then never read from the employee's own
 * card — only from the medical module's own list.
 */
export function ProfileMedicalTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()

  const checkups = useQuery({
    queryKey: ['emp-checkups', employeeId],
    queryFn: () => apiGet<Checkup[]>(`medical/employees/${employeeId}/checkups`),
  })
  const indexes = useQuery({
    queryKey: ['emp-annual-indexes', employeeId],
    queryFn: () => apiGet<AnnualIndex[]>(`medical/employees/${employeeId}/annual-indexes`),
  })

  const rows = Array.isArray(checkups.data) ? checkups.data : []
  const years = Array.isArray(indexes.data) ? indexes.data : []

  return (
    <div className="space-y-5">
      <Card className="p-0">
        <div className="px-4 pt-4">
          <CardHeader title={t('profile.annualIndexTitle')} />
        </div>
        {indexes.isLoading ? (
          <div className="p-4"><Skeleton className="h-20 w-full" /></div>
        ) : years.length === 0 ? (
          <EmptyState title={t('profile.noMedical')} />
        ) : (
          <div className="flex flex-wrap gap-3 p-4 pt-0">
            {years.map((y) => (
              <div key={y.id} className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                <div className="text-[11.5px] font-semibold text-fg-muted">
                  {y.year ?? '—'}
                </div>
                <div className="mt-1">
                  <Badge tone={INDEX_TONE[(y.health_index ?? '').toLowerCase()] ?? 'neutral'}>
                    {y.health_index || '—'}
                  </Badge>
                </div>
                {y.index_note && <p className="mt-2 max-w-[220px] text-xs text-fg-muted">{y.index_note}</p>}
                {y.set_by_name && (
                  <p className="mt-1 text-[11px] text-fg-subtle">{y.set_by_name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-4">
          <CardHeader title={t('profile.checkupsTitle')} />
        </div>
        {checkups.isLoading ? (
          <div className="p-4"><Skeleton className="h-24 w-full" /></div>
        ) : checkups.isError ? (
          /* A failed request must not read as "this employee has no checkups". */
          <div className="p-4"><LoadError error={checkups.error} onRetry={() => checkups.refetch()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('profile.noCheckups')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('profile.colCheckupDate')}</th>
                  <th className={TH}>{t('profile.colCheckupType')}</th>
                  <th className={TH}>{t('profile.colConclusion')}</th>
                  <th className={TH}>{t('profile.colDoctor')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className={TD_COMPACT}>
                      {c.checkup_date ? formatAppDate(c.checkup_date) : '—'}
                    </td>
                    {/* `checkup_type` never existed on the server; the specialty is what a check-up IS. */}
                    <td className={TD}>{c.specialty_name || '—'}</td>
                    <td className={TD}>{c.conclusion || c.status || '—'}</td>
                    <td className={TD}>{c.doctor_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
