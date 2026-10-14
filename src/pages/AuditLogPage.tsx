import { useMemo, useState, type ReactNode } from 'react'
import { lt } from '@/i18n/display'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import dayjs from 'dayjs'
import { AlertTriangle, CheckCircle2, Copy, Download, Radio, XCircle } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useListParams } from '@/hooks/useListParams'
import { formatDateTime } from '@/lib/format'
import { PDF_MIME, XLSX_MIME } from '@/lib/download'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { filterChip } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { runAuditExport } from '@/features/audit/useAuditExport'
import { ExportJobPanel } from '@/features/audit/ExportJobPanel'
import { useBranchStore } from '@/store/branchStore'
import {
  AUDIT_CATEGORIES,
  AUDIT_RESOURCE_TYPES,
  CATEGORY_ACTIONS,
  auditParams,
  useAuditActors,
  useAuditLive,
  useAuditLogs,
  useAuditStats,
  type AuditCategory,
  type AuditLog,
} from '@/features/audit/useAuditLogs'
import type { Translation } from '@/i18n/uz'

/*
 * AUDIT JURNALI — TZ A4 «Просмотр журнала действий». v1 `AuditLogPage` bilan
 * bir xil: toifa tablari (raqamlari `audit-logs/stats` dan), filtrlar
 * (qidiruv, filial, foydalanuvchi, amal, resurs, xato kodi 4xx/5xx, natija,
 * davr), ustunlar bo'yicha saralash, tafsilot oynasi va CSV / Excel / PDF
 * eksport (`audit-logs/export?format=&lang=`, ro'yxat bilan AYNAN bir xil
 * filtrlar bilan).
 */

const FILTER_KEYS = ['cat', 'action', 'status', 'result', 'from', 'to', 'user', 'res', 'branch', 'sort'] as const
/** Everything but the category tab and the sort counts as a «filter». */
const NARROWING = ['action', 'status', 'result', 'from', 'to', 'user', 'res', 'branch'] as const

type AuditKey = keyof Translation['audit']
const ACTION_META: Record<string, { labelKey: AuditKey; tone: BadgeTone }> = {
  CREATE: { labelKey: 'actionCreate', tone: 'success' },
  UPDATE: { labelKey: 'actionUpdate', tone: 'warning' },
  DELETE: { labelKey: 'actionDelete', tone: 'danger' },
  EXPORT: { labelKey: 'actionExport', tone: 'info' },
  LOGIN: { labelKey: 'actionLogin', tone: 'brand' },
  LOGOUT: { labelKey: 'actionLogout', tone: 'neutral' },
  PASSWORD: { labelKey: 'actionPassword', tone: 'warning' },
  PAGE_VIEW: { labelKey: 'actionPageView', tone: 'neutral' },
  VIEW: { labelKey: 'actionView', tone: 'neutral' },
  SEARCH: { labelKey: 'actionSearch', tone: 'info' },
  EMAIL: { labelKey: 'actionEmail', tone: 'info' },
  EMAIL_FAIL: { labelKey: 'actionEmailFail', tone: 'danger' },
  ERROR: { labelKey: 'actionError', tone: 'danger' },
  FEEDBACK: { labelKey: 'actionFeedback', tone: 'neutral' },
  // System events written by the services themselves (lower case).
  backup_created: { labelKey: 'actionBackup', tone: 'neutral' },
  backup_deleted: { labelKey: 'actionBackupDeleted', tone: 'danger' },
  system_emergency_shutdown: { labelKey: 'actionShutdown', tone: 'danger' },
  system_resume: { labelKey: 'actionResume', tone: 'success' },
  system_recovery: { labelKey: 'actionRecovery', tone: 'success' },
}
/** The actions the filter offers (v1 order). */
const FILTER_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'LOGIN', 'LOGOUT', 'PASSWORD',
  'PAGE_VIEW', 'VIEW', 'SEARCH', 'EMAIL', 'EMAIL_FAIL', 'ERROR',
]

/** Column key → server `sort` value (TZ A4 «сортировка»). */
const SORT_FIELD: Record<string, string> = { time: 'created_at', user: 'user', action: 'action', result: 'result' }
const SORT_COLUMN: Record<string, string> = { created_at: 'time', user: 'user', action: 'action', result: 'result' }

const EXPORTS = [
  { format: 'csv', labelKey: 'exportCsv', mime: 'text/csv' },
  { format: 'xlsx', labelKey: 'exportXlsx', mime: XLSX_MIME },
  { format: 'pdf', labelKey: 'exportPdf', mime: PDF_MIME },
] as const

const isFailure = (row: AuditLog) =>
  (row.result ?? (row.action === 'ERROR' || row.action === 'EMAIL_FAIL' ? 'failure' : 'success')) === 'failure'

export function AuditLogPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const resourceLabel = (r: string) => (i18n.exists(`audit.res_${r}`) ? t(`audit.res_${r}` as never) : r)
  const actionLabel = (a?: string | null) => {
    const meta = a ? ACTION_META[a] : undefined
    return meta ? t(`audit.${meta.labelKey}`) : a || '—'
  }

  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } = useListParams(FILTER_KEYS)

  // v1 opens on «Amallar» — the real changes, not page views and errors.
  const category: AuditCategory = (AUDIT_CATEGORIES as readonly string[]).includes(filters.cat)
    ? (filters.cat as AuditCategory)
    : 'changes'
  const narrowingCount = NARROWING.filter((k) => filters[k]).length
  const activeCount = narrowingCount + (search ? 1 : 0)
  const [filtersOpen, setFiltersOpen] = useState(() => narrowingCount > 0)

  const branchId = filters.branch ? Number(filters.branch) : null
  const allBranches = useBranchStore((st) => st.branches)
  const branchOptions = allBranches.map((b) => ({ value: String(b.id), label: b.name ?? String(b.id) }))

  const actors = useAuditActors(branchId)
  const actorOptions = useMemo(() => {
    const opts = (actors.data ?? []).map((a) => ({
      value: String(a.user_id),
      label: a.name && a.name !== a.username ? `${a.name} (${a.username})` : a.name || a.username || `#${a.user_id}`,
    }))
    if (filters.user && !opts.some((o) => o.value === filters.user)) {
      opts.unshift({ value: filters.user, label: t('audit.userSelected', { id: filters.user }) })
    }
    return opts
  }, [actors.data, filters.user, t])

  // Values the server would refuse are dropped, never sent.
  const allowedActions = category === 'all' ? FILTER_ACTIONS : CATEGORY_ACTIONS[category]
  const action = allowedActions.includes(filters.action) ? filters.action : ''
  const statusGroup = (category === 'errors' || category === 'all') && ['4xx', '5xx'].includes(filters.status) ? filters.status : ''
  const result = ['success', 'failure'].includes(filters.result) ? filters.result : ''
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  const [sortBy, sortDir] = (filters.sort || 'created_at:desc').split(':')
  const sort: SortState = {
    key: SORT_COLUMN[sortBy] ?? 'time',
    dir: sortDir === 'asc' ? 'asc' : 'desc',
  }

  const query = {
    userId: filters.user,
    action,
    category,
    statusGroup,
    resourceType: filters.res,
    result,
    dateFrom: filters.from,
    dateTo: filters.to,
    search,
    branchId,
    sort: SORT_FIELD[sort.key],
    order: sort.dir,
    enabled: !rangeInvalid,
  }
  const { rows: baseRows, total, pages, loading, fetching, denied, error, refetch } = useAuditLogs(page, size, query)
  const stats = useAuditStats(query, !denied)

  /*
   * TZ A4 919 «мониторинг в реальном времени»: page 1 in the default order
   * (newest first) only — new rows are put on top, which means nothing on
   * another page or under another sort.
   */
  const [liveOn, setLiveOn] = useState(false)
  const liveAllowed = page === 1 && sort.key === 'time' && sort.dir === 'desc' && !rangeInvalid && !denied
  const live = useAuditLive(query, baseRows, {
    active: liveOn && liveAllowed,
    ready: !loading && !error,
    onOverflow: () => void refetch(),
  })
  const rows = live.rows

  // TZ A4 919: the background export job — in the URL, so the notification
  // («Audit jurnali eksporti tayyor») opens this same panel.
  const [sp, setSp] = useSearchParams()
  const jobId = Number(sp.get('job')) || null
  const setJob = (id: number | null) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('job', String(id))
        else next.delete('job')
        return next
      },
      { replace: true },
    )

  const [exporting, setExporting] = useState(false)
  const exportAs = async (fmt: (typeof EXPORTS)[number]) => {
    setExporting(true)
    try {
      const res = await runAuditExport(
        // A-D10: column and action names in the interface language.
        { ...auditParams(query), format: fmt.format, lang: i18n.language || 'uz' },
        `audit-jurnali_${dayjs().format('DD.MM.YYYY')}.${fmt.format}`,
        fmt.mime,
      )
      if (res.kind === 'job') {
        setJob(res.job.job_id)
        toast.info(t('auditJob.started', { count: res.job.row_count ?? 0 }))
      } else {
        toast.ok(t('audit.exported'))
      }
    } catch (e) {
      toast.error(
        errorCode(e) === 'job_enqueue_failed' ? t('auditJob.enqueueFailed') : errorMessage(e, t('audit.exportFailed')),
      )
    } finally {
      setExporting(false)
    }
  }

  const reset = () =>
    setFilters({ q: null, ...Object.fromEntries(NARROWING.map((k) => [k, null])) })

  const selectCategory = (next: AuditCategory) => {
    const allowed = next === 'all' ? FILTER_ACTIONS : CATEGORY_ACTIONS[next]
    setFilters({
      cat: next === 'changes' ? null : next,
      // A filter the new tab cannot have would silently empty the list.
      action: filters.action && allowed.includes(filters.action) ? filters.action : null,
      status: next === 'errors' || next === 'all' ? filters.status || null : null,
    })
  }

  const [viewing, setViewing] = useState<AuditLog | null>(null)

  const columns: Column<AuditLog>[] = [
    {
      key: 'time',
      header: t('audit.colTime'),
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      skeleton: 'w-28',
      lockVisible: true,
      // Sorted by the server; the constant keeps the page in its order.
      sortValue: () => 0,
      cell: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'user',
      header: t('audit.colUser'),
      skeleton: 'w-40',
      sortValue: () => 0,
      cell: (row) => {
        const branch = lt(row.actor_branch_name || row.organization_branch_name)
        const target =
          row.organization_branch_name && lt(row.organization_branch_name) !== branch ? lt(row.organization_branch_name) : null
        return (
          <div className="min-w-0 max-w-[240px]">
            <p className="truncate text-[13px] font-medium text-fg">{row.employee_name || t('common.unknown')}</p>
            <p className="truncate text-[11.5px] text-fg-subtle" title={branch ?? undefined}>
              {branch || '—'}
              {target && <span> → {target}</span>}
            </p>
          </div>
        )
      },
    },
    {
      key: 'action',
      header: t('audit.colAction'),
      skeleton: 'w-16',
      sortValue: () => 0,
      cell: (row) => <Badge tone={(row.action && ACTION_META[row.action]?.tone) || 'neutral'}>{actionLabel(row.action)}</Badge>,
    },
    {
      key: 'result',
      header: t('audit.colResult'),
      skeleton: 'w-20',
      sortValue: () => 0,
      cell: (row) => <ResultMark failure={isFailure(row)} />,
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
        <span title={row.endpoint ?? undefined}>
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
      cell: (row) => (
        <>
          <span className="block font-mono text-[12px]">{row.ip_address || '—'}</span>
          <span className="block text-[11px]">{shortAgent(row.user_agent, t('audit.mobileApp'))}</span>
        </>
      ),
    },
  ]

  const resourceOptions = AUDIT_RESOURCE_TYPES.map((r) => ({ value: r, label: resourceLabel(r) })).sort((a, b) =>
    a.label.localeCompare(b.label, 'uz'),
  )
  const countOf = (c: AuditCategory) => (c === 'all' ? stats.total : stats.byCategory[c] ?? (stats.total != null ? 0 : undefined))

  return (
    <PageContainer>
      <PageHeader
        title={t('audit.title')}
        subtitle={`${t(`audit.catHint_${category}` as never)} — ${t('audit.totalRows', { count: total + live.added })}`}
        actions={
          denied ? undefined : (
            <ActionMenu
              label={t('audit.export')}
              icon={<Download size={14} />}
              width={180}
              items={EXPORTS.map((f) => ({
                key: f.format,
                label: t(`audit.${f.labelKey}`),
                loading: exporting,
                disabled: exporting || rangeInvalid,
                onClick: () => void exportAs(f),
              }))}
            />
          )
        }
      />

      {jobId && <ExportJobPanel jobId={jobId} onClose={() => setJob(null)} />}

      <Segmented
        className="mb-4"
        aria-label={t('audit.title')}
        value={category}
        onChange={selectCategory}
        options={AUDIT_CATEGORIES.map((c) => ({
          value: c,
          label: t(`audit.cat_${c}` as never),
          count: countOf(c),
        }))}
      />

      <Card className="flex h-[calc(100dvh-15rem)] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('audit.searchPlaceholder')}
            className="flex-1 lg:max-w-md"
          />
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={narrowingCount} />
          <FilterReset count={activeCount} onReset={reset} />
          <button
            type="button"
            aria-pressed={liveOn && liveAllowed}
            disabled={!liveAllowed}
            title={liveAllowed ? t('auditLive.hint') : t('auditLive.onlyFirstPage')}
            onClick={() => setLiveOn((v) => !v)}
            className={cn(filterChip(liveOn && liveAllowed), 'disabled:cursor-not-allowed disabled:opacity-50 lg:ml-auto')}
          >
            <Radio size={14} aria-hidden="true" className={cn(liveOn && liveAllowed && 'text-success')} />
            {t('auditLive.toggle')}
            {liveOn && liveAllowed && live.lastPoll && (
              <span className="tabular-nums text-[11px] text-fg-subtle">{dayjs(live.lastPoll).format('HH:mm:ss')}</span>
            )}
          </button>
          {filtersOpen && (
            <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {/* The journal's OWN branch picker — empty means every branch. */}
              <Combobox
                value={filters.branch}
                onChange={(v) => setFilters({ branch: v || null, user: null })}
                options={branchOptions}
                placeholder={t('audit.allBranches')}
                className="w-full"
              />
              <Combobox
                value={filters.user}
                onChange={(v) => setFilter('user', v)}
                options={actorOptions}
                loading={actors.isLoading}
                placeholder={t('audit.allUsers')}
                searchPlaceholder={t('audit.userSearchPlaceholder')}
                className="w-full"
              />
              <Combobox
                value={action}
                onChange={(v) => setFilter('action', v)}
                options={allowedActions.map((a) => ({ value: a, label: actionLabel(a) }))}
                placeholder={t('audit.allActions')}
                className="w-full"
              />
              <Combobox
                value={filters.res}
                onChange={(v) => setFilter('res', v)}
                options={resourceOptions}
                placeholder={t('audit.allResources')}
                className="w-full"
              />
              {(category === 'errors' || category === 'all') && (
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
              <Combobox
                value={result}
                onChange={(v) => setFilter('result', v)}
                options={[
                  { value: 'success', label: t('audit.resultSuccess') },
                  { value: 'failure', label: t('audit.resultFailure') },
                ]}
                placeholder={t('audit.allResults')}
                className="w-full"
              />
              <DateInput
                value={filters.from}
                onChange={(v) => setFilter('from', v)}
                invalid={rangeInvalid}
                aria-label={t('audit.dateFrom')}
                className="w-full"
              />
              <DateInput
                value={filters.to}
                onChange={(v) => setFilter('to', v)}
                invalid={rangeInvalid}
                aria-label={t('audit.dateTo')}
                className="w-full"
              />
            </div>
          )}
          {rangeInvalid && (
            <p role="alert" className="w-full text-xs text-danger">
              {t('list.invalidRange')}
            </p>
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
          filtered={!denied && activeCount > 0}
          emptyAction={<FilterReset count={activeCount} onReset={reset} />}
          minWidth={1100}
          sort={sort}
          onSort={(s) => setFilter('sort', s.key === 'time' && s.dir === 'desc' ? '' : `${SORT_FIELD[s.key]}:${s.dir}`)}
          onRowClick={setViewing}
          rowClassName={(row) => (live.fresh.has(row.id) ? 'bg-success-soft/70 transition-colors duration-700' : undefined)}
        />

        <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <AuditDetailModal row={viewing} onClose={() => setViewing(null)} actionLabel={actionLabel} resourceLabel={resourceLabel} />
    </PageContainer>
  )
}

function ResultMark({ failure }: { failure: boolean }) {
  const { t } = useTranslation()
  return failure ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-danger">
      <XCircle size={13} aria-hidden /> {t('audit.resultFailure')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-success">
      <CheckCircle2 size={13} aria-hidden /> {t('audit.resultSuccess')}
    </span>
  )
}

/** «Chrome 128 · Windows» out of a raw user-agent string. */
function shortAgent(ua: string | null | undefined, appLabel: string) {
  if (!ua) return '—'
  const ver = (re: RegExp) => re.exec(ua)?.[1]
  const browser = ver(/Edg\/(\d+)/) ? `Edge ${ver(/Edg\/(\d+)/)}`
    : ver(/OPR\/(\d+)/) ? `Opera ${ver(/OPR\/(\d+)/)}`
    : ver(/YaBrowser\/(\d+)/) ? `Yandex ${ver(/YaBrowser\/(\d+)/)}`
    : ver(/Chrome\/(\d+)/) ? `Chrome ${ver(/Chrome\/(\d+)/)}`
    : ver(/Firefox\/(\d+)/) ? `Firefox ${ver(/Firefox\/(\d+)/)}`
    : /Version\/(\d+).*Safari/.test(ua) ? `Safari ${ver(/Version\/(\d+)/)}`
    : /okhttp|Expo|Dart|CFNetwork/i.test(ua) ? appLabel
    : ua.split(' ')[0]
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

/**
 * One journal entry in full: who, where from, the outcome (response code and
 * the server's reason for a failure) and the request body the middleware
 * stored (passwords and tokens already masked).
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
  const d = row?.details && typeof row.details === 'object' && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : null
  const hasBody = row?.details != null && !(typeof row.details === 'object' && Object.keys(row.details as object).length === 0)
  const body = hasBody ? JSON.stringify(row!.details, null, 2) : ''
  const failure = row ? isFailure(row) : false
  const items: [string, ReactNode][] = row
    ? [
        [t('audit.colTime'), row.created_at ? formatDateTime(row.created_at) : '—'],
        [t('audit.colUser'), row.employee_name || '—'],
        [t('audit.colActorBranch'), lt(row.actor_branch_name) || '—'],
        [t('audit.colTargetBranch'), lt(row.organization_branch_name) || '—'],
        [t('audit.colAction'), actionLabel(row.action)],
        [t('audit.colResult'), <ResultMark key="r" failure={failure} />],
        [
          t('audit.colResource'),
          row.resource_type ? `${resourceLabel(row.resource_type)}${row.resource_id ? ` #${row.resource_id}` : ''}` : '—',
        ],
        [t('audit.colIp'), row.ip_address || '—'],
        [t('audit.device'), <span key="ua" title={row.user_agent ?? undefined}>{shortAgent(row.user_agent, t('audit.mobileApp'))}</span>],
        ...(d?.status != null ? ([[t('audit.responseCode'), String(d.status)]] as [string, ReactNode][]) : []),
        ...(d?.code != null ? ([[t('audit.errorCode'), String(d.code)]] as [string, ReactNode][]) : []),
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
          {failure && d?.error != null && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <b>{t('audit.errorReason')}:</b> {String(d.error)}
              </span>
            </p>
          )}
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
