import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, CircleSlash, Pencil, Phone, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '@/lib/cn'
import { useToast } from '@/components/ui/Toast'
import { useFilterReset } from '@/hooks/useFilterReset'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { BulkEditGrid, type GridField } from '@/components/data/BulkEditGrid'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useAuthStore } from '@/store/authStore'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { formatAppDate } from '@/lib/format'
import { useGuests, useGuestMutations, useGuestSummary, type Guest } from '@/features/guests/useGuests'
import { GuestFormModal } from '@/features/guests/GuestFormModal'
import { GuestProfileModal } from '@/features/guests/GuestProfileModal'
import { filterTile } from '@/components/ui/control'

const FILTER_KEYS = ['status', 'visit'] as const

/** Pass validity as the guard at the gate reads it. */
const passState = (g: Guest): 'valid' | 'soon' | 'expired' | 'none' => {
  if (!g.valid_until) return 'none'
  const end = dayjs(g.valid_until)
  if (end.isBefore(dayjs())) return 'expired'
  return end.diff(dayjs(), 'day') < 2 ? 'soon' : 'valid'
}
const PASS_TONE = { valid: 'bg-success-soft text-success', soon: 'bg-warning-soft text-warning', expired: 'bg-danger-soft text-danger', none: 'bg-surface-2 text-fg-subtle' } as const

export function GuestsPage() {
  const canRegister = !!useAuthStore((st) => st.user?.employee?.id)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Guest | null>(null)
  const { t } = useTranslation()
  const lp = useListParams(FILTER_KEYS)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter } = lp
  const { count: activeFilterCount, reset } = useFilterReset(lp, ['status', 'visit'])
  const toast = useToast()

  const guestFilters = { search, status: filters.status || undefined, visit: filters.visit || undefined }
  const { rows, total, pages, loading, fetching, error, refetch, loadAllIds } = useGuests(guestFilters, page, size)
  const stats = useGuestSummary(search)
  const { update, remove, invalidate } = useGuestMutations()
  const bulk = useBulkAction()

  // Selection survives paging; «select all N» asks the server for every id.
  const selection = useRowSelection(rows, {
    total,
    loadAllIds,
    resetKey: JSON.stringify([search, filters.status, filters.visit]),
  })
  // Rows seen on any page, so a selection that spans pages can still be edited.
  const seen = useRef(new Map<number, Guest>())
  for (const r of rows) seen.current.set(r.id, r)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  // Results go to toasts (the green banner stayed until the next reload).
  const setNotice = (n: { kind: 'ok' | 'warn'; text: string }) => (n.kind === 'ok' ? toast.ok(n.text) : toast.error(n.text))

  // From the whole filtered set: the selection may span pages.
  const selectedRows = useMemo(
    () => selection.selectedIds.map((id) => seen.current.get(id)).filter((r): r is Guest => !!r),
    [selection.selectedIds],
  )

  const finish = (failed: number[], okMessage: string) => {
    invalidate()
    if (failed.length) {
      setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    } else {
      setNotice({ kind: 'ok', text: okMessage })
      selection.clear()
    }
  }

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => remove.mutateAsync(id))
    finish(failed, t('guests.deleted', { count: ids.length - failed.length }))
  }

  const doBulkEdit = async (patches: Record<number, Record<string, unknown>>) => {
    const ids = Object.keys(patches).map(Number)
    setBulkEditOpen(false)
    const failed = await bulk.run(ids, (id) => update.mutateAsync({ id, body: patches[id] }))
    finish(failed, t('guests.updated', { count: ids.length - failed.length }))
  }

  const statusOptions = [
    { value: 'active', label: t('guests.statusActive') },
    { value: 'inactive', label: t('guests.statusInactive') },
  ]

  const gridFields: GridField<Guest>[] = [
    { key: 'legal_name', label: t('guests.fieldName'), type: 'text', width: 220 },
    { key: 'organization_name', label: t('guests.fieldOrganization'), type: 'text', width: 200, fillable: true },
    { key: 'job_position', label: t('guests.fieldPosition'), type: 'text', width: 170, fillable: true },
    { key: 'phone_number', label: t('guests.fieldPhone'), type: 'text', width: 150 },
    { key: 'telegram_username', label: t('guests.fieldTelegram'), type: 'text', width: 150 },
    /* ⚠️ `personal_identification_number` and `card_no` are NOT editable here.
     * Both are generated by the server on creation (`Mehmon{id}` and a random
     * 12-digit card token that is the turnstile match key). The grid used to
     * offer them as text cells and send them in the PATCH; `VisitorUpdate`
     * does not declare them, so the request returned 200 and the value never
     * changed — "updated N" with nothing updated (2026-09-11 audit). */
  ]

  const columns: Column<Guest>[] = [
    {
      key: 'guest',
      header: t('guests.colGuest'),
      skeleton: 'w-44',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name} size={34} />
          <span className="min-w-0 truncate font-semibold text-fg">
            {row.legal_name || t('common.unknown')}
          </span>
        </div>
      ),
    },
    {
      key: 'organization',
      header: t('guests.colOrganization'),
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{row.organization_name || '—'}</span>
          {row.job_position && <span className="truncate text-[12px] text-fg-subtle">{row.job_position}</span>}
        </span>
      ),
    },
    {
      key: 'phone',
      header: t('guests.colPhone'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-24',
      cell: (row) => row.phone_number || '—',
    },
    {
      key: 'host',
      header: t('guests.colHost'),
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {row.host_employee_name && <Avatar src={row.host_employee_photo_thumb_path} name={row.host_employee_name} size={26} />}
          <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{row.host_employee_name || '—'}</span>
          {row.host_employee_internal_phone && (
            <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-fg-subtle"><Phone size={11} />{row.host_employee_internal_phone}</span>
          )}
          </span>
        </span>
      ),
    },
    {
      key: 'pass',
      header: t('guests.colPass'),
      skeleton: 'w-20',
      cell: (row) => {
        const st = passState(row)
        return (
          <span className={cn('inline-flex whitespace-nowrap rounded-pill px-2 py-0.5 text-[11.5px] font-semibold', PASS_TONE[st])}>
            {st === 'none' ? '—' : st === 'expired' ? t('guests.passExpired') : t('guests.passUntil', { date: dayjs(row.valid_until).format('DD.MM.YYYY') })}
          </span>
        )
      },
    },
    {
      // Last visit + how many, one column: two narrow columns pushed «Holat»
      // off the right edge (2026-09-24).
      key: 'lastVisit',
      header: t('guests.colLastVisit'),
      skeleton: 'w-20',
      cell: (row) =>
        row.last_visit_time ? (
          <span className="flex flex-col whitespace-nowrap">
            <span className="tabular-nums text-fg">{formatAppDate(row.last_visit_time)}</span>
            <span className="text-[12px] tabular-nums text-fg-subtle">{t('guests.visitsN', { count: row.visit_count ?? 0 })}</span>
          </span>
        ) : (
          <span className="whitespace-nowrap text-fg-subtle">{t('guests.never')}</span>
        ),
    },
    {
      key: 'status',
      header: t('guests.colStatus'),
      skeleton: 'w-14',
      cell: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'} className="whitespace-nowrap">
          {row.is_active ? t('guests.statusActive') : t('guests.statusInactive')}
        </Badge>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('guests.title')}
        subtitle={t('guests.subtitle')}
        actions={
          /* A visitor is registered BY an employee host (`_validate_user` on the
             server), so an account with no employee row can only ever get a 403
             from this form — the button belongs to people, not to admin logins. */
          canRegister ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setFormOpen(true) }}>
              {t('guests.create')}
            </Button>
          ) : undefined
        }
      />

      {/* The guest book at a glance; each count is a filter (redesign 2026-09-24). */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {([
          ['', '', t('guests.statTotal'), stats.total, <Users key="i" size={17} />, 'from-[#8B5CF6] to-[#6D28D9]'],
          ['status', 'active', t('guests.statActive'), stats.active, <ShieldCheck key="i" size={17} />, 'from-[#34D399] to-[#059669]'],
          ['visit', 'today', t('guests.statToday'), stats.today, <CalendarCheck key="i" size={17} />, 'from-[#38BDF8] to-[#0284C7]'],
          ['visit', 'never', t('guests.statNever'), stats.never, <CircleSlash key="i" size={17} />, 'from-[#94A3B8] to-[#64748B]'],
        ] as const).map(([k, v, label, value, icon, tone]) => {
          const on = k ? filters[k] === v : !filters.status && !filters.visit
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => (k ? setFilter(k, on ? '' : v) : reset())}
              className={filterTile(on, 'hover:-translate-y-0.5')}
            >
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', tone)}>{icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-fg-muted">{label}</span>
                <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{value}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Card className="flex h-[calc(100dvh-19rem)] min-h-[420px] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('guests.searchPlaceholder')} className="flex-1 lg:max-w-md" />
          <Combobox
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            options={statusOptions}
            placeholder={t('guests.allStatuses')}
            className="w-full lg:w-48"
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        <DataTable
        tableId="guests"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={selection}
          onRowClick={(row) => setProfileId(row.id)}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          emptyTitle={t('guests.empty')}
          emptyDescription={t('guests.emptyHint')}
          minWidth={900}
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

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        <Button size="sm" variant="secondary" leftIcon={<Pencil size={15} />} onClick={() => setBulkEditOpen(true)}>
          {t('employees.bulkEdit')}
        </Button>
        <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
          {t('common.delete')}
        </Button>
      </BulkBar>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        danger
        title={t('guests.deleteTitle')}
        description={t('guests.deleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <BulkEditGrid
        open={bulkEditOpen}
        rows={selectedRows}
        fields={gridFields}
        title={t('guests.bulkEditTitle')}
        description={t('employees.bulkEditGridHint', { count: selectedRows.length })}
        rowLabel={(g) => g.legal_name ?? ''}
        onClose={() => setBulkEditOpen(false)}
        onSave={doBulkEdit}
        saving={bulk.progress.running}
      />

      <GuestProfileModal
        guestId={profileId}
        onClose={() => setProfileId(null)}
        onEdit={() => {
          setEditing(rows.find((r) => r.id === profileId) ?? null)
          setProfileId(null)
          setFormOpen(true)
        }}
      />
      <GuestFormModal
        open={formOpen}
        guest={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(msg) => {
          setFormOpen(false)
          setEditing(null)
          setNotice({ kind: 'ok', text: msg })
        }}
      />
    </PageContainer>
  )
}
