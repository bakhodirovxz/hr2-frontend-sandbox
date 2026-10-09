import { createContext, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { SelectOption } from '@/components/ui/Select'
import { errorMessage } from '@/api/errorMessage'
import { EmployeeBasisFields } from '../EmployeeBasisFields'
import { isBasisComplete, type EditBasis, type T2Section as T2SectionCode } from '../types'
import { fmtDate } from '../format'
import { useT2Mutations } from './useT2'

/**
 * TZ C3: the card-level basis document. One editing session may change
 * several sections under one order, so the basis lives on the card (v1
 * `T2BasisContext`) and every section in edit mode shows the block.
 */
export interface T2BasisState {
  value: EditBasis
  onChange: (next: EditBasis) => void
}
export const T2BasisContext = createContext<T2BasisState | null>(null)

/** The basis of the current session, or `null` (with a toast) when incomplete. */
export function useRequireBasis() {
  const ctx = useContext(T2BasisContext)
  const toast = useToast()
  const { t } = useTranslation()
  return (): EditBasis | null => {
    if (!ctx || !isBasisComplete(ctx.value)) {
      toast.error(t('personnel.basis.required'))
      return null
    }
    return ctx.value
  }
}

/**
 * Save helpers of the T-2 tabs: the basis is taken from the card session,
 * the result replaces the cached card, success / failure is toasted.
 * `saving` names the section being written.
 */
export function useT2Save(employeeId: number) {
  const { t } = useTranslation()
  const toast = useToast()
  const requireBasis = useRequireBasis()
  const m = useT2Mutations(employeeId)
  const [saving, setSaving] = useState('')
  const run = async (key: string, fn: (basis: EditBasis) => Promise<unknown>): Promise<boolean> => {
    const basis = requireBasis()
    if (!basis) return false
    setSaving(key)
    try {
      await fn(basis)
      toast.ok(t('common.saved'))
      return true
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
      return false
    } finally {
      setSaving('')
    }
  }
  return {
    saving,
    patch: (values: Record<string, unknown>, key: string) =>
      run(key, (basis) => m.saveScalars.mutateAsync({ values, basis })),
    put: (section: T2SectionCode, body: Record<string, unknown>, key: string) =>
      run(key, (basis) => m.saveSection.mutateAsync({ section, body, basis })),
  }
}

/** Empty strings → null (the API must not store ''). */
export const nullifyEmpty = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))

/** One T-2 section: header with «Tahrirlash» ⇄ «Saqlash / Bekor qilish». */
export function T2Section({
  icon,
  title,
  hint,
  actions,
  children,
  canEdit = false,
  editing = false,
  onEdit,
  onSave,
  onCancel,
  saving = false,
  noBasis = false,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  actions?: ReactNode
  children?: ReactNode
  canEdit?: boolean
  editing?: boolean
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  saving?: boolean
  noBasis?: boolean
}) {
  const { t } = useTranslation()
  const basis = useContext(T2BasisContext)
  const showBasis = canEdit && editing && !!onSave && !!basis && !noBasis
  return (
    <Card className="overflow-hidden p-0" aria-label={title} role="region">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {icon && <span className="text-brand">{icon}</span>}
        <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
        {hint && <span className="text-[11.5px] text-fg-subtle">{hint}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {actions}
          {canEdit && onEdit && !editing && (
            <Button size="sm" variant="outline" leftIcon={<Pencil size={13} />} onClick={onEdit}>
              {t('common.edit')}
            </Button>
          )}
          {canEdit && editing && (
            <>
              {onCancel && (
                <Button size="sm" variant="ghost" leftIcon={<X size={13} />} onClick={onCancel} disabled={saving}>
                  {t('common.cancel')}
                </Button>
              )}
              {onSave && (
                <Button size="sm" leftIcon={<Save size={13} />} onClick={onSave} loading={saving}>
                  {t('common.save')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="p-4">
        {children}
        {showBasis && (
          <div className="mt-4">
            <EmployeeBasisFields value={basis.value} onChange={basis.onChange} />
          </div>
        )}
      </div>
    </Card>
  )
}

/** Read-only «label: value» cell. */
export function ReadField({ label, value }: { label: string; value?: ReactNode }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11.5px] text-fg-subtle">{label}</span>
      <span className="break-words text-[13.5px] text-fg">{empty ? '—' : value}</span>
    </div>
  )
}

export function FieldGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''}`}>{children}</div>
  )
}

export function EmptyRow({ text }: { text?: string }) {
  const { t } = useTranslation()
  return <p className="py-1.5 text-[12.5px] text-fg-subtle">{text ?? t('personnel.t2.noRecords')}</p>
}

export interface RowsColumn<R> {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: SelectOption[]
  placeholder?: string
  width?: number
  render?: (row: R) => ReactNode
}

type Row = Record<string, unknown> & { id?: number | string }

function displayCell<R extends Row>(col: RowsColumn<R>, row: R): ReactNode {
  if (col.render) return col.render(row)
  const v = row[col.key]
  if (v === null || v === undefined || v === '') return '—'
  if (col.type === 'date') return fmtDate(String(v))
  if (col.type === 'select') return col.options?.find((o) => o.value === String(v))?.label ?? String(v)
  return String(v)
}

/** Read-only table of a repeating section. */
export function RowsTable<R extends Row>({ columns, rows, emptyText }: { columns: RowsColumn<R>[]; rows: R[]; emptyText?: string }) {
  if (!rows.length) return <EmptyRow text={emptyText} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[12.5px]">
        <thead>
          <tr className="text-left text-fg-subtle">
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-1.5 pr-4 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)} className="border-t border-line/70">
              {columns.map((c) => (
                <td key={c.key} className="py-2 pr-4 align-top text-fg">
                  {displayCell(c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Editor of a repeating section: add / remove rows, typed cells. */
export function RowsEditor<R extends Row>({
  columns,
  rows,
  setRows,
}: {
  columns: RowsColumn<R>[]
  rows: R[]
  setRows: (rows: R[]) => void
}) {
  const { t } = useTranslation()
  const update = (idx: number, key: string, value: unknown) =>
    setRows(rows.map((r, i) => (i === idx ? ({ ...r, [key]: value } as R) : r)))
  const blank = Object.fromEntries(columns.map((c) => [c.key, ''])) as R

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <EmptyRow />}
      {rows.map((row, idx) => (
        <div key={idx} className="flex flex-wrap items-end gap-2 border-b border-line/60 pb-3 last:border-b-0">
          {columns.map((c) => {
            const v = row[c.key]
            const str = v === null || v === undefined ? '' : String(v)
            return (
              <div key={c.key} style={{ width: c.width ?? 180 }} className="min-w-[140px] max-w-full">
                <Field label={c.label}>
                  {c.type === 'select' ? (
                    <Combobox
                      value={str}
                      onChange={(nv) => update(idx, c.key, nv)}
                      options={c.options ?? []}
                      placeholder={c.placeholder ?? t('common.choose')}
                      clearable
                    />
                  ) : c.type === 'date' ? (
                    <DateInput value={str} onChange={(nv) => update(idx, c.key, nv)} aria-label={c.label} />
                  ) : (
                    <Input
                      type={c.type === 'number' ? 'number' : 'text'}
                      value={str}
                      placeholder={c.placeholder}
                      onChange={(e) => update(idx, c.key, e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )
          })}
          <IconButton
            label={t('personnel.t2.removeRow')}
            onClick={() => setRows(rows.filter((_, i) => i !== idx))}
            className="mb-0.5 text-danger"
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        leftIcon={<Plus size={13} />}
        onClick={() => setRows([...rows, { ...blank }])}
      >
        {t('personnel.t2.addRow')}
      </Button>
    </div>
  )
}
