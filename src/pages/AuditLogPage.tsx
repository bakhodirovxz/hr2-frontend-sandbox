import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { Copy, Download } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Combobox } from '@/components/ui/Combobox'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { OnlineNowStrip } from '@/features/audit/OnlineNowStrip'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useEmployeePickerSearch } from '@/features/employees/EmployeePicker'
import { employeeOption } from '@/features/employees/subLabel'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { AUDIT_CATEGORIES, AUDIT_RESOURCE_TYPES, useAuditLogs, useAuditStats, type AuditLog } from '@/features/audit/useAuditLogs'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { useToast } from '@/components/ui/Toast'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { AUDIT_LOGS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import dayjs from 'dayjs'
import type { Translation } from '@/i18n/uz'

const FILTER_KEYS = ['action', 'cat', 'status', 'from', 'to', 'user', 'res', 'branch'] as const

type AuditKey = keyof Translation['audit']
const ACTION_META: Record<string, { labelKey: AuditKey; tone: BadgeTone }> = {
  CREATE: { labelKey: 'actionCreate', tone: 'success' },
  UPDATE: { labelKey: 'actionUpdate', tone: 'warning' },
  DELETE: { labelKey: 'actionDelete', tone: 'danger' },
  VIEW: { labelKey: 'actionView', tone: 'info' },
  PAGE_VIEW: { labelKey: 'actionPageView', tone: 'neutral' },
  LOGIN: { labelKey: 'actionLogin', tone: 'brand' },
  // Everything else the middleware writes (TEST: ERROR 23.5k, ASK 5.9k,
  // EXPORT 2.2k, LOGOUT 0.9k …). Without these the column showed raw slugs
  // and the Action filter could not narrow to errors at all.
  ERROR: { labelKey: 'actionError', tone: 'danger' },
  LOGOUT: { labelKey: 'actionLogout', tone: 'neutral' },
  EXPORT: { labelKey: 'actionExport', tone: 'info' },
  SEARCH: { labelKey: 'actionSearch', tone: 'neutral' },
  ASK: { labelKey: 'actionAsk', tone: 'brand' },
  EMAIL: { labelKey: 'actionEmail', tone: 'info' },
  EMAIL_FAIL: { labelKey: 'actionEmailFail', tone: 'danger' },
  PASSWORD: { labelKey: 'actionPassword', tone: 'warning' },
  attendance_period_lock: { labelKey: 'actionPeriodLock', tone: 'warning' },
  attendance_period_unlock: { labelKey: 'actionPeriodUnlock', tone: 'warning' },
  backup_created: { labelKey: 'actionBackup', tone: 'neutral' },
  backup_deleted: { labelKey: 'actionBackupDeleted', tone: 'danger' },
  system_emergency_shutdown: { labelKey: 'actionShutdown', tone: 'danger' },
  system_resume: { labelKey: 'actionResume', tone: 'success' },
  system_recovery: { labelKey: 'actionRecovery', tone: 'success' },
}

export function AuditLogPage() {
  const { t } = useTranslation()
  // A type the dictionary does not know yet is shown as its slug, never as a raw key.
  const resourceLabel = (r: string) => (i18n.exists(`audit.res_${r}`) ? t(`audit.res_${r}` as never) : r)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)
  const foldedCount = [filters.user, filters.cat, filters.action, filters.res, filters.branch, filters.status, filters.from, filters.to].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)

  const toast = useToast()
  // ⚠️ THE JOURNAL DOES NOT FOLLOW THE HEADER BRANCH. v1 deliberately opts out
  // of the global stamp and defaults to EVERY branch, because auditing branch B
  // should not require switching every other page to branch B. Measured live:
  // unfiltered 42 621 rows against 18 194 for branch 1 — the global selector was
  // silently hiding more than half the journal. An explicit pick here narrows it.
  const branchId = filters.branch ? Number(filters.branch) : null
  const allBranches = useBranchStore((st) => st.branches)
  const branchOptions = allBranches.map((b) => ({ value: String(b.id), label: b.name ?? String(b.id) }))
  const [exporting, setExporting] = useState(false)
  const [viewing, setViewing] = useState<AuditLog | null>(null)

  // Values the server would 422 on are dropped here, never sent: a resource
  // type outside the known set, a status group outside the errors category,
  // a range that runs backwards.
  const resourceType = (AUDIT_RESOURCE_TYPES as readonly string[]).includes(filters.res) ? filters.res : ''
  const statusGroup = filters.cat === 'errors' && ['4xx', '5xx'].includes(filters.status) ? filters.status : ''
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  // The user picker searches `/employees` the way every form picker does and
  // filters by the LOGIN behind the person (`user_id`), which is what the
  // journal is keyed by. A person with no login cannot appear in it.
  const [userQuery, setUserQuery] = useState('')
  const { candidates, loading: usersLoading, hasMore: usersHasMore, loadMore: loadMoreUsers } = useEmployeePickerSearch(userQuery, null, true)
  const userOptions = useMemo(() => {
    const opts = candidates
      .filter((e) => e.user_id != null)
      .map((e) => ({ ...employeeOption(e), value: String(e.user_id) }))
    // The selection lives in the URL as an id; after a reload the label is
    // not known until the person is searched again, so keep a stand-in row.
    if (filters.user && !opts.some((o) => o.value === filters.user)) {
      opts.unshift({ value: filters.user, label: t('audit.userSelected', { id: filters.user }) })
    }
    return opts
  }, [candidates, filters.user, t])

  const query = {
    userId: filters.user,
    action: filters.action,
    category: filters.cat,
    statusGroup,
    resourceType,
    dateFrom: filters.from,
    dateTo: filters.to,
    search,
    branchId,
    enabled: !rangeInvalid,
  }
  const { rows, total, pages, loading, fetching, denied, error, refetch } = useAuditLogs(page, size, query)
  const auditStats = useAuditStats(query, !denied)

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: `${AUDIT_LOGS}/export`,
        mime: XLSX_MIME,
        filename: `Audit_${dayjs().format('DD.MM.YYYY')}.xlsx`,
        params: {
          user_id: query.userId || undefined,
          action: query.action || undefined,
          category: query.category || undefined,
          status_group: query.statusGroup || undefined,
          resource_type: query.resourceType || undefined,
          date_from: query.dateFrom || undefined,
          date_to: query.dateTo || undefined,
          search: query.search || undefined,
          organization_branch_id: branchId || undefined,
        },
      })
      toast.ok(t('audit.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('audit.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const categoryOptions = useMemo(
    () =>
      AUDIT_CATEGORIES.map((c) => ({
        value: c,
        label: t(`audit.cat_${c}` as never),
        subLabel: t(`audit.catHint_${c}` as never),
      })),
    [t],
  )

  const resourceOptions = useMemo(
    () => AUDIT_RESOURCE_TYPES.map((r) => ({ value: r, label: resourceLabel(r) })),
    [t],
  )

  const actionOptions = useMemo(
    () =>
      // The server upper-cases the filter value, so the lower-case system
      // events (backup_*, system_*) can be labelled but not filtered by.
      Object.keys(ACTION_META).filter((a) => a === a.toUpperCase()).map((a) => ({
        value: a,
        label: t(`audit.${ACTION_META[a].labelKey}`),
      })),
    [t],
  )

  const columns: Column<AuditLog>[] = [
    {
      key: 'time',
      header: t('audit.colTime'),
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      skeleton: 'w-28',
      cell: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'user',
      header: t('audit.colUser'),
      skeleton: 'w-40',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.employee_name} size={28} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">
              {row.employee_name || t('common.unknown')}
            </p>
            {row.actor_branch_name && row.actor_branch_name !== row.organization_branch_name && (
              <p className="truncate text-[11px] text-fg-subtle">
                {t('audit.colActorBranch')}: {row.actor_branch_name}
              </p>
            )}
            {row.organization_branch_name && (
              <p className="truncate text-[11px] text-fg-subtle">{row.organization_branch_name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: t('audit.colAction'),
      skeleton: 'w-16',
      cell: (row) => {
        const meta = row.action ? ACTION_META[row.action] : undefined
        return (
          <Badge tone={meta?.tone ?? 'neutral'}>
            {meta ? t(`audit.${meta.labelKey}`) : row.action || '—'}
          </Badge>
        )
      },
    },
    {
      key: 'resource',
      header: t('audit.colResource'),
      className: 'text-fg-muted',
      cell: (row) =>
        row.resource_type ? (
          <span>
            {resourceLabel(row.resource_type)}
            {row.resource_id && <span className="ml-1 font-mono text-fg-subtle">#{row.resource_id}</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'endpoint',
      header: t('audit.colEndpoint'),
      className: 'max-w-[240px] truncate font-mono text-[12px] text-fg-subtle',
      skeleton: 'w-40',
      cell: (row) => (
        <span>
          {row.method && <span className="mr-1 text-fg-muted">{row.method}</span>}
          {row.endpoint || '—'}
        </span>
      ),
    },
    {
      key: 'ip',
      header: t('audit.colIp'),
      className: 'tabular-nums text-fg-subtle',
      skeleton: 'w-20',
      cell: (row) => row.ip_address || '—',
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            loading={exporting}
            disabled={denied}
            leftIcon={<Download size={14} />}
          >
            Excel
          </Button>
        }
      />

      <OnlineNowStrip />

      {/* The whole current selection by category — the table below shows one
          page of it. Clicking a category applies it as the filter. */}
      {auditStats.total > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(auditStats.byCategory)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([key, n]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filters.cat === key}
                onClick={() => setFilter('cat', filters.cat === key ? '' : key)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-left transition-colors',
                  filters.cat === key
                    ? 'border-brand bg-brand-soft'
                    : 'border-border bg-surface-2 hover:bg-fg/[0.05]',
                )}
              >
                <span className="block text-[11.5px] font-semibold text-fg-muted">
                  {t(`audit.cat_${key}` as never)}
                </span>
                <span className="block text-[15px] font-bold tabular-nums text-fg">{n}</span>
              </button>
            ))}
        </div>
      )}

      <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('audit.searchPlaceholder')}
            className="flex-1 lg:max-w-md"
          />
          {/* Seven narrowing controls wrapped to a second row with a lone date;
              they fold behind «Filtrlar» (redesign 2026-09-24). */}
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
          <FilterReset count={activeFilterCount} onReset={reset} />
          {filtersOpen && (
          <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Combobox
            value={filters.user}
            onChange={(v) => setFilter('user', v)}
            options={userOptions}
            onSearchChange={setUserQuery}
            loading={usersLoading}
            hasMore={usersHasMore}
            onLoadMore={loadMoreUsers}
            placeholder={t('audit.allUsers')}
            searchPlaceholder={t('audit.userSearchPlaceholder')}
            className="w-full"
          />
          {/* Category first: it is the question the reader arrived with, and it
              narrows the action list that follows. */}
          <Combobox
            value={filters.cat}
            onChange={(v) => setFilter('cat', v)}
            options={categoryOptions}
            placeholder={t('audit.allCategories')}
            className="w-full"
          />
          <Combobox
            value={filters.action}
            onChange={(v) => setFilter('action', v)}
            options={actionOptions}
            placeholder={t('audit.allActions')}
            className="w-full"
          />
          <Combobox
            value={resourceType}
            onChange={(v) => setFilter('res', v)}
            options={resourceOptions}
            placeholder={t('audit.allResources')}
            className="w-full"
          />
          {/* The journal's OWN branch picker. Empty means every branch — see the
              note on `branchId` above. */}
          <Combobox
            value={filters.branch}
            onChange={(v) => setFilter('branch', v)}
            options={branchOptions}
            placeholder={t('audit.allBranches')}
            className="w-full"
          />
          {filters.cat === 'errors' && (
            <Combobox
              value={statusGroup}
              onChange={(v) => setFilter('status', v)}
              options={[
                { value: '4xx', label: t('audit.status4xx') },
                { value: '5xx', label: t('audit.status5xx') },
              ]}
              placeholder={t('audit.allErrors')}
              className="w-full"
            />
          )}
          <DateInput
            value={filters.from}
            onChange={(v) => setFilter('from', v)}
            invalid={rangeInvalid}
            aria-label={t('audit.dateFrom')}
            placeholder={t('audit.dateFrom')}
            className="w-full"
          />
          <DateInput
            value={filters.to}
            onChange={(v) => setFilter('to', v)}
            invalid={rangeInvalid}
            aria-label={t('audit.dateTo')}
            placeholder={t('audit.dateTo')}
            className="w-full"
          />
          </div>
          )}
          {rangeInvalid && (
            <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>
          )}
        </div>

        <DataTable
        tableId="audit-log"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={denied ? t('audit.denied') : t('audit.empty')}
          emptyDescription={denied ? t('audit.deniedHint') : t('audit.emptyHint')}
          filtered={!denied && activeFilterCount > 0}
          minWidth={1000}
          onRowClick={setViewing}
        />

        <Pagination
          page={page}
          size={size}
          total={total}
          pages={pages}
          onPage={setPage}
          onSize={setSize}
          loading={fetching}
        />
      </Card>

      <AuditDetailModal
        row={viewing}
        onClose={() => setViewing(null)}
        actionLabel={(a) => {
          const meta = a ? ACTION_META[a] : undefined
          return meta ? t(`audit.${meta.labelKey}`) : a || '—'
        }}
        resourceLabel={resourceLabel}
      />
    </PageContainer>
  )
}

/** «Chrome 128 · Windows» out of a raw user-agent string — enough to tell a
 *  phone from the office PC without reading 200 characters. */
function shortAgent(ua: string | null | undefined, appLabel: string) {
  if (!ua) return '—'
  const browser = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /OPR\/(\d+)/.exec(ua) ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}`
    : /YaBrowser\/(\d+)/.exec(ua) ? `Yandex ${/YaBrowser\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
    : /okhttp|Expo|Dart|CFNetwork/i.test(ua) ? appLabel
    : ua.split(' ')[0]
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

/**
 * One journal entry in full. The list shows who/what/where; the question that
 * follows is «what exactly was sent» — the request body the middleware stored
 * (passwords and tokens already masked as ***) — and from which device.
 */
function AuditDetailModal({
  row,
  onClose,
  actionLabel,
  resourceLabel,
}: {
  row: AuditLog | null
  onClose: () => void
  actionLabel: (a?: string | null) => string
  resourceLabel: (r: string) => string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const hasBody = row?.details != null && !(typeof row.details === 'object' && Object.keys(row.details as object).length === 0)
  const body = hasBody ? JSON.stringify(row!.details, null, 2) : ''
  const items: [string, ReactNode][] = row
    ? [
        [t('audit.colTime'), row.created_at ? formatDateTime(row.created_at) : '—'],
        [t('audit.colUser'), row.employee_name || '—'],
        [t('audit.colActorBranch'), row.actor_branch_name || '—'],
        [t('audit.colAction'), actionLabel(row.action)],
        [t('audit.colResource'), row.resource_type ? `${resourceLabel(row.resource_type)}${row.resource_id ? ` #${row.resource_id}` : ''}` : '—'],
        [t('audit.colIp'), row.ip_address || '—'],
        [t('audit.device'), <span key="ua" title={row.user_agent ?? undefined}>{shortAgent(row.user_agent, t('audit.mobileApp'))}</span>],
      ]
    : []
  return (
    <Modal open={!!row} onClose={onClose} title={t('audit.detailTitle')} size="lg">
      {row && (
        <div className="flex flex-col gap-4">
          <p className="break-all rounded-control bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-fg">
            <span className="mr-2 font-semibold text-brand-strong">{row.method}</span>
            {row.endpoint || '—'}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {items.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11.5px] font-semibold text-fg-subtle">{k}</dt>
                <dd className="truncate text-[13.5px] text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-fg-muted">{t('audit.requestBody')}</span>
              {hasBody && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Copy size={13} />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(body).then(() => toast.ok(t('audit.copied')))
                  }}
                >
                  {t('audit.copy')}
                </Button>
              )}
            </div>
            {hasBody ? (
              <pre className="scroll-thin max-h-72 overflow-auto rounded-control border border-line bg-surface-2/60 p-3 font-mono text-[12px] leading-relaxed text-fg">
                {body}
              </pre>
            ) : (
              <p className="text-[12.5px] text-fg-subtle">{t('audit.noBody')}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
