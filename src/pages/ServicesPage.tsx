import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck2, FileSignature, FileText, Inbox, Paperclip, Plus, RefreshCw, User as UserIcon, UserPlus } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Avatar, Button, Card, IconButton, Select } from '@/components/ui'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { tabPill } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { useAuthStore } from '@/store/authStore'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { ServiceCreateModal } from '@/features/services/ServiceCreateModal'
import { ServiceDetailModal } from '@/features/services/ServiceDetailModal'
import { ServiceTemplatesPanel } from '@/features/services/ServiceTemplatesPanel'
import { CandidateResultBadge, StatusBadge, fmtStamp } from '@/features/services/serviceUi'
import { serviceClosedReason, serviceDescription, serviceLabel } from '@/features/services/serviceLabel'
import {
  ALL_STATUSES,
  JOB_APPLICATION,
  canReviewServices,
  useMyServiceRequests,
  useServiceCatalog,
  useServiceInbox,
  type ServiceCatalogItem,
  type ServiceRequestRow,
  type ServiceType,
} from '@/features/services/useServices'

const SERVICE_ICON: Record<string, typeof FileCheck2> = {
  work_certificate: FileCheck2,
  reference_letter: FileSignature,
  job_application: UserPlus,
}

type Tab = 'mine' | 'inbox' | 'templates'
const URL_KEYS = ['tab', 'status', 'type', 'open'] as const
const FILTERS = ['status', 'type'] as const

/**
 * INTERAKTIV XIZMATLAR — TZ 4.2.12 (I1, 2304–2305).
 *
 * Yuqorida — foydalanuvchiga OCHIQ xizmatlar peshtaxtasi (katalog backenddan:
 * qaysi biri ochiq, qaysi biri nega yopiq). Pastda uch ko'rinish:
 *   • «Mening so'rovlarim» — har kimda (mehmon ham: nomzodlik arizasi);
 *   • «Kiruvchi so'rovlar» — so'rovchi tashkilotining kadrlar xizmati;
 *   • «Hujjat shablonlari» — bosh administrator tahrirlaydi va tasdiqlaydi,
 *     kadr ko'radi.
 * Ochiq so'rov URL'da (`?open=<id>`) — xabarnomalar shu havolani beradi.
 */
export function ServicesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canReview = canReviewServices(user)
  const isMaster = isSiteMasterAdmin(user)
  const canTemplates = isMaster || canReview

  const { catalog } = useServiceCatalog()
  const lp = useListParams(URL_KEYS)
  const { search, page, size, filters, setSearch, setPage, setSize, setFilter, setFilters } = lp
  const { count: activeFilterCount, reset } = useFilterReset(lp, FILTERS)
  const tab: Tab =
    filters.tab === 'inbox' && canReview ? 'inbox' : filters.tab === 'templates' && canTemplates ? 'templates' : 'mine'

  const mine = useMyServiceRequests(filters.status, page, size, tab === 'mine')
  const inbox = useServiceInbox(
    { status: filters.status, serviceType: filters.type, search, page, size },
    tab === 'inbox',
  )
  const view = tab === 'inbox' ? inbox : mine

  const openId = Number(filters.open) || null
  const openRequest = (id: number | null) => setFilters({ open: id ? String(id) : null, page: page > 1 ? String(page) : null })

  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<ServiceType | null>(null)
  const openCreate = (type?: ServiceType) => {
    setCreateType(type ?? null)
    setCreateOpen(true)
  }

  const available = catalog.filter((c) => c.available)
  const closed = catalog.filter((c) => !c.available)

  const tabs: { key: Tab; label: string; icon: typeof Inbox }[] = [
    { key: 'mine', label: t('services.tab_mine'), icon: UserIcon },
    ...(canReview ? [{ key: 'inbox' as Tab, label: t('svc.tabInbox'), icon: Inbox }] : []),
    ...(canTemplates ? [{ key: 'templates' as Tab, label: t('svc.tabTemplates'), icon: FileText }] : []),
  ]

  const columns: Column<ServiceRequestRow>[] = [
    {
      key: 'number',
      header: t('services.number'),
      className: 'w-[150px] tabnum',
      cell: (r) => <span className="font-medium text-fg">{r.number}</span>,
    },
    {
      key: 'type',
      header: t('svc.service'),
      className: 'w-[220px]',
      cell: (r) => serviceLabel(r.service_type, r.service_type),
    },
    ...(tab === 'inbox'
      ? [
          {
            key: 'applicant',
            header: t('svc.from'),
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
      header: t('svc.purposeCol'),
      cell: (r) => <span className="block max-w-[360px] truncate text-fg-muted">{r.purpose || '—'}</span>,
    },
    {
      key: 'files',
      header: <Paperclip size={13} aria-label={t('svc.attachments')} />,
      label: t('svc.attachments'),
      className: 'w-[56px] tabnum text-fg-muted',
      cell: (r) =>
        r.attachments_count ? (
          <span className="inline-flex items-center gap-1" title={t('svc.attachments')}>
            <Paperclip size={12} /> {r.attachments_count}
          </span>
        ) : (
          ''
        ),
    },
    {
      key: 'submitted',
      header: t('services.submittedAt'),
      className: 'w-[120px] tabnum text-fg-muted',
      cell: (r) => fmtStamp(r.submitted_at, false),
    },
    {
      key: 'status',
      header: t('dictionaries.colStatus'),
      className: 'w-[190px]',
      cell: (r) => (
        <div className="min-w-0">
          <StatusBadge status={r.status} />
          {r.service_type === JOB_APPLICATION && <CandidateResultBadge payload={r.payload} compact />}
        </div>
      ),
    },
  ]

  return (
    <PageContainer className="flex min-h-full flex-col">
      <PageHeader
        title={t('nav.services')}
        subtitle={t('services.subtitle')}
        actions={
          available.length > 0 ? (
            <Button size="sm" onClick={() => openCreate()} leftIcon={<Plus size={15} />}>
              {t('services.newRequest')}
            </Button>
          ) : undefined
        }
      />

      {/* ── Xizmatlar peshtaxtasi: faqat ochiq xizmatlar, yopiqlari sababi bilan ── */}
      {available.length > 0 && (
        <div className={cn('mb-3 grid gap-3', available.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {available.map((c) => (
            <ServiceTile key={c.type} item={c} onPick={() => openCreate(c.type)} />
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <p className="mb-4 text-[12px] text-fg-subtle">
          {closed.map((c, i) => (
            <span key={c.type}>
              {i > 0 && ' · '}
              <span className="text-fg-muted">{serviceLabel(c.type, c.label)}</span> — {serviceClosedReason(c.type, c.reason)}
            </span>
          ))}
        </p>
      )}

      <Card className="flex min-h-[420px] flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex gap-1.5" role="tablist" aria-label={t('nav.services')}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setFilters({ tab: key === 'mine' ? null : key, page: null, type: null, q: null })}
                className={tabPill(tab === key, 'inline-flex items-center gap-1.5')}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {tab !== 'templates' && (
            <>
              {tab === 'inbox' && (
                <>
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder={t('services.searchNumber')}
                    className="w-full max-w-[220px]"
                  />
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
                options={ALL_STATUSES.map((s) => ({ value: s, label: t(`services.status_${s}` as never) }))}
                placeholder={t('services.allStatuses')}
                aria-label={t('dictionaries.colStatus')}
                wrapperClassName="w-[190px]"
              />
              <FilterReset count={activeFilterCount} onReset={reset} />
              <IconButton className="ml-auto" label={t('svc.refresh')} onClick={() => view.refetch()}>
                <RefreshCw size={15} />
              </IconButton>
            </>
          )}
        </div>

        {tab === 'templates' ? (
          <ServiceTemplatesPanel canEdit={isMaster} />
        ) : (
          <>
            <DataTable
              tableId="services"
              rows={view.rows}
              columns={columns}
              loading={view.loading}
              error={view.error}
              onRetry={view.refetch}
              onRowClick={(r) => openRequest(r.id)}
              filtered={activeFilterCount > 0}
              emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
              emptyTitle={tab === 'inbox' ? t('svc.inboxEmpty') : t('svc.mineEmpty')}
              emptyDescription={
                tab === 'inbox'
                  ? t('services.inboxEmptyHint')
                  : available.length > 0
                    ? t('services.mineEmptyHint')
                    : undefined
              }
              minWidth={960}
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
        onCreated={(id) => {
          if (tab !== 'mine') setFilters({ tab: null, status: null, type: null, q: null, open: String(id) })
          else openRequest(id)
        }}
      />
      <ServiceDetailModal id={openId} onClose={() => openRequest(null)} fromInbox={tab === 'inbox'} />
    </PageContainer>
  )
}

function ServiceTile({ item, onPick }: { item: ServiceCatalogItem; onPick: () => void }) {
  const { t } = useTranslation()
  const Icon = SERVICE_ICON[item.type] ?? FileCheck2
  const desc = serviceDescription(item.type, item.description)
  return (
    <Card className="cursor-pointer p-4" interactive onClick={onPick}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-inner bg-brand/[0.16] text-brand-strong">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg">{serviceLabel(item.type, item.label)}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted" title={desc || undefined}>
            {desc || t('services.tileAvailable')}
          </p>
        </div>
      </div>
    </Card>
  )
}
