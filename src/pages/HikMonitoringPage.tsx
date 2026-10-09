import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, MonitorSmartphone, Pencil, RefreshCw, UserCheck } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useListParams } from '@/hooks/useListParams'
import { errorMessage } from '@/api/errorMessage'
import { formatDateTime } from '@/lib/format'
import { useHikActions, useHikMonitoring, type HikDevice } from '@/features/system/useSystemAdmin'
import { useHikAuditLogs, useHikDeviceActions, type HikAuditRow } from '@/features/system/useDevices'
import { HikAuditDetailModal } from '@/features/system/HikAuditDetailModal'
import { HikDeviceModal } from '@/features/system/HikDeviceModal'

/*
 * WHAT HIKCENTRAL THINKS.
 *
 * Three questions: are the devices answering, did every employee's face and
 * card actually reach them, and — when the answer to either is no — what did
 * the integration try and what came back. An employee stuck at "failed" is
 * invisible to the turnstile: they show up as absent no matter how early they
 * arrive, which is why the failures are listed with a way to push them again
 * and an audit trail to explain why the push keeps failing.
 */
const ENROLL_TONE: Record<string, BadgeTone> = {
  verified: 'success',
  synced: 'info',
  pending: 'warning',
  failed: 'danger',
}

/** Operations the integration writes into the audit log. */
const AUDIT_OPERATIONS = ['add', 'face', 'verify', 'backfill', 'resync', 'access', 'device_status', 'rename', 'direction']
const AUDIT_RESULTS = ['ok', 'failed', 'skipped']

const HIK_KEYS = ['tab', 'online', 'operation', 'result'] as const

interface DeviceRow extends HikDevice {
  id: number
}

function HikMonitoringPageInner() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  /*
   * ⚠️ `sortValue` ALONE DOES NOTHING. `DataTable` makes a header clickable only
   * when BOTH `sortValue` and `onSort` are present — the device columns declared
   * one without the other, so "sort by online/offline" was dead. Same defect the
   * medical register already fixed once.
   */
  const [sort, setSort] = useState<SortState | null>(null)
  const toast = useToast()
  const { page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams(HIK_KEYS)
  const tab = filters.tab || 'devices'

  /* The device headers map onto the server's `sort_by` (`effective_name` →
     name, `online` → online); other tabs keep their page-local sort. */
  const deviceSortBy = tab === 'devices' && sort ? ({ effective_name: 'name', online: 'online' } as const)[sort.key as 'effective_name' | 'online'] : undefined
  const { summary, devices, enrollments, total, pages, loading, fetching, error, refetch } = useHikMonitoring(tab, {
    page,
    size,
    online: filters.online,
    sortBy: deviceSortBy,
    sortDir: sort?.dir,
  })
  const audit = useHikAuditLogs({
    page,
    size,
    operation: filters.operation,
    result: filters.result,
    enabled: tab === 'audit',
  })
  const actions = useHikActions()
  const deviceActions = useHikDeviceActions()

  const [editingDevice, setEditingDevice] = useState<DeviceRow | null>(null)
  const [openAudit, setOpenAudit] = useState<HikAuditRow | null>(null)

  const run = async (fn: () => Promise<unknown>, okMessage: string) => {
    try {
      await fn()
      toast.ok(okMessage)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const deviceColumns: Column<DeviceRow>[] = [
    {
      key: 'name',
      header: t('hik.colDevice'),
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{d.effective_name || d.acs_dev_name || `#${d.id}`}</p>
          {/* The appliance's own name is kept in view whenever an HR-side
              override hides it — it is what an engineer sees in HikCentral. */}
          {d.display_name && d.display_name !== d.acs_dev_name && (
            <p className="truncate text-xs text-fg-muted">{t('hik.hikName', { name: d.acs_dev_name ?? '—' })}</p>
          )}
        </div>
      ),
      sortValue: (d) => d.effective_name ?? d.acs_dev_name ?? '',
    },
    {
      key: 'ip',
      header: t('turnstiles.fieldIp'),
      cell: (d) => (
        <span className="font-mono text-xs text-fg-muted">
          {[d.acs_dev_ip, d.acs_dev_port].filter(Boolean).join(':') || '—'}
        </span>
      ),
    },
    {
      key: 'direction',
      header: t('hik.colDirection'),
      cell: (d) =>
        (d.doors ?? []).length === 0 ? (
          <span className="text-sm text-fg-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {d.doors!.map((door) => (
              <Badge key={door.id} tone={door.direction_type === 'exit' ? 'warning' : door.direction_type === 'entrance' ? 'success' : 'neutral'}>
                {door.direction_type === 'exit'
                  ? t('turnstiles.dirExit')
                  : door.direction_type === 'entrance'
                    ? t('turnstiles.dirEntrance')
                    : t('turnstiles.dirUnset')}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'online',
      header: t('hik.colStatus'),
      // `online` is the server's verdict — the browser must not re-derive it
      // from the raw HikCentral status code.
      cell: (d) => <Badge tone={d.online ? 'success' : 'danger'}>{d.online ? t('turnstiles.online') : t('turnstiles.offline')}</Badge>,
      sortValue: (d) => (d.online ? 1 : 0),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[110px]',
      cell: (d) => (
        <Button size="sm" variant="outline" leftIcon={<Pencil size={13} />} onClick={() => setEditingDevice(d)}>
          {t('common.edit')}
        </Button>
      ),
    },
  ]

  const auditColumns: Column<HikAuditRow>[] = [
    { key: 'created_at', header: t('hik.colTime'), cell: (r) => <span className="text-xs text-fg-muted">{formatDateTime(r.created_at)}</span> },
    {
      key: 'who',
      header: t('hik.colEmployee'),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">
            {r.employee_name || (r.turnstile_name ? t('hik.deviceRow', { name: r.turnstile_name }) : '—')}
          </p>
          <p className="truncate text-xs text-fg-muted">{r.branch_name || r.personal_identification_number || ''}</p>
        </div>
      ),
    },
    { key: 'operation', header: t('hik.colOperation'), cell: (r) => <span className="text-sm text-fg">{r.operation || '—'}</span> },
    {
      key: 'result',
      header: t('hik.colResult'),
      cell: (r) => <Badge tone={r.result === 'ok' ? 'success' : r.result === 'skipped' ? 'neutral' : 'danger'}>{r.result || '—'}</Badge>,
    },
    { key: 'message', header: t('hik.colMessage'), cell: (r) => <span className="truncate text-xs text-fg-muted">{r.message || '—'}</span> },
  ]

  const enrollColumns: Column<{ id: number } & (typeof enrollments)[number]>[] = [
    { key: 'name', header: t('hik.colEmployee'), cell: (e) => <span className="text-sm font-medium text-fg">{e.legal_name || `#${e.employee_id}`}</span> },
    { key: 'pinfl', header: t('hik.colPinfl'), cell: (e) => <span className="font-mono text-xs text-fg-muted">{e.personal_identification_number || '—'}</span> },
    {
      key: 'status',
      header: t('hik.colStatus'),
      cell: (e) => <Badge tone={ENROLL_TONE[e.status ?? ''] ?? 'neutral'}>{t(`hik.status_${e.status ?? 'pending'}` as 'hik.status_pending')}</Badge>,
    },
    {
      key: 'error',
      header: t('hik.colError'),
      cell: (e) =>
        e.device_face_error ? (
          <span className="truncate text-xs text-danger" title={e.device_face_error}>
            {e.device_face_error}
          </span>
        ) : (
          <span className="truncate text-xs text-fg-muted" title={e.last_error ?? ''}>
            {e.last_error || (e.last_attempt_at ? formatDateTime(e.last_attempt_at) : '—')}
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[120px]',
      cell: (e) => (
        <Button
          size="sm"
          variant="outline"
          loading={actions.resync.isPending}
          onClick={async () => {
            if (!e.employee_id) return
            if (!(await confirm({ kind: 'action', subject: e.legal_name || `#${e.employee_id}`, confirmLabel: t('hik.resync') }))) return
            await run(() => actions.resync.mutateAsync(e.employee_id!), t('hik.resyncQueued'))
          }}
        >
          {t('hik.resync')}
        </Button>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('hik.title')}
        subtitle={t('hik.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-ui">
            {/* Asks HikCentral for each device's online state right now, instead
                of waiting for the periodic refresh — the first thing to do when
                a turnstile is reported dead. */}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw size={14} />}
              loading={deviceActions.refreshDevices.isPending}
              onClick={() => run(() => deviceActions.refreshDevices.mutateAsync(), t('hik.devicesRefreshed'))}
            >
              {t('hik.refreshDevices')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw size={14} />}
              loading={actions.resyncAll.isPending}
              onClick={async () => {
                if (await confirm({ kind: 'action', confirmLabel: t('hik.resyncAll') })) await run(() => actions.resyncAll.mutateAsync(), t('hik.resyncQueued'))
              }}
            >
              {t('hik.resyncAll')}
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={MonitorSmartphone} label={t('hik.devicesOnline')} value={`${summary?.devices_online ?? 0} / ${summary?.devices_total ?? 0}`} tone="success" />
        <Stat icon={Activity} label={t('hik.devicesOffline')} value={summary?.devices_offline ?? 0} tone={summary?.devices_offline ? 'danger' : 'neutral'} />
        <Stat icon={UserCheck} label={t('hik.enrollVerified')} value={summary?.enrollment_verified ?? 0} tone="success" />
        <Stat icon={UserCheck} label={t('hik.enrollFailed')} value={summary?.enrollment_failed ?? 0} tone={summary?.enrollment_failed ? 'danger' : 'neutral'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={(v) => setFilter('tab', v === 'devices' ? '' : v)}
          options={[
            { value: 'devices', label: t('hik.tabDevices') },
            { value: 'enrollments', label: t('hik.tabEnrollments') },
            { value: 'audit', label: t('hik.tabAudit') },
          ]}
        />
        {tab === 'devices' && (
          <Select
            value={filters.online}
            onChange={(e) => setFilter('online', e.target.value)}
            placeholder={t('hik.filterAllDevices')}
            wrapperClassName="w-[160px]"
            options={[
              { value: 'true', label: t('turnstiles.online') },
              { value: 'false', label: t('turnstiles.offline') },
            ]}
          />
        )}
        {tab === 'audit' && (
          <>
            <Select
              value={filters.operation}
              onChange={(e) => setFilter('operation', e.target.value)}
              placeholder={t('hik.filterAllOperations')}
              wrapperClassName="w-[180px]"
              options={AUDIT_OPERATIONS.map((v) => ({ value: v, label: v }))}
            />
            <Select
              value={filters.result}
              onChange={(e) => setFilter('result', e.target.value)}
              placeholder={t('hik.filterAllResults')}
              wrapperClassName="w-[180px]"
              options={AUDIT_RESULTS.map((v) => ({ value: v, label: v }))}
            />
          </>
        )}
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      <Card>
        {tab === 'devices' && (
          <>
            <DataTable
        tableId="hik-monitoring-1"
              sort={sort}
              onSort={setSort}
              rows={devices as DeviceRow[]}
              columns={deviceColumns}
              loading={loading}
              error={error}
              onRetry={refetch}
              filtered={!!filters.online}
              emptyTitle={t('hik.noDevices')}
              emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
              minWidth={900}
            />
            <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
          </>
        )}

        {tab === 'enrollments' && (
          <>
            <DataTable
        tableId="hik-monitoring-2"
              sort={sort}
              onSort={setSort}
              rows={enrollments.map((e) => ({ ...e, id: e.employee_id ?? 0 }))}
              columns={enrollColumns}
              loading={loading}
              error={error}
              onRetry={refetch}
              emptyTitle={t('hik.allEnrolled')}
              emptyDescription={t('hik.allEnrolledHint')}
              minWidth={900}
            />
            <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
          </>
        )}

        {tab === 'audit' && (
          <>
            <DataTable
        tableId="hik-monitoring-3"
              sort={sort}
              onSort={setSort}
              rows={audit.rows.map((r) => ({ ...r, id: r.id }))}
              columns={auditColumns}
              loading={audit.loading}
              error={audit.error}
              onRetry={audit.refetch}
              onRowClick={setOpenAudit}
              filtered={!!(filters.operation || filters.result)}
              emptyTitle={t('hik.noAudit')}
              emptyDescription={t('hik.noAuditHint')}
              emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
              minWidth={900}
            />
            <Pagination page={page} size={size} total={audit.total} pages={audit.pages} onPage={setPage} onSize={setSize} loading={audit.fetching} />
          </>
        )}
      </Card>

      <HikDeviceModal device={editingDevice} onClose={() => setEditingDevice(null)} />
      <HikAuditDetailModal row={openAudit} onClose={() => setOpenAudit(null)} />
    </PageContainer>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string | number
  tone: 'success' | 'danger' | 'neutral'
}) {
  const toneCls =
    tone === 'success' ? 'bg-success-soft text-success' : tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-muted'
  return (
    <Card className="flex items-center gap-3 p-card">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneCls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-fg-muted">{label}</span>
        <span className="block truncate text-[16px] font-semibold tabular-nums text-fg">{value}</span>
      </span>
    </Card>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function HikMonitoringPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.canAccessSystemAdmin(user)} title={t('hik.title')}>
      <HikMonitoringPageInner />
    </RequireRole>
  )
}
