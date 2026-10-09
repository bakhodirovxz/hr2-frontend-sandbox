import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'
import { FileCheck2, FileSignature, Inbox, Plus, UserPlus } from 'lucide-react'
import dayjs from 'dayjs'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Button, Card, EmptyState, Select } from '@/components/ui'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { cn } from '@/lib/cn'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { ServiceCreateModal } from '@/features/services/ServiceCreateModal'
import { ServiceDetailModal } from '@/features/services/ServiceDetailModal'
import {
  canReviewServices,
  useMyServiceRequests,
  useServiceCatalog,
  useServiceInbox,
  type ServiceCatalogItem,
  type ServiceRequestRow,
  type ServiceType,
} from '@/features/services/useServices'
import { useAuthStore } from '@/store/authStore'
import { serviceLabel } from '@/features/services/serviceLabel'
import { tabPill } from '@/components/ui/control'

const STATUS_TONE: Record<string, string> = {
  accepted: 'bg-fg/[0.06] text-fg-muted',
  in_review: 'bg-warning/[0.13] text-warning',
  in_progress: 'bg-info/[0.12] text-info',
  ready: 'bg-brand/[0.14] text-brand-strong',
  issued: 'bg-success/[0.12] text-success',
  rejected: 'bg-danger/[0.13] text-danger',
  cancelled: 'bg-fg/[0.06] text-fg-muted',
}

const SERVICE_ICON: Record<string, typeof FileCheck2> = {
  work_certificate: FileCheck2,
  reference_letter: FileSignature,
  job_application: UserPlus,
}

const ALL_STATUSES = [
  'accepted',
  'in_review',
  'in_progress',
  'ready',
  'issued',
  'rejected',
  'cancelled',
]

/**
 * INTERAKTIV XIZMATLAR — TZ 4.2.12.
 *
 * The counter and the queue on one screen. The three service tiles at the top
 * are the counter — press one and the request form opens already knowing which
 * service it is; a tile the signed-in role may not use says WHY rather than
 * disappearing, because a service that is silently absent reads as a bug.
 *
 * Below it, one of two registers: your own requests, or — for the personnel
 * office — everything waiting to be worked.
 */
const SERVICE_KEYS = ['tab', 'status', 'type'] as const
const SERVICE_FILTERS = ['status', 'type'] as const

export function ServicesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canReview = canReviewServices(user)

  const { catalog } = useServiceCatalog()
  const lp = useListParams(SERVICE_KEYS)
  const { search, page, size, filters, setSearch, setPage, setSize, setFilter, setFilters } = lp
  // `tab` is a view switch, not a filter — it survives a reset.
  const { count: activeFilterCount, reset } = useFilterReset(lp, SERVICE_FILTERS)
  const tab = filters.tab === 'inbox' && canReview ? 'inbox' : 'mine'

  const mine = useMyServiceRequests(filters.status, page, size)
  const inbox = useServiceInbox(
    {
      status: filters.status,
      serviceType: filters.type,
      search: search,
      page,
      size,
    },
    tab === 'inbox',
  )
  const view = tab === 'inbox' ? inbox : mine

  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<ServiceType | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  const openCreate = (type?: ServiceType) => {
    setCreateType(type ?? null)
    setCreateOpen(true)
  }

  const columns: Column<ServiceRequestRow>[] = [
    {
      key: 'number',
      header: t('services.number'),
      className: 'w-[150px] tabnum',
      cell: (r) => <span className="font-medium text-fg">{r.number}</span>,
    },
    {
      key: 'type',
      header: t('services.serviceType'),
      className: 'w-[220px]',
      cell: (r) => t(`services.type_${r.service_type}` as never),
    },
    ...(tab === 'inbox'
      ? [
          {
            key: 'applicant',
            header: t('services.applicant'),
            className: 'w-[220px] text-fg-muted',
            cell: (r: ServiceRequestRow) => (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar src={r.applicant_photo_thumb_path} name={r.applicant_name ?? '?'} size={26} />
                <span className="truncate">{r.applicant_name || '—'}</span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'purpose',
      header: t('services.purpose'),
      cell: (r) => <span className="block truncate text-fg-muted">{r.purpose || '—'}</span>,
    },
    {
      key: 'submitted',
      header: t('services.submittedAt'),
      className: 'w-[130px] tabnum text-fg-muted',
      cell: (r) => (r.submitted_at ? dayjs(r.submitted_at).format('DD.MM.YYYY') : '—'),
    },
    {
      key: 'status',
      header: t('dictionaries.colStatus'),
      className: 'w-[150px]',
      cell: (r) => (
        <span
          className={cn(
            'inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold',
            STATUS_TONE[r.status] ?? 'bg-fg/[0.06] text-fg-muted',
          )}
        >
          {t(`services.status_${r.status}` as never)}
        </span>
      ),
    },
  ]

  return (
    <PageContainer className="flex min-h-full flex-col">
      <PageHeader
        title={t('nav.services')}
        subtitle={t('services.subtitle')}
        actions={
          <Button size="sm" onClick={() => openCreate()} leftIcon={<Plus size={15} />}>
            {t('services.newRequest')}
          </Button>
        }
      />

      {/* ── Xizmatlar peshtaxtasi ─────────────────────────────────────── */}
      {/* Only what this account can order. A greyed «for guests only» tile
          among the working ones read as a broken button (2026-09-25). */}
      <div className={cn('mb-4 grid gap-3', catalog.filter((c) => c.available).length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {catalog.filter((c) => c.available).map((c) => (
          <ServiceTile key={c.type} item={c} onPick={() => openCreate(c.type)} />
        ))}
      </div>

      <Card className="flex min-h-[420px] flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {canReview && (
            <div className="flex gap-1.5">
              {(['mine', 'inbox'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilters({ tab: k === 'mine' ? null : k, page: null })}
                  aria-pressed={tab === k}
                  className={tabPill(tab === k)}
                >
                  {t(`services.tab_${k}` as never)}
                </button>
              ))}
            </div>
          )}

          {tab === 'inbox' && (
            <>
              <SearchInput value={search} onChange={setSearch} placeholder={t('services.searchNumber')} className="w-full max-w-[220px]" />
              <Select
                value={filters.type}
                onChange={(e) => setFilter('type', e.target.value)}
                options={catalog.map((c) => ({ value: c.type, label: serviceLabel(c.type, c.label) }))}
                placeholder={t('services.allTypes')}
                aria-label={t('services.serviceType')}
                wrapperClassName="w-[220px]"
              />
            </>
          )}

          <Select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
            options={ALL_STATUSES.map((s) => ({
              value: s,
              label: t(`services.status_${s}` as never),
            }))}
            placeholder={t('services.allStatuses')}
            aria-label={t('dictionaries.colStatus')}
            wrapperClassName="w-[190px]"
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        {tab === 'inbox' && inbox.denied ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title={t('services.inboxDenied')}
            description={t('services.inboxDeniedHint')}
          />
        ) : (
          <>
            <DataTable
        tableId="services"
              rows={view.rows}
              columns={columns}
              loading={view.loading}
              error={view.error}
              onRetry={view.refetch}
              onRowClick={(r) => setDetailId(r.id)}
              filtered={activeFilterCount > 0}
              emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
              emptyTitle={tab === 'inbox' ? t('services.inboxEmpty') : t('services.mineEmpty')}
              emptyDescription={
                tab === 'inbox' ? t('services.inboxEmptyHint') : t('services.mineEmptyHint')
              }
              minWidth={900}
              density="compact"
            />
            <Pagination
              page={page}
              size={size}
              total={view.total}
              pages={view.pages}
              onPage={setPage}
              onSize={setSize}
              loading={view.loading}
            />
          </>
        )}
      </Card>

      <ServiceCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        catalog={catalog}
        initialType={createType}
      />
      <ServiceDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </PageContainer>
  )
}

function ServiceTile({ item, onPick }: { item: ServiceCatalogItem; onPick: () => void }) {
  const { t } = useTranslation()
  const Icon = SERVICE_ICON[item.type] ?? FileCheck2
  return (
    <Card
      className={cn('p-4', item.available && 'cursor-pointer')}
      interactive={item.available}
      onClick={item.available ? onPick : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-inner',
            item.available ? 'bg-brand/[0.16] text-brand-strong' : 'bg-fg/[0.06] text-fg-muted',
          )}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg">{serviceLabel(item.type, item.label)}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {item.available ? t('services.tileAvailable') : (item.reason ?? t('services.tileClosed'))}
          </p>
        </div>
      </div>
    </Card>
  )
}
