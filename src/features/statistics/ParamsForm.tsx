import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select, type SelectOption } from '@/components/ui/Select'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useBranchStore } from '@/store/branchStore'
import type { CatalogParam } from './api'
import { useServerText } from './serverText'
import { ALL_BRANCHES } from './useStatistics'
import { isoDate, yearStart } from './reportUtils'

/**
 * Hisobot parametrlari formasi — katalogdagi `params` ta'rifidan quriladi
 * (TZ R1 «форма параметров отчёта»). Server ta'rifi:
 * `{name, label, type, required, options, multiple, default}`; turlar —
 * `date`, `date_range` (period → `date_from`/`date_to`), `branch`,
 * `department`, `select`, `multiselect`; notanish tur — matn maydoni.
 */

export type ParamType = 'date' | 'date_range' | 'branch' | 'department' | 'select' | 'multiselect' | 'boolean' | 'number' | 'month' | 'text'

export interface ParamDesc {
  name: string
  label: string
  type: ParamType
  options: { value: string; label: string }[]
  required: boolean
  multiple: boolean
  default: unknown
  fromKey: string | null
  toKey: string | null
}

export type ParamValues = Record<string, unknown>

const KNOWN = new Set<ParamType>(['date', 'date_range', 'branch', 'department', 'select', 'multiselect', 'boolean', 'number', 'month', 'text'])

/**
 * Server ta'rifi → yagona ko'rinish. TZ R1 1488: bo'lim filtri BIR NECHTA
 * bo'limni qabul qiladi — yagona `department_id` maydoni `department_ids` ko'p
 * tanloviga aylantiriladi (backend ikkalasini ham tushunadi).
 */
export function normalizeParams(params: CatalogParam[] | undefined): ParamDesc[] {
  return (params ?? [])
    .filter((p) => p && p.name)
    .map((p) => {
      let type = (KNOWN.has(p.type as ParamType) ? p.type : 'text') as ParamType
      const options = (p.options ?? []).map((o) => ({ value: String(o.value ?? ''), label: String(o.label ?? o.value ?? '') }))
      if (type === 'select' && p.multiple) type = 'multiselect'
      const isDept = type === 'department'
      const range = type === 'date_range'
      const rangeBase = ['period', 'date_range', 'dates', 'range'].includes(p.name)
      return {
        name: isDept && p.name === 'department_id' ? 'department_ids' : p.name,
        label: p.label || p.name,
        type,
        options,
        required: !!p.required,
        multiple: isDept ? true : !!p.multiple || type === 'multiselect',
        default: p.default,
        fromKey: range ? (rangeBase ? 'date_from' : `${p.name}_from`) : null,
        toKey: range ? (rangeBase ? 'date_to' : `${p.name}_to`) : null,
      }
    })
}

/** Boshlang'ich qiymatlar: ta'rifdagi `default`, davr — yil boshidan bugungacha. */
export function initialValues(descs: ParamDesc[]): ParamValues {
  const v: ParamValues = {}
  for (const d of descs) {
    if (d.type === 'date_range') {
      v[d.fromKey!] = yearStart()
      v[d.toKey!] = isoDate(new Date())
    } else if (d.type === 'branch') v[d.name] = ''
    else if (d.multiple) v[d.name] = Array.isArray(d.default) ? d.default.map(String) : []
    else if (d.type === 'boolean') v[d.name] = !!d.default
    else v[d.name] = d.default == null ? '' : String(d.default)
  }
  return v
}

/**
 * So'rov tanasi: bo'sh qiymat yuborilmaydi, sonlar songa aylanadi. Filial —
 * `''` bo'lsa SHAPKADAGI filial, `'all'` bo'lsa yuborilmaydi (ko'lamdagi
 * barcha filiallar).
 */
export function buildBody(descs: ParamDesc[], values: ParamValues, headerBranch: number | null): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const d of descs) {
    if (d.type === 'date_range') {
      if (values[d.fromKey!]) body[d.fromKey!] = values[d.fromKey!]
      if (values[d.toKey!]) body[d.toKey!] = values[d.toKey!]
      continue
    }
    const v = values[d.name]
    if (d.type === 'branch') {
      const raw = String(v ?? '')
      const id = raw === ALL_BRANCHES ? null : raw ? Number(raw) : headerBranch
      if (id) body[d.name] = id
      continue
    }
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue
    if (d.type === 'department') body[d.name] = (v as string[]).map(Number)
    else if (d.type === 'number') body[d.name] = Number(v)
    else body[d.name] = v
  }
  return body
}

export function missingRequired(descs: ParamDesc[], values: ParamValues): string[] {
  return descs
    .filter((d) => {
      if (!d.required) return false
      if (d.type === 'date_range') return !values[d.fromKey!] || !values[d.toKey!]
      const v = values[d.name]
      return v === '' || v == null || (Array.isArray(v) && !v.length)
    })
    .map((d) => d.name)
}

/** Ko'p tanlov: qidiruvli ro'yxatdan qo'shiladi, tanlanganlar — olib tashlanadigan chiplar. */
export function MultiPick({
  value,
  onChange,
  options,
  placeholder,
  id,
}: {
  value: string[]
  onChange: (v: string[]) => void
  options: SelectOption[]
  placeholder: string
  /** `Field` beradi — yorliq ro'yxat tugmasini nomlasin. */
  id?: string
}) {
  const { t } = useTranslation()
  const byValue = new Map(options.map((o) => [o.value, o.label]))
  return (
    <div>
      <Combobox
        id={id}
        className="w-full"
        value=""
        onChange={(v) => v && !value.includes(v) && onChange([...value, v])}
        options={options.filter((o) => !value.includes(o.value))}
        placeholder={value.length ? t('statReports.addMore') : placeholder}
        clearable={false}
        hidePlaceholderOption
      />
      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {value.map((v) => (
            <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-pill border border-line bg-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-fg">
              <span className="truncate">{byValue.get(v) ?? `#${v}`}</span>
              <button
                type="button"
                aria-label={t('statReports.removeItem', { name: byValue.get(v) ?? v })}
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="grid h-4 w-4 shrink-0 place-items-center rounded-pill text-fg-subtle hover:text-danger"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function DepartmentField({
  value,
  onChange,
  branchId,
  id,
}: {
  value: string[]
  onChange: (v: string[]) => void
  branchId: number | null
  id?: string
}) {
  const { t } = useTranslation()
  const options = useDepartmentOptions(branchId)
  return <MultiPick id={id} value={value} onChange={onChange} options={options} placeholder={t('statReports.allDepartments')} />
}

export function ParamsForm({
  descriptors,
  values,
  onChange,
  errors,
}: {
  descriptors: ParamDesc[]
  values: ParamValues
  onChange: (next: ParamValues) => void
  errors: string[]
}) {
  const { t } = useTranslation()
  const st = useServerText()
  const branches = useBranchStore((s) => s.branches)
  const header = useBranchStore((s) => s.selectedBranchId)
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v })

  // Bo'limlar ro'yxati formadagi filialga ergashadi (bo'lmasa — shapkadagi).
  const branchDesc = descriptors.find((d) => d.type === 'branch')
  const rawBranch = branchDesc ? String(values[branchDesc.name] ?? '') : ''
  const formBranch = rawBranch === ALL_BRANCHES ? null : rawBranch ? Number(rawBranch) : header

  if (!descriptors.length) return <p className="text-[12.5px] text-fg-subtle">{t('statReports.noParams')}</p>

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {descriptors.map((d) => {
        const err = errors.includes(d.name) ? t('statReports.required') : undefined
        const label = st(d.label)
        let control: React.ReactNode
        switch (d.type) {
          case 'date_range': {
            const bad = !!values[d.fromKey!] && !!values[d.toKey!] && String(values[d.fromKey!]) > String(values[d.toKey!])
            return (
              <Field key={d.name} label={label} required={d.required} error={err ?? (bad ? t('list.invalidRange') : undefined)}>
                <div className="grid grid-cols-2 gap-2">
                  <DateInput
                    value={String(values[d.fromKey!] ?? '')}
                    onChange={(x) => set(d.fromKey!, x)}
                    invalid={!!err || bad}
                    aria-label={`${label}: ${t('statReports.from')}`}
                  />
                  <DateInput
                    value={String(values[d.toKey!] ?? '')}
                    onChange={(x) => set(d.toKey!, x)}
                    invalid={!!err || bad}
                    aria-label={`${label}: ${t('statReports.to')}`}
                  />
                </div>
              </Field>
            )
          }
          case 'date':
            control = <DateInput value={String(values[d.name] ?? '')} onChange={(x) => set(d.name, x)} invalid={!!err} />
            break
          case 'branch':
            control = (
              <Select
                value={rawBranch || (header ? String(header) : ALL_BRANCHES)}
                onChange={(e) => onChange({ ...values, [d.name]: e.target.value, department_ids: [] })}
                options={[
                  { value: ALL_BRANCHES, label: t('statistics.allBranches') },
                  ...branches.map((b) => ({ value: String(b.id), label: b.name })),
                ]}
              />
            )
            break
          case 'department':
            control = (
              <DepartmentField
                value={(values[d.name] as string[]) ?? []}
                onChange={(v) => set(d.name, v)}
                branchId={formBranch}
              />
            )
            break
          case 'select':
            control = (
              <Select
                value={String(values[d.name] ?? '')}
                onChange={(e) => set(d.name, e.target.value)}
                // Bo'sh qiymatli variantni server o'zi bersa («Guruhlashsiz») — «Barchasi» qo'shilmaydi.
                placeholder={d.options.some((o) => o.value === '') ? undefined : t('statReports.any')}
                options={d.options.map((o) => ({ value: o.value, label: st(o.label) }))}
              />
            )
            break
          case 'multiselect':
            control = (
              <MultiPick
                value={(values[d.name] as string[]) ?? []}
                onChange={(v) => set(d.name, v)}
                options={d.options.map((o) => ({ value: o.value, label: st(o.label) }))}
                placeholder={t('statReports.any')}
              />
            )
            break
          case 'boolean':
            return (
              <div key={d.name} className="flex items-end pb-2">
                <Checkbox label={label} checked={!!values[d.name]} onChange={(e) => set(d.name, e.target.checked)} />
              </div>
            )
          case 'number':
            control = <Input type="number" value={String(values[d.name] ?? '')} onChange={(e) => set(d.name, e.target.value)} />
            break
          case 'month':
            control = <Input type="month" value={String(values[d.name] ?? '')} onChange={(e) => set(d.name, e.target.value)} />
            break
          default:
            control = <Input value={String(values[d.name] ?? '')} onChange={(e) => set(d.name, e.target.value)} />
        }
        return (
          <Field key={d.name} label={label} required={d.required} error={err}>
            {control}
          </Field>
        )
      })}
    </div>
  )
}
