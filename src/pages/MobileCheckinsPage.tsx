import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, ExternalLink, MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { BulkBar } from '@/components/data/BulkBar'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useListParams } from '@/hooks/useListParams'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { fetchAllPages } from '@/api/fetchAll'
import { MOBILE_CHECKINS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { formatDateTime } from '@/lib/format'
import { isInvalidRange } from '@/lib/dateRange'
import { CancelCheckinDialog } from '@/features/mobileCheckins/CancelCheckinDialog'
import {
  formatDistance,
  useCancelCheckin,
  useMobileCheckins,
  type CheckinStatusFilter,
  type MobileCheckin,
} from '@/features/mobileCheckins/useMobileCheckins'

const FILTER_KEYS = ['from', 'to', 'status', 'far'] as const

/**
 * MOBIL BELGILAR — xizmat safaridagi xodimlarning telefondan qo'ygan
 * «keldim/ketdim» belgilari (2026-10-06).
 *
 * Kadr rasm, joy va manzildan masofani ko'radi; manzildan uzoqda qo'yilgan
 * belgi qizil. Shubhali belgini bekor qiladi — davomatdagi o'tish o'chadi,
 * belgi «bekor qilingan» bo'lib iz sifatida qoladi, xodimga sabab boradi.
 * Xuddi shu belgilar «Jonli tashrif» lentasida ham turadi va o'sha yerdan ham
 * bekor qilinadi.
 */
function MobileCheckinsPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)
  const rangeInvalid = isInvalidRange(filters.from, filters.to)
  const status = (filters.status || '') as CheckinStatusFilter
  const farOnly = filters.far === '1'

  const { rows, total, pages, loading, fetching, error, refetch } = useMobileCheckins(
    { search, from: filters.from, to: filters.to, status, farOnly, page, size },
    { enabled: !rangeInvalid },
  )
  const cancel = useCancelCheckin()
  const bulk = useBulkAction()

  // Faqat faol belgini bekor qilish mumkin — tanlov ham shular bilan.
  const actionable = useMemo(() => rows.filter((r) => r.status === 'active'), [rows])
  const listParams = {
    organization_branch_id: branchId || undefined,
    search: search.trim() || undefined,
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    status: 'active',
    far_only: farOnly || undefined,
  }
  const selection = useRowSelection(actionable, {
    // «Hammasini tanlash» faqat faol belgilar filtrida: umumiy `total`
    // bekor qilinganlarni ham sanaydi, tanlab bo'lmaydiganlarini esa emas.
    total: status === 'active' ? total : undefined,
    loadAllIds: () => fetchAllPages<MobileCheckin>(MOBILE_CHECKINS, listParams, 100, 60).then((r) => r.map((x) => x.id)),
    resetKey: JSON.stringify([branchId, search, filters]),
  })

  const [cancelling, setCancelling] = useState<MobileCheckin | 'bulk' | null>(null)
  const [cancelError, setCancelError] = useState('')

  const doCancel = async (reason: string) => {
    setCancelError('')
    if (cancelling === 'bulk') {
      const ids = selection.selectedIds
      const failed = await bulk.run(ids, (id) => cancel.mutateAsync({ id, reason }))
      setCancelling(null)
      selection.clear()
      if (failed.length) toast.error(t('list.bulkPartialFail', { count: failed.length }))
      else toast.ok(t('mobileCheckins.cancelledMany', { count: ids.length }))
      return
    }
    if (!cancelling) return
    try {
      await cancel.mutateAsync({ id: cancelling.id, reason })
      setCancelling(null)
      toast.ok(t('mobileCheckins.cancelled'))
    } catch (e) {
      setCancelError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<MobileCheckin>[] = [
    {
      key: 'employee',
      header: t('mobileCheckins.colEmployee'),
      label: t('mobileCheckins.colEmployee'),
      lockVisible: true,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          {/* The photo the phone sent — click opens it full size. */}
          {r.photo_thumb_path || r.photo_path ? (
            <a href={r.photo_path || r.photo_thumb_path || '#'} target="_blank" rel="noopener noreferrer" title={t('mobileCheckins.openPhoto')}>
              <img src={r.photo_thumb_path || r.photo_path || ''} alt="" className="h-10 w-10 shrink-0 rounded-inner object-cover" />
            </a>
          ) : (
            <Avatar name={r.employee?.legal_name ?? ''} src={r.employee?.photo_thumb_path ?? undefined} size={40} />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-fg">{r.employee?.legal_name || '—'}</span>
            <span className="block truncate text-[11.5px] text-fg-subtle">
              {typeof r.employee?.department === 'object' && r.employee?.department
                ? (r.employee.department as { name?: string }).name
                : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'time',
      header: t('mobileCheckins.colTime'),
      label: t('mobileCheckins.colTime'),
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="text-[12.5px] tabular-nums text-fg">{formatDateTime(r.happen_time)}</span>
          <span className={r.direction_type === 'entrance' ? 'text-[11px] font-semibold text-success' : 'text-[11px] font-semibold text-fg-muted'}>
            {r.direction_type === 'entrance' ? t('dashboard.passIn') : t('dashboard.passOut')}
          </span>
        </span>
      ),
    },
    {
      key: 'place',
      header: t('mobileCheckins.colNearest'),
      label: t('mobileCheckins.colNearest'),
      cell: (r) =>
        r.nearest_location ? (
          <span className="flex flex-col leading-tight">
            <span className="text-[12.5px] text-fg">{r.nearest_location.name}</span>
            {r.nearest_location.organization_branch?.name && (
              <span className="text-[11px] text-fg-subtle">{r.nearest_location.organization_branch.name}</span>
            )}
          </span>
        ) : (
          <span className="text-[12px] text-fg-subtle">{r.destination_branch?.name || '—'}</span>
        ),
    },
    {
      key: 'distance',
      header: t('mobileCheckins.colDistance'),
      label: t('mobileCheckins.colDistance'),
      sortValue: (r) => r.distance_m ?? -1,
      cell: (r) =>
        r.distance_m == null ? (
          <span className="text-[12px] text-fg-subtle">{t('mobileCheckins.distanceUnknown')}</span>
        ) : (
          <Badge tone={r.is_far ? 'danger' : 'success'}>
            {r.is_far ? t('mobileCheckins.far', { distance: formatDistance(r.distance_m) }) : formatDistance(r.distance_m)}
          </Badge>
        ),
    },
    {
      key: 'location',
      header: t('mobileCheckins.colLocation'),
      label: t('mobileCheckins.colLocation'),
      cell: (r) => (
        <a
          href={r.map_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] tabular-nums text-brand-strong hover:underline"
        >
          <MapPin size={12} />
          {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
          <ExternalLink size={11} className="opacity-60" />
          {r.accuracy_m != null && <span className="text-fg-subtle"> ±{Math.round(r.accuracy_m)} m</span>}
        </a>
      ),
    },
    {
      key: 'status',
      header: t('mobileCheckins.colStatus'),
      label: t('mobileCheckins.colStatus'),
      cell: (r) =>
        r.status === 'cancelled' ? (
          <span className="flex flex-col leading-tight" title={r.cancel_reason ?? undefined}>
            <Badge tone="neutral">{t('mobileCheckins.statusCancelled')}</Badge>
            <span className="mt-0.5 max-w-[14rem] truncate text-[11px] text-fg-subtle">
              {r.cancelled_by?.legal_name ? `${r.cancelled_by.legal_name}: ` : ''}{r.cancel_reason}
            </span>
          </span>
        ) : (
          <Badge tone="info">{t('mobileCheckins.statusActive')}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      lockVisible: true,
      className: 'pr-4 text-right',
      cell: (r) =>
        r.status === 'active' ? (
          <IconButton size="sm" label={t('mobileCheckins.cancel')} onClick={() => setCancelling(r)}>
            <Ban size={15} />
          </IconButton>
        ) : null,
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('mobileCheckins.title')} subtitle={t('mobileCheckins.subtitle')} />

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('mobileCheckins.searchPlaceholder')} className="flex-1 lg:max-w-sm" />
          <div className="flex items-center gap-2">
            <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} aria-label={t('tempOrders.from')} className="w-40" invalid={rangeInvalid} />
            <span className="text-fg-subtle">—</span>
            <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} aria-label={t('tempOrders.to')} className="w-40" invalid={rangeInvalid} />
          </div>
          <Segmented
            size="sm"
            value={status}
            onChange={(v) => setFilter('status', v)}
            aria-label={t('mobileCheckins.colStatus')}
            options={[
              { value: '', label: t('mobileCheckins.statusAll') },
              { value: 'active', label: t('mobileCheckins.statusActive') },
              { value: 'cancelled', label: t('mobileCheckins.statusCancelled') },
            ]}
          />
          <Checkbox
            label={t('mobileCheckins.farOnly')}
            checked={farOnly}
            onChange={(e) => setFilter('far', e.target.checked ? '1' : '')}
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
          {rangeInvalid && <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>}
        </div>

        <DataTable
          tableId="mobile-checkins"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={{
            ...selection,
            // Bekor qilingan belgini qayta bekor qilib bo'lmaydi — katakcha o'chiq.
            canSelect: (id) => actionable.some((r) => r.id === id),
          }}
          emptyTitle={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('mobileCheckins.empty')}
          emptyDescription={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('mobileCheckins.emptyHint')}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={980}
        />
        <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        <Button size="sm" variant="danger" leftIcon={<Ban size={15} />} onClick={() => setCancelling('bulk')}>
          {t('mobileCheckins.cancel')}
        </Button>
      </BulkBar>

      <CancelCheckinDialog
        open={!!cancelling}
        count={cancelling === 'bulk' ? selection.count : 1}
        loading={cancel.isPending || bulk.progress.running}
        error={cancelError}
        onClose={() => {
          setCancelling(null)
          setCancelError('')
        }}
        onSubmit={doCancel}
      />
    </PageContainer>
  )
}

export function MobileCheckinsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isHR(user) || roles.isMasterAdmin(user)} title={t('mobileCheckins.title')}>
      <MobileCheckinsPageInner />
    </RequireRole>
  )
}
