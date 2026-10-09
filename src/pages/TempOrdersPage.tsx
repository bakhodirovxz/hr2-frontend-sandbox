import { Fragment, useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ArrowRightLeft, ClipboardList, MapPin, Pencil, PlaneTakeoff, Plus, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { useOnAnnualLeave } from '@/features/leave/useLeave'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate, formatRange } from '@/lib/format'
import { isInvalidRange } from '@/lib/dateRange'
import type { Employee } from '@/types'
import {
  ARCHIVING_TYPES,
  HOURLY_TYPE,
  MOVE_TYPES,
  ORDER_TYPES,
  PERM_TRANSFER_TYPE,
  RECALL_TYPE,
  TRANSFER_KINDS,
  transferKindOf,
  useIncomingTransfers,
  useTempOrderMutations,
  useTempOrders,
  type BulkTripResult,
  type IncomingTransfer,
  type TempOrder,
  type TransferKind,
} from '@/features/temporders/useTempOrders'
import type { BadgeTone } from '@/components/ui/Badge'

const TRANSFER_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  scheduled: 'info',
  applied: 'success',
  rejected: 'danger',
}

/*
 * VAQTINCHALIK BUYRUQLAR — the orders HR records for other people: sick leave,
 * annual leave, an unpaid day, a recall from leave, a dismissal.
 *
 * They are written ALREADY APPROVED because they record a signed paper order;
 * the employee's own "Ruxsat so'rash" is the other door into the same table and
 * that one does go through a supervisor.
 */
function TempOrdersPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(['from', 'to', 'type'])
  const rangeInvalid = isInvalidRange(filters.from, filters.to)
  const { rows, total, pages, loading, fetching } = useTempOrders(
    { search, from: filters.from, to: filters.to, type: filters.type ?? undefined, page, size },
    { enabled: !rangeInvalid },
  )
  const mut = useTempOrderMutations()
  const [editing, setEditing] = useState<TempOrder | 'new' | null>(null)
  const [removing, setRemoving] = useState<TempOrder | null>(null)
  const [bulkTrip, setBulkTrip] = useState(false)

  const months = t('date.months', { returnObjects: true }) as string[]
  const monthOf = (d?: string | null) => (d ? dayjs(d).format('YYYY-MM') : '')
  const monthLabel = (d?: string | null) => (d ? `${months[dayjs(d).month()]} ${dayjs(d).year()}` : '—')

  const typeLabel = (v?: string | null) => {
    const kind = transferKindOf(v)
    if (kind) return `${t('tempOrders.type_boshqa_ishga_otkazish')} · ${t(`tempOrders.kind_${kind.kind}` as never)} (${kind.short})`
    const meta = ORDER_TYPES.find((o) => o.value === v)
    return meta ? `${t(`tempOrders.type_${meta.value}` as never)} (${meta.short})` : v || '—'
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('tempOrders.title')}
        subtitle={t('tempOrders.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Bir nechta xodimga birdan — masalan GESga ketayotgan brigada. */}
            <Button size="sm" variant="secondary" leftIcon={<PlaneTakeoff size={15} />} onClick={() => setBulkTrip(true)}>
              {t('tempOrders.bulkTrip')}
            </Button>
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('tempOrders.add')}
            </Button>
          </div>
        }
      />

      <IncomingTransfers />

      <div className="mb-4 flex flex-wrap items-center gap-ui">
        <div className="max-w-branch min-w-[14rem] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('tempOrders.searchPlaceholder')} />
        </div>
        <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} aria-label={t('tempOrders.from')} className="w-40" invalid={rangeInvalid} />
        <span className="text-fg-subtle">—</span>
        <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} aria-label={t('tempOrders.to')} className="w-40" invalid={rangeInvalid} />
        {/* Order TYPE — v1 filtered by it, v2 shipped without. */}
        <Combobox
          value={filters.type || ''}
          onChange={(v) => setFilter('type', v)}
          options={ORDER_TYPES.map((o) => ({
            value: o.value,
            label: t(`tempOrders.type_${o.value}` as never),
          }))}
          placeholder={t('tempOrders.allTypes')}
          className="w-52"
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
        {rangeInvalid && <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('tempOrders.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('tempOrders.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        </Card>
      ) : (
        <Card className={fetching ? 'overflow-hidden p-0 opacity-70' : 'overflow-hidden p-0'}>
          <ul className="divide-y divide-line/60">
            {rows.map((r, i) => (
              <Fragment key={r.id}>
              {/* Month headings: the list runs newest order date first, so a
                  month is one block («Sentabr 2026»). */}
              {monthOf(r.start_date) !== monthOf(rows[i - 1]?.start_date) && (
                <li className="bg-surface-2/60 px-4 py-1.5 text-[11.5px] font-semibold capitalize text-fg-muted">
                  {monthLabel(r.start_date)}
                </li>
              )}
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:flex-nowrap">
                <Avatar name={r.employee?.legal_name ?? ''} src={r.employee?.photo_thumb_path ?? undefined} size={34} />
                <span className="min-w-0 flex-1 basis-[calc(100%-100px)] sm:basis-auto">
                  <span className="block truncate text-[13px] font-medium text-fg">{r.employee?.legal_name || '—'}</span>
                  {MOVE_TYPES.includes(r.type ?? '') ? (
                    <TransferLine row={r} />
                  ) : (
                    <span className="block truncate text-[11.5px] text-fg-subtle">
                      {r.destination_branch?.name && (
                        <span className="mr-1.5 inline-flex items-center gap-0.5 text-fg-muted">
                          <MapPin size={11} className="shrink-0" />
                          {r.destination_branch.name}
                          {r.description ? ' ·' : ''}
                        </span>
                      )}
                      {r.description || (r.destination_branch?.name ? '' : '—')}
                    </span>
                  )}
                </span>
                {/* Phone: type + dates drop to their own line under the name —
                    in one row they squeezed the name out entirely. */}
                <span className="flex min-w-0 flex-wrap items-center gap-2 pl-[46px] sm:contents sm:pl-0">
                  <Badge tone="neutral" className="whitespace-nowrap">{typeLabel(r.type)}</Badge>
                  <span className="whitespace-nowrap text-[12px] tabular-nums text-fg-muted sm:min-w-44 sm:shrink-0 sm:text-right">
                    {/* One day keeps its weekday («8-avgust, shanba»); a span
                        is compact with its length, which is what HR checks. */}
                    {r.end_date && !dayjs(r.end_date).isSame(r.start_date, 'day') ? (
                      <>
                        {formatRange(r.start_date, r.end_date)}
                        <span className="ml-1.5 text-fg-subtle">· {t('tempOrders.daysCount', { count: dayjs(r.end_date).diff(dayjs(r.start_date), 'day') + 1 })}</span>
                      </>
                    ) : (
                      formatAppDate(r.start_date)
                    )}
                  </span>
                </span>
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                  <Pencil size={14} />
                </IconButton>
                {/* A move that already happened cannot be undone by deleting
                    its order — the server refuses (409), so no button. */}
                {!(MOVE_TYPES.includes(r.type ?? '') && r.transfer_status === 'applied') && (
                  <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(r)}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
              </Fragment>
            ))}
          </ul>
          <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
        </Card>
      )}

      <OrderModal
        value={editing}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          toast.ok(msg)
          setEditing(null)
        }}
        onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
      />

      <BulkTripModal open={bulkTrip} onClose={() => setBulkTrip(false)} />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('tempOrders.removeTitle')}
        description={t('tempOrders.removeConfirm', { name: removing?.employee?.legal_name ?? '' })}
        loading={mut.remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('tempOrders.removed'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </PageContainer>
  )
}

/** Where the move goes and how far along it is — the row's second line. */
function TransferLine({ row }: { row: TempOrder }) {
  const { t } = useTranslation()
  const target = [row.transfer_to_branch?.name, row.transfer_to_department?.name, row.transfer_to_job_position?.name]
    .filter(Boolean)
    .join(' · ')
  const st = row.transfer_status
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-subtle">
      <ArrowRightLeft size={12} className="shrink-0" aria-hidden />
      <span className="truncate">{target || row.description || '—'}</span>
      {st && (
        <Badge tone={TRANSFER_TONE[st] ?? 'neutral'} className="shrink-0 whitespace-nowrap">
          {t(`tempOrders.transferStatus_${st}` as never, { date: formatAppDate(row.start_date) })}
        </Badge>
      )}
      {st === 'rejected' && row.rejection_reason && <span className="truncate">— {row.rejection_reason}</span>}
    </span>
  )
}

/**
 * Transfers INTO my branch that wait for my answer. The employee still sits in
 * the old branch, so the ordinary list (read by the employee's branch) would
 * not show them to the receiving HR — this block is the only way in.
 */
function IncomingTransfers() {
  const { t } = useTranslation()
  const toast = useToast()
  const { rows } = useIncomingTransfers()
  const mut = useTempOrderMutations()
  const [accepting, setAccepting] = useState<IncomingTransfer | null>(null)
  const [rejecting, setRejecting] = useState<IncomingTransfer | null>(null)
  const [reason, setReason] = useState('')
  if (rows.length === 0) return null

  const place = (r: IncomingTransfer) =>
    [r.from_branch?.name, r.from_department?.name, r.from_job_position?.name].filter(Boolean).join(' · ') || '—'

  return (
    <Card className="mb-4 overflow-hidden border-warning/40 p-0">
      <div className="border-b border-line/60 bg-warning-soft/60 px-4 py-2.5">
        <p className="text-[13px] font-semibold text-fg">
          {t('tempOrders.incomingTitle')} <span className="tabular-nums text-fg-muted">({rows.length})</span>
        </p>
        <p className="text-[11.5px] text-fg-muted">{t('tempOrders.incomingHint')}</p>
      </div>
      <ul className="divide-y divide-line/60">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <Avatar name={r.employee?.legal_name ?? ''} src={r.employee?.photo_thumb_path ?? undefined} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{r.employee?.legal_name || '—'}</span>
              <span className="block truncate text-[11.5px] text-fg-subtle">
                {t('tempOrders.incomingFrom', { place: place(r) })}
                {r.description ? ` · ${r.description}` : ''}
              </span>
            </span>
            <span className="whitespace-nowrap text-[12px] tabular-nums text-fg-muted">{formatAppDate(r.start_date)}</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => setAccepting(r)}>{t('tempOrders.accept')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setReason(''); setRejecting(r) }}>
                {t('tempOrders.reject')}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <AcceptTransferModal row={accepting} onClose={() => setAccepting(null)} />

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('tempOrders.rejectTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              loading={mut.rejectTransfer.isPending}
              onClick={async () => {
                if (!rejecting) return
                try {
                  await mut.rejectTransfer.mutateAsync({ id: rejecting.id, reason: reason.trim() })
                  toast.ok(t('tempOrders.rejected'))
                  setRejecting(null)
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              {t('tempOrders.reject')}
            </Button>
          </>
        }
      >
        <Field label={t('tempOrders.rejectReason')}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  )
}

function AcceptTransferModal({ row, onClose }: { row: IncomingTransfer | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useTempOrderMutations()
  const branchId = row?.transfer_to_branch?.id ?? null
  // The RECEIVING branch's lists — not the one picked in the header.
  const departmentOptions = useDepartmentOptions(branchId)
  const positionOptions = useJobPositionOptions(branchId)
  const [dept, setDept] = useState('')
  const [pos, setPos] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setDept('')
    setPos('')
    setError('')
  }, [row])

  const submit = async () => {
    if (!row) return
    if (!dept || !pos) return setError(t('tempOrders.postRequired'))
    try {
      await mut.approveTransfer.mutateAsync({ id: row.id, department_id: Number(dept), job_position_id: Number(pos) })
      toast.ok(t('tempOrders.accepted'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('tempOrders.acceptTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.approveTransfer.isPending}>{t('tempOrders.accept')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] text-fg-muted">
          {t('tempOrders.acceptHint', { name: row?.employee?.legal_name ?? '', date: formatAppDate(row?.start_date) })}
        </p>
        <Field label={t('tempOrders.targetBranch')}>
          <p className="text-[13px] font-medium text-fg">{row?.transfer_to_branch?.name || '—'}</p>
        </Field>
        <Field label={t('tempOrders.targetDepartment')} required>
          <Combobox value={dept} onChange={setDept} options={departmentOptions} placeholder={t('t2.pick')} className="w-full" />
        </Field>
        <Field label={t('tempOrders.targetPosition')} required>
          <Combobox value={pos} onChange={setPos} options={positionOptions} placeholder={t('t2.pick')} className="w-full" />
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

type PickedEmployee = Employee & { primary_organization_branch_id?: number | null }

/** The employee's own branch — the order the server's `main_branch_id` uses. */
const homeBranchOf = (e: PickedEmployee | null): number | null =>
  e ? (e.primary_organization_branch_id ?? e.department?.organization_branch_id ?? e.organization_branch_id ?? null) : null

function OrderModal({
  value,
  onClose,
  onDone,
  onError,
}: {
  value: TempOrder | 'new' | null
  onClose: () => void
  onDone: (msg: string) => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useTempOrderMutations()
  const open = !!value
  const isEdit = !!value && value !== 'new'
  const row = isEdit ? (value as TempOrder) : null

  const [employee, setEmployee] = useState<PickedEmployee | null>(null)
  const [type, setType] = useState('kasal')
  const [kind, setKind] = useState<TransferKind>('tashkilot')
  const [toBranch, setToBranch] = useState('')
  const [toDept, setToDept] = useState('')
  const [toPos, setToPos] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('13:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setEmployee(row?.employee ? ({ id: row.employee.id, legal_name: row.employee.legal_name } as Employee) : null)
    // The three kinds are stored as three types; the form shows them as one
    // type with a choice of kind.
    const rowKind = transferKindOf(row?.type)
    setType(rowKind ? PERM_TRANSFER_TYPE : row?.type || 'kasal')
    setKind(rowKind?.kind ?? 'tashkilot')
    setToBranch(row?.transfer_to_branch ? String(row.transfer_to_branch.id) : '')
    setToDept(row?.transfer_to_department ? String(row.transfer_to_department.id) : '')
    setToPos(row?.transfer_to_job_position ? String(row.transfer_to_job_position.id) : '')
    setStart(row?.start_date ? dayjs(row.start_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))
    setEnd(row?.end_date ? dayjs(row.end_date).format('YYYY-MM-DD') : '')
    setStartTime(row?.start_date ? dayjs(row.start_date).format('HH:mm') : '09:00')
    setEndTime(row?.end_date ? dayjs(row.end_date).format('HH:mm') : '13:00')
    setNote(row?.description || '')
  }, [open, row])

  const isPermTransfer = type === PERM_TRANSFER_TYPE
  // What is actually stored: the kind picks the type for a permanent transfer.
  const effectiveType = isPermTransfer ? TRANSFER_KINDS.find((k) => k.kind === kind)!.type : type
  const isMove = MOVE_TYPES.includes(effectiveType)
  // An existing move order keeps its kind and target — only the date (until it
  // takes effect) and the note change. The server enforces the same.
  const moveLocked = isEdit && MOVE_TYPES.includes(row?.type ?? '')
  const dateLocked = moveLocked && (row?.transfer_status === 'applied' || row?.transfer_status === 'rejected')

  const homeBranch = homeBranchOf(employee)
  const branches = useBranchStore((s) => s.branches)
  const branchOptions = branches
    .filter((b) => b.id !== homeBranch)
    .map((b) => ({ value: String(b.id), label: b.name || `#${b.id}` }))
  // Department / position inside the employee's OWN branch, not the header's.
  const departmentOptions = useDepartmentOptions(homeBranch ?? undefined)
  const positionOptions = useJobPositionOptions(homeBranch ?? undefined)

  useEffect(() => {
    // Another person → another branch: a target picked for the last one is wrong.
    if (moveLocked) return
    setToBranch('')
    setToDept('')
    setToPos('')
  }, [employee?.id, moveLocked])

  const isHourly = type === HOURLY_TYPE
  /**
   * "Mehnat ta'tilidan chaqirib olish" applies to somebody who IS on annual
   * leave right now, so v1 narrows the picker to exactly that list.
   *
   * ⚠️ v2 OFFERED THE WHOLE ROSTER AND LET THE SERVER SAY NO. The rejection
   * (`no_active_annual_leave`) only arrives on save, after the dates and the
   * note have been filled in — and it does not tell the writer who they COULD
   * have picked. The endpoint that answers that had a hook here already, with
   * no callers.
   */
  const isRecall = type === RECALL_TYPE
  const onLeave = useOnAnnualLeave(open && isRecall)
  const isArchiving = ARCHIVING_TYPES.includes(effectiveType)
  const singleDate = isArchiving || isMove

  const submit = async () => {
    if (!isEdit && !employee) return setError(t('tempOrders.employeeRequired'))
    if (!start) return setError(t('tempOrders.startRequired'))
    if (!singleDate && !isHourly && !end) return setError(t('tempOrders.endRequired'))
    if (!moveLocked && effectiveType === TRANSFER_KINDS[0].type && !toBranch) return setError(t('tempOrders.branchRequired'))
    if (!moveLocked && effectiveType === TRANSFER_KINDS[1].type && (!toDept || !toPos))
      return setError(t('tempOrders.postRequired'))
    try {
      if (isEdit) {
        // Editing goes through the generic PATCH, which speaks datetimes.
        await mut.update.mutateAsync({
          id: row!.id,
          body: moveLocked
            ? {
                ...(dateLocked ? {} : { start_date: `${start}T00:00:00`, end_date: `${start}T23:59:59` }),
                description: note.trim() || null,
              }
            : {
                type,
                start_date: isHourly ? `${start}T${startTime}:00` : `${start}T00:00:00`,
                end_date: isArchiving ? null : isHourly ? `${start}T${endTime}:00` : `${end}T23:59:59`,
                description: note.trim() || null,
              },
        })
        onDone(t('tempOrders.updated'))
      } else {
        await mut.create.mutateAsync({
          employee_id: employee!.id,
          type: effectiveType,
          start_date: start,
          // An archiving order has no end: the employment stops. A move is
          // one day — the day it takes effect.
          end_date: singleDate ? null : isHourly ? start : end,
          start_time: isHourly ? `${startTime}:00` : null,
          end_time: isHourly ? `${endTime}:00` : null,
          note: note.trim() || null,
          ...(effectiveType === TRANSFER_KINDS[0].type ? { transfer_to_branch_id: Number(toBranch) } : {}),
          ...(effectiveType === TRANSFER_KINDS[1].type
            ? { transfer_to_department_id: Number(toDept), transfer_to_job_position_id: Number(toPos) }
            : {}),
        })
        onDone(t('tempOrders.created'))
      }
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('tempOrders.editTitle') : t('tempOrders.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.create.isPending || mut.update.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <Field label={t('tempOrders.employee')} required>
            {isRecall ? (
              <>
                <Combobox
                  value={employee ? String(employee.id) : ''}
                  onChange={(v) => {
                    const picked = onLeave.rows.find((r) => String(r.id) === v)
                    setEmployee(picked ? ({ id: picked.id, legal_name: picked.legal_name } as Employee) : null)
                  }}
                  options={onLeave.rows.map((r) => ({
                    value: String(r.id),
                    label: r.legal_name ?? String(r.id),
                  }))}
                />
                {!onLeave.loading && onLeave.rows.length === 0 && (
                  <p className="mt-1 text-[12px] text-fg-muted">{t('tempOrders.noneOnLeave')}</p>
                )}
              </>
            ) : (
              <EmployeePicker value={employee} onChange={setEmployee} />
            )}
          </Field>
        )}
        <Field label={t('tempOrders.type')} required>
          <Combobox
            value={type}
            onChange={(v) => v && setType(v)}
            options={ORDER_TYPES.map((o) => ({
              value: o.value,
              label: `${t(`tempOrders.type_${o.value}` as never)} (${o.short})`,
            }))}
            clearable={false}
            disabled={moveLocked}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>

        {isPermTransfer && (
          <Field label={t('tempOrders.transferKind')} required>
            {moveLocked ? (
              <p className="text-[13px] font-medium text-fg">{t(`tempOrders.kind_${kind}` as never)}</p>
            ) : (
              <Segmented
                size="sm"
                value={kind}
                onChange={setKind}
                aria-label={t('tempOrders.transferKind')}
                options={TRANSFER_KINDS.map((k) => ({ value: k.kind, label: t(`tempOrders.kind_${k.kind}` as never) }))}
              />
            )}
          </Field>
        )}

        {isMove && !moveLocked && (
          <p className="text-[12px] text-fg-muted">{t(`tempOrders.kindHint_${kind}` as never)}</p>
        )}

        {isMove && kind === 'tashkilot' && (
          <Field label={t('tempOrders.targetBranch')} required>
            {moveLocked ? (
              <p className="text-[13px] font-medium text-fg">{row?.transfer_to_branch?.name || '—'}</p>
            ) : (
              <Combobox
                value={toBranch}
                onChange={setToBranch}
                options={branchOptions}
                placeholder={t('t2.pick')}
                className="w-full"
              />
            )}
          </Field>
        )}

        {isMove && (kind === 'lavozim' || (moveLocked && row?.transfer_to_department)) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('tempOrders.targetDepartment')} required={!moveLocked}>
              {moveLocked ? (
                <p className="text-[13px] font-medium text-fg">{row?.transfer_to_department?.name || '—'}</p>
              ) : (
                <Combobox
                  value={toDept}
                  onChange={setToDept}
                  options={departmentOptions}
                  disabled={!employee}
                  placeholder={employee ? t('t2.pick') : t('tempOrders.pickEmployeeFirst')}
                  className="w-full"
                />
              )}
            </Field>
            <Field label={t('tempOrders.targetPosition')} required={!moveLocked}>
              {moveLocked ? (
                <p className="text-[13px] font-medium text-fg">{row?.transfer_to_job_position?.name || '—'}</p>
              ) : (
                <Combobox
                  value={toPos}
                  onChange={setToPos}
                  options={positionOptions}
                  disabled={!employee}
                  placeholder={employee ? t('t2.pick') : t('tempOrders.pickEmployeeFirst')}
                  className="w-full"
                />
              )}
            </Field>
          </div>
        )}

        {isArchiving && (
          <p className="rounded-inner border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-fg-muted">
            {t('tempOrders.archiveWarning')}
          </p>
        )}

        {dateLocked && <p className="text-[12px] text-fg-muted">{t('tempOrders.transferLocked')}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={isMove ? t('tempOrders.effectiveDate') : t('tempOrders.from')} required>
            <DateInput
              value={start}
              onChange={setStart}
              disabled={dateLocked}
              aria-label={isMove ? t('tempOrders.effectiveDate') : t('tempOrders.from')}
            />
          </Field>
          {!singleDate && !isHourly && (
            <Field label={t('tempOrders.to')} required>
              <DateInput value={end} onChange={setEnd} min={start || undefined} aria-label={t('tempOrders.to')} />
            </Field>
          )}
          {isHourly && (
            <>
              <Field label={t('tempOrders.timeFrom')} required>
                <TimeInput value={startTime} onChange={setStartTime} aria-label={t('tempOrders.timeFrom')} />
              </Field>
              <Field label={t('tempOrders.timeTo')} required>
                <TimeInput value={endTime} onChange={setEndTime} aria-label={t('tempOrders.timeTo')} />
              </Field>
            </>
          )}
        </div>

        {isHourly && <p className="text-[11.5px] text-fg-subtle">{t('tempOrders.hourlyHint')}</p>}

        <Field label={t('tempOrders.note')}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}


/**
 * OMMAVIY XIZMAT SAFARI (2026-10-06) — bir nechta xodimga bir xil sanalarda,
 * bir manzilga. Server har xodimga alohida buyruq yozadi va bittalab
 * yaratishdagi tekshiruvlarni (filial, yopilgan davr, takror) har biriga
 * qo'llaydi; o'tmaganlari sababi bilan qaytadi va shu oynada qoladi — kadr
 * sanani to'g'rilab faqat ularni qayta yuboradi.
 *
 * Telefondan «keldim» belgisini FAQAT shu yerda (kadr) qo'yilgan safar ochadi.
 */
function BulkTripModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useTempOrderMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<BulkTripResult | null>(null)

  useEffect(() => {
    if (!open) return
    setPeople([])
    setStart(dayjs().format('YYYY-MM-DD'))
    setEnd('')
    setNote('')
    setError('')
    setResult(null)
  }, [open])

  const submit = async () => {
    setError('')
    if (!people.length) return setError(t('tempOrders.bulkTripPickEmployees'))
    if (!start || !end) return setError(t('tempOrders.endRequired'))
    if (isInvalidRange(start, end)) return setError(t('list.invalidRange'))
    try {
      const res = await mut.bulkTrip.mutateAsync({
        employee_ids: people.map((p) => p.id),
        start_date: start,
        end_date: end,
        note: note.trim() || null,
      })
      if (!res.skipped.length) {
        toast.ok(t('tempOrders.bulkTripDone', { count: res.created.length }))
        onClose()
        return
      }
      // Faqat o'tmaganlar tanlovda qoladi — sanani to'g'rilab qayta yuborish uchun.
      setResult(res)
      const skipped = new Set(res.skipped.map((x) => x.employee_id))
      setPeople((prev) => prev.filter((p) => skipped.has(p.id)))
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('tempOrders.bulkTrip')}
      description={t('tempOrders.bulkTripHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{result ? t('common.close') : t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.bulkTrip.isPending} disabled={!people.length}>
            {t('tempOrders.bulkTripSubmit', { count: people.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {result && (
          <div role="status" className="rounded-inner border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px]">
            <p className="font-medium text-fg">
              {t('tempOrders.bulkTripPartial', { created: result.created.length, skipped: result.skipped.length })}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-fg-muted">
              {result.skipped.map((x) => (
                <li key={x.employee_id}>
                  <span className="font-medium text-fg">
                    {people.find((p) => p.id === x.employee_id)?.legal_name ?? `#${x.employee_id}`}
                  </span>
                  {' — '}
                  {x.message || x.code}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label={t('tempOrders.bulkTripEmployees')} required>
          <EmployeeMultiPicker value={people} onChange={setPeople} branchId={branchId ?? null} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('tempOrders.from')} required>
            <DateInput value={start} onChange={setStart} aria-label={t('tempOrders.from')} />
          </Field>
          <Field label={t('tempOrders.to')} required>
            <DateInput value={end} onChange={setEnd} min={start || undefined} aria-label={t('tempOrders.to')} />
          </Field>
        </div>

        <Field label={t('tempOrders.note')}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function TempOrdersPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isHR(user) || roles.isMasterAdmin(user)} title={t('tempOrders.title')}>
      <TempOrdersPageInner />
    </RequireRole>
  )
}

