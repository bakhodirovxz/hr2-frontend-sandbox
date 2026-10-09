import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, FileText, ShieldAlert, Stamp } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DetailRow } from '@/components/data/DetailRow'
import { apiGet } from '@/api/http'
import { joinApiUrl } from '@/api/client'
import { formatAppDate, formatDateTime } from '@/lib/format'
import { letterStatusKey } from '@/features/letters/useLetters'

/*
 * DOCUMENT VERIFICATION — what the QR stamp on a printed document opens.
 *
 * The payload is deliberately MINIMAL (no passport data, no body text): the
 * question being answered is "is this piece of paper genuine and who signed
 * it", and the answer travels to whoever is holding the paper.
 *
 * Login is still required, and the `t` token from the QR has to match — a
 * document id alone is not a key.
 */
interface Signer {
  name?: string | null
  position?: string | null
  role?: string | null
  agreed?: boolean | null
  acted_at?: string | null
}

interface VerifyPayload {
  id: number
  type_label?: string | null
  number?: string | null
  date?: string | null
  status?: string | null
  is_stamped?: boolean
  registered_number?: string | null
  registered_date?: string | null
  branch?: string | null
  signers?: Signer[]
  rejection_reason?: string | null
  return_reason?: string | null
}

export function DocumentVerifyPage({ kind }: { kind: 'letter' | 'order' }) {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') || undefined
  const base = kind === 'letter' ? 'letters' : 'order-acts'

  const q = useQuery({
    enabled: !!id,
    queryKey: ['verify', kind, id, token],
    queryFn: () => apiGet<VerifyPayload>(`${base}/${id}/verify`, token ? { t: token } : undefined),
    retry: false,
  })

  const d = q.data

  return (
    <PageContainer>
      <PageHeader title={t('verify.title')} subtitle={t('verify.subtitle')} />

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : q.isError || !d ? (
        <Card className="p-6">
          <EmptyState icon={<ShieldAlert size={22} />} title={t('verify.notFound')} description={t('verify.notFoundHint')} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_20rem] xl:items-start">
          <Card className="p-card">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-success-soft text-success">
                <BadgeCheck size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-fg">{d.type_label || t('verify.document')}</span>
                <span className="block text-[12px] text-fg-subtle">{d.branch || '—'}</span>
              </span>
              {d.is_stamped && (
                <Badge tone="success" className="ml-auto">
                  <Stamp size={12} /> {t('verify.stamped')}
                </Badge>
              )}
            </div>

            <dl className="divide-y divide-line/60">
              <DetailRow label={t('verify.number')} value={d.registered_number || d.number || '—'} />
              <DetailRow label={t('verify.date')} value={formatAppDate(d.registered_date || d.date) || '—'} />
              {/* The raw status is a backend token (`pending_registration`);
                  reuse the letters screen's own mapping so the same document
                  never reads two different ways in the product. */}
              <DetailRow label={t('verify.status')} value={d.status ? statusLabel(t, d.status) : '—'} />
            </dl>

            {(d.rejection_reason || d.return_reason) && (
              <p className="mt-3 rounded-inner border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                {d.rejection_reason || d.return_reason}
              </p>
            )}

            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              leftIcon={<FileText size={14} />}
              onClick={() => window.open(joinApiUrl(`${base}/${id}/verify/pdf${token ? `?t=${token}` : ''}`), '_blank')}
            >
              {t('verify.openPdf')}
            </Button>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-[14px] font-semibold text-fg">{t('verify.signers')}</h3>
            </div>
            {(d.signers ?? []).length === 0 ? (
              <p className="px-4 py-3 text-[12.5px] text-fg-subtle">{t('verify.noSigners')}</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {(d.signers ?? []).map((s, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">{s.name || '—'}</span>
                        <span className="block truncate text-[11.5px] text-fg-subtle">{s.position || '—'}</span>
                      </span>
                      <Badge tone={(s.agreed ? 'success' : s.agreed === false ? 'danger' : 'neutral') as BadgeTone}>
                        {s.agreed ? t('verify.agreed') : s.agreed === false ? t('verify.refused') : t('verify.waiting')}
                      </Badge>
                    </div>
                    {s.acted_at && <p className="mt-0.5 text-[11px] tabular-nums text-fg-subtle">{formatDateTime(s.acted_at)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  )
}

const STATUS_KEYS = {
  draft: 'letters.stDraft',
  agreeing: 'letters.stAgreeing',
  signed: 'letters.stSigned',
  registered: 'letters.stRegistered',
  chancellery: 'letters.stChancellery',
  pendingReg: 'letters.stPendingReg',
  management: 'letters.stManagement',
  report: 'letters.stReport',
  rejected: 'letters.stRejected',
  returned: 'letters.stReturned',
} as const

function statusLabel(t: TFunction, status: string): string {
  return t(STATUS_KEYS[letterStatusKey(status)] as never)
}

