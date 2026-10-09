import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListPlus, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { FormError } from '@/components/ui/FormError'
import { useConfirm } from '@/components/data/useConfirm'
import { useServerText } from '@/features/statistics/serverText'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { isDoneStatus, num, pct, useEntries, useKpiMutations, usePerformance, type KpiArgument } from './api'
import { useKpiAccess } from './useKpiAccess'

/*
 * Scorecard arguments (v1 `PerformanceDrawer`): the entries that make up one
 * person's scorecard, each with its weight and operation (+ add / − subtract).
 * «Barcha KPI'ni qo'shish» takes every entry of the period; the result is the
 * weighted sum over finished (D) entries, recomputed on every change.
 */

export function PerformanceDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const { perf, loading } = usePerformance(id)
  const { rows: entries } = useEntries(
    { employee_id: perf?.employee_id, size: 100 },
    id != null && !!perf?.employee_id,
  )
  const [pick, setPick] = useState({ entry: '', weight: '', op: 'A' as 'A' | 'S' })
  const [error, setError] = useState('')

  useEffect(() => {
    setPick({ entry: '', weight: '', op: 'A' })
    setError('')
  }, [id])

  const locked = isDoneStatus(perf?.status) && !acc.master
  const canAdd = acc.may('employee_performance', 'performance_arguments') && !locked
  const canFill = acc.may('employee_performance', 'fill_kpi_arguments') && !locked
  const canTune = acc.may('employee_performance', 'set_argument_settings') && !locked
  const canRemove = acc.may('employee_performance', 'performance_arguments') && !locked

  const used = useMemo(() => new Set((perf?.arguments ?? []).map((a) => a.source_entry_id)), [perf])
  const free = entries.filter((e) => !used.has(e.id))

  const act = async (p: () => Promise<unknown>) => {
    setError('')
    try {
      await p()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const add = () => {
    if (!perf || !pick.entry) return setError(t('kpi.pickEntry'))
    const w = pick.weight.trim() === '' ? null : Number(pick.weight)
    if (w != null && !Number.isFinite(w)) return setError(t('kpi.numberRequired'))
    return act(async () => {
      await mut.addArgument.mutateAsync({ perfId: perf.id, body: { source_entry_id: Number(pick.entry), weight: w, operation: pick.op } })
      setPick({ entry: '', weight: '', op: 'A' })
    })
  }

  const remove = async (a: KpiArgument) => {
    if (!(await confirm({ kind: 'delete', subject: sx(a.source_entry?.indicator?.name) }))) return
    await act(() => mut.deleteArgument.mutateAsync(a.id))
  }

  return (
    <Modal
      open={id != null}
      onClose={onClose}
      placement="right"
      size="lg"
      title={t('kpi.sheetArguments')}
      description={perf?.employee?.legal_name ?? undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {loading || !perf ? (
        <div className="grid h-40 place-items-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-fg-subtle">{t('kpi.totalResult')}</p>
              <p className="text-[28px] font-bold leading-tight tabular-nums text-brand">{pct(perf.result_percent)}</p>
            </div>
            <div className="ml-auto text-right text-[12.5px] text-fg-muted">
              <p>
                {t('kpi.colWeightsSum')}: <span className="tabular-nums text-fg">{num(perf.weights_sum)}</span>
              </p>
              <p>
                {t('kpi.colLiveResult')}: <span className="tabular-nums text-fg">{pct(perf.live_result_percent)}</span>
              </p>
            </div>
            {acc.manager && (
              <IconButton
                label={t('kpi.recompute')}
                onClick={() => act(() => mut.recomputePerformance.mutateAsync(perf.id))}
              >
                <RefreshCw size={16} className={cn(mut.recomputePerformance.isPending && 'animate-spin')} />
              </IconButton>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold text-fg">{t('kpi.argumentsTitle')}</h3>
            {canFill && (
              <Button size="sm" variant="secondary" leftIcon={<ListPlus size={14} />} loading={mut.fillArguments.isPending} onClick={() => act(() => mut.fillArguments.mutateAsync(perf.id))}>
                {t('kpi.fillArguments')}
              </Button>
            )}
          </div>

          {(perf.arguments ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-subtle">{t('kpi.argumentsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {perf.arguments.map((a) => (
                <li key={a.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg">
                      {sx(a.source_entry?.indicator?.name) || `#${a.source_entry_id}`}
                      <span className="ml-1 tabular-nums text-fg-subtle">
                        · {num(a.source_entry?.plan_value)} / {num(a.source_entry?.fact_value)} · {pct(a.source_entry?.result_percent)}
                      </span>
                    </span>
                    {canRemove && (
                      <IconButton size="sm" label={t('common.delete')} onClick={() => remove(a)}>
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11.5px] text-fg-subtle">
                      {t('kpi.weight')}
                      <Input
                        key={`${a.id}-${a.weight}`}
                        type="number"
                        defaultValue={a.weight ?? ''}
                        disabled={!canTune}
                        wrapperClassName="mt-1"
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (e.target.value !== '' && Number.isFinite(v) && v !== Number(a.weight)) {
                            void act(() => mut.updateArgument.mutateAsync({ id: a.id, body: { weight: v } }))
                          }
                        }}
                      />
                    </label>
                    <label className="text-[11.5px] text-fg-subtle">
                      {t('kpi.operation')}
                      <Select
                        value={a.operation}
                        disabled={!canTune}
                        wrapperClassName="mt-1"
                        onChange={(e) => act(() => mut.updateArgument.mutateAsync({ id: a.id, body: { operation: e.target.value as 'A' | 'S' } }))}
                        options={[
                          { value: 'A', label: t('kpi.opAdd') },
                          { value: 'S', label: t('kpi.opSubtract') },
                        ]}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canAdd && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand/40 bg-brand-soft/30 p-3">
              <Combobox
                value={pick.entry}
                onChange={(v) => setPick((p) => ({ ...p, entry: v }))}
                options={free.map((e) => ({
                  value: String(e.id),
                  label: sx(e.indicator?.name) || `#${e.id}`,
                  subLabel: pct(e.result_percent),
                }))}
                placeholder={free.length ? t('kpi.pickEntry') : t('kpi.noFreeEntries')}
                className="w-full"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={pick.weight}
                  onChange={(e) => setPick((p) => ({ ...p, weight: e.target.value }))}
                  placeholder={t('kpi.weightAuto')}
                  aria-label={t('kpi.weight')}
                />
                <Select
                  value={pick.op}
                  aria-label={t('kpi.operation')}
                  onChange={(e) => setPick((p) => ({ ...p, op: e.target.value as 'A' | 'S' }))}
                  options={[
                    { value: 'A', label: t('kpi.opAdd') },
                    { value: 'S', label: t('kpi.opSubtract') },
                  ]}
                />
              </div>
              <Button size="sm" leftIcon={<Plus size={14} />} loading={mut.addArgument.isPending} onClick={add}>
                {t('kpi.addArgument')}
              </Button>
            </div>
          )}
          {locked && <p className="text-[12px] text-fg-subtle">{t('kpi.sheetLocked')}</p>}
          <FormError className="text-xs">{error}</FormError>
        </div>
      )}
    </Modal>
  )
}
