import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadError } from '@/components/data/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { formatAppDate } from '@/lib/format'

interface Checkup {
  id: number
  checkup_date?: string | null
  checkup_type?: string | null
  conclusion?: string | null
  status?: string | null
  doctor_name?: string | null
}

/**
 * MY OWN medical examinations.
 *
 * A separate endpoint from the personnel one on purpose: this asks "mine",
 * not "employee 2288's", so it needs no permission to read another person's
 * health record and works for every employee. v2 had no way for someone to see
 * their own examinations at all — they had to ask the clinic.
 */
export function MyMedicalTab() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['my-medical-checkups'],
    // The endpoint answers `{ checkups, annual_indexes }` (MedicalService.
    // my_medical_record) — this tab read it as a bare array since it was
    // written, so every employee saw «Ko‘rik yozuvi yo‘q» whatever the clinic
    // had recorded (found by the 2026-09-22 checkup chain test).
    queryFn: () => apiGet<{ checkups?: Checkup[] } | Checkup[]>(`${EMPLOYEES_LIST}/me/medical-checkups`),
  })
  const rows = Array.isArray(q.data) ? q.data : (q.data?.checkups ?? [])

  return (
    <Card className="p-0">
      <div className="px-4 pt-4">
        <CardHeader title={t('profile.checkupsTitle')} />
      </div>
      {q.isLoading ? (
        <div className="p-4"><Skeleton className="h-24 w-full" /></div>
      ) : q.isError ? (
        /* "No checkups on record" is a claim about this person's health file —
           it must not be what a failed request looks like. */
        <div className="p-4"><LoadError error={q.error} onRetry={() => q.refetch()} /></div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('profile.noCheckups')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
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
                  <td className={TD_COMPACT}>{c.checkup_date ? formatAppDate(c.checkup_date) : '—'}</td>
                  <td className={TD}>{c.checkup_type || '—'}</td>
                  <td className={TD}>{c.conclusion || c.status || '—'}</td>
                  <td className={TD}>{c.doctor_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
