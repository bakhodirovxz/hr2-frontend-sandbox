import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ClipboardCheck, Play, Plus, Trash2, X } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { Pagination } from '@/components/data/Pagination'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useBranchStore } from '@/store/branchStore'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'
import {
  FINDING_SEVERITIES,
  INSPECTION_OBJECTS,
  INSPECTION_STATUSES,
  useInspection,
  useInspectionMutations,
  useInspections,
  type Inspection,
} from '@/features/inspections/useInspections'
import { isInvalidRange } from '@/lib/dateRange'

/** The audited subject by name — `object_label` is only the type word. */
const objectName = (r: Pick<Inspection, 'employee_name' | 'department_name' | 'process_name'>) =>
  r.employee_name || r.department_name || r.process_name || null

const STATUS_TONE: Record<string, BadgeTone> = {
  planned: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}
const SEV_TONE: Record<string, BadgeTone> = { low: 'neutral', medium: 'warning', high: 'danger' }

function InspectionsPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams(['status', 'object'])
  const { rows, total, pages, loading, fetching } = useInspections({
    page,
    size,
    search: search,
    status: filters.status,
    objectType: filters.object,
  })
  const mut = useInspectionMutations()
  /* The server stamps every row with the caller's rights. An empty list gives
     us no row to read, so the role predicate is the fallback there — it is
     the same rule the service applies (`InspectionService.can_manage`). */
  const user = useAuthStore((s) => s.user)
  const canManage = rows.length
    ? rows.some((r) => r.can_manage)
    : roles.isSiteMasterAdmin(user) ||
      roles.isBranchAdmin(user) ||
      roles.isHR(user) ||
      roles.isMinister(user) ||
      roles.isDeputy(user) ||
      !!user?.employee?.is_kpi_admin
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [removing, setRemoving] = useState<Inspection | null>(null)

  return (
    <PageContainer>
      <PageHeader
        title={t('inspections.title')}
        subtitle={t('inspections.subtitle')}
        actions={
          canManage ? (
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>
              {t('inspections.add')}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-ui">
        <div className="max-w-branch min-w-[14rem] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('inspections.searchPlaceholder')} />
        </div>
        <Combobox
          value={filters.status || ''}
          onChange={(v) => setFilter('status', v)}
          options={INSPECTION_STATUSES.map((x) => ({ value: x, label: t(`inspections.status_${x}` as never) }))}
          placeholder={t('inspections.allStatuses')}
          className="w-full sm:w-48"
        />
        <Combobox
          value={filters.object || ''}
          onChange={(v) => setFilter('object', v)}
          options={INSPECTION_OBJECTS.map((x) => ({ value: x, label: t(`inspections.object_${x}` as never) }))}
          placeholder={t('inspections.allObjects')}
          className="w-full sm:w-48"
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<ClipboardCheck size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('inspections.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('inspections.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        </Card>
      ) : (
        <Card className={fetching ? 'overflow-hidden p-0 opacity-70' : 'overflow-hidden p-0'}>
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60" onClick={() => setOpenId(r.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{r.title}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {/* `object_label` is only the TYPE word («Xodim») — the row used to print it
                        twice and never said WHICH employee / department / process is audited. */}
                    {[t(`inspections.object_${r.object_type}` as never), objectName(r), r.branch_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {!!r.findings_total && (
                  <Badge tone={r.findings_open ? 'danger' : 'success'}>
                    {t('inspections.findingsCount', { open: r.findings_open ?? 0, total: r.findings_total })}
                  </Badge>
                )}
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`inspections.status_${r.status}` as never)}</Badge>
                {r.can_manage && (
                  <IconButton
                    size="sm"
                    label={t('common.delete')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setRemoving(r)
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} />
        </Card>
      )}

      <CreateModal open={creating} onClose={() => setCreating(false)} onDone={() => { toast.ok(t('inspections.created')); setCreating(false) }} onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))} />
      <DetailModal id={openId} onClose={() => setOpenId(null)} />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('inspections.removeTitle')}
        description={t('inspections.removeConfirm', { name: removing?.title ?? '' })}
        loading={mut.remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('common.deleted'))
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

function CreateModal({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useInspectionMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const departments = useDepartmentOptions(branchId)
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [objectType, setObjectType] = useState<string>('department')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [memberNames, setMemberNames] = useState<Record<number, string>>({})
  const [memberQuery, setMemberQuery] = useState('')
  const { employees: memberCandidates } = useEmployeeSearch(null, open && memberQuery.trim().length > 0, memberQuery)
  const [departmentId, setDepartmentId] = useState('')
  const [processName, setProcessName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setPurpose('')
    setObjectType('department')
    setEmployee(null)
    setDepartmentId('')
    setProcessName('')
    setMemberIds([])
    setMemberNames({})
    setMemberQuery('')
    setPeriodStart('')
    setPeriodEnd('')
    setError('')
  }, [open])

  const submit = async () => {
    if (!title.trim()) return setError(t('inspections.titleRequired'))
    // What is being inspected depends on the object type — sending all three
    // would leave the record claiming to inspect a person AND a department.
    if (objectType === 'employee' && !employee) return setError(t('inspections.objectRequired'))
    if (objectType === 'department' && !departmentId) return setError(t('inspections.objectRequired'))
    if (objectType === 'process' && !processName.trim()) return setError(t('inspections.objectRequired'))
    if (isInvalidRange(periodStart, periodEnd)) return setError(t('list.invalidRange'))
    try {
      await mut.create.mutateAsync({
        title: title.trim(),
        purpose: purpose.trim() || null,
        object_type: objectType,
        employee_id: objectType === 'employee' ? employee!.id : null,
        department_id: objectType === 'department' ? Number(departmentId) : null,
        process_name: objectType === 'process' ? processName.trim() : null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        organization_branch_id: branchId || null,
        // Auditorlar — `InspectionCreate.member_ids`. v2 buni na so'rardi, na
        // yuborardi, ya'ni tekshiruvni KIM o'tkazayotgani yozilmasdi.
        member_ids: memberIds.length ? memberIds : null,
      })
      onDone()
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inspections.add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.create.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('inspections.fieldTitle')} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('inspections.purpose')}>
          <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label={t('inspections.objectType')} required>
          <Combobox
            value={objectType}
            onChange={(v) => v && setObjectType(v)}
            options={INSPECTION_OBJECTS.map((x) => ({ value: x, label: t(`inspections.object_${x}` as never) }))}
            clearable={false}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        {objectType === 'employee' && (
          <Field label={t('inspections.object_employee')} required>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </Field>
        )}
        {objectType === 'department' && (
          <Field label={t('inspections.object_department')} required>
            <Combobox value={departmentId} onChange={setDepartmentId} options={departments} placeholder={t('t2.pick')} className="w-full" />
          </Field>
        )}
        {objectType === 'process' && (
          <Field label={t('inspections.object_process')} required>
            <Input value={processName} onChange={(e) => setProcessName(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('inspections.periodStart')}>
            <DateInput value={periodStart} onChange={setPeriodStart} aria-label={t('inspections.periodStart')} invalid={isInvalidRange(periodStart, periodEnd)} />
          </Field>
          <Field label={t('inspections.periodEnd')}>
            <DateInput value={periodEnd} onChange={setPeriodEnd} aria-label={t('inspections.periodEnd')} invalid={isInvalidRange(periodStart, periodEnd)} />
          </Field>
        </div>
        {/* Auditorlar — tekshiruvni KIM o'tkazayotgani. */}
        <Field label={t('inspections.members')}>
          <div className="flex flex-col gap-2">
            {memberIds.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {memberIds.map((mid) => (
                  <li key={mid} className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-[12.5px] text-fg">
                    {memberNames[mid] ?? `#${mid}`}
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => setMemberIds((prev) => prev.filter((x) => x !== mid))}
                      className="text-fg-subtle hover:text-danger"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder={t('common.search')} />
            {memberQuery.trim() && memberCandidates.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-lg border border-line">
                {memberCandidates
                  .filter((emp) => !memberIds.includes(emp.id))
                  .map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setMemberIds((prev) => [...prev, emp.id])
                        setMemberNames((prev) => ({ ...prev, [emp.id]: emp.legal_name ?? '' }))
                        setMemberQuery('')
                      }}
                    >
                      <Avatar src={emp.photo_path} name={emp.legal_name ?? '?'} size={24} />
                      <span className="truncate">{emp.legal_name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

function DetailModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const { inspection, loading } = useInspection(id)
  const mut = useInspectionMutations()
  const [findingText, setFindingText] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [findingRec, setFindingRec] = useState('')
  const [findingResponsible, setFindingResponsible] = useState<Employee | null>(null)
  const [findingDue, setFindingDue] = useState('')
  /** Bartaraf etish IZOHI — `FindingUpdate.resolution_note`. v2 topilmani
   *  izohsiz yopardi, ya'ni "nima qilindi" hech qayerda qolmasdi. */
  const [resolving, setResolving] = useState<{ id: number } | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal open={!!id} onClose={onClose} title={inspection?.title ?? t('inspections.title')} size="lg">
      {loading || !inspection ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[inspection.status] ?? 'neutral'}>{t(`inspections.status_${inspection.status}` as never)}</Badge>
            <Badge tone="neutral">{t(`inspections.object_${inspection.object_type}` as never)}</Badge>
            {objectName(inspection) && <span className="text-[12.5px] text-fg-muted">{objectName(inspection)}</span>}
            {(inspection.period_start || inspection.period_end) && (
              <span className="text-[12px] tabular-nums text-fg-subtle">
                {formatAppDate(inspection.period_start)} — {formatAppDate(inspection.period_end)}
              </span>
            )}
          </div>

          {inspection.purpose && <p className="text-[13px] text-fg-muted">{inspection.purpose}</p>}
          {(inspection.members ?? []).length > 0 && (
            <p className="text-[12.5px] text-fg-subtle">
              <span className="font-medium text-fg-muted">{t('inspections.members')}:</span>{' '}
              {(inspection.members ?? []).map((m) => m.employee_name).filter(Boolean).join(', ')}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {inspection.can_manage && inspection.status === 'planned' && (
              <Button size="sm" leftIcon={<Play size={14} />} loading={mut.start.isPending} onClick={async () => { if (await confirm({ kind: 'status', subject: inspection.title, confirmLabel: t('inspections.start') })) await run(() => mut.start.mutateAsync(inspection.id), t('inspections.started')) }}>
                {t('inspections.start')}
              </Button>
            )}
            {inspection.can_manage && (inspection.status === 'in_progress' || inspection.status === 'planned') && (
              <Button size="sm" onClick={() => setFinishing(true)}>{t('inspections.complete')}</Button>
            )}
            {inspection.can_manage && ['planned', 'in_progress'].includes(inspection.status) && (
              <Button
                size="sm"
                variant="danger-ghost"
                leftIcon={<X size={14} />}
                onClick={() => {
                  setCancelReason('')
                  setCancelling(true)
                }}
              >
                {t('inspections.cancel')}
              </Button>
            )}
          </div>

          {inspection.conclusion && (
            <div className="rounded-inner border border-line bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11.5px] font-semibold text-fg-subtle">{t('inspections.conclusion')}</p>
              <p className="mt-1 text-[13px] text-fg">{inspection.conclusion}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('inspections.findings')}</p>
            {(inspection.findings ?? []).length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">{t('inspections.noFindings')}</p>
            ) : (
              <ul className="divide-y divide-line/60 rounded-inner border border-line">
                {(inspection.findings ?? []).map((f) => (
                  <li key={f.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-fg">{f.description}</span>
                      {f.recommendation && <span className="block text-[11.5px] text-fg-subtle">{f.recommendation}</span>}
                      {(f.responsible_name || f.due_date) && (
                        <span className={cn('flex items-center gap-1 text-[11.5px]', f.is_overdue ? 'text-danger' : 'text-fg-subtle')}>
                          {/* The server flags an OPEN finding whose due date has passed. */}
                          {f.is_overdue && <AlertTriangle size={11} aria-label={t('inspections.overdue')} />}
                          {[f.responsible_name, f.due_date ? formatAppDate(f.due_date) : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {f.resolution_note && (
                        <span className="block text-[11.5px] text-success">{f.resolution_note}</span>
                      )}
                    </span>
                    <Badge tone={SEV_TONE[f.severity ?? 'medium'] ?? 'neutral'}>{t(`inspections.sev_${f.severity ?? 'medium'}` as never)}</Badge>
                    <Badge tone={f.status === 'resolved' ? 'success' : 'warning'}>
                      {f.status === 'resolved' ? t('inspections.resolved') : t('inspections.open')}
                    </Badge>
                    {f.status !== 'resolved' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResolving(f)}
                      >
                        {t('inspections.resolve')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* `add_finding` answers 409 «Tekshiruv yopilgan» on a completed audit
                as well as on a cancelled one; the form only makes sense while open. */}
            {inspection.can_add_finding && !['completed', 'cancelled'].includes(inspection.status) && (
              /* ⚠️ TAVSIYA, MAS'UL va MUDDAT — topilmani KUZATILADIGAN
                 vazifaga aylantiradigan uchlik. `FindingCreate` uchalasini
                 ham oladi, v2 esa faqat `{description, severity}` yuborardi;
                 ro'yxat esa `due_date` ustunini chizardi, ya'ni u doim bo'sh
                 edi. */
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Field label={t('inspections.newFinding')} wide>
                  <Input value={findingText} onChange={(e) => setFindingText(e.target.value)} placeholder={t('inspections.findingPlaceholder')} />
                </Field>
                <Field label={t('inspections.recommendation')} wide>
                  <Input value={findingRec} onChange={(e) => setFindingRec(e.target.value)} />
                </Field>
                <Field label={t('inspections.severity')}>
                  <Combobox
                    value={severity}
                    onChange={(v) => v && setSeverity(v)}
                    options={FINDING_SEVERITIES.map((x) => ({ value: x, label: t(`inspections.sev_${x}` as never) }))}
                    clearable={false}
                    placeholder={t('t2.pick')}
                    className="w-full"
                  />
                </Field>
                <Field label={t('inspections.dueDate')}>
                  <DateInput value={findingDue} onChange={setFindingDue} />
                </Field>
                <Field label={t('inspections.responsible')} wide>
                  <EmployeePicker value={findingResponsible} onChange={setFindingResponsible} />
                </Field>
                <div className="sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={!findingText.trim()}
                    loading={mut.addFinding.isPending}
                    onClick={async () => {
                      await run(
                        () =>
                          mut.addFinding.mutateAsync({
                            id: inspection.id,
                            body: {
                              description: findingText.trim(),
                              severity,
                              recommendation: findingRec.trim() || null,
                              responsible_id: findingResponsible?.id ?? null,
                              due_date: findingDue || null,
                            },
                          }),
                        t('inspections.findingAdded'),
                      )
                      setFindingText('')
                      setFindingRec('')
                      setFindingResponsible(null)
                      setFindingDue('')
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Topilmani yopish — izoh bilan. */}
          <Modal
            open={!!resolving}
            onClose={() => setResolving(null)}
            title={t('inspections.resolve')}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setResolving(null)}>{t('common.cancel')}</Button>
                <Button
                  loading={mut.updateFinding.isPending}
                  onClick={async () => {
                    const f = resolving
                    setResolving(null)
                    if (!f) return
                    await run(
                      () =>
                        mut.updateFinding.mutateAsync({
                          id: inspection.id,
                          findingId: f.id,
                          body: { status: 'resolved', resolution_note: resolutionNote.trim() || null },
                        }),
                      t('inspections.findingResolved'),
                    )
                    setResolutionNote('')
                  }}
                >
                  {t('inspections.resolve')}
                </Button>
              </>
            }
          >
            <Field label={t('inspections.resolutionNote')}>
              <Textarea rows={3} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
            </Field>
          </Modal>

          <Modal
            open={finishing}
            onClose={() => setFinishing(false)}
            title={t('inspections.complete')}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setFinishing(false)}>{t('common.cancel')}</Button>
                <Button
                  loading={mut.complete.isPending}
                  disabled={!conclusion.trim()}
                  onClick={async () => {
                    await run(() => mut.complete.mutateAsync({ id: inspection.id, conclusion: conclusion.trim() }), t('inspections.completed'))
                    setFinishing(false)
                  }}
                >
                  {t('inspections.complete')}
                </Button>
              </>
            }
          >
            {/* The conclusion is REQUIRED by the server — an audit that ends
                without one leaves nothing behind to act on. */}
            <Field label={t('inspections.conclusion')} required>
              <Textarea rows={4} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
            </Field>
          </Modal>

          {/* Cancelling needs a written reason: the server demands one, and a
              cancelled audit with no explanation is a hole in the record. */}
          <Modal
            open={cancelling}
            onClose={() => setCancelling(false)}
            title={t('inspections.cancel')}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setCancelling(false)}>{t('common.cancel')}</Button>
                <Button
                  variant="danger"
                  loading={mut.cancel.isPending}
                  disabled={!cancelReason.trim()}
                  onClick={async () => {
                    await run(
                      () => mut.cancel.mutateAsync({ id: inspection.id, reason: cancelReason.trim() }),
                      t('inspections.cancelled'),
                    )
                    setCancelling(false)
                  }}
                >
                  {t('inspections.cancel')}
                </Button>
              </>
            }
          >
            <Field label={t('inspections.cancelReason')} required>
              <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </Field>
          </Modal>
        </div>
      )}
    </Modal>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function InspectionsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={!roles.isEmployeeLike(user) || !!user?.employee?.id} title={t('inspections.title')}>
      <InspectionsPageInner />
    </RequireRole>
  )
}

