import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDashed, Clock, Download, GraduationCap, Paperclip, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { filterTile } from '@/components/ui/control'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { canWriteOrg } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useListParams } from '@/hooks/useListParams'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { CertificateFileField, TrainingCompleteModal } from '@/features/trainings/TrainingCompleteModal'
import {
  TRAINING_RESULTS,
  TRAINING_STATUSES,
  TRAINING_TYPES,
  trainingParams,
  useTraining,
  useTrainingMutations,
  useTrainingSummary,
  useTrainings,
  type Training,
} from '@/features/trainings/useTrainings'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { usePlanIndicators } from '@/features/workplan/useWorkPlan'
import { downloadFile } from '@/lib/download'
import { isInvalidRange } from '@/lib/dateRange'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'

const STATUS_TONE: Record<string, BadgeTone> = { planned: 'warning', completed: 'success', cancelled: 'neutral' }
const dmy = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—')

/**
 * Malaka oshirish — TZ K4 «Учёт обучения». HR keeps the courses, trainings
 * and seminars of an employee, the certificate and its expiry, and exports
 * the register to Excel. A plain employee sees only his own rows (the server
 * scopes the list); writing is HR's (`trainings` at organisation level).
 */
export function TrainingsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canWrite = canWriteOrg(user, 'trainings')
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams(['type', 'status', 'expiring'])
  const listFilters = { search, type: filters.type, status: filters.status, expiringOnly: filters.expiring === '1' }
  const { rows, total, pages, loading, fetching, error, refetch } = useTrainings({ ...listFilters, page, size })
  const summary = useTrainingSummary()
  const mut = useTrainingMutations()

  const [editing, setEditing] = useState<Training | 'new' | null>(null)
  const [viewing, setViewing] = useState<Training | null>(null)
  const [completing, setCompleting] = useState<Training | null>(null)
  const [removing, setRemoving] = useState<Training | null>(null)
  const [exporting, setExporting] = useState(false)

  // Deep link `?open={id}` — the certificate-expiry notice and global search point here.
  const [sp, setSp] = useSearchParams()
  const openId = Number(sp.get('open')) || null
  const { training: linked, error: linkedError } = useTraining(openId)
  const dropOpen = () =>
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      n.delete('open')
      return n
    }, { replace: true })
  useEffect(() => {
    if (!linked) return
    if (canWrite) setEditing(linked)
    else setViewing(linked)
    dropOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])
  useEffect(() => {
    if (!linkedError) return
    toast.error(errorMessage(linkedError, t('list.docNotFound')))
    dropOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedError])

  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: 'trainings/export-excel',
        method: 'post',
        params: trainingParams(listFilters, branchId),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'malaka-oshirish.xlsx',
      })
    } catch (e) {
      toast.error(errorMessage(e, t('trainings.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const typeLabel = (r: Training) =>
    (TRAINING_TYPES as readonly string[]).includes(r.training_type) ? t(`trainings.type_${r.training_type}` as never) : r.training_type_label || r.training_type

  const columns: Column<Training>[] = [
    { key: 'n', header: '№', className: 'w-12 text-fg-subtle tabular-nums', cell: (_r, i) => `${(page - 1) * size + i + 1}.` },
    {
      key: 'employee',
      header: t('trainings.employee'),
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{r.employee_name || '—'}</span>
          <span className="truncate text-[12px] text-fg-subtle">{r.department_name || '—'}</span>
        </span>
      ),
    },
    {
      key: 'program',
      header: t('trainings.program'),
      cell: (r) => (
        <span className="flex min-w-0 max-w-[22rem] flex-col">
          <span className="line-clamp-2 font-medium text-fg">{r.program_name}</span>
          <span className="truncate text-[12px] text-fg-subtle">{[r.provider || '—', typeLabel(r)].join(' · ')}</span>
          {r.kpi_indicator_id != null && (
            <span
              className={cn('mt-0.5 flex items-center gap-1 text-[12px]', r.kpi_entry_id ? 'text-brand' : 'text-fg-subtle')}
              title={r.kpi_entry_id ? t('kpiExt.trainingCounts') : t('kpiExt.trainingNotCounting')}
            >
              <Target size={11} className="shrink-0" />
              <span className="truncate">{r.kpi_indicator_name || `#${r.kpi_indicator_id}`}</span>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'period',
      header: t('trainings.period'),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums text-fg-muted">
            {dmy(r.start_date)} — {dmy(r.end_date)}
            {r.hours ? ` · ${t('trainings.hoursN', { count: r.hours })}` : ''}
          </span>
          {r.cost != null && r.cost !== '' && <span className="text-[12px] text-fg-subtle">{t('trainings.costSum', { sum: formatNumber(Number(r.cost)) })}</span>}
        </span>
      ),
    },
    {
      key: 'certificate',
      header: t('trainings.certificate'),
      cell: (r) =>
        !r.certificate_number && !r.certificate_expires_at && !r.file_url ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="flex min-w-0 flex-col">
            <span className="text-fg">{r.certificate_number || '—'}</span>
            {r.file_url && (
              <a href={r.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[14rem] items-center gap-1 text-[12px] text-brand hover:underline">
                <Paperclip size={11} className="shrink-0" />
                <span className="truncate">{r.file_original_name || t('trainings.fileCurrent')}</span>
              </a>
            )}
            {r.certificate_expires_at && (
              <span className={cn('flex items-center gap-1 text-[12px]', r.is_expired ? 'text-danger' : 'text-fg-subtle')}>
                {r.is_expired && <AlertTriangle size={11} />}
                {t('trainings.untilDate', { date: dmy(r.certificate_expires_at) })}
              </span>
            )}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('trainings.status'),
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`trainings.status_${r.status}` as never, { defaultValue: r.status })}</Badge>
          {r.result && <span className="text-[12px] text-fg-subtle">{t(`trainings.result_${r.result}` as never, { defaultValue: r.result })}</span>}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            cell: (r: Training) => (
              <div className="flex items-center justify-end gap-1">
                {r.status === 'planned' && (
                  <Button size="sm" variant="secondary" leftIcon={<CheckCircle2 size={14} />} onClick={(e) => { e.stopPropagation(); setCompleting(r) }}>
                    {t('trainings.complete')}
                  </Button>
                )}
                <IconButton size="sm" label={t('common.edit')} onClick={(e) => { e.stopPropagation(); setEditing(r) }}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="sm" label={t('common.delete')} onClick={(e) => { e.stopPropagation(); setRemoving(r) }}>
                  <Trash2 size={14} className="text-danger" />
                </IconButton>
              </div>
            ),
          } as Column<Training>,
        ]
      : []),
  ]

  const stats: { key: string; label: string; value: string | number; icon: typeof Clock; tone: string; filter?: () => void; on?: boolean }[] = [
    { key: 'total', label: t('trainings.statTotal'), value: summary?.total ?? 0, icon: GraduationCap, tone: 'bg-brand-soft text-brand-strong' },
    { key: 'completed', label: t('trainings.status_completed'), value: summary?.completed ?? 0, icon: CheckCircle2, tone: 'bg-success-soft text-success' },
    { key: 'planned', label: t('trainings.status_planned'), value: summary?.planned ?? 0, icon: CircleDashed, tone: 'bg-warning-soft text-warning' },
    { key: 'hours', label: t('trainings.statHours'), value: formatNumber(summary?.total_hours ?? 0), icon: Clock, tone: 'bg-brand-soft text-brand-strong' },
    {
      key: 'expiring',
      label: t('trainings.statExpiring'),
      value: summary?.expiring_soon ?? 0,
      icon: CalendarClock,
      tone: summary?.expiring_soon ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-strong',
      filter: () => setFilter('expiring', filters.expiring === '1' ? '' : '1'),
      on: filters.expiring === '1',
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('trainings.title')}
        subtitle={t('trainings.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" leftIcon={<Download size={15} />} loading={exporting} onClick={exportExcel}>
              {t('trainings.export')}
            </Button>
            {canWrite && (
              <Button leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
                {t('trainings.add')}
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px]', s.tone)}>
                <s.icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-fg-muted">{s.label}</span>
                <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{s.value}</span>
              </span>
            </>
          )
          return s.filter ? (
            <button key={s.key} type="button" aria-pressed={s.on} onClick={s.filter} className={filterTile(!!s.on)}>{body}</button>
          ) : (
            <div key={s.key} className={filterTile(false)}>{body}</div>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] max-w-md flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={t('trainings.searchPlaceholder')} />
        </div>
        <Combobox
          value={filters.type}
          onChange={(v) => setFilter('type', v)}
          options={TRAINING_TYPES.map((x) => ({ value: x, label: t(`trainings.type_${x}`) }))}
          placeholder={t('trainings.allTypes')}
          className="w-full sm:w-52"
        />
        <Combobox
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          options={TRAINING_STATUSES.map((x) => ({ value: x, label: t(`trainings.status_${x}`) }))}
          placeholder={t('trainings.allStatuses')}
          className="w-full sm:w-48"
        />
        <Checkbox
          label={t('trainings.expiringOnly')}
          checked={filters.expiring === '1'}
          onChange={(e) => setFilter('expiring', e.target.checked ? '1' : '')}
        />
        <FilterReset count={activeFilterCount} onReset={reset} />
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          tableId="trainings"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={activeFilterCount ? t('list.noResultsFiltered') : t('trainings.empty')}
          emptyDescription={activeFilterCount ? t('list.noResultsFilteredHint') : canWrite ? t('trainings.emptyHint') : undefined}
          onRowClick={(r) => (canWrite ? setEditing(r) : setViewing(r))}
        />
        <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <TrainingModal value={editing ?? viewing} readOnly={!editing} onClose={() => { setEditing(null); setViewing(null) }} />
      <TrainingCompleteModal row={completing} onClose={() => setCompleting(null)} />

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

const EMPTY_FORM = {
  training_type: 'qualification',
  program_name: '',
  provider: '',
  start_date: '',
  end_date: '',
  hours: '',
  status: 'completed',
  result: '',
  cost: '',
  certificate_number: '',
  certificate_expires_at: '',
  note: '',
  kpi_indicator_id: '',
}
type Form = typeof EMPTY_FORM

function TrainingModal({ value, readOnly, onClose }: { value: Training | 'new' | null; readOnly: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useTrainingMutations()
  const open = !!value
  const row = value && value !== 'new' ? value : null

  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [employee, setEmployee] = useState<Employee | null>(null)
  /** Group registration — `trainings/bulk` (TZ «Массовая регистрация»). */
  const [group, setGroup] = useState(false)
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setGroup(false)
    setPeople([])
    setFile(null)
    setEmployee(null)
    setForm(
      row
        ? {
            training_type: row.training_type,
            program_name: row.program_name ?? '',
            provider: row.provider ?? '',
            start_date: row.start_date ?? '',
            end_date: row.end_date ?? '',
            hours: row.hours != null ? String(row.hours) : '',
            status: row.status,
            result: row.result ?? '',
            cost: row.cost != null ? String(row.cost) : '',
            certificate_number: row.certificate_number ?? '',
            certificate_expires_at: row.certificate_expires_at ?? '',
            note: row.note ?? '',
            kpi_indicator_id: row.kpi_indicator_id ? String(row.kpi_indicator_id) : '',
          }
        : EMPTY_FORM,
    )
  }, [open, row])

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const completed = form.status === 'completed'
  // K4 · 1442 «Привязка к KPI» — only where the KPI module is on.
  const kpiOn = !!useAuthStore((s) => s.user?.kpi_enabled)
  const indicators = usePlanIndicators(open && kpiOn)
  const indicatorOptions = [
    ...indicators
      .filter((i) => !(i as { is_justification?: boolean }).is_justification && (i.is_active !== false || String(i.id) === form.kpi_indicator_id))
      .map((i) => ({ value: String(i.id), label: i.name, subLabel: i.measure ?? undefined })),
    ...(row?.kpi_indicator_id && !indicators.some((i) => i.id === row.kpi_indicator_id)
      ? [{ value: String(row.kpi_indicator_id), label: row.kpi_indicator_name || `#${row.kpi_indicator_id}` }]
      : []),
  ]

  const uploadAfter = async (id: number) => {
    if (!file) return
    try {
      await mut.upload.mutateAsync({ id, file })
    } catch (e) {
      toast.error(`${t('trainings.fileFailed')}: ${errorMessage(e, t('common.actionFailed'))}`)
    }
  }

  const submit = async () => {
    setError('')
    if (!row && !group && !employee) return setError(t('trainings.employeeRequired'))
    if (!row && group && people.length === 0) return setError(t('trainings.employeesRequired'))
    if (!form.program_name.trim()) return setError(t('trainings.programRequired'))
    // TZ K4: a «completed» training needs its end date and result (the server checks too).
    if (completed && (!form.end_date || !form.result)) return setError(t('trainings.completedNeeds'))
    if (isInvalidRange(form.start_date, form.end_date)) return setError(t('list.invalidRange'))
    const body = {
      training_type: form.training_type,
      program_name: form.program_name.trim(),
      provider: form.provider.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      hours: form.hours === '' ? null : Number(form.hours),
      status: form.status,
      result: form.result || null,
      cost: form.cost === '' ? null : Number(form.cost),
      certificate_number: form.certificate_number.trim() || null,
      certificate_expires_at: form.certificate_expires_at || null,
      note: form.note.trim() || null,
      ...(kpiOn || row?.kpi_indicator_id ? { kpi_indicator_id: form.kpi_indicator_id ? Number(form.kpi_indicator_id) : null } : {}),
    }
    try {
      if (row) {
        await mut.update.mutateAsync({ id: row.id, body })
        await uploadAfter(row.id)
        toast.ok(t('trainings.updated'))
      } else if (group) {
        const res = await mut.bulk.mutateAsync({ ...body, employee_ids: people.map((p) => p.id) })
        const ok = res?.created?.length ?? 0
        const failed = res?.failed?.length ?? 0
        toast.ok(failed ? t('trainings.createdGroupPartial', { count: ok, failed }) : t('trainings.createdGroup', { count: ok }))
      } else {
        const created = await mut.create.mutateAsync({ ...body, employee_id: employee!.id })
        if (created?.id) await uploadAfter(created.id)
        toast.ok(t('trainings.created'))
      }
      onClose()
    } catch (e) {
      setError(errorCode(e) === 'training_kpi_indicator_invalid' ? t('kpiExt.trainingIndicatorInvalid') : errorMessage(e, t('common.actionFailed')))
    }
  }

  const saving = mut.create.isPending || mut.update.isPending || mut.bulk.isPending || mut.upload.isPending
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={readOnly ? t('trainings.viewTitle') : row ? t('trainings.editTitle') : group ? t('trainings.groupTitle') : t('trainings.add')}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2">
          <FormError className="text-xs">{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
            {!readOnly && <Button onClick={submit} loading={saving}>{t('common.save')}</Button>}
          </div>
        </div>
      }
    >
      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {row ? (
          <Field label={t('trainings.employee')} wide>
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg">
              {row.employee_name || '—'}
              {row.department_name && <span className="text-fg-subtle"> · {row.department_name}</span>}
            </p>
          </Field>
        ) : (
          <Field label={group ? t('trainings.employees') : t('trainings.employee')} required wide>
            <div className="flex flex-col gap-2">
              <Segmented
                size="sm"
                value={group ? 'group' : 'one'}
                onChange={(v) => setGroup(v === 'group')}
                options={[
                  { value: 'one', label: t('trainings.modeOne') },
                  { value: 'group', label: t('trainings.modeGroup') },
                ]}
              />
              {group ? (
                <EmployeeMultiPicker value={people} onChange={setPeople} placeholder={t('trainings.employeesPlaceholder')} />
              ) : (
                <EmployeePicker value={employee} onChange={setEmployee} />
              )}
            </div>
          </Field>
        )}
        <Field label={t('trainings.type')} required>
          <Combobox
            value={form.training_type}
            onChange={(v) => v && set('training_type', v)}
            options={[
              ...TRAINING_TYPES.map((x) => ({ value: x, label: t(`trainings.type_${x}`) })),
              ...(row && !(TRAINING_TYPES as readonly string[]).includes(row.training_type)
                ? [{ value: row.training_type, label: row.training_type_label || row.training_type }]
                : []),
            ]}
            clearable={false}
          />
        </Field>
        <Field label={t('trainings.status')} required>
          <Combobox
            value={form.status}
            onChange={(v) => v && set('status', v)}
            options={TRAINING_STATUSES.map((x) => ({ value: x, label: t(`trainings.status_${x}`) }))}
            clearable={false}
          />
        </Field>
        <Field label={t('trainings.program')} required wide>
          <Input value={form.program_name} onChange={(e) => set('program_name', e.target.value)} />
        </Field>
        <Field label={t('trainings.provider')} wide>
          <Input value={form.provider} onChange={(e) => set('provider', e.target.value)} />
        </Field>
        <Field label={t('trainings.startDate')}>
          <DateInput value={form.start_date} onChange={(v) => set('start_date', v)} invalid={isInvalidRange(form.start_date, form.end_date)} />
        </Field>
        <Field label={t('trainings.endDate')} required={completed}>
          <DateInput value={form.end_date} onChange={(v) => set('end_date', v)} min={form.start_date || undefined} invalid={isInvalidRange(form.start_date, form.end_date)} />
        </Field>
        <Field label={t('trainings.hours')}>
          <Input type="number" min={0} value={form.hours} onChange={(e) => set('hours', e.target.value)} />
        </Field>
        <Field label={t('trainings.result')} required={completed}>
          <Combobox
            value={form.result}
            onChange={(v) => set('result', v)}
            options={TRAINING_RESULTS.map((x) => ({ value: x, label: t(`trainings.result_${x}`) }))}
            placeholder="—"
          />
        </Field>
        <Field label={t('trainings.cost')}>
          <Input type="number" min={0} value={form.cost} onChange={(e) => set('cost', e.target.value)} />
        </Field>
        <Field label={t('trainings.certificateNumber')}>
          <Input value={form.certificate_number} onChange={(e) => set('certificate_number', e.target.value)} />
        </Field>
        <Field label={t('trainings.expiresAt')} hint={t('trainings.expiresHint')}>
          <DateInput value={form.certificate_expires_at} onChange={(v) => set('certificate_expires_at', v)} />
        </Field>
        {/* In group mode each person's scan is their own — attached per row later. */}
        {!group && (
          <Field label={t('trainings.fileField')} wide>
            <CertificateFileField file={file} onChange={setFile} current={row} disabled={readOnly} />
          </Field>
        )}
        {(kpiOn || !!row?.kpi_indicator_id) && (
          <Field label={t('kpiExt.trainingIndicator')} hint={t('kpiExt.trainingIndicatorHint')} wide>
            <Combobox
              value={form.kpi_indicator_id}
              onChange={(v) => set('kpi_indicator_id', v)}
              options={indicatorOptions}
              placeholder={t('workPlan.kpiIndicatorNone')}
            />
          </Field>
        )}
        <Field label={t('trainings.note')} wide>
          <Textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </fieldset>
    </Modal>
  )
}
