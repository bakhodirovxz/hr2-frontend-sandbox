import { useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Car, Check, Fuel, History, MapPin, Pencil, Plus, Route, Trash2, Wrench, X } from 'lucide-react'
import dayjs from 'dayjs'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { TD, TD_COMPACT, TH } from '@/components/data/tableStyles'
import { formatDateTime } from '@/lib/format'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { cn } from '@/lib/cn'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import type { Employee } from '@/types'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { VisitsTab } from '@/features/vehicles/VisitsTab'
import { AvailabilityChip, FleetOverview, GpsMark, PlateChip, today } from '@/features/vehicles/FleetBits'
import { BulkBar } from '@/components/data/BulkBar'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { Avatar } from '@/components/ui/Avatar'
import { DateInput } from '@/components/ui/DateInput'
import { FlowSteps, type FlowStep } from '@/components/data/FlowSteps'
import {
  useDriverOptions,
  useGpsUnits,
  useDriverScopeMutations,
  useDriverScopes,
  useFleetAccess,
  useFleetMutations,
  useFuelTypes,
  useVehicleRequestsPaged,
  useVehicles,
  type FuelType,
  type DriverScope,
  type Vehicle,
  type VehicleRequest,
  isFuelApproved,
  useFuelLogs,
} from '@/features/vehicles/useVehicles'

const REQ_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  awaiting_approval: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

/**
 * AVTOPARK — the cars lent to business trips.
 *
 * Three jobs on one page, because they are done by the same two or three
 * people: the FLEET itself (who owns which car), the REQUEST QUEUE (a trip
 * asked for a car; the head office passes it on, the fleet attaches a car and
 * a driver) and FUEL TYPES (a price that has to be approved before it counts).
 *
 * Which tabs appear comes from `GET /vehicles/access`, not from a guess about
 * the role: the same server answer decides what the request would allow.
 */
/**
 * The server accepts exactly these (`core/vehicle_types.FUEL_UNITS`) and
 * answers anything else with a raw 422. A free-text box invited typos that
 * only failed on save, so the unit is picked, not typed.
 */
const FUEL_UNITS = ['litr', 'm³', 'kVt·soat']

/** URL filter keys of the fleet tab and the request tab (the rest is `tab`, `req`, `q`). */
const FLEET_KEYS = ['state', 'avail', 'fuel', 'gps', 'drv'] as const
const REQUEST_KEYS = ['from', 'to', 'veh'] as const

export function VehiclesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { access, loading: accessLoading } = useFleetAccess()
  const user = useAuthStore((s) => s.user)
  const { filters, setFilter, setFilters, search, setSearch, reset } = useListParams(['tab', 'req', ...FLEET_KEYS, ...REQUEST_KEYS])
  const tab = filters.tab || 'fleet'
  const [adding, setAdding] = useState(false)
  const canSeeGps = !!(access?.can_manage || access?.can_approve)

  if (accessLoading) return <CenteredSpinner />

  if (access && !access.can_view) {
    return (
      <PageContainer>
        <PageHeader title={t('vehicles.title')} subtitle={t('vehicles.subtitle')} />
        <Card>
          <EmptyState icon={<Car size={20} />} title={t('vehicles.noAccess')} description={t('vehicles.noAccessHint')} />
        </Card>
      </PageContainer>
    )
  }

  const tabs = [
    { value: 'fleet', label: t('vehicles.tabFleet') },
    { value: 'requests', label: t('vehicles.tabRequests') },
    ...(access?.can_manage || access?.can_approve
      ? [{ value: 'fuel', label: t('vehicles.tabFuel') }]
      : []),
    // Where the cars stood (GPS stops beside cafés/hotels…) — driver tracking,
    // so the fleet operator and the transport approver, same gate as the live map.
    ...(canSeeGps ? [{ value: 'visits', label: t('vehicles.tabVisits') }] : []),
    // The driver scope is ONE global setting that decides who may be assigned a
    // car and who appears on the nurse's roster — so it belongs to the site
    // master-admin alone, like it does in v1.
    ...(roles.isSiteMasterAdmin(user) ? [{ value: 'drivers', label: t('vehicles.tabDrivers') }] : []),
  ]

  // Fleet-tab filters only count on the fleet tab; the request tab has its own.
  const fleetFilterCount = FLEET_KEYS.filter((k) => filters[k]).length + (search ? 1 : 0)
  const resetFleet = () => reset()

  return (
    <PageContainer>
      <PageHeader
        title={t('vehicles.title')}
        subtitle={t('vehicles.subtitle')}
        actions={
          access?.can_manage ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => { if (tab !== 'fleet') setFilter('tab', 'fleet'); setAdding(true) }}>
              {t('vehicles.add')}
            </Button>
          ) : undefined
        }
      />

      {/* The whole fleet at a glance; a tile is a shortcut into the matching
          filter, so "3 free" is one click away from the three cars. */}
      <FleetOverview
        canSeeQueue={!!(access?.can_manage || access?.can_approve)}
        onPick={(pick) => setFilters({ tab: pick.tab, avail: pick.avail ?? null, state: pick.state ?? null, gps: pick.gps ?? null, req: pick.req ?? null, q: null })}
      />

      <div className="mb-4">
        <Segmented value={tab} onChange={(v) => setFilter('tab', v)} options={tabs} />
      </div>

      {tab === 'fleet' && (
        <FleetTab
          canManage={!!access?.can_manage}
          search={search}
          setSearch={setSearch}
          filters={filters}
          setFilter={setFilter}
          reset={resetFleet}
          activeFilterCount={fleetFilterCount}
          addOpen={adding}
          onAddClose={() => setAdding(false)}
          onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
          onOk={(m) => toast.ok(m)}
        />
      )}
      {tab === 'requests' && (
        <RequestsTab
          canApprove={!!access?.can_approve}
          status={filters.req || (access?.can_approve ? 'awaiting_approval' : 'pending')}
          setStatus={(v) => setFilter('req', v)}
          filters={filters}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          reset={reset}
          onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
          onOk={(m) => toast.ok(m)}
        />
      )}
      {tab === 'visits' && canSeeGps && <VisitsTab />}
      {tab === 'drivers' && (
        <DriverScopeTab onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))} />
      )}

      {tab === 'fuel' && (
        <FuelTab
          canManage={!!access?.can_manage}
          canApprove={!!access?.can_approve}
          search={search}
          setSearch={setSearch}
          onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
          onOk={(m) => toast.ok(m)}
        />
      )}
    </PageContainer>
  )
}

/* ── Mashinalar ─────────────────────────────────────────────────────────── */

function FleetTab({
  canManage,
  search,
  setSearch,
  filters,
  setFilter,
  reset,
  activeFilterCount,
  addOpen,
  onAddClose,
  onError,
  onOk,
}: {
  canManage: boolean
  search: string
  setSearch: (v: string) => void
  filters: Record<string, string>
  setFilter: (k: string, v: string) => void
  reset: () => void
  activeFilterCount: number
  /** The page header owns the "add car" button (EDO style); the form is here. */
  addOpen: boolean
  onAddClose: () => void
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  // Today's range: the server then says per car whether it is on a trip or
  // asked for right now — the one thing the fleet wants to see in the list.
  const d = today()
  const { rows: all, loading, error, refetch } = useVehicles(search, false, { from: d, to: d })
  const { rows: fuels } = useFuelTypes()
  const mut = useFleetMutations()
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null)
  /** Deleting a car is irreversible; it used to fire on the first click. */
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const [bulk, setBulk] = useState<'delete' | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)

  // The fleet is tens of cars; the narrowing beyond the search is done here,
  // so the same list answers every filter without a request per click.
  const rows = useMemo(
    () =>
      all.filter((v) => {
        if (filters.state === 'active' && v.is_active === false) return false
        if (filters.state === 'inactive' && v.is_active !== false) return false
        if (filters.avail === 'free' && (v.is_busy || v.has_pending || v.is_active === false)) return false
        if (filters.avail === 'busy' && !v.is_busy) return false
        if (filters.avail === 'pending' && !(v.has_pending && !v.is_busy)) return false
        if (filters.fuel && String(v.fuel_type_id ?? '') !== filters.fuel) return false
        if (filters.gps === '1' && !v.gps_device_id) return false
        if (filters.gps === '0' && v.gps_device_id) return false
        if (filters.drv === '1' && !v.driver_employee_id) return false
        if (filters.drv === '0' && v.driver_employee_id) return false
        return true
      }),
    [all, filters],
  )
  const sel = useRowSelection(rows)
  const bulkRun = useBulkAction()

  /** One PATCH per selected car; the bar shows progress and failures. */
  const bulkPatch = async (body: Record<string, unknown>, doneMsg: string) => {
    const failed = await bulkRun.run(sel.selectedIds, (id) => mut.updateVehicle.mutateAsync({ id, body }))
    mut.invalidate()
    sel.clear()
    if (failed.length) onError(new Error(t('list.bulkFailedCount', { count: failed.length })))
    else onOk(doneMsg)
  }

  const columns: Column<Vehicle>[] = useMemo(
    () => [
      {
        key: 'plate',
        rowLink: true,
        header: t('vehicles.colPlate'),
        className: 'w-[168px]',
        sortValue: (r) => r.plate_number ?? '',
        cell: (r) => (
          <span className="inline-flex flex-col items-start gap-1">
            <PlateChip plate={r.plate_number} />
            <GpsMark v={r} />
          </span>
        ),
      },
      {
        key: 'model',
        header: t('vehicles.colModel'),
        sortValue: (r) => r.model_name ?? '',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-fg">{r.model_name || '—'}</p>
            <p className="truncate text-[11px] text-fg-subtle">
              {[r.color, r.seats ? `${r.seats} ${t('vehicles.seats')}` : null, r.year]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ),
      },
      {
        key: 'driver',
        header: t('vehicles.colDriver'),
        sortValue: (r) => r.driver?.legal_name ?? '',
        cell: (r) =>
          r.driver ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar src={r.driver.photo_thumb_path} fallbackSrc={r.driver.photo_path} name={r.driver.legal_name ?? ''} size={26} />
              <div className="min-w-0">
                <p className="truncate text-[13px] text-fg">{r.driver.legal_name}</p>
                {r.driver_available === false && r.driver_block_reason ? (
                  <p className="truncate text-[11px] text-danger">{r.driver_block_reason}</p>
                ) : r.driver_position ? (
                  <p className="truncate text-[11px] text-fg-subtle">{r.driver_position}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="text-[12px] text-fg-subtle">{t('vehicles.noDriver')}</span>
          ),
      },
      {
        key: 'fuel',
        header: t('vehicles.colFuel'),
        className: 'w-[170px]',
        sortValue: (r) => r.fuel_type_name ?? '',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-fg">{r.fuel_type_name || '—'}</p>
            <p className="truncate text-[11px] tabular-nums text-fg-subtle">
              {r.fuel_consumption ? `${r.fuel_consumption} ${r.fuel_unit ?? ''}` : ''}
              {r.fuel_price != null ? `${r.fuel_consumption ? ' · ' : ''}${Number(r.fuel_price).toLocaleString('ru-RU')} ${t('vehicles.sum')}` : ''}
            </p>
          </div>
        ),
      },
      {
        key: 'today',
        header: t('vehicles.colToday'),
        className: 'w-[180px]',
        sortValue: (r) => (r.is_active === false ? 3 : r.is_busy ? 2 : r.has_pending ? 1 : 0),
        cell: (r) => <AvailabilityChip v={r} />,
      },
      ...(canManage
        ? [
            {
              key: 'actions',
              header: '',
              headerClassName: 'w-20',
              className: 'text-right pr-4',
              cell: (r: Vehicle) => (
                // ⚠️ `stopPropagation`: the row itself opens the car's profile,
                // so without it "edit" and "delete" both just navigated away.
                <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleting(r)}>
                    <Trash2 size={14} />
                  </IconButton>
                </span>
              ),
            } as Column<Vehicle>,
          ]
        : []),
    ],
    [t, canManage, setEditing, setDeleting],
  )

  const stateOptions = [
    { value: 'active', label: t('vehicles.inService') },
    { value: 'inactive', label: t('vehicles.inactive') },
  ]
  const availOptions = [
    { value: 'free', label: t('vehicles.availFree') },
    { value: 'busy', label: t('vehicles.availOnTrip') },
    { value: 'pending', label: t('vehicles.availRequested') },
  ]
  const yesNo = (yes: string, no: string) => [
    { value: '1', label: yes },
    { value: '0', label: no },
  ]

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('vehicles.searchPlaceholder')} className="w-full sm:w-64" />
        <Select
          aria-label={t('vehicles.colState')}
          value={filters.state}
          onChange={(e) => setFilter('state', e.target.value)}
          placeholder={t('vehicles.filterAnyState')}
          options={stateOptions}
          wrapperClassName="w-[11rem]"
        />
        <Select
          aria-label={t('vehicles.colToday')}
          value={filters.avail}
          onChange={(e) => setFilter('avail', e.target.value)}
          placeholder={t('vehicles.filterAnyAvail')}
          options={availOptions}
          wrapperClassName="w-[11rem]"
        />
        <Select
          aria-label={t('vehicles.colFuel')}
          value={filters.fuel}
          onChange={(e) => setFilter('fuel', e.target.value)}
          placeholder={t('vehicles.filterAnyFuel')}
          options={fuels.map((f) => ({ value: String(f.id), label: f.name ?? '' }))}
          wrapperClassName="w-[11.5rem]"
        />
        <Select
          aria-label="GPS"
          value={filters.gps}
          onChange={(e) => setFilter('gps', e.target.value)}
          placeholder={t('vehicles.filterAnyGps')}
          options={yesNo(t('vehicles.filterGpsYes'), t('vehicles.filterGpsNo'))}
          wrapperClassName="w-[9.5rem]"
        />
        <Select
          aria-label={t('vehicles.colDriver')}
          value={filters.drv}
          onChange={(e) => setFilter('drv', e.target.value)}
          placeholder={t('vehicles.filterAnyDriver')}
          options={yesNo(t('vehicles.filterDriverYes'), t('vehicles.filterDriverNo'))}
          wrapperClassName="w-[12.5rem]"
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
        <span className="ml-auto text-[12px] tabular-nums text-fg-subtle">
          {t('vehicles.countCars', { count: rows.length })}
        </span>
      </div>

      <DataTable
        tableId="vehicles"
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={refetch}
        filtered={activeFilterCount > 0}
        emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
        emptyTitle={t('vehicles.empty')}
        emptyDescription={t('vehicles.emptyHint')}
        minWidth={940}
        sort={sort}
        onSort={setSort}
        selection={canManage ? sel : undefined}
        // The row is the way into the car's own page — its history, totals and
        // tracker live there, not in this list.
        rowHref={(r) => `/vehicles/${r.id}`}
      />

      {canManage && (
        <BulkBar count={sel.count} onClear={sel.clear} progress={bulkRun.progress}>
          <Button size="sm" variant="secondary" leftIcon={<Wrench size={14} />} onClick={async () => { if (await confirm({ kind: 'status', count: sel.count, confirmLabel: t('vehicles.bulkDeactivate') })) void bulkPatch({ is_active: false }, t('vehicles.bulkDeactivated')) }}>
            {t('vehicles.bulkDeactivate')}
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Check size={14} />} onClick={async () => { if (await confirm({ kind: 'status', count: sel.count, confirmLabel: t('vehicles.bulkActivate') })) void bulkPatch({ is_active: true }, t('vehicles.bulkActivated')) }}>
            {t('vehicles.bulkActivate')}
          </Button>
          <Button size="sm" variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => setBulk('delete')}>
            {t('common.delete')}
          </Button>
        </BulkBar>
      )}

      <ConfirmDialog
        open={bulk === 'delete'}
        onClose={() => setBulk(null)}
        onConfirm={async () => {
          setBulk(null)
          const failed = await bulkRun.run(sel.selectedIds, (id) => mut.removeVehicle.mutateAsync(id))
          mut.invalidate()
          sel.clear()
          if (failed.length) onError(new Error(t('list.bulkFailedCount', { count: failed.length })))
          else onOk(t('vehicles.removed'))
        }}
        danger
        title={t('vehicles.deleteTitle')}
        description={t('vehicles.bulkDeleteConfirm', { count: sel.count })}
        confirmLabel={t('common.delete')}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const v = deleting
          setDeleting(null)
          if (!v) return
          try {
            await mut.removeVehicle.mutateAsync(v.id)
            mut.invalidate()
            onOk(t('vehicles.removed'))
          } catch (e) {
            onError(e)
          }
        }}
        danger
        title={t('vehicles.deleteTitle')}
        description={t('vehicles.deleteConfirm', { plate: deleting?.plate_number ?? '' })}
        confirmLabel={t('common.delete')}
      />

      <VehicleModal
        value={addOpen ? 'new' : editing}
        onClose={() => { setEditing(null); onAddClose() }}
        onSaved={() => {
          mut.invalidate()
          onOk(t('common.saved'))
          setEditing(null)
          onAddClose()
        }}
        onError={onError}
      />
    </Card>
  )
}

function VehicleModal({
  value,
  onClose,
  onSaved,
  onError,
}: {
  value: Vehicle | 'new' | null
  onClose: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const open = !!value
  const editing = value !== 'new' ? (value as Vehicle | null) : null
  const mut = useFleetMutations()
  const { rows: fuels } = useFuelTypes(open)
  const drivers = useDriverOptions(open)
  // The tracker inventory comes from Wialon, so it is fetched only while the
  // form is open — and when that service is down we fall back to a plain id
  // field rather than making the car uneditable.
  const { units: gpsUnits, failed: gpsFailed } = useGpsUnits(open)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Seed the form when the modal opens (not on every render).
  const seedKey = open ? String(editing?.id ?? 'new') : ''
  const [seeded, setSeeded] = useState('')
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setForm({
      model_name: editing?.model_name ?? '',
      plate_number: editing?.plate_number ?? '',
      color: editing?.color ?? '',
      year: editing?.year ? String(editing.year) : '',
      seats: editing?.seats ? String(editing.seats) : '',
      fuel_type_id: editing?.fuel_type_id ? String(editing.fuel_type_id) : '',
      fuel_consumption: editing?.fuel_consumption ? String(editing.fuel_consumption) : '',
      gps_device_id: editing?.gps_device_id ?? '',
      driver_employee_id: editing?.driver_employee_id ? String(editing.driver_employee_id) : '',
    })
    setError('')
  }

  const submit = async () => {
    if (!form.plate_number?.trim()) return setError(t('vehicles.plateRequired'))
    if (!form.model_name?.trim()) return setError(t('vehicles.modelRequired'))
    const body: Record<string, unknown> = {
      model_name: form.model_name.trim(),
      plate_number: form.plate_number.trim().toUpperCase(),
      color: form.color?.trim() || null,
      year: form.year ? Number(form.year) : null,
      seats: form.seats ? Number(form.seats) : null,
      fuel_type_id: form.fuel_type_id ? Number(form.fuel_type_id) : null,
      fuel_consumption: form.fuel_consumption ? Number(form.fuel_consumption) : null,
      gps_device_id: form.gps_device_id?.trim() || null,
      driver_employee_id: form.driver_employee_id ? Number(form.driver_employee_id) : null,
    }
    try {
      if (editing) await mut.updateVehicle.mutateAsync({ id: editing.id, body })
      else await mut.createVehicle.mutateAsync(body)
      onSaved()
    } catch (e) {
      onError(e)
    }
  }

  const saving = mut.createVehicle.isPending || mut.updateVehicle.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('vehicles.editTitle') : t('vehicles.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('vehicles.colPlate')} required>
          <Input value={form.plate_number ?? ''} onChange={(e) => set('plate_number', e.target.value.toUpperCase())} />
        </Field>
        <Field label={t('vehicles.colModel')} required>
          <Input value={form.model_name ?? ''} onChange={(e) => set('model_name', e.target.value)} />
        </Field>
        <Field label={t('vehicles.fieldColor')}>
          <Input value={form.color ?? ''} onChange={(e) => set('color', e.target.value)} />
        </Field>
        <Field label={t('vehicles.fieldYear')}>
          <Input type="number" value={form.year ?? ''} onChange={(e) => set('year', e.target.value)} />
        </Field>
        <Field label={t('vehicles.fieldSeats')}>
          <Input type="number" value={form.seats ?? ''} onChange={(e) => set('seats', e.target.value)} />
        </Field>
        <Field label={t('vehicles.colFuel')}>
          <Select
            value={form.fuel_type_id ?? ''}
            onChange={(e) => set('fuel_type_id', e.target.value)}
            options={fuels.map((f) => ({ value: String(f.id), label: f.name ?? '—' }))}
            placeholder={t('t2.pick')}
          />
        </Field>
        <Field label={t('vehicles.fieldConsumption')}>
          <Input value={form.fuel_consumption ?? ''} onChange={(e) => set('fuel_consumption', e.target.value)} />
        </Field>
        <Field
          label={t('vehicles.fieldGps')}
          hint={gpsFailed ? t('vehicles.gpsUnitsFailed') : t('vehicles.gpsUnitHint')}
          wide
        >
          {gpsFailed ? (
            <Input value={form.gps_device_id ?? ''} onChange={(e) => set('gps_device_id', e.target.value)} />
          ) : (
            <Combobox
              value={form.gps_device_id ?? ''}
              onChange={(v) => set('gps_device_id', v)}
              options={gpsUnits.map((u) => ({
                value: String(u.id),
                label: u.name || u.plate || `#${u.id}`,
                // Says out loud that the object is already on another car —
                // silently stealing a tracker leaves the first car blind.
                subLabel:
                  u.vehicle_id && u.vehicle_id !== editing?.id
                    ? t('vehicles.gpsUnitTaken', { plate: u.vehicle_plate ?? '' })
                    : (u.plate ?? undefined),
              }))}
              placeholder={t('t2.pick')}
              className="w-full"
            />
          )}
        </Field>
        <Field label={t('vehicles.colDriver')} wide>
          <Combobox
            value={form.driver_employee_id ?? ''}
            onChange={(v) => set('driver_employee_id', v)}
            options={drivers}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
      </div>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}

/* ── So'rovlar navbati ──────────────────────────────────────────────────── */

function RequestsTab({
  canApprove,
  status,
  setStatus,
  filters,
  setFilter,
  search,
  setSearch,
  reset,
  onError,
  onOk,
}: {
  canApprove: boolean
  status: string
  setStatus: (v: string) => void
  filters: Record<string, string>
  setFilter: (k: string, v: string) => void
  search: string
  setSearch: (v: string) => void
  reset: () => void
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const { t } = useTranslation()
  const rangeInvalid = isInvalidRange(filters.from, filters.to)
  const { rows, loading, hasMore, loadingMore, loadMore } = useVehicleRequestsPaged(
    status,
    rangeInvalid ? { search } : { vehicleId: filters.veh, from: filters.from, to: filters.to, search },
  )
  const { rows: cars } = useVehicles('', false)
  const mut = useFleetMutations()
  const [acting, setActing] = useState<{ req: VehicleRequest; mode: 'approve' | 'respond' } | null>(null)
  const [finalizing, setFinalizing] = useState<VehicleRequest | null>(null)
  const [finalKm, setFinalKm] = useState('')
  const [finalNote, setFinalNote] = useState('')


  const statuses = [
    ...(canApprove ? [{ value: 'awaiting_approval', label: t('vehicles.reqAwaiting') }] : []),
    { value: 'pending', label: t('vehicles.reqPending') },
    { value: 'approved', label: t('vehicles.reqApproved') },
    { value: 'rejected', label: t('vehicles.reqRejected') },
  ]
  const filterCount = [filters.from, filters.to, filters.veh, search].filter(Boolean).length

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Segmented value={status} onChange={setStatus} options={statuses} />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder={t('vehicles.reqSearchPlaceholder')} className="w-full sm:w-60" />
          <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} aria-label={t('vehicles.gpsFrom')} className="w-[9.5rem]" invalid={rangeInvalid} />
          <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} aria-label={t('vehicles.gpsTo')} className="w-[9.5rem]" invalid={rangeInvalid} />
          <Select
            aria-label={t('vehicles.visitVehicle')}
            value={filters.veh}
            onChange={(e) => setFilter('veh', e.target.value)}
            placeholder={t('vehicles.visitAllVehicles')}
            options={cars.map((c) => ({ value: String(c.id), label: `${c.plate_number ?? ''} — ${c.model_name ?? ''}` }))}
            wrapperClassName="w-[13rem]"
          />
          <FilterReset count={filterCount} onReset={reset} />
        </div>
      </div>
      {rangeInvalid && <p role="alert" className="px-4 pt-2 text-xs text-danger">{t('list.invalidRange')}</p>}

      {loading ? (
        <CenteredSpinner />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Car size={20} />}
          title={filterCount ? t('common.noResults') : t('vehicles.noRequests')}
          description={filterCount ? undefined : t('vehicles.noRequestsHint')}
          action={filterCount ? <FilterReset count={filterCount} onReset={reset} /> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              onApprove={() => setActing({ req: r, mode: 'approve' })}
              onRespond={() => setActing({ req: r, mode: 'respond' })}
              onFinalize={() => { setFinalKm(''); setFinalNote(''); setFinalizing(r) }}
            />
          ))}
          {hasMore && (
            <li className="p-3 text-center">
              <Button size="sm" variant="ghost" loading={loadingMore} onClick={loadMore}>{t('common.loadMore')}</Button>
            </li>
          )}
        </ul>
      )}

      <RequestActionModal
        acting={acting}
        onClose={() => setActing(null)}
        onDone={(m) => {
          mut.invalidate()
          onOk(m)
          setActing(null)
        }}
        onError={onError}
      />
    
      {/* Actual cost after the trip. GPS fills it in when the car has a
          tracker; otherwise the kilometres are typed. */}
      <Modal
        open={!!finalizing}
        onClose={() => setFinalizing(null)}
        title={t('vehicles.finalize')}
        size="sm"
        description={t('vehicles.finalizeHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinalizing(null)}>{t('common.cancel')}</Button>
            <Button
              loading={mut.finalizeRequest.isPending}
              onClick={async () => {
                try {
                  await mut.finalizeRequest.mutateAsync({
                    id: (finalizing as VehicleRequest).id,
                    actual_distance_km: finalKm ? Number(finalKm) : undefined,
                    note: finalNote.trim() || undefined,
                  })
                  setFinalizing(null)
                  // Refresh like approve/respond do — the row kept its close
                  // button and old kilometres until a reload.
                  mut.invalidate()
                  onOk(t('vehicles.finalized'))
                } catch (e) {
                  onError(e)
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('vehicles.actualKm')}>
            <Input
              type="number"
              inputMode="decimal"
              value={finalKm}
              onChange={(e) => setFinalKm(e.target.value)}
              placeholder={t('vehicles.actualKmHint')}
            />
          </Field>
          <Field label={t('vehicles.note')}>
            <Textarea rows={2} value={finalNote} onChange={(e) => setFinalNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

    </Card>
  )
}

const RAIL: Record<string, string> = {
  pending: 'border-l-warning',
  awaiting_approval: 'border-l-info',
  approved: 'border-l-success',
  rejected: 'border-l-danger',
  cancelled: 'border-l-line-strong',
}

/**
 * Where a request stands on its road: head-office approval → the fleet
 * attaches a car → the trip → closed with the real figures. Rejection paints
 * the step it died at; a branch without an approver skips the first step.
 */
function requestSteps(r: VehicleRequest, t: TFunction): FlowStep[] {
  const st = r.status ?? 'pending'
  const needsApproval = r.approval_status && r.approval_status !== 'not_required'
  const rejectedAtApproval = st === 'rejected' && r.approval_status === 'rejected'
  const steps: FlowStep[] = []
  if (needsApproval) {
    steps.push({
      key: 'approve',
      label: t('vehicles.stepApprove'),
      state: rejectedAtApproval ? 'rejected' : st === 'awaiting_approval' ? 'current' : 'done',
    })
  }
  steps.push({
    key: 'attach',
    label: t('vehicles.stepAttach'),
    state:
      st === 'rejected' && !rejectedAtApproval
        ? 'rejected'
        : st === 'pending'
          ? 'current'
          : st === 'approved'
            ? 'done'
            : 'pending',
  })
  steps.push({
    key: 'trip',
    label: t('vehicles.stepTrip'),
    hint: r.vehicle?.plate_number ?? undefined,
    state: st === 'approved' ? (r.finalized_at ? 'done' : 'current') : 'pending',
  })
  steps.push({ key: 'close', label: t('vehicles.stepClose'), state: r.finalized_at ? 'done' : 'pending' })
  return steps
}

function RequestRow({ r, onApprove, onRespond, onFinalize }: { r: VehicleRequest; onApprove: () => void; onRespond: () => void; onFinalize: () => void }) {
  const { t } = useTranslation()
  const cost = r.actual_fuel_cost ?? r.fuel_cost
  const km = r.actual_distance_km ?? r.distance_km
  return (
    <li className={cn('flex flex-col gap-3 border-l-4 p-4 lg:flex-row lg:items-start lg:gap-5', RAIL[r.status ?? ''] ?? 'border-l-transparent')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Avatar src={r.employee_photo_thumb_path} fallbackSrc={r.employee_photo_path} name={r.employee_name ?? '?'} size={28} />
          <span className="text-[14px] font-semibold text-fg">{r.employee_name || '—'}</span>
          {r.status && (
            <Badge tone={REQ_TONE[r.status] ?? 'neutral'}>
              {t(`vehicles.status_${r.status}` as never)}
            </Badge>
          )}
          {r.letter_number && (
            <span className="text-[11px] tabular-nums text-fg-subtle">#{r.letter_number}</span>
          )}
        </div>
        <p className="text-[12px] text-fg-muted">
          {[r.employee_position, r.department_name].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} className="text-fg-subtle" />
            {r.start_date ? dayjs(r.start_date).format('DD.MM.YYYY') : '—'}
            {r.end_date ? ` — ${dayjs(r.end_date).format('DD.MM.YYYY')}` : ''}
          </span>
          {!!r.regions?.length && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} className="text-fg-subtle" />
              {r.regions.join(', ')}
            </span>
          )}
          {km != null && (
            <span className="inline-flex items-center gap-1.5">
              <Route size={13} className="text-fg-subtle" />
              {km} km{cost != null ? ` · ${Number(cost).toLocaleString('ru-RU')} ${t('vehicles.sum')}` : ''}
            </span>
          )}
        </p>
        {r.purpose && <p className="mt-1 text-[12px] text-fg-muted">{r.purpose}</p>}
        {r.vehicle && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
            <PlateChip plate={r.vehicle.plate_number} size="sm" />
            <span>{r.vehicle.model_name}</span>
            {r.assigned_driver?.legal_name && (
              <span className="text-fg-subtle">· {t('vehicles.driver')}: {r.assigned_driver.legal_name}</span>
            )}
          </p>
        )}
        {(r.approval_note || r.response_text) && (
          <p className="mt-1 text-[12px] text-danger">{r.approval_note || r.response_text}</p>
        )}
        <FlowSteps className="mt-3" steps={requestSteps(r, t)} />
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {/* Row flags, not the list-level access object — see the
            VehicleRequest type. */}
        {!!r.can_approve && (
          <Button size="sm" onClick={onApprove}>
            {t('vehicles.decide')}
          </Button>
        )}
        {!!r.can_respond && r.status === 'pending' && (
          <Button size="sm" onClick={onRespond}>
            {t('vehicles.attach')}
          </Button>
        )}
        {/* Closing an approved request with the REAL cost. Approval
            records the estimate; this records what the trip actually
            was, which is the number the fuel report needs. */}
        {!!r.can_finalize && r.vehicle && (
          <Button size="sm" variant="secondary" onClick={onFinalize}>
            {t('vehicles.finalize')}
          </Button>
        )}
      </div>
    </li>
  )
}

function RequestActionModal({
  acting,
  onClose,
  onDone,
  onError,
}: {
  acting: { req: VehicleRequest; mode: 'approve' | 'respond' } | null
  onClose: () => void
  onDone: (m: string) => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const open = !!acting
  const mut = useFleetMutations()
  /* The trip's own dates decide who is free. Without them every car and every
     driver looks available; `exclude_letter_id` keeps THIS request's own
     booking from marking its own car busy. */
  const range = {
    from: acting?.req.start_date,
    to: acting?.req.end_date,
    excludeLetterId: acting?.req.letter_id,
  }
  const { rows: vehicles } = useVehicles('', true, range)
  const drivers = useDriverOptions(open, range)
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  /**
   * BIRGA KETADIGANLAR — bitta safarga bir nechta xodim ketsa, ularning
   * so'rovlari ALOHIDA qatorlar bo'ladi va v2 da har birini birma-bir
   * javoblash kerak edi. Server `also_request_ids` bilan hammasiga bitta
   * mashinani biriktiradi va nomzodlarni O'ZI tekshiradi (aynan bir manzil,
   * bir sana, hali navbatda).
   */
  const [alsoIds, setAlsoIds] = useState<number[]>([])
  /**
   * ⚠️ The candidates come FROM THE SERVER (`shared_candidates`), which checks
   * the destination as well as the dates. Rebuilding the list here from dates
   * alone offered colleagues travelling elsewhere that day, and the server then
   * refused the whole assignment with 400 `not_same_trip`.
   */
  const peers = (acting?.req.shared_candidates ?? []).map((c) => ({
    id: c.request_id,
    employee_name: c.employee_name,
  }))

  const run = async (approved: boolean) => {
    if (!acting) return
    // ⚠️ Izoh MAJBURIY — server bo'sh izohni 400 bilan qaytaradi.
    if (!note.trim()) return setError(t('vehicles.noteRequired'))
    try {
      if (acting.mode === 'approve') {
        await mut.approveRequest.mutateAsync({ id: acting.req.id, approved, note: note.trim() })
      } else {
        if (approved && !vehicleId) return setError(t('vehicles.vehicleRequired'))
        await mut.respondRequest.mutateAsync({
          id: acting.req.id,
          approved,
          vehicle_id: approved ? Number(vehicleId) : null,
          assigned_driver_employee_id: driverId ? Number(driverId) : null,
          response_text: note.trim(),
          also_request_ids: approved && alsoIds.length ? alsoIds : undefined,
        })
      }
      setNote('')
      setVehicleId('')
      setDriverId('')
      setAlsoIds([])
      onDone(approved ? t('vehicles.done') : t('vehicles.refused'))
    } catch (e) {
      onError(e)
    }
  }

  const busy = mut.approveRequest.isPending || mut.respondRequest.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={acting?.mode === 'approve' ? t('vehicles.decide') : t('vehicles.attach')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => run(false)} loading={busy} leftIcon={<X size={14} />}>
            {t('vehicles.refuse')}
          </Button>
          <Button onClick={() => run(true)} loading={busy} leftIcon={<Check size={14} />}>
            {acting?.mode === 'approve' ? t('vehicles.pass') : t('vehicles.give')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {acting?.mode === 'respond' && (
          <>
            <Field label={t('vehicles.pickVehicle')} required>
              <Combobox
                value={vehicleId}
                onChange={setVehicleId}
                options={vehicles.map((v) => ({
                  value: String(v.id),
                  label: `${v.plate_number ?? ''} · ${v.model_name ?? ''}`,
                  // Busy is not selectable — the server refuses it anyway.
                  disabled: !!v.is_busy,
                  subLabel: v.is_busy
                    ? t('vehicles.busyOnDates')
                    : [
                        v.driver?.legal_name ?? null,
                        // A car assigned to one leader may still be lent out,
                        // but the fleet manager should see it first.
                        v.leader?.legal_name ? `⚠ ${t('vehicles.leaderCar')}: ${v.leader.legal_name}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                }))}
                placeholder={t('t2.pick')}
                className="w-full"
              />
            </Field>
            <Field label={t('vehicles.pickDriver')} hint={t('vehicles.driverHint')}>
              <Combobox value={driverId} onChange={setDriverId} options={drivers} placeholder={t('t2.pick')} className="w-full" />
            </Field>
            {peers.length > 0 && (
              <Field label={t('vehicles.alsoRequests')} hint={t('vehicles.alsoRequestsHint')}>
                <ul className="flex flex-col gap-1.5">
                  {peers.map((r) => (
                    <li key={r.id}>
                      <Checkbox
                        checked={alsoIds.includes(r.id)}
                        onChange={(e) =>
                          setAlsoIds((prev) =>
                            e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                          )
                        }
                        label={r.employee_name ?? `#${r.id}`}
                      />
                    </li>
                  ))}
                </ul>
              </Field>
            )}
          </>
        )}
        <Field label={t('vehicles.note')} required hint={t('vehicles.noteHint')}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

/* ── Yoqilg'i turlari ───────────────────────────────────────────────────── */

function FuelTab({
  canManage,
  canApprove,
  search,
  setSearch,
  onError,
  onOk,
}: {
  canManage: boolean
  canApprove: boolean
  search: string
  setSearch: (v: string) => void
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { rows: all, loading } = useFuelTypes()
  const [only, setOnly] = useState<'' | 'pending' | 'approved' | 'rejected'>('')
  // The price book is a dozen rows; narrowing is done in place.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((f) => {
      if (q && !(f.name ?? '').toLowerCase().includes(q)) return false
      if (only === 'approved' && !isFuelApproved(f)) return false
      if (only === 'pending' && (isFuelApproved(f) || f.approval_status === 'rejected')) return false
      if (only === 'rejected' && f.approval_status !== 'rejected') return false
      return true
    })
  }, [all, search, only])
  const pendingCount = all.filter((f) => !isFuelApproved(f) && f.approval_status !== 'rejected' && f.price != null).length
  const mut = useFleetMutations()
  const [editing, setEditing] = useState<FuelType | 'new' | null>(null)
  const [deciding, setDeciding] = useState<FuelType | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const logs = useFuelLogs(historyOpen)

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Fuel size={16} className="text-brand-strong" />
        <span className="text-[14px] font-semibold text-fg">{t('vehicles.tabFuel')}</span>
        <SearchInput value={search} onChange={setSearch} placeholder={t('vehicles.fuelSearchPlaceholder')} className="w-full sm:ml-2 sm:w-52" />
        <Segmented
          size="sm"
          value={only}
          onChange={(v) => setOnly(v)}
          options={[
            { value: '', label: t('vehicles.fuelAll') },
            { value: 'approved', label: t('vehicles.fuelApproved') },
            { value: 'pending', label: t('vehicles.notApproved'), count: pendingCount || undefined },
            { value: 'rejected', label: t('vehicles.priceRejected') },
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          leftIcon={<History size={15} />}
          onClick={() => setHistoryOpen(true)}
        >
          {t('vehicles.fuelHistory')}
        </Button>
        {canManage && (
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('common.add')}
          </Button>
        )}
      </div>

      {loading ? (
        <CenteredSpinner />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Fuel size={20} />} title={search || only ? t('common.noResults') : t('vehicles.noFuel')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
                <Fuel size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-fg">{f.name || '—'}</p>
                <p className="text-[11px] tabular-nums text-fg-subtle">
                  {f.price != null
                    ? `${Number(f.price).toLocaleString('ru-RU')} ${t('vehicles.perUnit', { unit: f.unit ?? '' })}`
                    : t('vehicles.noPrice')}
                  {f.approval_status === 'pending' && f.price != null
                    ? ` · ${t('vehicles.pendingPrice', { price: Number(f.price).toLocaleString('ru-RU') })}`
                    : ''}
                </p>
              </div>
              {f.approval_status === 'rejected' ? (
                <Badge tone="danger">{t('vehicles.priceRejected')}</Badge>
              ) : (
                !isFuelApproved(f) && <Badge tone="warning">{t('vehicles.notApproved')}</Badge>
              )}
              {canApprove && !isFuelApproved(f) && (
                <Button size="sm" variant="secondary" onClick={() => setDeciding(f)}>
                  {t('vehicles.approvePrice')}
                </Button>
              )}
              {canManage && (
                <span className="flex gap-1">
                  <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(f)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('common.delete')}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'delete', subject: f.name }))) return
                      try {
                        await mut.removeFuelType.mutateAsync(f.id)
                        mut.invalidate()
                        onOk(t('vehicles.removed'))
                      } catch (e) {
                        onError(e)
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <FuelDecisionModal
        value={deciding}
        onClose={() => setDeciding(null)}
        onDone={(msg) => {
          mut.invalidate()
          onOk(msg)
          setDeciding(null)
        }}
        onError={onError}
      />

      <FuelModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          mut.invalidate()
          onOk(t('common.saved'))
          setEditing(null)
        }}
        onError={onError}
      />

      {/* The price trail: what changed, from what to what, and who decided. */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('vehicles.fuelHistory')}
        size="lg"
        description={t('vehicles.fuelHistoryHint')}
      >
        {logs.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : logs.rows.length === 0 ? (
          <EmptyState title={t('vehicles.fuelHistoryEmpty')} />
        ) : (
          <div className="scroll-thin max-h-[52vh] overflow-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className={TH}>{t('vehicles.colDate')}</th>
                  <th className={TH}>{t('vehicles.colFuel')}</th>
                  <th className={TH}>{t('vehicles.colAction')}</th>
                  <th className={TH}>{t('vehicles.colPriceChange')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className={TD_COMPACT}>{r.created_at ? formatDateTime(r.created_at) : '—'}</td>
                    <td className={TD}>{r.fuel_name || '—'}</td>
                    <td className={TD_COMPACT}>{r.action_label || r.action || '—'}</td>
                    <td className={TD_COMPACT}>
                      {r.old_price != null && r.new_price != null && r.old_price !== r.new_price ? (
                        <span className="tabular-nums">
                          <span className="text-fg-subtle line-through">{r.old_price}</span>
                          {' → '}
                          <span className="font-semibold text-fg">{r.new_price}</span>
                        </span>
                      ) : (
                        <span className="tabular-nums text-fg">{r.new_price ?? '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </Card>
  )
}

/**
 * The approver's decision on a submitted price. `approve` is not a bare click:
 * the endpoint takes a verdict, a note (required to reject) and an optional
 * corrected price, which is the whole point of the review step.
 */
function FuelDecisionModal({
  value,
  onClose,
  onDone,
  onError,
}: {
  value: FuelType | null
  onClose: () => void
  onDone: (msg: string) => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useFleetMutations()
  const open = !!value
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [seeded, setSeeded] = useState('')
  const [error, setError] = useState('')

  const key = open ? String(value?.id) : ''
  if (open && seeded !== key) {
    setSeeded(key)
    setPrice(String(value?.price ?? ''))
    setNote('')
    setError('')
  }

  const decide = async (approved: boolean) => {
    if (!value) return
    if (!approved && !note.trim()) return setError(t('vehicles.rejectNoteRequired'))
    try {
      await mut.approveFuelType.mutateAsync({
        id: value.id,
        approved,
        note,
        price: approved && price ? Number(price) : null,
      })
      onDone(approved ? t('vehicles.priceApproved') : t('vehicles.priceRejected'))
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('vehicles.approvePrice')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => decide(false)}>{t('vehicles.rejectPrice')}</Button>
          <Button onClick={() => decide(true)}>{t('common.confirm')}</Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <Field label={t('vehicles.fuelPrice')} hint={t('vehicles.approvePriceHint')}>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t('vehicles.decisionNote')}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

function FuelModal({
  value,
  onClose,
  onSaved,
  onError,
}: {
  value: FuelType | 'new' | null
  onClose: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const open = !!value
  const editing = value !== 'new' ? (value as FuelType | null) : null
  const mut = useFleetMutations()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [seeded, setSeeded] = useState('')
  const [error, setError] = useState('')

  const key = open ? String(editing?.id ?? 'new') : ''
  if (open && seeded !== key) {
    setSeeded(key)
    setName(editing?.name ?? '')
    setUnit(editing?.unit ?? '')
    setPrice(editing?.price != null ? String(editing.price) : '')
    setError('')
  }

  const submit = async () => {
    if (!name.trim()) return setError(t('vehicles.fuelNameRequired'))
    try {
      await mut.saveFuelType.mutateAsync({
        id: editing?.id,
        body: { name: name.trim(), unit: unit.trim() || null, price: price ? Number(price) : null },
      })
      onSaved()
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('common.edit') : t('common.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.saveFuelType.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('vehicles.fuelName')} required wide>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('vehicles.fuelUnit')}>
          <Combobox
            value={unit || 'litr'}
            onChange={setUnit}
            options={FUEL_UNITS.map((u) => ({ value: u, label: u }))}
            clearable={false}
          />
        </Field>
        <Field label={t('vehicles.fuelPrice')} hint={t('vehicles.priceHint')}>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}


/**
 * "Haydovchi doirasi" — the single global rule for who counts as a driver.
 *
 * Site master-admin only. An EMPTY list is not "nobody": the server reads it as
 * "everyone in the fleet branch", so the screen says so out loud instead of
 * showing an empty box that looks like a broken setting.
 */
function DriverScopeTab({ onError }: { onError: (e: unknown) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { scopes, loading } = useDriverScopes(true)
  const mut = useDriverScopeMutations()
  const [kind, setKind] = useState<'department' | 'job_position' | 'employee'>('department')
  const [pick, setPick] = useState('')
  const [picked, setPicked] = useState<Employee | null>(null)
  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  const [removing, setRemoving] = useState<DriverScope | null>(null)

  // Picking grants the scope at once — ask first.
  const add = async (scopeId: number, label?: string | null) => {
    if (!(await confirm({ kind: 'status', subject: label }))) return
    try {
      await mut.addScope.mutateAsync({ scope_type: kind, scope_id: scopeId })
      setPick('')
      toast.ok(t('vehicles.scopeAdded'))
    } catch (e) {
      onError(e)
    }
  }

  const kindLabel = (type?: string | null) =>
    type === 'employee'
      ? t('vehicles.scopeEmployee')
      : type === 'job_position'
        ? t('vehicles.scopePosition')
        : t('vehicles.scopeDepartment')

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-line p-3">
        <p className="text-[14px] font-semibold text-fg">{t('vehicles.tabDrivers')}</p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">{t('vehicles.scopeHint')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-ui p-3">
        <div className="w-[13rem]">
          <Field label={t('vehicles.scopeKind')}>
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind)
                setPick('')
              }}
              options={[
                { value: 'department', label: t('vehicles.scopeDepartment') },
                { value: 'job_position', label: t('vehicles.scopePosition') },
                { value: 'employee', label: t('vehicles.scopeEmployee') },
              ]}
            />
          </Field>
        </div>
        <div className="min-w-[16rem] flex-1">
          <Field label={t('vehicles.scopePick')}>
            {kind === 'employee' ? (
              <EmployeePicker
                value={picked}
                onChange={(emp) => {
                  setPicked(emp)
                  if (emp) {
                    void add(emp.id, emp.legal_name)
                    setPicked(null)
                  }
                }}
              />
            ) : (
              <Combobox
                value={pick}
                onChange={(v) => v && add(Number(v), (kind === 'department' ? departments : positions).find((o) => String(o.value) === v)?.label)}
                options={kind === 'department' ? departments : positions}
                placeholder={t('t2.pick')}
                className="w-full"
              />
            )}
          </Field>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : scopes.length === 0 ? (
        <EmptyState icon={<Car size={20} />} title={t('vehicles.scopeEmpty')} description={t('vehicles.scopeEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line/60">
          {scopes.map((sc) => (
            <li key={sc.id} className="flex items-center gap-3 px-4 py-2.5">
              <Badge tone="neutral">{kindLabel(sc.scope_type)}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{sc.label || `#${sc.scope_id}`}</span>
                {sc.sub_label && <span className="block truncate text-[11.5px] text-fg-subtle">{sc.sub_label}</span>}
              </span>
              <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(sc)}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('vehicles.scopeRemoveTitle')}
        description={t('vehicles.scopeRemoveConfirm', { name: removing?.label ?? '' })}
        loading={mut.removeScope.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.removeScope.mutateAsync(removing.id)
            toast.ok(t('vehicles.scopeRemoved'))
          } catch (e) {
            onError(e)
          } finally {
            setRemoving(null)
          }
        }}
      />
    </Card>
  )
}
