import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, Save } from 'lucide-react'
import { Button, Combobox, EmptyState, Field, Select, Textarea, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { errorMessage } from '@/api/errorMessage'
import { useIndicators } from './useKpiAdmin'
import { useCalculationMutations, useFormulaVariables, useIndicatorCalculation } from './useKpiRoles'
import { tabPill } from '@/components/ui/control'

/** Verifix HPM_CALCULATION_TYPES methods. */
const METHODS = ['M', 'T', 'G', 'F', 'E'] as const
const TARGETS = ['P', 'F'] as const

/**
 * HISOBLASH — how an indicator's PLAN and FACT are produced.
 *
 * Each indicator carries two independent rules, one per target: the plan may be
 * typed in while the fact comes from a formula, and that asymmetry is the
 * normal case rather than an exception. The variable list beside the editor is
 * not decoration — a formula referencing an unknown identifier is rejected by
 * the server with a 400 rather than silently evaluating to zero, so the author
 * needs the identifiers in front of them.
 */
export function KpiCalculationPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const { indicators } = useIndicators()
  const { variables } = useFormulaVariables()
  const [indicatorId, setIndicatorId] = useState('')
  const { rows, loading } = useIndicatorCalculation(indicatorId ? Number(indicatorId) : null)
  const { save } = useCalculationMutations()

  const [target, setTarget] = useState<string>('F')
  const [method, setMethod] = useState<string>('M')
  const [formula, setFormula] = useState('')

  const current = rows.find((r) => r.target === target)

  useEffect(() => {
    setMethod(current?.method ?? 'M')
    setFormula(current?.formula ?? '')
  }, [current?.id, current?.method, current?.formula, target])

  const submit = async () => {
    if (!indicatorId) return
    try {
      await save.mutateAsync({
        indicatorId: Number(indicatorId),
        body: { target, method, formula: method === 'F' ? formula.trim() || null : null },
      })
      toast.ok(t('kpi.calcSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.calcFailed')))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Combobox
          value={indicatorId}
          onChange={setIndicatorId}
          options={indicators.map((i) => ({ value: String(i.id), label: i.name ?? `#${i.id}` }))}
          placeholder={t('kpi.calcPickIndicator')}
          className="w-96 max-w-full"
        />
        <div className="flex gap-1.5">
          {TARGETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTarget(v)}
              aria-pressed={target === v}
              className={tabPill(target === v)}
            >
              {t(v === 'P' ? 'kpi.calcTargetPlan' : 'kpi.calcTargetFact')}
            </button>
          ))}
        </div>
      </div>

      {!indicatorId ? (
        <EmptyState icon={<Calculator size={20} />} title={t('kpi.calcPickIndicator')} />
      ) : loading ? (
        <CenteredSpinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-4 rounded-inner border border-line p-4">
            <Field label={t('kpi.calcMethod')}>
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                options={METHODS.map((m) => ({
                  value: m,
                  label: t(`kpi.calcMethod_${m}` as never),
                }))}
              />
            </Field>

            {method === 'F' && (
              <Field label={t('kpi.calcFormula')} hint={t('kpi.calcFormulaHint')}>
                <Textarea
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  rows={3}
                  className="font-mono text-[13px]"
                  placeholder="(A1 + A2) / 2"
                />
              </Field>
            )}

            <div className="flex justify-end">
              <Button onClick={submit} loading={save.isPending} leftIcon={<Save size={15} />}>
                {t('common.save')}
              </Button>
            </div>

            {!current && (
              <p className="text-xs text-fg-subtle">{t('kpi.calcEmpty')}</p>
            )}
          </div>

          <div className="rounded-inner border border-line">
            <p className="engrave border-b border-line px-3 py-2.5 text-fg">
              {t('kpi.calcVariables')}
            </p>
            <ul className="scroll-thin max-h-[360px] divide-y divide-line overflow-y-auto">
              {variables.map((v) => (
                <li key={v.id} className="px-3 py-2">
                  <code className="text-[12px] font-semibold text-brand-strong">
                    {v.identifier}
                  </code>
                  <span className="block truncate text-[11px] text-fg-muted">
                    {v.name ?? v.short_name ?? '—'}
                    {v.measure ? ` · ${v.measure}` : ''}
                  </span>
                </li>
              ))}
              {variables.length === 0 && (
                <li className="px-3 py-3 text-xs text-fg-subtle">{t('kpi.calcEmpty')}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
