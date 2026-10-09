import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Award, CalendarClock, Clock, Download, GraduationCap, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import * as roles from '@/auth/roles'
import { useBranchStore } from '@/store/branchStore'
import { canManageEmployees } from '@/auth/canManage'
import { useAuthStore } from '@/store/authStore'
import { Pagination } from '@/components/data/Pagination'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile } from '@/lib/download'
import { formatAppDate, formatNumber } from '@/lib/format'
import type { Employee } from '@/types'
import {
  TRAINING_RESULTS,
  TRAINING_STATUSES,
  TRAINING_TYPES,
  useTrainingMutations,
  useTrainingSummary,
  useTrainings,
  type Training,
} from '@/features/trainings/useTrainings'
import { isInvalidRange } from '@/lib/dateRange'

const STATUS_TONE: Record<string, BadgeTone> = { planned: 'info', completed: 'success', cancelled: 'neutral' }

function TrainingsPageInner() {
  const exportBranchId = useBranchStore((st) => st.selectedBranchId)
  /*
   * WRITE IS NARROWER THAN READ. The page opens for everyone who is not
   * employee-like, but `POST/PATCH/DELETE /trainings` runs
   * `TrainingService._require_write` → `employee_mgmt_scope`, which is HR,
   * ministr and the master admin only. Measured live across nine roles:
   * chancellery, kuzatuvchi, monitoring, deputy and AKT all took a 403
   * `forbidden` from a button v2 drew for them.
   */
  const currentUser = useAuthStore((s) => s.user)
  const canWrite = canManageEmployees(currentUser) || roles.isMinister(currentUser)
  const { t } = useTranslation()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams(['type', 'status', 'expiring'])
  const { rows, total, pages, loading, fetching } = useTrainings({
    page,
    size,
    search: search,
    type: filters.type,
    status: filters.status,
    expiringOnly: filters.expiring === '1',
  })
  const { summary } = useTrainingSummary()
  const mut = useTrainingMutations()
  const [editing, setEditing] = useState<Training | 'new' | null>(null)
  const [removing, setRemoving] = useState<Training | null>(null)

  return (
    <PageContainer>
      <PageHeader
        title={t('trainings.title')}
        subtitle={t('trainings.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* The export takes the SCREEN's filters, so what is downloaded is
                what is being looked at — the same contract the leave export
                already follows. */}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={15} />}
              loading={exporting}
              onClick={async () => {
                setExporting(true)
                try {
                  await downloadFile({
                    url: 'trainings/export-excel',
                    method: 'post',
                    params: {
                      // ⚠️ The branch too. `useTrainings` adds it to the LIST
                      // internally, so the file silently covered every branch
                      // while the table showed one — the same drift the
                      // attendance export had.
                      organization_branch_id: exportBranchId || undefined,
                      training_type: filters.type || undefined,
                      status: filters.status || undefined,
                      expiring_only: filters.expiring === '1' ? true : undefined,
                      search: search || undefined,
                    },
                    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    filename: `${t('trainings.title')}.xlsx`,
                  })
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                } finally {
                  setExporting(false)
                }
              }}
            >
              Excel
            </Button>
            {canWrite && (
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
                {t('trainings.add')}
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={GraduationCap} label={t('trainings.statTotal')} value={summary?.total ?? 0} tone="brand" />
        <Stat icon={Clock} label={t('trainings.statHours')} value={summary?.total_hours ?? 0} tone="brand" />
        <Stat icon={Wallet} label={t('trainings.statCost')} value={formatNumber(Number(summary?.total_cost ?? 0))} tone="brand" />
        <button type="button" className="text-left" aria-pressed={filters.expiring === '1'} onClick={() => setFilter('expiring', filters.expiring === '1' ? '' : '1')}>
          <Stat
            icon={CalendarClock}
            label={t('trainings.statExpiring')}
            value={summary?.expiring_soon ?? 0}
            tone={summary?.expiring_soon ? 'warning' : 'brand'}
          />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-ui">
        <div className="max-w-branch min-w-[14rem] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('trainings.searchPlaceholder')} />
        </div>
        <Combobox
          value={filters.type || ''}
          onChange={(v) => setFilter('type', v)}
          options={TRAINING_TYPES.map((x) => ({ value: x, label: t(`trainings.type_${x}` as never) }))}
          placeholder={t('trainings.allTypes')}
          className="w-full sm:w-52"
        />
        <Combobox
          value={filters.status || ''}
          onChange={(v) => setFilter('status', v)}
          options={TRAINING_STATUSES.map((x) => ({ value: x, label: t(`trainings.status_${x}` as never) }))}
          placeholder={t('trainings.allStatuses')}
          className="w-full sm:w-44"
        />
        <Button
          size="sm"
          variant={filters.expiring === '1' ? 'primary' : 'secondary'}
          onClick={() => setFilter('expiring', filters.expiring === '1' ? '' : '1')}
        >
          {t('trainings.expiringOnly')}
        </Button>
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<GraduationCap size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('trainings.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('trainings.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        </Card>
      ) : (
        <Card className={fetching ? 'overflow-hidden p-0 opacity-70' : 'overflow-hidden p-0'}>
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <Avatar src={r.employee_photo_thumb_path} fallbackSrc={r.employee_photo_path} name={r.employee_name ?? '?'} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-fg">{r.program_name}</span>
                  <span className="block truncate text-[12px] text-fg-muted">
                    {[r.employee_name, r.provider].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] tabular-nums text-fg-subtle">
                    {(r.start_date || r.end_date) && <span>{[r.start_date, r.end_date].filter(Boolean).map((d) => formatAppDate(d!)).join(' — ')}</span>}
                    {r.hours ? <span>{t('trainings.hoursN', { count: r.hours })}</span> : null}
                    {r.certificate_number && <span>№ {r.certificate_number}</span>}
                  </span>
                </span>
                <Badge tone="neutral">{r.training_type_label || t(`trainings.type_${r.training_type}` as never)}</Badge>
                {/* The date that drives this register — how far off, coloured. */}
                {r.certificate_expires_at && (() => {
                  const left = dayjs(r.certificate_expires_at).startOf('day').diff(dayjs().startOf('day'), 'day')
                  return (
                    <span
                      title={`${t('trainings.until')} ${formatAppDate(r.certificate_expires_at)}`}
                      className={cn('shrink-0 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold tabular-nums', left < 0 ? 'bg-danger-soft text-danger' : left <= 30 ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-fg-muted')}
                    >
                      {left < 0 ? t('trainings.expiredAgo', { count: -left }) : t('trainings.expiresIn', { count: left })}
                    </span>
                  )
                })()}
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`trainings.status_${r.status}` as never)}</Badge>
                {canWrite && (
                  <>
                    <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(r)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} />
        </Card>
      )}

      <TrainingModal
        value={editing}
        onClose={() => setEditing(null)}
        onDone={(m) => {
          toast.ok(m)
          setEditing(null)
        }}
        onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
      />

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('trainings.removeTitle')}
        description={t('trainings.removeConfirm', { name: removing?.program_name ?? '' })}
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

function TrainingModal({
  value,
  onClose,
  onDone,
  onError,
}: {
  value: Training | 'new' | null
  onClose: () => void
  onDone: (msg: string) => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useTrainingMutations()
  const open = !!value
  const row = value && value !== 'new' ? value : null

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  /**
   * GURUH BO'LIB RO'YXATGA OLISH — `trainings/bulk`. Hook v2 da yozilgan edi
   * (`useTrainings.ts` `bulk`), lekin uni hech kim chaqirmasdi: bitta kursga
   * borgan butun bo'limni birma-bir kiritish kerak edi.
   */
  const [groupMode, setGroupMode] = useState(false)
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [groupNames, setGroupNames] = useState<Record<number, string>>({})
  const [empQuery, setEmpQuery] = useState('')
  const { employees: empCandidates } = useEmployeeSearch(null, groupMode && empQuery.trim().length > 0, empQuery)

  useEffect(() => {
    if (!open) return
    setError('')
    setEmployee(row ? ({ id: row.employee_id, legal_name: row.employee_name } as Employee) : null)
    setGroupMode(false)
    setGroupIds([])
    setGroupNames({})
    setEmpQuery('')
    setForm({
      training_type: row?.training_type ?? 'course',
      program_name: row?.program_name ?? '',
      provider: row?.provider ?? '',
      start_date: row?.start_date ?? '',
      end_date: row?.end_date ?? '',
      hours: row?.hours != null ? String(row.hours) : '',
      status: row?.status ?? 'planned',
      result: row?.result ?? '',
      cost: row?.cost != null ? String(row.cost) : '',
      certificate_number: row?.certificate_number ?? '',
      certificate_expires_at: row?.certificate_expires_at ?? '',
      note: row?.note ?? '',
    })
  }, [open, row])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!row && !groupMode && !employee) return setError(t('trainings.employeeRequired'))
    if (!row && groupMode && groupIds.length === 0) return setError(t('trainings.employeeRequired'))
    if (!form.program_name?.trim()) return setError(t('trainings.programRequired'))
    if (isInvalidRange(form.start_date, form.end_date)) return setError(t('list.invalidRange'))
    const body: Record<string, unknown> = {
      training_type: form.training_type,
      program_name: form.program_name.trim(),
      provider: form.provider?.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      hours: form.hours ? Number(form.hours) : null,
      status: form.status,
      result: form.result || null,
      cost: form.cost ? Number(form.cost) : null,
      certificate_number: form.certificate_number?.trim() || null,
      certificate_expires_at: form.certificate_expires_at || null,
      note: form.note?.trim() || null,
    }
    try {
      if (row) {
        await mut.update.mutateAsync({ id: row.id, body })
        onDone(t('trainings.updated'))
      } else if (groupMode) {
        await mut.bulk.mutateAsync({ ...body, employee_ids: groupIds })
        onDone(t('trainings.createdGroup', { count: groupIds.length }))
      } else {
        await mut.create.mutateAsync({ ...body, employee_id: employee!.id })
        onDone(t('trainings.created'))
      }
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('trainings.editTitle') : t('trainings.add')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.create.isPending || mut.update.isPending || mut.bulk.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!row && (
          <Field label={t('trainings.employee')} required wide>
            <div className="flex flex-col gap-2">
              <Segmented
                size="sm"
                value={groupMode ? 'group' : 'one'}
                onChange={(v) => setGroupMode(v === 'group')}
                options={[
                  { value: 'one', label: t('trainings.modeOne') },
                  { value: 'group', label: t('trainings.modeGroup') },
                ]}
              />
              {groupMode ? (
                <div className="flex flex-col gap-2">
                  {groupIds.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {groupIds.map((id) => (
                        <li key={id} className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 py-1 text-[12.5px] text-fg">
                          {groupNames[id] ?? `#${id}`}
                          <button
                            type="button"
                            aria-label={t('common.delete')}
                            onClick={() => setGroupIds((prev) => prev.filter((x) => x !== id))}
                            className="text-fg-subtle hover:text-danger"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Input
                    value={empQuery}
                    onChange={(e) => setEmpQuery(e.target.value)}
                    placeholder={t('common.search')}
                  />
                  {empQuery.trim() && empCandidates.length > 0 && (
                    <div className="max-h-40 overflow-auto rounded-lg border border-line">
                      {empCandidates
                        .filter((emp) => !groupIds.includes(emp.id))
                        .map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                            onClick={() => {
                              setGroupIds((prev) => [...prev, emp.id])
                              setGroupNames((prev) => ({ ...prev, [emp.id]: emp.legal_name ?? '' }))
                              setEmpQuery('')
                            }}
                          >
                            <Avatar src={emp.photo_path} name={emp.legal_name ?? '?'} size={24} />
                            <span className="truncate">{emp.legal_name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmployeePicker value={employee} onChange={setEmployee} />
              )}
            </div>
          </Field>
        )}
        <Field label={t('trainings.type')} required>
          <Combobox
            value={form.training_type ?? 'course'}
            onChange={(v) => v && set('training_type', v)}
            options={TRAINING_TYPES.map((x) => ({ value: x, label: t(`trainings.type_${x}` as never) }))}
            clearable={false}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('trainings.status')} required>
          <Combobox
            value={form.status ?? 'planned'}
            onChange={(v) => v && set('status', v)}
            options={TRAINING_STATUSES.map((x) => ({ value: x, label: t(`trainings.status_${x}` as never) }))}
            clearable={false}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('trainings.program')} required wide>
          <Input value={form.program_name ?? ''} onChange={(e) => set('program_name', e.target.value)} />
        </Field>
        <Field label={t('trainings.provider')} wide>
          <Input value={form.provider ?? ''} onChange={(e) => set('provider', e.target.value)} />
        </Field>
        <Field label={t('trainings.startDate')}>
          <DateInput value={form.start_date ?? ''} onChange={(v) => set('start_date', v)} aria-label={t('trainings.startDate')} invalid={isInvalidRange(form.start_date, form.end_date)} />
        </Field>
        <Field label={t('trainings.endDate')}>
          <DateInput value={form.end_date ?? ''} onChange={(v) => set('end_date', v)} min={form.start_date || undefined} aria-label={t('trainings.endDate')} invalid={isInvalidRange(form.start_date, form.end_date)} />
        </Field>
        <Field label={t('trainings.hours')}>
          <Input type="number" value={form.hours ?? ''} onChange={(e) => set('hours', e.target.value)} />
        </Field>
        <Field label={t('trainings.cost')}>
          <Input type="number" value={form.cost ?? ''} onChange={(e) => set('cost', e.target.value)} />
        </Field>
        <Field label={t('trainings.result')}>
          <Combobox
            value={form.result ?? ''}
            onChange={(v) => set('result', v)}
            options={TRAINING_RESULTS.map((x) => ({ value: x, label: t(`trainings.result_${x}` as never) }))}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('trainings.certificateNumber')}>
          <Input value={form.certificate_number ?? ''} onChange={(e) => set('certificate_number', e.target.value)} />
        </Field>
        {/* The date the whole screen exists for: an expired certificate is the
            thing somebody has to catch before it lapses. */}
        <Field label={t('trainings.expiresAt')} hint={t('trainings.expiresHint')} wide>
          <DateInput
            value={form.certificate_expires_at ?? ''}
            onChange={(v) => set('certificate_expires_at', v)}
            aria-label={t('trainings.expiresAt')}
          />
        </Field>
        <Field label={t('trainings.note')} wide>
          <Textarea rows={2} value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Award
  label: string
  value: string | number
  tone: 'brand' | 'warning'
}) {
  return (
    <Card className="flex items-center gap-3 p-card">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand-strong'}`}>
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
 * No role guard here any more. The menu offers «Malaka oshirish» to every
 * role (navConfig: v1 did, the server scopes the list to the caller's own
 * rows via `_narrow_to_own`), but this wrapper still refused employee-like
 * users, so the menu entry led to «Ruxsat yo‘q» for employee, accounting,
 * akt and dashboard accounts (measured 2026-09-17). Writes stay behind
 * `canWrite` inside the page.
 */
export function TrainingsPage() {
  return <TrainingsPageInner />
}

