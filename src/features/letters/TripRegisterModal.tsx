import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer, ScrollText } from 'lucide-react'
import { apiGet } from '@/api/http'
import { LETTERS_LIST } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchInput } from '@/components/data/SearchInput'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { downloadFile } from '@/lib/download'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import { useBranchStore } from '@/store/branchStore'
import { LoadError } from '@/components/data/LoadError'

interface RegisterRow {
  id: number
  fio?: string | null
  position?: string | null
  guvohnoma_number?: string | null
  registered_number?: string | null
  decree_number?: string | null
  departure_date?: string | null
  arrival_date?: string | null
  destination?: string | null
  status?: string | null
  is_trip_confirmed?: boolean
}

const TONE: Record<string, BadgeTone> = {
  cancelled: 'danger',
  rejected: 'danger',
  report_approved: 'success',
  management_approved: 'brand',
}

/**
 * THE YEAR'S TRIP REGISTER — one row per business trip, the way the personnel
 * office keeps it on paper: who went, on what certificate number, where, and
 * whether they came back.
 *
 * This is not the letters list with a filter on it. The list answers "what is
 * happening with this document"; the register answers "who travelled this
 * year", which is the question an audit asks, and it is the thing that gets
 * exported and signed. v2 had no equivalent at all.
 */
export function TripRegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(thisYear))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const params = { year, organization_branch_id: branchId || undefined }
  const rows = useQuery({
    queryKey: ['trip-register', year, branchId],
    queryFn: () => apiGet<RegisterRow[]>(`${LETTERS_LIST}/trip-register`, params),
    enabled: open,
  })

  const years = useMemo(
    () => Array.from({ length: 6 }, (_, i) => String(thisYear - i)),
    [thisYear],
  )

  // The register is one year of one branch — small enough that narrowing it in
  // the browser is instant and does not need a round trip. The SERVER has no
  // search parameter here, which is why this one filter stays local.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = rows.data ?? []
    if (!needle) return all
    return all.filter((r) =>
      `${r.fio ?? ''} ${r.destination ?? ''} ${r.guvohnoma_number ?? ''} ${r.decree_number ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [rows.data, q])

  const exportXlsx = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadFile({
        url: `${LETTERS_LIST}/trip-register/export`,
        params,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `Safar_reyestri_${year}.xlsx`,
      })
    } catch (e) {
      setError(errorMessage(e, t('letters.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('letters.tripRegister')}
      size="lg"
      description={t('letters.tripRegisterHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          {/* v1 prints this register straight from the panel; v2 offered Excel
              only. `data-print-area` (see global.css) is what keeps the dimmed
              app behind the modal off the paper. */}
          <Button
            variant="secondary"
            leftIcon={<Printer size={15} />}
            disabled={(rows.data ?? []).length === 0}
            onClick={() => window.print()}
          >
            {t('letters.tripRegisterPrint')}
          </Button>
          <Button
            leftIcon={<Download size={15} />}
            loading={busy}
            disabled={(rows.data ?? []).length === 0}
            onClick={exportXlsx}
          >
            {t('letters.tripRegisterExport')}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          options={years.map((y) => ({ value: y, label: y }))}
          className="w-28"
        />
        <SearchInput value={q} onChange={setQ} placeholder={t('letters.searchPlaceholder')} />
        <span className="ml-auto text-[13px] tabular-nums text-fg-muted">
          {t('letters.tripRegisterCount', { count: shown.length })}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {rows.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.isError ? (
        <LoadError error={rows.error} onRetry={() => rows.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<ScrollText size={20} />} title={t('letters.tripRegisterEmpty')} />
      ) : (
        <div className="scroll-thin max-h-[52vh] overflow-auto">
          <table data-print-area className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={TH}>{t('letters.colEmployee')}</th>
                <th className={TH}>{t('letters.colGuvohnoma')}</th>
                <th className={TH}>{t('letters.colDestination')}</th>
                <th className={TH}>{t('letters.colDeparture')}</th>
                <th className={TH}>{t('letters.colArrival')}</th>
                <th className={TH}>{t('letters.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className={TD}>
                    <div className="font-medium text-fg">{r.fio?.trim() || '—'}</div>
                    {r.position && <div className="text-[12px] text-fg-subtle">{r.position}</div>}
                  </td>
                  <td className={TD_COMPACT}>{r.guvohnoma_number || r.registered_number || '—'}</td>
                  <td className={TD}>{r.destination || '—'}</td>
                  <td className={TD_COMPACT}>{r.departure_date ? formatAppDate(r.departure_date) : '—'}</td>
                  <td className={TD_COMPACT}>{r.arrival_date ? formatAppDate(r.arrival_date) : '—'}</td>
                  <td className={TD_COMPACT}>
                    <Badge tone={TONE[(r.status ?? '').toLowerCase()] ?? 'neutral'}>
                      {r.status || '—'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
