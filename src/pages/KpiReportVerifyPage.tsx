import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, BarChart3, CalendarRange, ShieldAlert, ShieldCheck, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DetailRow } from '@/components/data/DetailRow'
import { apiGet } from '@/api/http'
import { formatAppDate, formatDateTime } from '@/lib/format'

/**
 * KPI HISOBOTINI TEKSHIRISH — what the QR line in an approved report opens.
 *
 * `KpiReportService.verify_url` prints `/kpi/reports/{id}/verify?token=…` into
 * the workbook, but v2 had no such route: the reader scanned the code and
 * landed on the dashboard. Two factors, as with the letter and order stamps —
 * the report id AND its token; the login still applies on top.
 *
 * The token arrives as `?token=` from the backend. `?t=` is accepted too
 * because that is the spelling every other verify link in the product uses.
 */
interface KpiReportVerify {
  id: number
  title?: string | null
  period_start?: string | null
  period_end?: string | null
  row_count?: number | null
  status?: string | null
  signature_kind?: string | null
  approved_by_name?: string | null
  approved_by_position?: string | null
  approved_at?: string | null
  revoked_at?: string | null
  revoked_by_name?: string | null
  revoke_reason?: string | null
  superseded_by_id?: number | null
}

const STATUS_KEYS: Record<string, string> = {
  draft: 'kpiVerify.stDraft',
  pending: 'kpiVerify.stPending',
  approved: 'kpiVerify.stApproved',
  rejected: 'kpiVerify.stRejected',
  revoked: 'kpiVerify.stRevoked',
}

export function KpiReportVerifyPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? params.get('t') ?? ''

  const q = useQuery({
    enabled: !!id,
    queryKey: ['kpi-report-verify', id, token],
    queryFn: () => apiGet<KpiReportVerify>(`kpi/reports/${id}/verify`, { token }),
    retry: false,
  })

  const d = q.data
  const approved = d?.status === 'approved'
  // A reopened month: the printed copy is no longer in force.
  const revoked = d?.status === 'revoked'
  const period =
    d?.period_start && d?.period_end
      ? `${formatAppDate(d.period_start)} — ${formatAppDate(d.period_end)}`
      : null
  const approver = d?.approved_by_name
    ? [d.approved_by_name, d.approved_by_position].filter(Boolean).join(', ')
    : null

  return (
    <PageContainer>
      <PageHeader title={t('kpiVerify.title')} subtitle={t('kpiVerify.subtitle')} />

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError || !d ? (
        <Card className="p-6">
          <EmptyState
            icon={<ShieldAlert size={22} />}
            title={t('kpiVerify.notFound')}
            description={t('kpiVerify.notFoundHint')}
          />
        </Card>
      ) : (
        <Card className="p-card">
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-4">
            <span
              className={
                approved
                  ? 'grid h-10 w-10 place-items-center rounded-lg bg-success-soft text-success'
                  : revoked
                    ? 'grid h-10 w-10 place-items-center rounded-lg bg-danger-soft text-danger'
                    : 'grid h-10 w-10 place-items-center rounded-lg bg-warning-soft text-warning'
              }
            >
              {approved ? <BadgeCheck size={20} /> : revoked ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            </span>
            <span className="min-w-0">
              <span className={revoked ? 'block text-[15px] font-semibold text-danger' : 'block text-[15px] font-semibold text-fg'}>
                {approved ? t('kpiVerify.genuine') : revoked ? t('kpiVerify.revoked') : t('kpiVerify.found')}
              </span>
              <span className="block text-[12px] text-fg-subtle">
                {t('kpiVerify.report')} №{d.id}
              </span>
            </span>
            {d.status ? (
              <Badge tone={approved ? 'success' : revoked ? 'danger' : 'neutral'} className="ml-auto">
                {STATUS_KEYS[d.status] ? t(STATUS_KEYS[d.status] as never) : d.status}
              </Badge>
            ) : null}
          </div>

          {revoked && (
            <p className="mb-3 rounded-[var(--r-sm)] bg-danger-soft px-3 py-2 text-sm text-danger">{t('kpiVerify.revokedHint')}</p>
          )}
          <dl className="divide-y divide-line/60">
            <DetailRow icon={<BarChart3 size={14} />} label={t('kpiVerify.name')} value={d.title} />
            <DetailRow icon={<CalendarRange size={14} />} label={t('kpiVerify.period')} value={period} />
            <DetailRow icon={<BarChart3 size={14} />} label={t('kpiVerify.rowCount')} value={d.row_count} />
            <DetailRow icon={<User size={14} />} label={t('kpiVerify.approvedBy')} value={approver} />
            <DetailRow
              icon={<CalendarRange size={14} />}
              label={t('kpiVerify.approvedAt')}
              value={d.approved_at ? formatDateTime(d.approved_at) : null}
            />
            {revoked && (
              <>
                <DetailRow icon={<User size={14} />} label={t('kpiVerify.revokedBy')} value={d.revoked_by_name} />
                <DetailRow
                  icon={<CalendarRange size={14} />}
                  label={t('kpiVerify.revokedAt')}
                  value={d.revoked_at ? formatDateTime(d.revoked_at) : null}
                />
                <DetailRow icon={<ShieldAlert size={14} />} label={t('kpiVerify.revokeReason')} value={d.revoke_reason} />
                <DetailRow
                  icon={<BarChart3 size={14} />}
                  label={t('kpiVerify.supersededBy')}
                  value={d.superseded_by_id ? `${t('kpiVerify.report')} №${d.superseded_by_id}` : t('kpiVerify.notRefiled')}
                />
              </>
            )}
          </dl>
        </Card>
      )}
    </PageContainer>
  )
}
