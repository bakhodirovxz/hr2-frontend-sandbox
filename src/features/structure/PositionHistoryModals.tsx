import dayjs from 'dayjs'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { UserRoundSearch } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { TD_COMPACT, TH } from '@/components/data/tableStyles'
import { ChangeLogList } from './ChangeLogList'
import { useOccupancyHistory, usePositionDetail, type OccupancyRow, type PositionRow } from './usePositionAdmin'

function Loading() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

/** Lavozim o'zgarishlari tarixi (`extra.change_log`, TZ 4.2.6 · 2051). */
export function PositionHistoryModal({ position, onClose }: { position: PositionRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const q = usePositionDetail(position?.id ?? null)
  return (
    <Modal
      open={!!position}
      onClose={onClose}
      size="md"
      title={t('orgAdmin.history')}
      description={position?.name}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ChangeLogList items={q.data?.extra?.change_log} />
      )}
    </Modal>
  )
}

const fmt = (d?: string | null) => (d && dayjs(d).isValid() ? dayjs(d).format('DD.MM.YYYY') : '—')
const basisText = (b: OccupancyRow['basis']) => (b && typeof b === 'object' ? b.label || b.number || '—' : b || '—')

/** TZ 4.2.6 · 2058 «Egallash tarixi» — kim, qachondan qachongacha, qaysi bo'limda, qaysi asos bilan. */
export function OccupancyHistoryModal({ position, onClose }: { position: PositionRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const q = useOccupancyHistory(position?.id ?? null)
  const rows = q.data ?? []
  return (
    <Modal
      open={!!position}
      onClose={onClose}
      size="lg"
      title={t('orgAdmin.occupancy')}
      description={position?.name}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<UserRoundSearch size={22} />} title={t('orgAdmin.occupancyEmpty')} />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[12px] font-semibold text-fg-muted">
                <th className={TH}>{t('orgAdmin.occEmployee')}</th>
                <th className={TH}>{t('orgAdmin.occDepartment')}</th>
                <th className={TH}>{t('orgAdmin.occFrom')}</th>
                <th className={TH}>{t('orgAdmin.occTo')}</th>
                <th className={TH}>{t('orgAdmin.occBasis')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.employee?.id ?? ''}-${r.from ?? ''}-${i}`} className="border-b border-line/60">
                  <td className={TD_COMPACT}>{r.employee?.name || '—'}</td>
                  <td className={`${TD_COMPACT} text-fg-muted`}>{ln(r.department) || '—'}</td>
                  <td className={`${TD_COMPACT} tabular-nums`}>{fmt(r.from)}</td>
                  <td className={`${TD_COMPACT} tabular-nums`}>
                    {r.to ? fmt(r.to) : <span className="text-success">{t('orgAdmin.occNow')}</span>}
                  </td>
                  <td className={`${TD_COMPACT} text-fg-muted`}>{basisText(r.basis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
