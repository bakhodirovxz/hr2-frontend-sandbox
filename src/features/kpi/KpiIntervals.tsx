import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { fmtDay, intervalType, periodBounds, useIntervals, useKpiMutations, type KpiInterval, type PeriodType } from './api'
import { useKpiAccess } from './useKpiAccess'

export const PERIOD_TYPES: PeriodType[] = ['month', 'quarter', 'year']
export const PERIOD_KEY: Record<PeriodType, string> = { month: 'kpi.periodMonth', quarter: 'kpi.periodQuarter', year: 'kpi.periodYear' }

/**
 * Evaluation periods (`interval_list`). Monthly periods appear by themselves
 * with the first scorecard of the month; a quarter or a year is added here.
 */
export function IntervalManager() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const { intervals, loading, error } = useIntervals()
  const [editing, setEditing] = useState<KpiInterval | 'new' | null>(null)
  const canAdd = acc.may('interval_list', 'add')
  const canEdit = acc.may('interval_list', 'edit')
  const canDelete = acc.may('interval_list', 'delete')

  const rows = [...intervals].sort((a, b) => String(b.begin_date).localeCompare(String(a.begin_date)))

  const columns: Column<KpiInterval>[] = [
    { key: 'name', header: t('kpi.colName'), skeleton: 'w-32', className: 'font-medium text-fg', cell: (iv) => iv.name || '—' },
    {
      key: 'type',
      header: t('kpi.periodType'),
      skeleton: 'w-16',
      className: 'text-fg-muted',
      cell: (iv) => {
        const ty = intervalType(iv)
        return ty ? t(PERIOD_KEY[ty] as never) : '—'
      },
    },
    { key: 'begin', header: t('kpi.begin'), className: 'tabular-nums text-fg-muted', skeleton: 'w-20', cell: (iv) => fmtDay(iv.begin_date) },
    { key: 'end', header: t('kpi.end'), className: 'tabular-nums text-fg-muted', skeleton: 'w-20', cell: (iv) => fmtDay(iv.end_date) },
    {
      key: 'active',
      header: t('kpi.colStatus'),
      skeleton: 'w-14',
      cell: (iv) => <Badge tone={iv.is_active === false ? 'neutral' : 'success'}>{iv.is_active === false ? t('kpi.inactive') : t('kpi.active')}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right whitespace-nowrap',
      cell: (iv) => (
        <span className="inline-flex gap-0.5">
          {canEdit && (
            <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(iv)}>
              <Pencil size={14} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton
              size="sm"
              label={t('common.delete')}
              onClick={async () => {
                if (!(await confirm({ kind: 'delete', subject: iv.name }))) return
                try {
                  await mut.deleteInterval.mutateAsync(iv.id)
                  toast.ok(t('common.deleted'))
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          )}
        </span>
      ),
    },
  ]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <CalendarRange size={17} className="text-fg-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-fg">
            {t('kpi.intervalsTitle')} <span className="font-normal text-fg-subtle">({intervals.length})</span>
          </h3>
          <p className="text-[12px] text-fg-subtle">{t('kpi.intervalsHint')}</p>
        </div>
        {canAdd && (
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
            {t('kpi.addInterval')}
          </Button>
        )}
      </div>
      <DataTable rows={rows} columns={columns} loading={loading} error={error} emptyTitle={t('kpi.intervalsEmpty')} minWidth={640} skeletonRows={3} />
      <IntervalModal value={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

function IntervalModal({ value, onClose }: { value: KpiInterval | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useKpiMutations()
  const row = value && value !== 'new' ? value : null
  const [form, setForm] = useState({ name: '', begin_date: '', end_date: '', is_active: true, period_type: '' as PeriodType | '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setError('')
    setForm({
      name: row?.name ?? '',
      begin_date: row?.begin_date ?? '',
      end_date: row?.end_date ?? '',
      is_active: row?.is_active ?? true,
      period_type: row ? intervalType(row) : '',
    })
  }, [value, row])

  // A type re-derives the bounds from the start date (and a name when empty).
  const applyType = (type: PeriodType | '', anchor?: string) =>
    setForm((f) => {
      if (!type) return { ...f, period_type: '' }
      const b = periodBounds(type, anchor || f.begin_date || undefined)
      if (!b) return { ...f, period_type: type }
      const y = b.begin.slice(0, 4)
      const auto =
        type === 'year'
          ? t('kpi.autoYear', { y })
          : type === 'quarter'
            ? t('kpi.autoQuarter', { y, q: Math.floor(Number(b.begin.slice(5, 7)) / 3) + 1 })
            : b.begin.slice(0, 7)
      return { ...f, period_type: type, begin_date: b.begin, end_date: b.end, name: f.name.trim() ? f.name : auto }
    })

  const invalid = isInvalidRange(form.begin_date, form.end_date)

  const submit = async () => {
    if (!form.name.trim()) return setError(t('kpi.nameRequired'))
    if (!form.begin_date || !form.end_date) return setError(t('kpi.periodRequired'))
    if (invalid) return setError(t('list.invalidRange'))
    const body = {
      name: form.name.trim(),
      begin_date: form.begin_date,
      end_date: form.end_date,
      is_active: form.is_active,
      ...(form.period_type ? { period_type: form.period_type } : {}),
    }
    try {
      if (row) await mut.updateInterval.mutateAsync({ id: row.id, body })
      else await mut.createInterval.mutateAsync(body)
      toast.ok(t('kpi.intervalSaved'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      placement="right"
      size="sm"
      title={row ? t('kpi.editInterval') : t('kpi.newInterval')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.createInterval.isPending || mut.updateInterval.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('kpi.intervalName')} required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('kpi.intervalNamePh')} />
        </Field>
        <Field label={t('kpi.periodType')}>
          <Select
            value={form.period_type}
            onChange={(e) => applyType(e.target.value as PeriodType | '')}
            placeholder={t('kpi.customDates')}
            options={PERIOD_TYPES.map((p) => ({ value: p, label: t(PERIOD_KEY[p] as never) }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('kpi.begin')} required>
            <DateInput
              value={form.begin_date}
              onChange={(v) => (form.period_type ? applyType(form.period_type, v) : setForm((f) => ({ ...f, begin_date: v })))}
              invalid={invalid}
              aria-label={t('kpi.begin')}
            />
          </Field>
          <Field label={t('kpi.end')} required>
            <DateInput value={form.end_date} onChange={(v) => setForm((f) => ({ ...f, end_date: v }))} min={form.begin_date || undefined} invalid={invalid} aria-label={t('kpi.end')} />
          </Field>
        </div>
        <Checkbox label={t('kpi.active')} checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}
