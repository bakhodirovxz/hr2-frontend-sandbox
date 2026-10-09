import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookMarked, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { useConfirm } from '@/components/data/useConfirm'
import { useServerText } from '@/features/statistics/serverText'
import { errorMessage } from '@/api/errorMessage'
import { useJustifications, useKpiMutations, type KpiIndicator, type PeriodType } from './api'
import { PERIOD_TYPES } from './KpiIntervals'

const PERIOD_ADJ_KEY: Record<PeriodType, string> = { month: 'kpi.monthly', quarter: 'kpi.quarterly', year: 'kpi.yearly' }

/**
 * «Markaziy obosnovaniyalar» (TZ 4.2.8 · 2161–2162): the central catalogue of
 * grounds, the same for every employee. Only the site master admin creates,
 * edits and deletes them (`kpi_main_admin_required`); everyone else reads.
 * A «Jarima» ground (direction L) takes points away.
 */
export function JustificationsTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useKpiMutations()
  const { rows, loading, error, refetch } = useJustifications()
  const [editing, setEditing] = useState<KpiIndicator | 'new' | null>(null)

  const columns: Column<KpiIndicator>[] = [
    {
      key: 'name',
      header: t('kpi.justification'),
      skeleton: 'w-72',
      className: 'max-w-[34rem]',
      cell: (r) => (
        <>
          <span className="whitespace-pre-wrap leading-snug text-fg">{sx(r.name)}</span>
          {r.description && <span className="mt-0.5 block text-[11.5px] text-fg-subtle">{r.description}</span>}
        </>
      ),
    },
    {
      key: 'kind',
      header: t('kpi.colType'),
      skeleton: 'w-20',
      cell: (r) =>
        r.direction === 'L' ? (
          <Badge tone="danger">
            <TrendingDown size={12} /> {t('kpi.penalty')}
          </Badge>
        ) : (
          <Badge tone="success">
            <TrendingUp size={12} /> {t('kpi.additive')}
          </Badge>
        ),
    },
    {
      key: 'period',
      header: t('kpi.colPeriod'),
      skeleton: 'w-16',
      className: 'text-fg-muted',
      cell: (r) => t(PERIOD_ADJ_KEY[r.period_type ?? 'month'] as never),
    },
    {
      key: 'max',
      header: t('kpi.colMaxPoints'),
      headerClassName: 'text-right',
      skeleton: 'w-8',
      className: 'text-right tabular-nums',
      cell: (r) =>
        r.max_percent == null ? '—' : r.direction === 'L' ? <span className="text-danger">−{Number(r.max_percent)}</span> : Number(r.max_percent),
    },
    {
      key: 'active',
      header: t('kpi.colStatus'),
      skeleton: 'w-12',
      cell: (r) => <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? t('kpi.active') : t('kpi.inactive')}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            className: 'whitespace-nowrap text-right',
            cell: (r: KpiIndicator) => (
              <span className="inline-flex gap-0.5">
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  label={t('common.delete')}
                  onClick={async () => {
                    if (!(await confirm({ kind: 'delete', subject: sx(r.name)?.slice(0, 80), description: t('kpi.deleteJustificationBody') }))) return
                    try {
                      await mut.deleteJustification.mutateAsync(r.id)
                      toast.ok(t('common.deleted'))
                    } catch (e) {
                      toast.error(errorMessage(e, t('common.actionFailed')))
                    }
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </span>
            ),
          } satisfies Column<KpiIndicator>,
        ]
      : []),
  ]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        <BookMarked size={17} className="text-brand" aria-hidden />
        <h3 className="text-[14px] font-semibold text-fg">{t('kpi.justificationsTitle')}</h3>
        <Badge tone="info">{t('kpi.sameForAll')}</Badge>
        {canManage && (
          <Button size="sm" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => setEditing('new')}>
            {t('kpi.newJustification')}
          </Button>
        )}
      </div>
      <DataTable rows={rows} columns={columns} loading={loading} error={error} onRetry={refetch} emptyTitle={t('kpi.justificationsEmpty')} minWidth={760} skeletonRows={4} />
      <JustificationModal value={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

function JustificationModal({ value, onClose }: { value: KpiIndicator | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useKpiMutations()
  const row = value && value !== 'new' ? value : null
  const [form, setForm] = useState({ name: '', description: '', direction: 'M', measure: 'ball', max_percent: '', period_type: 'month', is_active: true })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setError('')
    setForm({
      name: row?.name ?? '',
      description: row?.description ?? '',
      direction: row?.direction ?? 'M',
      measure: row?.measure ?? 'ball',
      max_percent: row?.max_percent == null ? '' : String(row.max_percent),
      period_type: row?.period_type ?? 'month',
      is_active: row?.is_active ?? true,
    })
  }, [value, row])

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return setError(t('kpi.justificationRequired'))
    const max = form.max_percent.trim() === '' ? null : Number(form.max_percent)
    if (max != null && !Number.isFinite(max)) return setError(t('kpi.numberRequired'))
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      direction: form.direction as 'M' | 'L',
      measure: form.measure.trim() || null,
      max_percent: max,
      period_type: form.period_type as PeriodType,
      is_active: form.is_active,
    }
    try {
      if (row) await mut.updateJustification.mutateAsync({ id: row.id, body })
      else await mut.createJustification.mutateAsync(body)
      toast.ok(row ? t('kpi.justificationUpdated') : t('kpi.justificationAdded'))
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
      size="md"
      title={row ? t('kpi.editJustification') : t('kpi.newJustification')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.createJustification.isPending || mut.updateJustification.isPending}>
            {row ? t('common.save') : t('common.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kpi.justificationText')} required wide>
          <Textarea rows={3} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('kpi.justificationPlaceholder')} />
        </Field>
        <Field label={t('kpi.note')} wide>
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t('kpi.colType')} wide>
          <Select
            value={form.direction}
            onChange={(e) => set('direction', e.target.value)}
            options={[
              { value: 'M', label: t('kpi.additiveLong') },
              { value: 'L', label: t('kpi.penaltyLong') },
            ]}
          />
        </Field>
        <Field label={t('kpi.colPeriod')}>
          <Select value={form.period_type} onChange={(e) => set('period_type', e.target.value)} options={PERIOD_TYPES.map((p) => ({ value: p, label: t(PERIOD_ADJ_KEY[p] as never) }))} />
        </Field>
        <Field label={t('kpi.maxPointsShort')}>
          <Input type="number" value={form.max_percent} onChange={(e) => set('max_percent', e.target.value)} placeholder="—" />
        </Field>
        <Field label={t('kpi.colUnit')} wide>
          <Input value={form.measure} onChange={(e) => set('measure', e.target.value)} placeholder={t('kpi.measurePlaceholder')} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label={t('kpi.activeForEveryone')} checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        </div>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}
