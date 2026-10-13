import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, FileDown, FileText, ListPlus, Play, Plus, Repeat, X, XCircle } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { canWriteOrg } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentRecords } from '@/hooks/useReferenceData'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { KpiSnapshot } from '@/features/inspections/KpiSnapshot'
import { FindingTaskModal, FindingTasks, FollowUpModal } from '@/features/inspections/InspectionExtras'
import {
  ASSESSMENTS,
  FINDING_SEVERITIES,
  INSPECTION_OBJECTS,
  INSPECTION_STATUSES,
  useAuditIndicators,
  useInspection,
  useInspectionMutations,
  useInspections,
  type AuditIndicator,
  type Finding,
  type Inspection,
} from '@/features/inspections/useInspections'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile } from '@/lib/download'
import { isInvalidRange } from '@/lib/dateRange'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'

const STATUS_TONE: Record<string, BadgeTone> = { planned: 'warning', in_progress: 'info', completed: 'success', cancelled: 'neutral' }
const SEV_TONE: Record<string, BadgeTone> = { low: 'neutral', medium: 'warning', high: 'danger' }
const dmy = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—')
const objectName = (r: Pick<Inspection, 'employee_name' | 'department_name' | 'process_name'>) =>
  r.employee_name || r.department_name || r.process_name || '—'
const isOpen = (s?: string) => s === 'planned' || s === 'in_progress'

/** Same name in several organisations — the label carries the organisation once more than one is visible. */
function useIndicatorLabel(all: AuditIndicator[]) {
  const { t } = useTranslation()
  const multi = new Set(all.map((i) => i.organization_branch_id ?? 'g')).size > 1
  return (i: AuditIndicator) => (multi ? `${i.name} — ${i.organization_branch_name || t('inspections.central')}` : i.name)
}

/**
 * Auditlar — TZ K5 «Проведение аудитов». Management opens a planned audit,
 * appoints the auditors and the KPI indicators to check, starts it, records
 * findings (the auditors may too) and completes it with a conclusion. A
 * completed audit is frozen; the report goes out as Word or PDF.
 */
export function InspectionsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canManage = canWriteOrg(user, 'inspections')
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams(['status'])
  const { rows, total, pages, loading, fetching, error, refetch } = useInspections({ page, size, search, status: filters.status })
  const mut = useInspectionMutations()

  const [creating, setCreating] = useState(false)
  const [completing, setCompleting] = useState<Inspection | null>(null)
  const [cancelling, setCancelling] = useState<Inspection | null>(null)

  // Detail by `?open={id}` — the row button, notifications and global search all use it.
  const [sp, setSp] = useSearchParams()
  const openId = Number(sp.get('open')) || null
  const setOpen = (id: number | null) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      if (id) n.set('open', String(id))
      else n.delete('open')
      return n
    }, { replace: !id })

  const start = async (r: Inspection) => {
    try {
      await mut.start.mutateAsync({ id: r.id })
      toast.ok(t('inspections.started'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<Inspection>[] = [
    { key: 'n', header: '№', className: 'w-12 text-fg-subtle tabular-nums', cell: (_r, i) => `${(page - 1) * size + i + 1}.` },
    {
      key: 'title',
      header: t('inspections.colTitle'),
      cell: (r) => (
        <span className="flex min-w-0 max-w-[26rem] flex-col">
          <span className="line-clamp-2 font-medium text-fg">{r.title}</span>
          <span className="truncate text-[12px] text-fg-subtle">
            {t(`inspections.object_${r.object_type}` as never, { defaultValue: r.object_label ?? '' })}: {objectName(r)}
          </span>
        </span>
      ),
    },
    { key: 'period', header: t('inspections.period'), cell: (r) => <span className="whitespace-nowrap tabular-nums text-fg-muted">{dmy(r.period_start)} — {dmy(r.period_end)}</span> },
    {
      key: 'findings',
      header: t('inspections.findings'),
      cell: (r) =>
        r.findings_total ? (
          <span className={cn('tabular-nums', r.findings_open ? 'text-danger' : 'text-fg-muted')}>
            {t('inspections.findingsCount', { open: r.findings_open ?? 0, total: r.findings_total })}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: 'status', header: t('inspections.status'), cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`inspections.status_${r.status}` as never, { defaultValue: r.status })}</Badge> },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setOpen(r.id)}>{t('inspections.details')}</Button>
          {canManage && r.status === 'planned' && (
            <Button size="sm" variant="secondary" leftIcon={<Play size={13} />} loading={mut.start.isPending && mut.start.variables?.id === r.id} onClick={() => start(r)}>
              {t('inspections.start')}
            </Button>
          )}
          {/* «Начать» → «В процессе» → «Завершить» — completion only after a start. */}
          {canManage && r.status === 'in_progress' && (
            <Button size="sm" variant="secondary" leftIcon={<CheckCircle2 size={13} />} onClick={() => setCompleting(r)}>
              {t('inspections.complete')}
            </Button>
          )}
          {canManage && isOpen(r.status) && (
            <IconButton size="sm" label={t('inspections.cancelTitle')} onClick={() => setCancelling(r)}>
              <XCircle size={15} />
            </IconButton>
          )}
        </div>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('inspections.title')}
        subtitle={t('inspections.subtitle')}
        actions={canManage ? <Button leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>{t('inspections.add')}</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] max-w-md flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('inspections.searchPlaceholder')} />
        </div>
        <Combobox
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          options={INSPECTION_STATUSES.map((x) => ({ value: x, label: t(`inspections.status_${x}`) }))}
          placeholder={t('inspections.allStatuses')}
          className="w-full sm:w-52"
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          tableId="inspections"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={activeFilterCount ? t('list.noResultsFiltered') : t('inspections.empty')}
          emptyDescription={activeFilterCount ? t('list.noResultsFilteredHint') : canManage ? t('inspections.emptyHint') : undefined}
          onRowClick={(r) => setOpen(r.id)}
        />
        <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <CreateModal open={creating} onClose={() => setCreating(false)} />
      <DetailDrawer id={openId} canManage={canManage} onClose={() => setOpen(null)} onOpen={setOpen} onComplete={setCompleting} onCancel={setCancelling} />
      <CompleteModal row={completing} onClose={() => setCompleting(null)} />
      <CancelModal row={cancelling} onClose={() => setCancelling(null)} />
    </PageContainer>
  )
}

// ─────────────────────────────── Create ───────────────────────────────

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const kpiOn = !!useAuthStore((s) => s.user?.kpi_enabled)
  const departments = useDepartmentRecords<{ id: number; name?: string | null; organization_branch_id?: number | null }>(branchId)
  const indicators = useAuditIndicators(open && kpiOn)
  const indicatorLabel = useIndicatorLabel(indicators)

  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [objectType, setObjectType] = useState<string>('department')
  const [departmentId, setDepartmentId] = useState('')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [processName, setProcessName] = useState('')
  const [members, setMembers] = useState<PickedPerson[]>([])
  const [indicatorIds, setIndicatorIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setPurpose('')
    setPeriodStart('')
    setPeriodEnd('')
    setObjectType('department')
    setDepartmentId('')
    setEmployee(null)
    setProcessName('')
    setMembers([])
    setIndicatorIds([])
    setError('')
  }, [open])

  // The audited object's organisation: only its (and the central) indicators
  // may be checked — the server answers 422 `inspection_indicator_branch` otherwise.
  const deptBranch = (id?: number | string | null) => departments.find((d) => String(d.id) === String(id))?.organization_branch_id ?? null
  const objectBranchId =
    objectType === 'department' && departmentId
      ? deptBranch(departmentId)
      : objectType === 'employee' && employee
        ? employee.organization_branch_id ?? employee.department?.organization_branch_id ?? deptBranch(employee.department_id)
        : null
  const indicatorOptions = useMemo(
    () =>
      indicators
        .filter((i) => i.is_active !== false && (objectBranchId == null || i.organization_branch_id == null || Number(i.organization_branch_id) === Number(objectBranchId)))
        .map((i) => ({ value: String(i.id), label: indicatorLabel(i) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indicators, objectBranchId],
  )
  // A changed object drops the picked indicators of another organisation.
  useEffect(() => {
    if (objectBranchId == null) return
    const allowed = new Set(indicatorOptions.map((o) => o.value))
    setIndicatorIds((ids) => (ids.every((id) => allowed.has(id)) ? ids : ids.filter((id) => allowed.has(id))))
  }, [objectBranchId, indicatorOptions])

  const submit = async () => {
    setError('')
    if (!title.trim()) return setError(t('inspections.titleRequired'))
    if (objectType === 'department' && !departmentId) return setError(t('inspections.objectRequired'))
    if (objectType === 'employee' && !employee) return setError(t('inspections.objectRequired'))
    if (objectType === 'process' && !processName.trim()) return setError(t('inspections.objectRequired'))
    if (isInvalidRange(periodStart, periodEnd)) return setError(t('list.invalidRange'))
    try {
      await mut.create.mutateAsync({
        title: title.trim(),
        purpose: purpose.trim() || null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        object_type: objectType,
        department_id: objectType === 'department' ? Number(departmentId) : null,
        employee_id: objectType === 'employee' ? employee!.id : null,
        process_name: objectType === 'process' ? processName.trim() : null,
        member_ids: members.map((m) => m.id),
        kpi_indicator_ids: indicatorIds.map(Number),
      })
      toast.ok(t('inspections.created'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const indicatorName = (id: string) => indicatorOptions.find((o) => o.value === id)?.label ?? `#${id}`
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inspections.add')}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          <FormError className="text-xs">{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={submit} loading={mut.create.isPending}>{t('common.save')}</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('inspections.fieldTitle')} required wide>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('inspections.purpose')} wide>
          <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label={t('inspections.periodStart')}>
          <DateInput value={periodStart} onChange={setPeriodStart} invalid={isInvalidRange(periodStart, periodEnd)} />
        </Field>
        <Field label={t('inspections.periodEnd')}>
          <DateInput value={periodEnd} onChange={setPeriodEnd} min={periodStart || undefined} invalid={isInvalidRange(periodStart, periodEnd)} />
        </Field>
        <Field label={t('inspections.objectType')} required>
          <Combobox
            value={objectType}
            onChange={(v) => v && setObjectType(v)}
            options={INSPECTION_OBJECTS.map((x) => ({ value: x, label: t(`inspections.object_${x}`) }))}
            clearable={false}
          />
        </Field>
        {objectType === 'department' && (
          <Field label={t('inspections.object_department')} required>
            <Combobox value={departmentId} onChange={setDepartmentId} options={departments.map((d) => ({ value: String(d.id), label: d.name ?? `#${d.id}` }))} placeholder={t('common.choose')} />
          </Field>
        )}
        {objectType === 'employee' && (
          <Field label={t('inspections.object_employee')} required>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </Field>
        )}
        {objectType === 'process' && (
          <Field label={t('inspections.processName')} required>
            <Input value={processName} onChange={(e) => setProcessName(e.target.value)} />
          </Field>
        )}
        <Field label={t('inspections.members')} wide>
          <EmployeeMultiPicker value={members} onChange={setMembers} placeholder={t('inspections.membersPlaceholder')} />
        </Field>
        {kpiOn && (
          <Field label={t('inspections.kpiIndicators')} hint={t('inspections.kpiIndicatorsHint')} wide>
            <div className="flex flex-col gap-2">
              {indicatorIds.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {indicatorIds.map((id) => (
                    <li key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-[12.5px] text-fg">
                      <span className="truncate">{indicatorName(id)}</span>
                      <button type="button" aria-label={t('common.clearValue')} onClick={() => setIndicatorIds((p) => p.filter((x) => x !== id))} className="shrink-0 text-fg-subtle hover:text-danger">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Combobox
                value=""
                onChange={(v) => v && setIndicatorIds((p) => (p.includes(v) ? p : [...p, v]))}
                options={indicatorOptions.filter((o) => !indicatorIds.includes(o.value))}
                placeholder={t('inspections.kpiIndicatorsPlaceholder')}
                hidePlaceholderOption
              />
            </div>
          </Field>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────── Detail ───────────────────────────────

function DetailDrawer({
  id,
  canManage,
  onClose,
  onOpen,
  onComplete,
  onCancel,
}: {
  id: number | null
  canManage: boolean
  onClose: () => void
  onOpen: (id: number) => void
  onComplete: (r: Inspection) => void
  onCancel: (r: Inspection) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const kpiOn = !!useAuthStore((s) => s.user?.kpi_enabled)
  const { inspection: d, loading, error } = useInspection(id)
  const indicators = useAuditIndicators(!!id && kpiOn && !!d?.kpi_indicator_ids?.length)
  const indicatorLabel = useIndicatorLabel(indicators)
  const mut = useInspectionMutations()
  const [resolving, setResolving] = useState<Finding | null>(null)
  const [extend, setExtend] = useState<{ end: string; reason: string } | null>(null)
  const [extendError, setExtendError] = useState('')
  const [reporting, setReporting] = useState<string | null>(null)
  const [taskFor, setTaskFor] = useState<Finding | null>(null)
  const [followUpFor, setFollowUpFor] = useState<Inspection | null>(null)

  useEffect(() => {
    setExtend(null)
    setExtendError('')
  }, [id])

  const myEmpId = user?.employee?.id
  const isAuditor = !!d && myEmpId != null && (d.members ?? []).some((m) => Number(m.employee_id) === Number(myEmpId))
  const canFindings = canManage || isAuditor
  const open = isOpen(d?.status)

  const download = async (format: 'docx' | 'pdf') => {
    if (!d) return
    setReporting(format)
    try {
      await downloadFile({ url: `inspections/${d.id}/report`, params: { format }, filename: `tekshiruv_${d.id}.${format}` })
    } catch (e) {
      toast.error(errorMessage(e, t('inspections.reportFailed')))
    } finally {
      setReporting(null)
    }
  }

  const submitExtension = async () => {
    if (!d || !extend) return
    setExtendError('')
    if (!extend.end) return setExtendError(t('inspections.extendDateRequired'))
    if (d.period_end && extend.end <= String(d.period_end).slice(0, 10)) return setExtendError(t('inspections.extendDateLater'))
    if (extend.reason.trim().length < 3) return setExtendError(t('inspections.extendReasonRequired'))
    try {
      await mut.update.mutateAsync({ id: d.id, body: { period_end: extend.end, extension_reason: extend.reason.trim() } })
      toast.ok(t('inspections.extended'))
      setExtend(null)
    } catch (e) {
      setExtendError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const indicatorNames = (d?.kpi_indicator_ids ?? []).map((iid) => {
    const i = indicators.find((x) => x.id === iid)
    return i ? indicatorLabel(i) : d?.kpi_snapshot?.rows?.find((r) => r.indicator_id === iid)?.name || `#${iid}`
  })

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      placement="right"
      size="lg"
      title={d?.title ?? t('inspections.details')}
      description={d ? `${t(`inspections.object_${d.object_type}` as never, { defaultValue: d.object_label ?? '' })}: ${objectName(d)} · ${dmy(d.period_start)} — ${dmy(d.period_end)}` : undefined}
    >
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : error || !d ? (
        <p className="text-sm text-danger">{errorMessage(error, t('list.docNotFound'))}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{t(`inspections.status_${d.status}` as never, { defaultValue: d.status })}</Badge>
            <span className="ml-auto text-[12px] text-fg-subtle">{t('inspections.report')}:</span>
            <Button size="sm" variant="outline" leftIcon={<FileText size={13} />} loading={reporting === 'docx'} onClick={() => download('docx')}>Word</Button>
            <Button size="sm" variant="outline" leftIcon={<FileDown size={13} />} loading={reporting === 'pdf'} onClick={() => download('pdf')}>PDF</Button>
          </div>

          {(d.parent_inspection_id || (d.follow_ups ?? []).length > 0) && (
            <div className="flex flex-col gap-1 text-[12.5px] text-fg-muted">
              {d.parent_inspection_id && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <Repeat size={13} className="text-brand" aria-hidden />
                  {t('kpiExt.followUpOf')}:
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => onOpen(d.parent_inspection_id as number)}>
                    {d.parent_inspection_title || `#${d.parent_inspection_id}`}
                  </button>
                </span>
              )}
              {(d.follow_ups ?? []).map((f) => (
                <span key={f.id} className="flex flex-wrap items-center gap-1.5">
                  <Repeat size={13} className="text-brand" aria-hidden />
                  {t('kpiExt.followUpAudit')}:
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => onOpen(f.id)}>
                    {f.title}
                  </button>
                  <Badge tone={STATUS_TONE[f.status] ?? 'neutral'}>{t(`inspections.status_${f.status}` as never, { defaultValue: f.status_label ?? f.status })}</Badge>
                </span>
              ))}
            </div>
          )}

          {canManage && d.status === 'completed' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={<Repeat size={13} />} onClick={() => setFollowUpFor(d)}>{t('kpiExt.followUpTitle')}</Button>
            </div>
          )}

          {canManage && open && (
            <div className="flex flex-wrap gap-2">
              {d.status === 'planned' && (
                <Button
                  size="sm"
                  leftIcon={<Play size={13} />}
                  loading={mut.start.isPending}
                  onClick={async () => {
                    try {
                      await mut.start.mutateAsync({ id: d.id })
                      toast.ok(t('inspections.started'))
                    } catch (e) {
                      toast.error(errorMessage(e, t('common.actionFailed')))
                    }
                  }}
                >
                  {t('inspections.start')}
                </Button>
              )}
              {d.status === 'in_progress' && (
                <Button size="sm" leftIcon={<CheckCircle2 size={13} />} onClick={() => onComplete(d)}>{t('inspections.complete')}</Button>
              )}
              {!extend && (
                <Button size="sm" variant="secondary" leftIcon={<CalendarClock size={13} />} onClick={() => setExtend({ end: '', reason: '' })}>
                  {t('inspections.extend')}
                </Button>
              )}
              <Button size="sm" variant="danger-ghost" leftIcon={<XCircle size={13} />} onClick={() => onCancel(d)}>{t('inspections.cancelTitle')}</Button>
            </div>
          )}

          {extend && (
            <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3">
              <p className="text-[13px] font-semibold text-warning">{t('inspections.extend')}</p>
              <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                <Field label={t('inspections.extendNewEnd')}>
                  <DateInput value={extend.end} onChange={(v) => setExtend((x) => (x ? { ...x, end: v } : x))} />
                </Field>
                <Field label={t('inspections.extendReason')}>
                  <Input value={extend.reason} onChange={(e) => setExtend((x) => (x ? { ...x, reason: e.target.value } : x))} />
                </Field>
              </div>
              <FormError className="text-xs">{extendError}</FormError>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setExtend(null)}>{t('common.cancel')}</Button>
                <Button size="sm" loading={mut.update.isPending} onClick={submitExtension}>{t('common.save')}</Button>
              </div>
            </div>
          )}

          {d.purpose && <p className="whitespace-pre-line text-[13px] text-fg-muted">{d.purpose}</p>}

          <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[10rem_1fr]">
            {(d.members ?? []).length > 0 && (
              <>
                <dt className="text-fg-subtle">{t('inspections.members')}</dt>
                <dd className="text-fg">{(d.members ?? []).map((m) => m.employee_name || `#${m.employee_id}`).join(', ')}</dd>
              </>
            )}
            {indicatorNames.length > 0 && (
              <>
                <dt className="flex items-center gap-1 text-fg-subtle"><Activity size={13} className="text-brand" /> {t('inspections.kpiIndicators')}</dt>
                <dd className="text-fg">{indicatorNames.join(', ')}</dd>
              </>
            )}
            {d.branch_name && (
              <>
                <dt className="text-fg-subtle">{t('inspections.organisation')}</dt>
                <dd className="text-fg">{d.branch_name}</dd>
              </>
            )}
          </dl>

          {(d.extensions ?? []).length > 0 && (
            <div className="flex flex-col gap-1 text-[12.5px] text-fg-muted">
              <b className="text-[13px] text-fg">{t('inspections.extensions')}</b>
              {(d.extensions ?? []).map((e, i) => (
                <span key={i}>
                  {e.at ? `${dmy(e.at)} · ` : ''}
                  {dmy(e.old_end)} → {dmy(e.new_end)} · {e.reason}
                  {e.by ? ` (${e.by})` : ''}
                </span>
              ))}
            </div>
          )}

          {d.conclusion && (
            <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-fg">
              <b className="text-success">{t('inspections.conclusion')}:</b> <span className="whitespace-pre-line">{d.conclusion}</span>
            </div>
          )}
          {d.cancel_reason && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-fg">
              <b className="text-danger">{t('inspections.cancelledLabel')}:</b> {d.cancel_reason}
            </div>
          )}

          <KpiSnapshot snapshot={d.kpi_snapshot} />

          <section className="flex flex-col gap-2">
            <h4 className="text-[14px] font-semibold text-fg">
              {t('inspections.findingsHeading', { open: d.findings_open ?? 0, total: d.findings_total ?? 0 })}
            </h4>
            {(d.findings ?? []).length === 0 && <p className="text-[13px] text-fg-subtle">{t('inspections.noFindings')}</p>}
            {(d.findings ?? []).map((f) => (
              <div key={f.id} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="whitespace-pre-line text-[13px] text-fg">{f.description}</span>
                  <Badge tone={f.status === 'resolved' ? 'success' : 'warning'}>{f.status === 'resolved' ? t('inspections.resolved') : t('inspections.open')}</Badge>
                </div>
                {f.recommendation && <p className="mt-1 text-[12px] text-fg-muted">{t('inspections.recommendation')}: {f.recommendation}</p>}
                <FindingTasks finding={f} />
                {f.resolution_note && <p className="mt-1 text-[12px] text-success">{t('inspections.resolutionNote')}: {f.resolution_note}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
                  <Badge tone={SEV_TONE[f.severity] ?? 'neutral'}>{t(`inspections.sev_${f.severity}` as never, { defaultValue: f.severity })}</Badge>
                  {f.responsible_name && <span>· {f.responsible_name}</span>}
                  {f.due_date && (
                    <span className={cn('flex items-center gap-1', f.is_overdue && 'text-danger')}>
                      {f.is_overdue && <AlertTriangle size={11} />} {t('inspections.dueUntil', { date: dmy(f.due_date) })}
                    </span>
                  )}
                  {f.status !== 'resolved' && canFindings && (
                    <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<ListPlus size={13} />} onClick={() => setTaskFor(f)}>
                      {t('kpiExt.correctiveTaskAdd')}
                    </Button>
                  )}
                  {f.status !== 'resolved' && canFindings && (
                    <Button size="sm" variant="ghost" leftIcon={<CheckCircle2 size={13} />} onClick={() => setResolving(f)}>
                      {t('inspections.resolve')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* A completed / cancelled audit is frozen — no new findings. */}
          {open && canFindings && <FindingForm inspectionId={d.id} />}
        </div>
      )}
      <ResolveModal inspectionId={d?.id ?? null} finding={resolving} onClose={() => setResolving(null)} />
      <FindingTaskModal inspection={d} finding={taskFor} onClose={() => setTaskFor(null)} />
      <FollowUpModal inspection={followUpFor} onClose={() => setFollowUpFor(null)} onCreated={onOpen} />
    </Modal>
  )
}

function FindingForm({ inspectionId }: { inspectionId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [q, setQ] = useState('')
  const people = useEmployeeSearch(branchId, true, q)
  const [description, setDescription] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [responsible, setResponsible] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!description.trim()) return setError(t('inspections.findingRequired'))
    try {
      await mut.addFinding.mutateAsync({
        id: inspectionId,
        body: {
          description: description.trim(),
          recommendation: recommendation.trim() || null,
          severity,
          responsible_id: responsible ? Number(responsible) : null,
          due_date: due || null,
        },
      })
      setDescription('')
      setRecommendation('')
      setSeverity('medium')
      setResponsible('')
      setDue('')
      toast.ok(t('inspections.findingAdded'))
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <h4 className="text-[13.5px] font-semibold text-fg">{t('inspections.newFinding')}</h4>
      <Field label={t('inspections.findingText')} required>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t('inspections.recommendation')}>
        <Input value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('inspections.severity')}>
          <Combobox value={severity} onChange={(v) => v && setSeverity(v)} options={FINDING_SEVERITIES.map((x) => ({ value: x, label: t(`inspections.sev_${x}`) }))} clearable={false} />
        </Field>
        <Field label={t('inspections.responsible')}>
          <Combobox
            value={responsible}
            onChange={setResponsible}
            options={people.options}
            onSearchChange={setQ}
            loading={people.loading}
            hasMore={people.hasMore}
            onLoadMore={people.loadMore}
            placeholder={t('common.choose')}
          />
        </Field>
        <Field label={t('inspections.dueDate')}>
          <DateInput value={due} onChange={setDue} />
        </Field>
      </div>
      <FormError className="text-xs">{error}</FormError>
      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus size={14} />} loading={mut.addFinding.isPending} onClick={submit}>{t('inspections.addFinding')}</Button>
      </div>
    </section>
  )
}

function ResolveModal({ inspectionId, finding, onClose }: { inspectionId: number | null; finding: Finding | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setNote('')
    setError('')
  }, [finding])
  const submit = async () => {
    if (!finding || !inspectionId) return
    try {
      await mut.updateFinding.mutateAsync({ id: inspectionId, findingId: finding.id, body: { status: 'resolved', resolution_note: note.trim() || null } })
      toast.ok(t('inspections.findingResolved'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }
  return (
    <Modal
      open={!!finding}
      onClose={onClose}
      title={t('inspections.resolveTitle')}
      description={finding?.description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.updateFinding.isPending}>{t('inspections.resolve')}</Button>
        </>
      }
    >
      <Field label={t('inspections.resolutionNote')} hint={t('inspections.resolutionHint')}>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}

// ─────────────────────────────── Complete / cancel ───────────────────────────────

/** TZ K5 «Завершить проверку — формирование заключения». */
function CompleteModal({ row, onClose }: { row: Inspection | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const [assessment, setAssessment] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setAssessment('')
    setConclusion('')
    setRecommendations('')
    setError('')
  }, [row?.id])

  const submit = async () => {
    if (!row) return
    if (!conclusion.trim()) return setError(t('inspections.conclusionRequired'))
    try {
      await mut.complete.mutateAsync({
        id: row.id,
        body: { conclusion: conclusion.trim(), assessment: assessment || null, recommendations: recommendations.trim() || null },
      })
      toast.ok(t('inspections.completed'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('inspections.completeTitle')}
      description={row?.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button leftIcon={<CheckCircle2 size={14} />} onClick={submit} loading={mut.complete.isPending}>{t('inspections.completeSubmit')}</Button>
        </>
      }
    >
      {row && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-[12.5px]">
          <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
            <div className="text-fg-subtle">{t('inspections.period')}</div>
            <div className="text-fg">{dmy(row.period_start)} — {dmy(row.period_end)}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
            <div className="text-fg-subtle">{t('inspections.findingsTotal')}</div>
            <div className="text-fg">{row.findings_total ?? 0}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
            <div className="text-fg-subtle">{t('inspections.findingsOpen')}</div>
            <div className={row.findings_open ? 'text-danger' : 'text-success'}>{row.findings_open ?? 0}</div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Field label={t('inspections.assessment')}>
          <Combobox value={assessment} onChange={setAssessment} options={ASSESSMENTS.map((x) => ({ value: x, label: t(`inspections.assess_${x}`) }))} placeholder={t('inspections.assessmentOptional')} />
        </Field>
        <Field label={t('inspections.conclusion')} required>
          <Textarea rows={5} value={conclusion} onChange={(e) => { setConclusion(e.target.value); setError('') }} placeholder={t('inspections.conclusionPlaceholder')} />
        </Field>
        <Field label={t('inspections.recommendations')}>
          <Textarea rows={3} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} placeholder={t('inspections.recommendationsPlaceholder')} />
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}

function CancelModal({ row, onClose }: { row: Inspection | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setReason('')
    setError('')
  }, [row?.id])
  const submit = async () => {
    if (!row) return
    if (!reason.trim()) return setError(t('inspections.cancelReasonRequired'))
    try {
      await mut.cancel.mutateAsync({ id: row.id, body: { reason: reason.trim() } })
      toast.ok(t('inspections.cancelled'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('inspections.cancelTitle')}
      description={row?.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.previous')}</Button>
          <Button variant="danger" onClick={submit} loading={mut.cancel.isPending}>{t('inspections.cancelTitle')}</Button>
        </>
      }
    >
      <Field label={t('inspections.cancelReason')} required>
        <Textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('inspections.cancelReasonPlaceholder')} />
      </Field>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}
