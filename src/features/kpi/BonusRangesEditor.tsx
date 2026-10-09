import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useConfirm } from '@/components/data/useConfirm'
import { useBonusRangeMutations } from './useKpiBonusRanges'
import type { KpiIndicator } from './useKpi'

/**
 * AN INDICATOR'S BONUS SCALE — "reach a fact in this band, earn this much".
 *
 * ⚠️ THE ROUTES EXISTED, THE ROWS WERE ALREADY BEING SENT, AND NOTHING SHOWED
 * THEM. `POST/DELETE /kpi/bonus-ranges` have been there since the KPI engine
 * was written and had zero callers in either frontend, while
 * `KpiIndicatorRead.bonus_ranges` came down on every indicator and was
 * dropped on the floor. A scale could therefore be seeded into the database
 * and then never inspected or corrected from the app.
 *
 * Rows are add/remove only, deliberately: that is exactly what the server
 * offers (there is no PATCH), and editing a band in place would have to be
 * faked as delete-then-create — which silently changes the row's id and would
 * lose the band if the second call failed.
 */
export function BonusRangesEditor({ indicator }: { indicator: KpiIndicator }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useBonusRangeMutations()
  const confirm = useConfirm()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const rows = indicator.bonus_ranges ?? []

  const add = async () => {
    if (!indicator.id) return
    const f = Number(from)
    const tt = Number(to)
    const v = Number(value)
    if (!from.trim() || !to.trim() || !value.trim() || [f, tt, v].some(Number.isNaN)) {
      return setError(t('kpi.bonusRangeIncomplete'))
    }
    if (f > tt) return setError(t('kpi.bonusRangeOrder'))
    setError('')
    try {
      await mut.create.mutateAsync({ indicator_id: indicator.id, from_value: f, to_value: tt, value: v })
      setFrom('')
      setTo('')
      setValue('')
      toast.ok(t('kpi.bonusRangeAdded'))
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <div className="rounded-inner border border-line p-3">
      <p className="mb-2 text-[13px] font-medium text-fg">{t('kpi.bonusRanges')}</p>
      <p className="mb-2.5 text-[12px] text-fg-muted">{t('kpi.bonusRangesHint')}</p>

      {rows.length > 0 && (
        <ul className="mb-2.5 divide-y divide-line">
          {rows.map((r, idx) => (
            <li key={r.id ?? idx} className="flex items-center gap-2 py-1.5 text-[13px]">
              <span className="flex-1 tabular-nums text-fg">
                {r.from_value ?? 0} — {r.to_value ?? 0}
              </span>
              <span className="tabular-nums font-medium text-brand-strong">{r.value ?? 0}</span>
              {r.id != null && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-danger"
                  aria-label={t('common.delete')}
                  loading={mut.remove.isPending}
                  onClick={async () => {
                    if (!(await confirm({ kind: 'delete', subject: `${r.from_value ?? 0} — ${r.to_value ?? 0}` }))) return
                    try {
                      await mut.remove.mutateAsync(r.id as number)
                      toast.ok(t('kpi.bonusRangeRemoved'))
                    } catch (e) {
                      toast.error(errorMessage(e, t('common.actionFailed')))
                    }
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={t('kpi.bonusFrom')}
          inputMode="decimal"
          className="w-24"
        />
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t('kpi.bonusTo')}
          inputMode="decimal"
          className="w-24"
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('kpi.bonusValue')}
          inputMode="decimal"
          className="w-24"
        />
        <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} loading={mut.create.isPending} onClick={add}>
          {t('kpi.bonusRangeAdd')}
        </Button>
      </div>

      <FormError className="mt-2 text-[12px] text-[12px]">{error}</FormError>
    </div>
  )
}
