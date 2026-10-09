import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TimeInput } from '@/components/ui/TimeInput'
import { isInvalidRange } from '@/lib/dateRange'
import { DivisionTreeSelect } from './DivisionTreeSelect'
import { MonthInput } from './MonthInput'
import { MultiPicker } from './MultiPicker'
import { reportLabel } from './reportStyles'
import type { ParamDef, ReportOption, ReportParams } from './types'
import { useReportOptions } from './useReportPrefs'

interface Props {
  code: string
  defs: ParamDef[]
  value: ReportParams
  onChange: (next: ReportParams) => void
  disabled?: boolean
}

function branchDeps(def: ParamDef, value: ReportParams): (number | string)[] {
  const out: (number | string)[] = []
  for (const dep of def.depends_on) {
    const v = value[dep]
    if (Array.isArray(v)) out.push(...(v as (number | string)[]))
    else if (v != null && v !== '') out.push(v as number | string)
  }
  return out
}

/** One parameter control, chosen by kind; options come from the server, scoped. */
function ParamControl({ code, def, value, all, onChange, disabled }: {
  code: string; def: ParamDef; value: unknown; all: ReportParams; onChange: (v: unknown) => void; disabled?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const remote = def.kind === 'employee_multi'
  // The options route has no offset, only `limit` (≤200): «more» asks for a
  // longer first page; past 200 the search box narrows the list instead.
  const [limit, setLimit] = useState(50)
  useEffect(() => setLimit(50), [q])
  const needsOptions = !!def.options_source
  const deps = branchDeps(def, all)
  const selectedIds = Array.isArray(value) ? (value as (number | string)[]) : []
  const opts = useReportOptions(code, needsOptions ? def.name : null, { branch_ids: deps, q: remote ? q : undefined, limit: remote ? limit : undefined }, needsOptions)
  // Remote lists: resolve labels of already-selected ids that the search page lacks.
  const selectedOpts = useReportOptions(code, remote && selectedIds.length ? def.name : null, { branch_ids: deps, ids: selectedIds }, remote && selectedIds.length > 0)
  const options: ReportOption[] = opts.data ?? []
  const selectedLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const o of selectedOpts.data ?? []) m[String(o.value)] = o.label
    return m
  }, [selectedOpts.data])

  switch (def.kind) {
    case 'date_range': {
      const r = (value ?? {}) as { from?: string; to?: string }
      const invalid = isInvalidRange(r.from ?? '', r.to ?? '')
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('reports.dateFrom')} required={def.required} error={invalid ? t('list.invalidRange') : undefined}>
            <DateInput value={r.from ?? ''} onChange={(v) => onChange({ ...r, from: v })} invalid={invalid} disabled={disabled} />
          </Field>
          <Field label={t('reports.dateTo')} required={def.required}>
            <DateInput value={r.to ?? ''} onChange={(v) => onChange({ ...r, to: v })} invalid={invalid} disabled={disabled} />
          </Field>
        </div>
      )
    }
    case 'month':
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <MonthInput value={String(value ?? '').slice(0, 7)} onChange={onChange} disabled={disabled} />
        </Field>
      )
    case 'text':
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <Input value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={200} />
        </Field>
      )
    case 'date':
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <DateInput value={String(value ?? '')} onChange={onChange} disabled={disabled} />
        </Field>
      )
    case 'division_tree':
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <DivisionTreeSelect value={(value as number[]) ?? []} onChange={onChange} options={options} loading={opts.isLoading} placeholder={t('reports.pickPlaceholder')} />
        </Field>
      )
    case 'branch_multi':
    case 'job_multi':
    case 'employee_multi':
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <MultiPicker
            value={selectedIds}
            onChange={onChange}
            options={options}
            onSearchChange={remote ? setQ : undefined}
            loading={opts.isFetching}
            hasMore={remote && Array.isArray(opts.data) && opts.data.length >= limit && limit < 200}
            onLoadMore={() => setLimit((l) => Math.min(200, l + 50))}
            disabled={disabled}
            selectedLabels={selectedLabels}
            showPhotos={def.kind === 'employee_multi'}
          />
        </Field>
      )
    case 'enum': {
      const choiceOpts: ReportOption[] = def.choices.length
        ? def.choices.map((c) => ({ value: c.value, label: reportLabel(c.label_key, c.value) }))
        : options
      if (def.multiple) {
        return (
          <Field label={reportLabel(def.label_key)} required={def.required}>
            <MultiPicker value={selectedIds} onChange={onChange} options={choiceOpts} loading={opts.isLoading} disabled={disabled} />
          </Field>
        )
      }
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <Combobox
            value={value == null ? '' : String(value)}
            onChange={(v) => onChange(v || null)}
            options={choiceOpts.map((o) => ({ value: String(o.value), label: o.label }))}
            placeholder={t('reports.any')}
            clearable={!def.required}
            disabled={disabled}
            loading={opts.isLoading}
            className="w-full"
          />
        </Field>
      )
    }
    case 'int':
      if (def.options_source) {
        return (
          <Field label={reportLabel(def.label_key)} required={def.required}>
            <Combobox
              value={value == null ? '' : String(value)}
              onChange={(v) => onChange(v ? Number(v) : null)}
              options={options.map((o) => ({ value: String(o.value), label: o.label }))}
              placeholder={t('reports.any')}
              clearable={!def.required}
              disabled={disabled}
              loading={opts.isLoading}
              className="w-full"
            />
          </Field>
        )
      }
      return (
        <Field label={reportLabel(def.label_key)} required={def.required}>
          <Input type="number" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} disabled={disabled} />
        </Field>
      )
    case 'bool':
      return (
        <div className="pt-6">
          <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} label={reportLabel(def.label_key)} disabled={disabled} />
        </div>
      )
    case 'time_range': {
      const r = (value ?? {}) as { from?: string; to?: string }
      return (
        <Field label={reportLabel(def.label_key)}>
          <div className="grid grid-cols-2 gap-3">
            <TimeInput value={r.from ?? '00:00'} onChange={(v: string) => onChange({ ...r, from: v })} />
            <TimeInput value={r.to ?? '23:59'} onChange={(v: string) => onChange({ ...r, to: v })} />
          </div>
        </Field>
      )
    }
    default:
      return (
        <Field label={reportLabel(def.label_key)}>
          <Select options={[]} value="" onChange={() => undefined} disabled />
        </Field>
      )
  }
}

/** Column span per control kind on the 3-column grid: wide pickers get more room. */
function span(kind: ParamDef['kind']): string {
  if (kind === 'date_range' || kind === 'time_range') return 'md:col-span-2'
  return ''
}

export function ReportParamsForm({ code, defs, value, onChange, disabled }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {defs.map((d) => (
        <div key={d.name} className={span(d.kind)}>
          <ParamControl
            code={code}
            def={d}
            value={value[d.name]}
            all={value}
            onChange={(v) => onChange({ ...value, [d.name]: v })}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  )
}
