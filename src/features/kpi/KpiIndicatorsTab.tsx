import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Pencil, Plus, Sparkles, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { BulkBar } from '@/components/data/BulkBar'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { useConfirm } from '@/components/data/useConfirm'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { MultiPicker } from '@/features/reports/MultiPicker'
import { useServerText } from '@/features/statistics/serverText'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useRowSelection } from '@/hooks/useRowSelection'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import {
  normalizeAssignees,
  useGroupNames,
  useIndicators,
  useKpiMutations,
  type IndicatorInput,
  type KpiAssignees,
  type KpiIndicator,
  type PeriodType,
} from './api'
import { IntervalManager, PERIOD_KEY, PERIOD_TYPES } from './KpiIntervals'
import { useKpiAccess } from './useKpiAccess'

const UNITS = ['%', 'son', "so'm", 'soat', 'kun'] as const
const unitOf = (i?: KpiIndicator | null) => i?.unit || i?.measure || '%'
const byOrder = (a: KpiIndicator, b: KpiIndicator) => (a.order_no ?? 100) - (b.order_no ?? 100) || a.id - b.id

/** «3 xodim · 2 bo'lim · 1 toifa» — the assignment of an indicator in one cell. */
function AssigneesSummary({ value, departments }: { value: KpiIndicator['assignees']; departments: { value: string; label: string }[] }) {
  const { t } = useTranslation()
  const a = normalizeAssignees(value)
  const parts = [
    a.employee_ids.length ? t('kpi.nEmployees', { count: a.employee_ids.length }) : '',
    a.department_ids.length ? t('kpi.nDepartments', { count: a.department_ids.length }) : '',
    a.position_categories.length ? t('kpi.nCategories', { count: a.position_categories.length }) : '',
  ].filter(Boolean)
  if (!parts.length) return <span className="text-fg-subtle">—</span>
  const names = [
    ...(value?.employees ?? []).map((e) => e.legal_name).filter(Boolean),
    ...a.department_ids.map((id) => departments.find((d) => d.value === String(id))?.label).filter(Boolean),
  ]
  return (
    <span className="whitespace-nowrap" title={names.join('\n')}>
      {parts.join(' · ')}
    </span>
  )
}

/**
 * «KPI sozlamalari» (K1): the indicator catalogue — branch-wide ones and the
 * department-specific ones — with create / copy / edit / delete, group,
 * direction and state filters, bulk delete; below it the evaluation periods.
 */
export function KpiIndicatorsTab() {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const bulk = useBulkAction(3)
  const { filters, setFilter, reset } = useListParams(['igrp', 'idir', 'iact', 'idept'])
  const { indicators, loading, error, refetch } = useIndicators()
  const departments = useDepartmentOptions()
  const groups = useGroupNames(indicators)
  const [editing, setEditing] = useState<{ row: KpiIndicator | null; copy?: boolean; scope?: 'department' | 'branch'; dept?: string } | null>(null)

  const canAdd = acc.may('indicator_type_list', 'add')
  const canEdit = acc.may('indicator_type_list', 'edit')
  const canDelete = acc.may('indicator_type_list', 'delete')

  // The catalogue shows indicators; central justifications have their own tab.
  const pass = (i: KpiIndicator) =>
    !i.is_justification &&
    (!filters.igrp || i.group_name === filters.igrp) &&
    (!filters.idir || (i.direction ?? 'M') === filters.idir) &&
    (!filters.iact || String(!!i.is_active) === filters.iact)
  const general = useMemo(() => indicators.filter((i) => i.scope !== 'department' && pass(i)).sort(byOrder), [indicators, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDept = useMemo(
    () => indicators.filter((i) => i.scope === 'department' && (!filters.idept || String(i.department_id) === filters.idept) && pass(i)).sort(byOrder),
    [indicators, filters], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const selGeneral = useRowSelection(general)
  const selDept = useRowSelection(byDept)
  const selected = [...selGeneral.selectedIds, ...selDept.selectedIds]
  const filterCount = [filters.igrp, filters.idir, filters.iact].filter(Boolean).length

  const removeOne = async (i: KpiIndicator) => {
    if (!(await confirm({ kind: 'delete', subject: sx(i.name), description: t('kpi.deleteIndicatorBody') }))) return
    try {
      await mut.deleteIndicator.mutateAsync(i.id)
      toast.ok(t('common.deleted'))
    } catch (e) {
      toast.error(errorCode(e) === 'kpi_indicator_has_entries' ? t('kpi.indicatorHasEntries') : errorMessage(e, t('common.actionFailed')))
    }
  }

  const bulkDelete = async () => {
    if (!(await confirm({ kind: 'delete', count: selected.length, description: t('kpi.deleteIndicatorBody') }))) return
    const failed = await bulk.run(selected, (id) => mut.deleteIndicator.mutateAsync(id))
    selGeneral.clear()
    selDept.clear()
    if (failed.length) toast.error(t('kpi.bulkDeletePartial', { done: selected.length - failed.length, failed: failed.length }))
    else toast.ok(t('kpi.bulkDeleteDone', { count: selected.length }))
  }

  const seed = async () => {
    if (!(await confirm({ kind: 'action', title: t('kpi.seedDefaults'), description: t('kpi.seedDefaultsHint') }))) return
    try {
      const r = await mut.seedDefaultIndicators.mutateAsync()
      toast.ok(t('kpi.seedDone', { count: r?.created_indicators ?? 0 }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<KpiIndicator>[] = [
    {
      key: 'name',
      header: t('kpi.colName'),
      skeleton: 'w-60',
      className: 'min-w-[16rem] max-w-[24rem]',
      cell: (i) => (
        <span className="flex gap-1.5">
          {i.order_no != null && i.order_no < 100 && (
            <span className="mt-0.5 inline-grid h-[18px] min-w-5 shrink-0 place-items-center rounded bg-brand-soft px-1 text-[11px] font-bold text-brand-strong">
              {i.order_no}
            </span>
          )}
          <span className="line-clamp-2 text-fg" title={sx(i.name)}>
            {sx(i.name)}
          </span>
        </span>
      ),
    },
    {
      key: 'direction',
      header: t('kpi.colDirection'),
      skeleton: 'w-20',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (i) => (
        <span className="inline-flex items-center gap-1">
          {i.direction === 'L' ? <TrendingDown size={13} className="text-danger" /> : <TrendingUp size={13} className="text-success" />}
          {i.direction === 'L' ? t('kpi.dirLess') : t('kpi.dirMore')}
        </span>
      ),
    },
    { key: 'group', header: t('kpi.colGroup'), skeleton: 'w-24', className: 'max-w-[12rem] text-fg-muted', cell: (i) => <span className="line-clamp-1">{sx(i.group_name) || '—'}</span> },
    { key: 'max', header: t('kpi.colMaxPoints'), headerClassName: 'text-right', className: 'text-right tabular-nums', skeleton: 'w-8', cell: (i) => (i.max_percent != null ? Number(i.max_percent) : '—') },
    { key: 'unit', header: t('kpi.colUnit'), skeleton: 'w-8', className: 'text-fg-muted', cell: (i) => unitOf(i) },
    { key: 'type', header: t('kpi.colType'), skeleton: 'w-16', className: 'whitespace-nowrap text-fg-muted', cell: (i) => (i.value_type === 'qualitative' ? t('kpi.qualitative') : t('kpi.quantitative')) },
    {
      key: 'target',
      header: <span title={t('kpi.targetHint')}>{t('kpi.colTarget')}</span>,
      label: t('kpi.colTarget'),
      skeleton: 'w-12',
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      cell: (i) => (
        <>
          {i.target_value != null ? Number(i.target_value) : '—'}
          {(i.threshold_low != null || i.threshold_high != null) && (
            <span className="block text-[11px] text-fg-subtle">
              {i.threshold_low ?? '…'} – {i.threshold_high ?? '…'}
            </span>
          )}
        </>
      ),
    },
    { key: 'weight', header: t('kpi.weight'), headerClassName: 'text-right', className: 'text-right tabular-nums', skeleton: 'w-8', cell: (i) => (i.weight != null ? Number(i.weight) : '—') },
    {
      key: 'scope',
      header: t('kpi.colScope'),
      skeleton: 'w-16',
      className: 'text-fg-muted',
      cell: (i) =>
        i.department_id
          ? departments.find((d) => d.value === String(i.department_id))?.label ?? t('kpi.scopeDepartment')
          : i.scope === 'global'
            ? t('kpi.scopeGlobal')
            : t('kpi.scopeBranch'),
    },
    { key: 'period', header: t('kpi.periodType'), skeleton: 'w-12', className: 'whitespace-nowrap text-fg-muted', cell: (i) => (i.period_type ? t(PERIOD_KEY[i.period_type] as never) : '—') },
    { key: 'assignees', header: t('kpi.colAssignees'), skeleton: 'w-16', className: 'text-[12.5px] text-fg-muted', cell: (i) => <AssigneesSummary value={i.assignees} departments={departments} /> },
    { key: 'active', header: t('kpi.colStatus'), skeleton: 'w-12', cell: (i) => <Badge tone={i.is_active ? 'success' : 'neutral'}>{i.is_active ? t('kpi.active') : t('kpi.inactive')}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      cell: (i) => (
        <span className="inline-flex gap-0.5">
          {canEdit && (
            <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing({ row: i })}>
              <Pencil size={14} />
            </IconButton>
          )}
          {canAdd && (
            <IconButton size="sm" label={t('kpi.copy')} onClick={() => setEditing({ row: i, copy: true })}>
              <Copy size={14} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton size="sm" label={t('common.delete')} onClick={() => removeOne(i)}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2.5 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <Combobox value={filters.igrp} onChange={(v) => setFilter('igrp', v)} options={groups.map((g) => ({ value: g, label: sx(g) }))} placeholder={t('kpi.allGroups')} className="w-full lg:w-64" />
        <Combobox
          value={filters.idir}
          onChange={(v) => setFilter('idir', v)}
          options={[
            { value: 'M', label: t('kpi.dirMoreFilter') },
            { value: 'L', label: t('kpi.dirLessFilter') },
          ]}
          placeholder={t('kpi.allDirections')}
          className="w-full lg:w-60"
        />
        <Combobox
          value={filters.iact}
          onChange={(v) => setFilter('iact', v)}
          options={[
            { value: 'true', label: t('kpi.active') },
            { value: 'false', label: t('kpi.inactive') },
          ]}
          placeholder={t('kpi.allStatuses')}
          className="w-full lg:w-44"
        />
        <FilterReset count={filterCount} onReset={reset} />
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {acc.master && (
            <Button size="sm" variant="secondary" leftIcon={<Sparkles size={14} />} loading={mut.seedDefaultIndicators.isPending} onClick={seed}>
              {t('kpi.seedDefaults')}
            </Button>
          )}
          {canAdd && (
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEditing({ row: null, scope: 'branch' })}>
              {t('kpi.indicator')}
            </Button>
          )}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <h3 className="text-[14px] font-semibold text-fg">{t('kpi.generalIndicators')}</h3>
          <Badge tone="success">{t('kpi.allDepartmentsBadge')}</Badge>
        </div>
        <DataTable
          tableId="kpi-indicators"
          rows={general}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={canDelete ? selGeneral : undefined}
          emptyTitle={t('kpi.generalEmpty')}
          filtered={filterCount > 0}
          minWidth={1280}
          skeletonRows={5}
        />
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <h3 className="text-[14px] font-semibold text-fg">{t('kpi.departmentIndicators')}</h3>
          <Badge tone="info">{t('kpi.onlyDepartmentBadge')}</Badge>
          <Combobox
            value={filters.idept}
            onChange={(v) => setFilter('idept', v)}
            options={departments}
            placeholder={t('kpi.allDepartments')}
            className="w-full sm:w-72"
          />
          {canAdd && (
            <Button size="sm" variant="secondary" className="sm:ml-auto" leftIcon={<Plus size={14} />} onClick={() => setEditing({ row: null, scope: 'department', dept: filters.idept })}>
              {t('kpi.departmentIndicator')}
            </Button>
          )}
        </div>
        <DataTable
          tableId="kpi-indicators"
          rows={byDept}
          columns={columns}
          loading={loading}
          selection={canDelete ? selDept : undefined}
          emptyTitle={t('kpi.departmentEmpty')}
          filtered={filterCount > 0}
          minWidth={1280}
          skeletonRows={3}
        />
      </Card>

      <IntervalManager />

      <BulkBar count={selected.length} onClear={() => { selGeneral.clear(); selDept.clear() }} progress={bulk.progress}>
        <Button size="sm" variant="danger" leftIcon={<Trash2 size={14} />} disabled={bulk.progress.running} onClick={bulkDelete}>
          {t('common.delete')}
        </Button>
      </BulkBar>

      <IndicatorModal value={editing} groups={groups} departments={departments} onClose={() => setEditing(null)} />
    </div>
  )
}

type FieldErrors = Partial<Record<'name' | 'department_id' | 'weight' | 'target_value' | 'threshold_low' | 'threshold_high' | 'form', string>>

/**
 * Create / copy / edit an indicator (K1): name, scope (new only), direction,
 * type, unit and weight, target and thresholds, evaluation period, who it is
 * assigned to, group, max points and order.
 */
function IndicatorModal({
  value,
  groups,
  departments,
  onClose,
}: {
  value: { row: KpiIndicator | null; copy?: boolean; scope?: 'department' | 'branch'; dept?: string } | null
  groups: string[]
  departments: { value: string; label: string }[]
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const mut = useKpiMutations()
  const { options: categories } = useDictionaryOptions(value ? 'position_categories' : null)
  const row = value?.row ?? null
  const editing = !!row && !value?.copy
  const empty = {
    name: '',
    description: '',
    scope: 'branch' as 'branch' | 'department',
    department_id: '',
    direction: 'M',
    value_type: 'quantitative',
    unit: '%',
    weight: '',
    target_value: '',
    threshold_low: '',
    threshold_high: '',
    period_type: 'month' as PeriodType,
    group_name: '',
    max_percent: '',
    order_no: '',
    is_active: true,
  }
  const [form, setForm] = useState(empty)
  const [assignees, setAssignees] = useState<KpiAssignees>(normalizeAssignees(null))
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (!value) return
    setErrors({})
    const s = (v?: number | null) => (v == null ? '' : String(v))
    setForm(
      row
        ? {
            name: value.copy ? `${row.name ?? ''} ${t('kpi.copySuffix')}` : row.name ?? '',
            description: row.description ?? '',
            scope: row.scope === 'department' ? 'department' : 'branch',
            department_id: row.department_id ? String(row.department_id) : '',
            direction: row.direction ?? 'M',
            value_type: row.value_type ?? 'quantitative',
            unit: unitOf(row),
            weight: s(row.weight),
            target_value: s(row.target_value),
            threshold_low: s(row.threshold_low),
            threshold_high: s(row.threshold_high),
            period_type: row.period_type ?? 'month',
            group_name: row.group_name ?? '',
            max_percent: s(row.max_percent),
            order_no: value.copy ? '' : s(row.order_no),
            is_active: row.is_active ?? true,
          }
        : { ...empty, scope: value.scope ?? 'branch', department_id: value.dept ?? '' },
    )
    const a = normalizeAssignees(row?.assignees)
    setAssignees(a)
    const names = new Map((row?.assignees?.employees ?? []).map((e) => [e.id, e.legal_name]))
    setPeople(a.employee_ids.map((id) => ({ id, legal_name: names.get(id) ?? `#${id}` })))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined, form: undefined }))
  }

  const submit = async () => {
    const errs: FieldErrors = {}
    if (!form.name.trim()) errs.name = t('kpi.nameRequired')
    if (!editing && form.scope === 'department' && !form.department_id) errs.department_id = t('kpi.departmentRequired')
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    const w = n(form.weight)
    if (w != null && (!Number.isFinite(w) || w < 0 || w > 100)) errs.weight = t('kpi.weightRange')
    // TZ K1: target and thresholds make sense together (the server checks too).
    const tgt = n(form.target_value)
    const lo = n(form.threshold_low)
    const hi = n(form.threshold_high)
    ;(
      [
        ['target_value', tgt],
        ['threshold_low', lo],
        ['threshold_high', hi],
      ] as const
    ).forEach(([k, v]) => {
      if (v != null && (!Number.isFinite(v) || v < 0)) errs[k] = t('kpi.negativeValue')
      else if (v != null && form.value_type === 'qualitative' && v > 100) errs[k] = t('kpi.qualitativeScale')
    })
    if (!errs.threshold_low && lo != null && hi != null && lo > hi) errs.threshold_low = t('kpi.lowAboveHigh')
    if (!errs.target_value && tgt != null && lo != null && tgt < lo) errs.target_value = t('kpi.targetBelowLow')
    if (!errs.target_value && tgt != null && hi != null && tgt > hi) errs.target_value = t('kpi.targetAboveHigh')
    if (Object.keys(errs).length) return setErrors(errs)

    const body: IndicatorInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      direction: form.direction as 'M' | 'L',
      value_type: form.value_type as 'quantitative' | 'qualitative',
      measure: form.unit,
      unit: form.unit,
      weight: w,
      target_value: tgt,
      threshold_low: lo,
      threshold_high: hi,
      period_type: form.period_type,
      group_name: form.group_name.trim() || null,
      max_percent: n(form.max_percent),
      order_no: n(form.order_no),
      is_active: form.is_active,
      assignees: { ...assignees, employee_ids: people.map((p) => p.id) },
    }
    if (!editing) {
      body.scope = form.scope
      if (form.scope === 'department') body.department_id = Number(form.department_id)
    }
    try {
      if (editing) await mut.updateIndicator.mutateAsync({ id: row!.id, body })
      else await mut.createIndicator.mutateAsync(body)
      toast.ok(t('kpi.indicatorSaved'))
      onClose()
    } catch (e) {
      // Server field errors (`params.fields`) go under their own field.
      const fields = errorParams(e).fields
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        setErrors(Object.fromEntries(Object.entries(fields as Record<string, unknown>).map(([k, v]) => [k, String(v)])) as FieldErrors)
      } else setErrors({ form: errorMessage(e, t('common.actionFailed')) })
    }
  }

  const catOptions = categories.map((c) => ({ value: c.code, label: i18n.language === 'ru' && c.name_ru ? c.name_ru : c.name }))

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      placement="right"
      size="lg"
      title={editing ? t('kpi.editIndicator') : t('kpi.newIndicator')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.createIndicator.isPending || mut.updateIndicator.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kpi.colName')} required error={errors.name} wide>
          <Textarea rows={2} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('kpi.namePlaceholder')} />
        </Field>
        {!editing && (
          <>
            <Field label={t('kpi.forWhom')} wide={form.scope !== 'department'}>
              <Select
                value={form.scope}
                onChange={(e) => set('scope', e.target.value)}
                options={[
                  { value: 'department', label: t('kpi.scopeOnlyDepartment') },
                  { value: 'branch', label: t('kpi.scopeWholeBranch') },
                ]}
              />
            </Field>
            {form.scope === 'department' && (
              <Field label={t('kpi.colDepartment')} required error={errors.department_id}>
                <Combobox value={form.department_id} onChange={(v) => set('department_id', v)} options={departments} placeholder={t('kpi.pickDepartment')} className="w-full" invalid={!!errors.department_id} />
              </Field>
            )}
          </>
        )}
        <Field label={t('kpi.note')} wide>
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('kpi.descriptionPlaceholder')} />
        </Field>
        <Field label={t('kpi.colDirection')}>
          <Select
            value={form.direction}
            onChange={(e) => set('direction', e.target.value)}
            options={[
              { value: 'M', label: t('kpi.dirMoreLong') },
              { value: 'L', label: t('kpi.dirLessLong') },
            ]}
          />
        </Field>
        <Field label={t('kpi.valueType')}>
          <Select
            value={form.value_type}
            onChange={(e) => set('value_type', e.target.value)}
            options={[
              { value: 'quantitative', label: t('kpi.quantitative') },
              { value: 'qualitative', label: t('kpi.qualitative') },
            ]}
          />
        </Field>
        <Field label={t('kpi.colUnit')}>
          <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} options={UNITS.map((u) => ({ value: u, label: u === '%' ? '%' : t(`kpi.unit_${u.replace("'", '')}` as never) }))} />
        </Field>
        <Field label={t('kpi.weightLabel')} error={errors.weight}>
          <Input type="number" min={0} max={100} value={form.weight} onChange={(e) => set('weight', e.target.value)} invalid={!!errors.weight} />
        </Field>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label={t('kpi.target')} error={errors.target_value}>
            <Input type="number" min={0} value={form.target_value} onChange={(e) => set('target_value', e.target.value)} invalid={!!errors.target_value} />
          </Field>
          <Field label={t('kpi.thresholdLow')} error={errors.threshold_low}>
            <Input type="number" min={0} value={form.threshold_low} onChange={(e) => set('threshold_low', e.target.value)} invalid={!!errors.threshold_low} />
          </Field>
          <Field label={t('kpi.thresholdHigh')} error={errors.threshold_high}>
            <Input type="number" min={0} value={form.threshold_high} onChange={(e) => set('threshold_high', e.target.value)} invalid={!!errors.threshold_high} />
          </Field>
        </div>
        <Field label={t('kpi.evaluationPeriod')}>
          <Select value={form.period_type} onChange={(e) => set('period_type', e.target.value)} options={PERIOD_TYPES.map((p) => ({ value: p, label: t(PERIOD_KEY[p] as never) }))} />
        </Field>
        <Field label={t('kpi.groupLabel')}>
          <Input list="kpi-group-names" value={form.group_name} onChange={(e) => set('group_name', e.target.value)} placeholder={t('kpi.groupPlaceholder')} />
          <datalist id="kpi-group-names">
            {groups.map((g) => (
              <option key={g} value={g}>
                {sx(g)}
              </option>
            ))}
          </datalist>
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/40 p-3 sm:col-span-2">
          <legend className="px-1 text-[13px] font-semibold text-fg">{t('kpi.assignTo')}</legend>
          <p className="-mt-1 text-[12px] text-fg-subtle">{t('kpi.assignHint')}</p>
          <Field label={t('kpi.employees')}>
            <EmployeeMultiPicker value={people} onChange={setPeople} placeholder={t('kpi.pickEmployees')} />
          </Field>
          <Field label={t('kpi.departments')}>
            <MultiPicker
              value={assignees.department_ids}
              onChange={(v) => setAssignees((a) => ({ ...a, department_ids: v.map(Number) }))}
              options={departments}
              placeholder={t('kpi.pickDepartments')}
            />
          </Field>
          <Field label={t('kpi.positionCategories')}>
            <MultiPicker
              value={assignees.position_categories}
              onChange={(v) => setAssignees((a) => ({ ...a, position_categories: v.map(String) }))}
              options={catOptions}
              placeholder={catOptions.length ? t('kpi.pickCategories') : t('kpi.dictionaryEmpty')}
              disabled={!catOptions.length && !assignees.position_categories.length}
            />
          </Field>
        </fieldset>

        <Field label={t('kpi.maxPoints')}>
          <Input type="number" value={form.max_percent} onChange={(e) => set('max_percent', e.target.value)} placeholder="50" />
        </Field>
        <Field label={t('kpi.orderNo')}>
          <Input type="number" value={form.order_no} onChange={(e) => set('order_no', e.target.value)} placeholder="6" />
        </Field>
        <p className={cn('-mt-2 text-[11.5px] text-fg-subtle sm:col-span-2')}>{t('kpi.maxPointsHint')}</p>
        <div className="sm:col-span-2">
          <Checkbox label={t('kpi.active')} checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        </div>
      </div>
      <FormError className="mt-3 text-xs">{errors.form}</FormError>
    </Modal>
  )
}
