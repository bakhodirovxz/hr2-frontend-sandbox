import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, History, RefreshCw } from 'lucide-react'
import { inTashkent } from '@/lib/format'
import { Button, EmptyState, Input, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { TD, TH } from '@/components/data/tableStyles'
import { useEntryCalcTrail, useEntryHistory, useKpiOps, type CalcTrailRow } from './useKpiOps'

/**
 * HISOBLASH IZI — why this KPI figure is what it is.
 *
 * The engine computes a result from named arguments (attendance days, closed
 * tasks, penalties…). Without this panel the number is an assertion; with it,
 * every input is visible and the ones the engine cannot read by itself are
 * editable in place. A KPI nobody can audit is a KPI nobody accepts — which is
 * exactly the complaint the Verifix parity round was opened to fix.
 */
export function EntryTrailPanel({
  entryId,
  canEdit,
}: {
  entryId: number
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { rows, loading, denied } = useEntryCalcTrail(entryId)
  const ops = useKpiOps()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const saveExternal = async (row: CalcTrailRow) => {
    // `value` is a required float server-side: refuse an empty box here rather
    // than send null and get an opaque 422 back.
    const n = Number(draft.replace(',', '.'))
    if (draft.trim() === '' || Number.isNaN(n)) {
      toast.error(t('kpi.trailValueRequired'))
      return
    }
    try {
      await ops.setExternalValue.mutateAsync({
        id: entryId,
        identifier: row.identifier ?? '',
        target: row.target,
        value: n,
      })
      toast.ok(t('kpi.trailSaved'))
      setEditing(null)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.trailSaveFailed')))
    }
  }

  const recompute = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('kpi.recompute') }))) return
    try {
      await ops.recomputeEntry.mutateAsync(entryId)
      toast.ok(t('kpi.recomputed'))
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.recomputeFailed')))
    }
  }

  if (loading) return <CenteredSpinner />
  if (denied)
    return <EmptyState icon={<Calculator size={20} />} title={t('kpi.trailDenied')} />

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs text-fg-muted">{t('kpi.trailHint')}</p>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          loading={ops.recomputeEntry.isPending}
          onClick={recompute}
          leftIcon={<RefreshCw size={14} />}
        >
          {t('kpi.recompute')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('kpi.trailEmpty')} description={t('kpi.trailEmptyHint')} />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>{t('kpi.trailVariable')}</th>
                <th className={TH}>{t('kpi.trailSource')}</th>
                <th className={`${TH} text-right`}>{t('kpi.trailValue')}</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const code = `${r.target ?? ''}:${r.identifier ?? i}`
                const isEditing = editing === code
                /* An argument the engine reads by itself carries a `measure`
                   (the source it was read from). One without a measure is the
                   external kind — the only kind a human may fill in. */
                const external = !r.measure
                return (
                  <tr key={code} className="border-b border-line last:border-0">
                    <td className={TD}>
                      <span className="font-medium text-fg">{r.name || r.identifier || '—'}</span>
                      {r.identifier && r.name && (
                        <span className="block text-xs text-fg-subtle">{r.identifier}</span>
                      )}
                    </td>
                    <td className={`${TD} text-fg-muted`}>
                      {external ? t('kpi.trailExternal') : r.measure}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {isEditing ? (
                        <Input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          type="number"
                          autoFocus
                          wrapperClassName="w-28 ml-auto"
                        />
                      ) : (
                        <span className="font-semibold text-fg">{r.value ?? '—'}</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      {canEdit && external && (
                        isEditing ? (
                          <span className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              loading={ops.setExternalValue.isPending}
                              onClick={() => saveExternal(r)}
                            >
                              {t('common.save')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              {t('common.cancel')}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(code)
                              setDraft(r.value == null ? '' : String(r.value))
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Who changed what on this entry, and when. The official trail. */
export function EntryHistoryPanel({ entryId }: { entryId: number }) {
  const { t } = useTranslation()
  const { rows, loading, denied } = useEntryHistory(entryId)

  if (loading) return <CenteredSpinner />
  if (denied) return <EmptyState icon={<History size={20} />} title={t('kpi.historyDenied')} />
  if (!rows.length) return <EmptyState title={t('kpi.historyEmpty')} />

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-baseline gap-x-2 rounded-inner bg-surface-2 px-3 py-2 text-xs text-fg-muted"
        >
          <span className="font-semibold text-fg">
            {r.event ? (t(`kpi.event_${r.event}` as never, { defaultValue: r.event }) as string) : '—'}
          </span>
          {/* The trail stores a SNAPSHOT per row, not a before/after pair:
              reading it as `old_value → new_value` (fields the API never sent)
              printed «— → —» on every single line. */}
          {(r.plan_value != null || r.fact_value != null) && (
            <span className="tabnum">
              {t('kpi.colPlan')} {r.plan_value ?? '—'} · {t('kpi.colFact')} {r.fact_value ?? '—'}
              {r.result_percent != null ? ` · ${Math.round(r.result_percent)}%` : ''}
            </span>
          )}
          {r.status && (
            <span className="rounded-tag bg-surface px-1.5 py-0.5">
              {t(`kpi.status${r.status === 'draft' ? 'Draft' : r.status === 'locked' ? 'Locked' : r.status}` as never, { defaultValue: r.status }) as string}
            </span>
          )}
          {r.note && <span className="italic">«{r.note}»</span>}
          <span className="ml-auto whitespace-nowrap text-fg-subtle">
            {r.changed_by_name ?? '—'}
            {r.created_at ? ` · ${inTashkent(r.created_at).format('DD.MM.YYYY HH:mm')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
