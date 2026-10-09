import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuthStore } from '@/store/authStore'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { CalendarClock, Download, Pencil, Plus, Printer, RotateCcw, Trash2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { WORK_LEAVES_EXPORT, WORK_LEAVES_MY_APPROVERS, WORK_LEAVES_RULES } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { apiGet } from '@/api/http'
import { useToast } from '@/components/ui/Toast'
import dayjs from 'dayjs'
import { formatDateTime } from '@/lib/format'
import {
  LEAVE_SCOPES,
  LEAVE_STATUS_PARAM,
  leaveListParams,
  leaveStatusKey,
  useLeaveMutations,
  useLeaveRequests,
  useSupervisorOptions,
  type LeaveRequest,
  type LeaveScope,
} from '@/features/leave/useLeave'
import { useHasSubordinates } from '@/features/employees/useEmployees'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { DateInput } from '@/components/ui/DateInput'
import * as roles from '@/auth/roles'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { Avatar } from '@/components/ui/Avatar'
import { Checkbox } from '@/components/ui/Checkbox'
import { cn } from '@/lib/cn'

const STATUS_LABEL = { pending: 'statusPending', signed: 'statusSigned', rejected: 'statusRejected' } as const
const STATUS_PILL: Record<'pending' | 'signed' | 'rejected', string> = {
  pending: 'bg-warning-soft text-warning',
  signed: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
}
const STATUS_DOT: Record<'pending' | 'signed' | 'rejected', string> = { pending: 'bg-[#F5A524]', signed: 'bg-[#22C55E]', rejected: 'bg-[#E5484D]' }
const withCount = (label: string, n: number | null) => (n == null ? label : `${label} · ${n}`)

/** «22.08 00:00 — 22.08 23:59» → «22.08.2026» for a whole day, else compact. */
function rangeText(from: string, to: string) {
  const a = dayjs(from)
  const b = dayjs(to)
  const wholeDays = a.format('HH:mm') === '00:00' && b.format('HH:mm') >= '23:59'
  if (wholeDays) return a.isSame(b, 'day') ? a.format('DD.MM.YYYY') : `${a.format('DD.MM')} — ${b.format('DD.MM.YYYY')}`
  if (a.isSame(b, 'day')) return `${a.format('DD.MM.YYYY')} · ${a.format('HH:mm')}–${b.format('HH:mm')}`
  return `${a.format('DD.MM HH:mm')} — ${b.format('DD.MM.YYYY HH:mm')}`
}
/** How long — the figure an approver weighs: «3 soat», «1 kun», «5 kun». */
function durationText(from: string, to: string, t: TFunction) {
  const mins = Math.max(0, dayjs(to).diff(dayjs(from), 'minute'))
  if (mins >= 23 * 60) return t('leave.durDays', { count: Math.round(mins / (24 * 60)) || 1 })
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? (m ? t('leave.durHM', { h, m }) : t('leave.durHours', { count: h })) : t('leave.durMin', { count: m })
}

/** Leave type as a small coloured chip — the colour tells kinds apart at a glance. */
function TypeChip({ type, t }: { type?: string | null; t: TFunction }) {
  const label = leaveTypeLabel(t, type)
  let h = 0
  for (const ch of type ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const tones = ['bg-[#8B5CF6]/12 text-[#6D28D9] dark:text-[#C4B5FD]', 'bg-[#0EA5E9]/12 text-[#0369A1] dark:text-[#7DD3FC]', 'bg-[#10B981]/12 text-[#047857] dark:text-[#6EE7B7]', 'bg-[#EC4899]/12 text-[#BE185D] dark:text-[#F9A8D4]', 'bg-[#F59E0B]/15 text-[#B45309] dark:text-[#FCD34D]']
  return <span className={cn('rounded-pill px-2 py-0.5 text-[11.5px] font-semibold', tones[h % tones.length])}>{label}</span>
}

const SCOPE_LABEL: Record<LeaveScope, 'scopeMine' | 'scopeTeam' | 'scopeBranch'> = {
  mine: 'scopeMine',
  team: 'scopeTeam',
  branch: 'scopeBranch',
}

const LIST_KEYS = ['scope', 'status', 'type', 'dept', 'sup', 'from', 'to'] as const

export function RequestPermissionPage() {
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } =
    useListParams(LIST_KEYS)
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const user = useAuthStore((st) => st.user)
  const myEmployeeId = user?.employee?.id

  // WHOSE requests. "My team" only exists for someone who supervises anyone
  // (otherwise it is a switch that returns an empty list); "whole branch" is
  // the personnel office's and the administrator's view.
  const hasTeam = useHasSubordinates()
  const canSeeBranch = roles.isHR(user) || roles.isMasterAdmin(user) || roles.isSiteMasterAdmin(user)
  /** Serverdagi `_is_privileged_manager` ning ko'zgusi. */
  const canManageLeave = roles.isHR(user) || roles.isMasterAdmin(user) || roles.isSiteMasterAdmin(user)
  const scopes = useMemo(
    () => LEAVE_SCOPES.filter((sc) => (sc === 'team' ? hasTeam : sc === 'branch' ? canSeeBranch : true)),
    [hasTeam, canSeeBranch],
  )
  const scope: LeaveScope = scopes.includes(filters.scope as LeaveScope) ? (filters.scope as LeaveScope) : 'mine'
  const statusKey = filters.status in LEAVE_STATUS_PARAM ? filters.status : ''
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to
  const departmentOptions = useDepartmentOptions()
  const supervisorOptions = useSupervisorOptions(scope === 'branch')

  const listArgs = {
    scope,
    status: statusKey,
    type: filters.type,
    departmentIds: scope === 'branch' && filters.dept ? [Number(filters.dept)] : undefined,
    // "Whose approvals are these?" — only meaningful on a list wider than one
    // person, so it rides with the branch scope like the department filter.
    supervisorId: scope === 'branch' ? filters.sup || undefined : undefined,
    dateFrom: filters.from,
    dateTo: filters.to,
    search,
  }
  const { rows, total, pages, loading, fetching, loadAllRows } = useLeaveRequests({
    ...listArgs,
    page,
    size,
    enabled: !rangeInvalid,
  })

  // Counts on the status tabs — three one-row queries on the same filters
  // (the list is paginated on the server, so counting the page would lie).
  const cPending = useLeaveRequests({ ...listArgs, status: 'pending', page: 1, size: 1, enabled: !rangeInvalid })
  const cSigned = useLeaveRequests({ ...listArgs, status: 'signed', page: 1, size: 1, enabled: !rangeInvalid })
  const cRejected = useLeaveRequests({ ...listArgs, status: 'rejected', page: 1, size: 1, enabled: !rangeInvalid })
  const counts = {
    pending: cPending.loading ? null : cPending.total,
    signed: cSigned.loading ? null : cSigned.total,
    rejected: cRejected.loading ? null : cRejected.total,
    all: cPending.loading || cSigned.loading || cRejected.loading ? null : cPending.total + cSigned.total + cRejected.total,
  }

  const filterCount =
    [statusKey, filters.type, scope === 'branch' ? filters.dept : '', scope === 'branch' ? filters.sup : '', filters.from, filters.to, search].filter(Boolean).length
  const resetFilters = () =>
    setFilters({ status: null, type: null, dept: null, sup: null, from: null, to: null, q: null })

  // TZ 4.2.12/A4: the screen's own narrowing goes into the file — what you see
  // is what you download.
  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: WORK_LEAVES_EXPORT,
        mime: XLSX_MIME,
        filename: `Ruxsat_sorovlari_${dayjs().format('DD.MM.YYYY')}.xlsx`,
        params: leaveListParams(listArgs),
      })
      toast.ok(t('leave.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('leave.exportFailed')))
    } finally {
      setExporting(false)
    }
  }
  const mut = useLeaveMutations()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<LeaveRequest | null>(null)
  const [editing, setEditing] = useState<LeaveRequest | null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null)
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const [reopening, setReopening] = useState<LeaveRequest | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * Mirrors `WorkLeaveService._assert_assigned_signer`: only someone named in
   * `assigned_signers` acts, only while the request is still pending, and only
   * once — a second signature returns `work_leave_already_signed`. Requests the
   * viewer filed themselves never show approval buttons.
   */
  /** Is this person one of the request's deciders (status aside)? */
  const isDecider = (r: LeaveRequest) => {
    if (!myEmployeeId || r.employee_id === myEmployeeId) return false
    const assignedList = r.assigned_signers ?? []
    if (assignedList.length === 0) {
      if (canManageLeave) return true
      const supId = r.employee?.supervisor_id
      if (supId) return supId === myEmployeeId
      const deptId = r.employee?.department_id
      return !!deptId && (user?.headed_department_ids ?? []).includes(deptId)
    }
    return canManageLeave || assignedList.some((sg) => sg.id === myEmployeeId)
  }
  /**
   * Reopen (Verifix «reset»): a decided, non-HR request, by one of its
   * deciders — the server checks the same gate (`reopen_work_leave`).
   */
  const canReopen = (r: LeaveRequest) =>
    !r.is_hr_order && ['signed', 'rejected'].includes(leaveStatusKey(r.status)) && isDecider(r)

  const canActOn = (r: LeaveRequest) => {
    if (!myEmployeeId || leaveStatusKey(r.status) !== 'pending') return false
    if (r.employee_id === myEmployeeId) return false
    const assignedList = r.assigned_signers ?? []
    // No signer named: the server lets the default approver or a privileged
    // manager settle it — `WorkLeaveService.default_approvers`: the direct
    // supervisor, else the head of the requester's department (how Verifix
    // routed 96% of approvals; supervisors are set for almost nobody).
    if (assignedList.length === 0) {
      if (canManageLeave) return true
      const supId = r.employee?.supervisor_id
      if (supId) return supId === myEmployeeId
      const deptId = r.employee?.department_id
      return !!deptId && (user?.headed_department_ids ?? []).includes(deptId)
    }
    const assigned = assignedList.some((sg) => sg.id === myEmployeeId)
    const alreadySigned = (r.signers ?? []).some((sg) => sg.id === myEmployeeId)
    return assigned && !alreadySigned
  }
  /**
   * Mirrors `_assert_can_mutate` (PATCH/DELETE): a privileged manager for
   * anyone in scope; the requester only while the request is neither an HR
   * order nor already signed. The old rule offered Edit on a signed request
   * to its requester (403) and never offered Delete to HR at all.
   */
  const canMutate = (r: LeaveRequest) =>
    canManageLeave ||
    (r.employee_id === myEmployeeId && !r.is_hr_order && leaveStatusKey(r.status) !== 'signed')

  // Only the rows this person may actually approve can be selected — offering a
  // checkbox on a request someone cannot sign would promise an action the
  // server refuses. Declared after `canActOn` because it reads it.
  const actionable = useMemo(() => rows.filter((r) => canActOn(r)), [rows])  // eslint-disable-line react-hooks/exhaustive-deps
  // Across pages: «select all» loads every matching request and keeps only
  // the ones this person may sign. How many that is is known only after the
  // load, so until then the offer quotes the list total.
  const selectionKey = JSON.stringify(listArgs)
  const [actionableTotal, setActionableTotal] = useState<{ key: string; n: number } | null>(null)
  const loadAllIds = useCallback(async () => {
    const ids = (await loadAllRows()).filter((r) => canActOn(r)).map((r) => r.id)
    setActionableTotal({ key: selectionKey, n: ids.length })
    return ids
  }, [selectionKey])  // eslint-disable-line react-hooks/exhaustive-deps
  const selection = useRowSelection(actionable, {
    total: actionableTotal?.key === selectionKey ? actionableTotal.n : total,
    loadAllIds,
    resetKey: selectionKey,
  })
  const bulk = useBulkAction()

  // The type filter is EXACT on the server, so it offers exactly the values
  // a request can carry: the dictionary reasons the form now writes, the two
  // free-text kinds older requests carry (in the current language) and KADR's
  // snake_case categories.
  const { options: filterReasons } = useDictionaryOptions('leave_request_reasons')
  const typeOptions = useMemo(
    () => {
      const rows = [
        ...filterReasons.map((r) => ({ value: r.name, label: r.name })),
        { value: t('leave.typeWork'), label: t('leave.typeWork') },
        { value: t('leave.typePersonal'), label: t('leave.typePersonal') },
        ...LEAVE_CATEGORIES.map((c) => ({ value: c, label: t(`leave.cat_${c}` as never) })),
      ]
      // A reason whose wording matches a built-in would otherwise appear twice.
      const seen = new Set<string>()
      return rows.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
    },
    [t, filterReasons],
  )

  const doSign = async (r: LeaveRequest) => {
    if (!(await confirm({ kind: 'approve', subject: r.employee?.legal_name, confirmLabel: t('leave.approve') }))) return
    await mut.sign.mutateAsync(r.id)
    mut.invalidate()
    setNotice(t('leave.approved'))
  }

  const doReject = async (reason: string) => {
    if (!rejecting) return
    const r = rejecting
    setRejecting(null)
    await mut.reject.mutateAsync({ id: r.id, reason })
    mut.invalidate()
    setNotice(t('leave.rejected'))
  }

  const doReopen = async (reason: string) => {
    if (!reopening) return
    const r = reopening
    try {
      await mut.reopen.mutateAsync({ id: r.id, reason })
      setReopening(null)
      mut.invalidate()
      setNotice(t('leave.reopened'))
    } catch (e) {
      setNotice(errorMessage(e, t('leave.actionFailed')))
    }
  }

  const doBulkReject = async (reason: string) => {
    const ids = selection.selectedIds
    try {
      const res = await mut.bulkReject.mutateAsync({ ids, reason })
      const failed = res?.failed?.length ?? 0
      setBulkRejecting(false)
      mut.invalidate()
      selection.clear()
      setNotice(failed > 0 ? t('list.bulkPartialFail', { count: failed }) : t('leave.bulkRejected', { count: ids.length }))
    } catch (e) {
      setNotice(errorMessage(e, t('leave.actionFailed')))
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    const d = deleting
    setDeleting(null)
    await mut.remove.mutateAsync(d.id)
    mut.invalidate()
    setNotice(t('leave.deleted'))
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('leave.title')}
        subtitle={t('leave.subtitle')}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              loading={exporting}
              leftIcon={<Download size={14} />}
            >
              Excel
            </Button>
            {/* A leave request belongs to a PERSON: `_validate_user` rejects a
                login with no employee row, so the form is offered only to one. */}
            {myEmployeeId && (
              <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
                {t('leave.create')}
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          {notice}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {scopes.length > 1 && (
          <Segmented
            value={scope}
            onChange={(v) => setFilters({ scope: v === 'mine' ? null : v, dept: null })}
            options={scopes.map((sc) => ({
              value: sc,
              label: t(`leave.${SCOPE_LABEL[sc]}`),
            }))}
          />
        )}
        <Segmented
          value={statusKey || 'all'}
          onChange={(v) => setFilter('status', v === 'all' ? '' : v)}
          options={[
            { value: 'all', label: withCount(t('leave.filterAll'), counts.all) },
            { value: 'pending', label: withCount(t('leave.filterPending'), counts.pending) },
            { value: 'signed', label: withCount(t('leave.filterSigned'), counts.signed) },
            { value: 'rejected', label: withCount(t('leave.filterRejected'), counts.rejected) },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('leave.searchPlaceholder')}
          className="w-full lg:max-w-xs"
        />
        <Combobox
          value={filters.type}
          onChange={(v) => setFilter('type', v)}
          options={typeOptions}
          placeholder={t('leave.allTypes')}
          className="w-full lg:w-52"
        />
        {scope === 'branch' && (
          <Combobox
            value={filters.dept}
            onChange={(v) => setFilter('dept', v)}
            options={departmentOptions}
            placeholder={t('leave.allDepartments')}
            className="w-full lg:w-52"
          />
        )}
        {scope === 'branch' && (
          <Combobox
            value={filters.sup}
            onChange={(v) => setFilter('sup', v)}
            options={supervisorOptions}
            placeholder={t('leave.allSupervisors')}
            className="w-full lg:w-52"
          />
        )}
        <div className="flex items-center gap-2">
          <DateInput
            value={filters.from}
            onChange={(v) => setFilter('from', v)}
            invalid={rangeInvalid}
            aria-label={t('leave.dateFrom')}
            className="w-full lg:w-36"
          />
          <span className="text-fg-subtle">—</span>
          <DateInput
            value={filters.to}
            onChange={(v) => setFilter('to', v)}
            invalid={rangeInvalid}
            aria-label={t('leave.dateTo')}
            className="w-full lg:w-36"
          />
        </div>
        <FilterReset count={filterCount} onReset={resetFilters} />
        {rangeInvalid && (
          <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<CalendarClock size={22} />}
            title={filterCount > 0 ? t('list.noResultsFiltered') : t('leave.empty')}
            description={filterCount > 0 ? t('list.noResultsFilteredHint') : t('leave.emptyHint')}
          />
        </Card>
      ) : (
        /* Compact rows (redesign 2026-09-24): a request was a tall card each,
           five to a screen — an approver scanning thirty had to scroll six
           times. One row now carries who, what, when (with its length), who
           decides, the state, and the decision buttons. */
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line/70">
            {rows.map((r) => {
              const sk = leaveStatusKey(r.status)
              const deciders = r.assigned_signers ?? []
              const signedIds = new Set((r.signers ?? []).map((x) => x.id))
              const own = r.employee_id === myEmployeeId
              return (
                <li key={r.id} className={cn('group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 lg:flex-row lg:items-center', selection.isSelected(r.id) && 'bg-brand-soft/40')}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {/* The selection slot exists only when something on the page can be approved. */}
                    {actionable.length > 0 && (
                      <span className="flex w-5 shrink-0 justify-center pt-2">
                        {canActOn(r) && (
                          <Checkbox checked={selection.isSelected(r.id)} onChange={() => selection.toggle(r.id)} srLabel={t('leave.approve')} />
                        )}
                      </span>
                    )}
                    <Avatar src={r.employee?.photo_thumb_path} fallbackSrc={r.employee?.photo_path} name={r.employee?.legal_name ?? '?'} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14px] font-semibold text-fg">{own ? t('leave.me') : (r.employee?.legal_name ?? '—')}</span>
                        <TypeChip type={r.type} t={t} />
                        {r.is_hr_order && <span className="rounded-pill border border-line px-1.5 py-px text-[10.5px] font-semibold text-fg-subtle">{t('leave.hrOrder')}</span>}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] tabular-nums text-fg-muted">
                        <CalendarClock size={13} className="text-fg-subtle" />
                        <span>{rangeText(r.start_date, r.end_date)}</span>
                        <span className="rounded-pill bg-surface-2 px-1.5 py-px text-[11px] font-semibold text-fg-muted">{durationText(r.start_date, r.end_date, t)}</span>
                      </p>
                      {r.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-fg-subtle">{r.description}</p>}
                      {sk === 'pending' && r.reopen_reason && (
                        <p className="mt-1.5 rounded-lg border border-warning/30 bg-warning-soft px-2.5 py-1 text-[12px] text-fg">{t('leave.reopenedNote', { reason: r.reopen_reason })}</p>
                      )}
                      {sk === 'rejected' && r.rejection_reason && (
                        <p className="mt-1.5 rounded-lg border border-danger/25 bg-danger-soft px-2.5 py-1 text-[12px] text-danger">{t('leave.rejectionReason')}: {r.rejection_reason}</p>
                      )}
                    </div>
                  </div>

                  <div className={cn('flex flex-wrap items-center gap-3 lg:pl-0', actionable.length > 0 ? 'pl-[80px]' : 'pl-12')}>
                    {deciders.length > 0 && (
                      <span className="flex -space-x-1.5" title={`${t('leave.colSigners')}: ${deciders.map((d) => d.legal_name).join(', ')}`}>
                        {deciders.slice(0, 4).map((d) => (
                          <span key={d.id} className="relative">
                            <Avatar src={d.photo_thumb_path} fallbackSrc={d.photo_path} name={d.legal_name ?? '?'} size={26} className="ring-2 ring-surface" />
                            {signedIds.has(d.id) && <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-success text-[8px] text-white ring-2 ring-surface">✓</span>}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11.5px] font-semibold', STATUS_PILL[sk])}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[sk])} />
                      {t(`leave.${STATUS_LABEL[sk]}`)}
                    </span>
                    <span className="flex items-center gap-1">
                      {canActOn(r) && (
                        <>
                          <Button size="sm" leftIcon={<UserCheck size={14} />} onClick={() => doSign(r)}>{t('leave.approve')}</Button>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRejecting(r)}>{t('leave.reject')}</Button>
                        </>
                      )}
                      {canReopen(r) && (
                        <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} />} onClick={() => setReopening(r)}>{t('leave.reopen')}</Button>
                      )}
                      <IconButton size="sm" label={t('leave.print')} onClick={() => printLeave(r, t)}><Printer size={15} /></IconButton>
                      {/* VAQTNI TUZATISH — gate is the server's `_assert_can_mutate`. */}
                      {canMutate(r) && (
                        <IconButton size="sm" label={t('common.edit')} onClick={() => {
                          setEditFrom((r.start_date ?? '').slice(0, 16))
                          setEditTo((r.end_date ?? '').slice(0, 16))
                          setEditing(r)
                        }}><Pencil size={15} /></IconButton>
                      )}
                      {canMutate(r) && (canManageLeave || sk === 'pending') && (
                        <IconButton size="sm" label={t('leave.deleteTitle')} onClick={() => setDeleting(r)}><Trash2 size={15} /></IconButton>
                      )}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {(total > size || page > 1) && (
        <Card className="mt-4">
          <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
        </Card>
      )}

      {/* Vaqtni tuzatish — `PATCH work-leaves/{id}`; v2 da bu yo'l yo'q edi. */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('leave.editTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button
              loading={mut.update.isPending}
              disabled={!editFrom || !editTo}
              onClick={async () => {
                const row = editing
                setEditing(null)
                if (!row) return
                try {
                  await mut.update.mutateAsync({
                    id: row.id,
                    body: { start_date: editFrom, end_date: editTo },
                  })
                  mut.invalidate()
                  setNotice(t('leave.saved'))
                } catch (e) {
                  setNotice(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Field label={t('leave.fieldStart')} required>
            <DateTimeInput value={editFrom} onChange={setEditFrom} aria-label={t('leave.fieldStart')} />
          </Field>
          <Field label={t('leave.fieldEnd')} required>
            <DateTimeInput value={editTo} onChange={setEditTo} aria-label={t('leave.fieldEnd')} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        danger
        title={t('leave.deleteTitle')}
        description={t('leave.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />

      <RejectLeaveModal
        open={!!rejecting}
        loading={mut.reject.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={doReject}
      />
      <RejectLeaveModal
        open={bulkRejecting}
        loading={mut.bulkReject.isPending}
        title={t('leave.rejectSelectedTitle', { count: selection.count })}
        onClose={() => setBulkRejecting(false)}
        onSubmit={doBulkReject}
      />
      <RejectLeaveModal
        open={!!reopening}
        loading={mut.reopen.isPending}
        title={t('leave.reopen')}
        description={t('leave.reopenHint')}
        label={t('leave.reopenReason')}
        confirmLabel={t('leave.reopen')}
        minLength={3}
        danger={false}
        onClose={() => setReopening(null)}
        onSubmit={doReopen}
      />

      <CreateLeaveModal
        open={creating}
        loading={mut.create.isPending}
        onClose={() => setCreating(false)}
        onSubmit={async (body) => {
          await mut.create.mutateAsync(body)
          mut.invalidate()
          setCreating(false)
          setNotice(t('leave.created'))
        }}
      />
      {/* Approving several at once. The server checks each request on its own
          and reports the ones it refused, so a partial failure is normal and is
          reported rather than swallowed. */}
      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        <Button
          size="sm"
          leftIcon={<UserCheck size={15} />}
          loading={mut.bulkSign.isPending}
          onClick={async () => {
            const ids = selection.selectedIds
            if (!(await confirm({ kind: 'approve', count: ids.length, confirmLabel: t('leave.approveSelected') }))) return
            try {
              const res = await mut.bulkSign.mutateAsync(ids)
              const failed = res?.failed?.length ?? 0
              mut.invalidate()
              selection.clear()
              setNotice(
                failed > 0
                  ? t('list.bulkPartialFail', { count: failed })
                  : t('leave.bulkSigned', { count: ids.length }),
              )
            } catch (e) {
              setNotice(errorMessage(e, t('leave.actionFailed')))
            }
          }}
        >
          {t('leave.approveSelected')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => setBulkRejecting(true)}>
          {t('leave.rejectSelected')}
        </Button>
      </BulkBar>

    </PageContainer>
  )
}

/**
 * KADR's temporary orders share this list and carry a snake_case CATEGORY
 * (`otgul`, `mehnat_tatili`, …), while an ordinary request carries free text
 * the requester typed. Anything without a translation is shown as it came —
 * that is the free-text case, not a missing string.
 */
const LEAVE_CATEGORIES = [
  'kasal', 'mehnat_tatili', 'xizmat_safari', 'dekret', 'haqsiz_tatil', 'ishdan_ozod',
  'tolanmaydigan_tatil', 'noaniq_sabab', 'harbiy_xizmat', 'progul', 'malumotnoma',
  'ish_haqi_saqlangan', 'malaka_oshirish', 'oquv_tatil', 'otgul',
  'boshqa_ishga_otkazish', 'mehnat_tatilidan_chaqirish', 'ruxsat',
] as const

function leaveTypeLabel(t: TFunction, type?: string | null): string {
  if (!type) return t('leave.typeWork')
  return (LEAVE_CATEGORIES as readonly string[]).includes(type) ? t(`leave.cat_${type}` as never) : type
}

function CreateLeaveModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  // Who the request goes to (supervisor, else department head) — asked from
  // the server so the form names the real approver.
  const approversQ = useQuery({
    queryKey: ['work-leaves', 'my-approvers'],
    queryFn: () => apiGet<{ id: number; legal_name: string; via: string }[]>(WORK_LEAVES_MY_APPROVERS),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const approvers = approversQ.data ?? []
  // The backdating limit (setting `attendance.leave_max_days_back`, Verifix 3)
  // — said up front and checked here; the server enforces it regardless.
  const rulesQ = useQuery({
    queryKey: ['work-leaves', 'rules'],
    queryFn: () => apiGet<{ max_days_back: number; exempt: boolean }>(WORK_LEAVES_RULES),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const maxBack = rulesQ.data && !rulesQ.data.exempt ? rulesQ.data.max_days_back : null
  const supervisorName = approvers.map((a) => a.legal_name).join(', ')
  const viaHead = approvers[0]?.via === 'department_head'
  // The reason comes from the «Ruxsat so'rovi sabablari» dictionary, so HR can
  // keep the list in step with how the organisation actually words it. The two
  // built-ins stay as the fallback: an empty or unreachable dictionary must not
  // leave the field without a single choice.
  const { options: reasonRows } = useDictionaryOptions('leave_request_reasons')
  const [type, setType] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setType(t('leave.typeWork'))
    setStart('')
    setEnd('')
    setDescription('')
    setError('')
  }, [open, t])

  const submit = () => {
    if (!start || !end) return setError(t('leave.dateRequired'))
    // A request that ends when it starts (both fields left at 00:00) went
    // through to HR as a zero-minute permission (audit 2026-09-22).
    if (new Date(end).getTime() <= new Date(start).getTime()) return setError(t('list.invalidRange'))
    if (!description.trim()) return setError(t('leave.descRequired'))
    if (maxBack != null) {
      const earliest = new Date()
      earliest.setHours(0, 0, 0, 0)
      earliest.setDate(earliest.getDate() - maxBack)
      if (new Date(start).getTime() < earliest.getTime()) return setError(t('leave.tooFarBack', { count: maxBack }))
    }
    onSubmit({
      type,
      start_date: start,
      end_date: end,
      description: description.trim(),
      // No assigned_signer_ids on purpose — that is what routes the request to
      // the requester's direct supervisor server-side.
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('leave.createTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={loading}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('leave.fieldType')}>
          <Combobox
            value={type}
            onChange={setType}
            options={
              reasonRows.length
                ? reasonRows.map((r) => ({ value: r.name, label: r.name }))
                : [
                    { value: t('leave.typeWork'), label: t('leave.typeWork') },
                    { value: t('leave.typePersonal'), label: t('leave.typePersonal') },
                  ]
            }
            placeholder={t('leave.fieldType')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('leave.fieldStart')}>
            <DateTimeInput value={start} onChange={setStart} aria-label={t('leave.fieldStart')} />
          </Field>
          <Field label={t('leave.fieldEnd')}>
            <DateTimeInput value={end} onChange={setEnd} aria-label={t('leave.fieldEnd')} />
          </Field>
        </div>
        <Field label={t('leave.fieldDescription')} required>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t('leave.descriptionPlaceholder')}
            aria-label={t('leave.fieldDescription')}
          />
        </Field>

        {/* Routing is not a choice: the request goes to the requester's direct
            supervisor. Picking signers by hand let people route around their
            own manager, and an empty pick silently produced a request nobody
            could sign. */}
        <div className="flex items-start gap-2.5 rounded-inner border border-line bg-surface-2/60 px-3 py-2.5">
          <UserCheck size={16} className="mt-0.5 shrink-0 text-brand" />
          <p className="text-[13px] text-fg-muted">
            {supervisorName
              ? viaHead
                ? t('leave.goesToDepartmentHead', { name: supervisorName })
                : t('leave.goesToSupervisor', { name: supervisorName })
              : t('leave.goesToNobody')}
            {maxBack != null && <span className="mt-1 block">{t('leave.backHint', { count: maxBack })}</span>}
          </p>
        </div>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

/** A reason prompt — rejecting one, rejecting many, or reopening. */
function RejectLeaveModal({
  open, loading, onClose, onSubmit, title, description, label, confirmLabel, minLength = 1, danger = true,
}: {
  open: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  title?: string
  description?: string
  label?: string
  confirmLabel?: string
  minLength?: number
  danger?: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('leave.reject')}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            disabled={reason.trim().length < minLength}
            onClick={() => onSubmit(reason.trim())}
          >
            {confirmLabel ?? t('leave.reject')}
          </Button>
        </div>
      }
    >
      <Field label={label ?? t('leave.rejectionReason')} required>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

/**
 * A printable slip for one request (Verifix printed each request with its
 * number). Built as a plain document in a new window; every value is escaped.
 */
function printLeave(r: LeaveRequest, t: TFunction) {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const signers = (r.signers ?? []).map((s) => s.legal_name).filter(Boolean).join(', ')
  const rows: [string, string][] = [
    [t('leave.printNumber'), `№ ${r.id}`],
    [t('leave.fieldType'), leaveTypeLabel(t, r.type)],
    [t('leave.fieldStart'), formatDateTime(r.start_date)],
    [t('leave.fieldEnd'), formatDateTime(r.end_date)],
    [t('leave.fieldDescription'), r.description ?? '—'],
    [t('leave.colSigners'), signers || '—'],
    [t('leave.printStatus'), t(`leave.${STATUS_LABEL[leaveStatusKey(r.status)]}` as never)],
  ]
  const w = window.open('', '_blank', 'width=720,height=800')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('leave.printTitle'))} № ${r.id}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:40px;color:#111}h1{font-size:18px;margin:0 0 20px}
table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:8px 10px;vertical-align:top}
td:first-child{width:34%;color:#444}.sig{margin-top:48px;display:flex;justify-content:space-between}</style></head>
<body><h1>${esc(t('leave.printTitle'))}</h1><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<div class="sig"><span>${esc(t('leave.printRequester'))}: ____________</span><span>${esc(t('leave.printApprover'))}: ____________</span></div>
<script>window.onload=function(){window.print()}</script></body></html>`)
  w.document.close()
}
