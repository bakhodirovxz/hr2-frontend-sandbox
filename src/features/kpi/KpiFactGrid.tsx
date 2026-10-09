import { Fragment, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Lock, Save, ShieldAlert, Undo2 } from 'lucide-react'
import { apiGet, apiPost } from '@/api/http'
import { KPI_FACT_GRID, KPI_FACT_GRID_SAVE, KPI_FACT_GRID_SIGNALS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button, Card, EmptyState, useToast } from '@/components/ui'
import { Checkbox } from '@/components/ui/Checkbox'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { SearchInput } from '@/components/data/SearchInput'
import { TD_COMPACT, TH } from '@/components/data/tableStyles'
import { cn } from '@/lib/cn'

interface GridIndicator {
  id: number
  name: string
  group_name?: string | null
  direction: 'M' | 'L' | string
  max_percent?: number | null
  fact_source: string
  editable: boolean
}

interface GridCell {
  entry_id: number
  plan: number
  fact: number
  status: string
  locked: boolean
}

interface GridRow {
  employee_id: number
  name: string
  job?: string | null
  division: string
  cells: Record<string, GridCell>
  total: number
}

interface GridData {
  month: string
  branch_id: number
  indicators: GridIndicator[]
  rows: GridRow[]
  stats: { entries: number; with_fact: number; locked: number }
  can_edit_locked: boolean
}

interface Signals {
  late_days: number
  absent_days: number
  early_leave_days: number
  overdue_tasks: number
}

interface SaveResult {
  updated: number
  unchanged: number
  errors: { entry_id: number; code?: string | null; detail?: string | null }[]
}

/**
 * The month's KPI laid out like the report — division → employee rows, one
 * column per indicator — for typing the exceptions in place.
 *
 * Why a grid: in the client's Verifix only 6–51 of ~626 entries a month ever
 * carry a fact (the rewards and penalties), and the operator used to open an
 * entry per fact. Only `manual` indicators are editable; task/formula facts
 * are computed and frozen entries stay frozen (the server re-checks both and
 * answers per cell).
 */
export function KpiFactGrid({ month, branchId, onSaved }: { month: string; branchId?: number | null; onSaved?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [cellErrors, setCellErrors] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [onlyWithFact, setOnlyWithFact] = useState(false)
  const [showSignals, setShowSignals] = useState(false)
  const [saving, setSaving] = useState(false)

  const params = { month, ...(branchId ? { organization_branch_id: branchId } : {}) }
  const q = useQuery({
    queryKey: ['kpi', 'fact-grid', month, branchId ?? null],
    queryFn: () => apiGet<GridData>(KPI_FACT_GRID, params),
  })
  const sig = useQuery({
    queryKey: ['kpi', 'fact-grid-signals', month, branchId ?? null],
    queryFn: () => apiGet<{ employees: Record<string, Signals> }>(KPI_FACT_GRID_SIGNALS, params),
    enabled: showSignals,
    staleTime: 5 * 60_000,
  })

  const data = q.data
  const indicators = data?.indicators ?? []
  const canEditLocked = !!data?.can_edit_locked

  const valueOf = (cell: GridCell) => {
    const d = drafts[cell.entry_id]
    if (d === undefined || d.trim() === '') return d === undefined ? cell.fact : 0
    const n = Number(d)
    return Number.isFinite(n) ? n : cell.fact
  }

  const rowTotal = (row: GridRow) => {
    let s = 0
    for (const ind of indicators) {
      const c = row.cells[String(ind.id)]
      if (!c) continue
      const v = valueOf(c)
      s += ind.direction === 'L' ? -v : v
    }
    return Math.max(s, 0)
  }

  const sections = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const out: { division: string; rows: GridRow[] }[] = []
    for (const r of data?.rows ?? []) {
      if (needle && !(r.name || '').toLowerCase().includes(needle)) continue
      if (onlyWithFact && !Object.values(r.cells).some((c) => c.fact !== 0 || drafts[c.entry_id] !== undefined)) continue
      const last = out[out.length - 1]
      if (last && last.division === r.division) last.rows.push(r)
      else out.push({ division: r.division, rows: [r] })
    }
    return out
  }, [data, search, onlyWithFact, drafts])

  const changed = useMemo(() => {
    const byId = new Map<number, GridCell>()
    for (const r of data?.rows ?? []) for (const c of Object.values(r.cells)) byId.set(c.entry_id, c)
    return Object.entries(drafts)
      .map(([id, v]) => ({ id: Number(id), v, cell: byId.get(Number(id)) }))
      .filter(({ v, cell }) => {
        if (!cell) return false
        const n = v.trim() === '' ? 0 : Number(v)
        return Number.isFinite(n) && n !== cell.fact
      })
  }, [drafts, data])

  const save = async () => {
    if (changed.length === 0) return
    setSaving(true)
    try {
      const res = await apiPost<SaveResult>(KPI_FACT_GRID_SAVE, {
        cells: changed.map(({ id, v }) => ({ entry_id: id, fact_value: v.trim() === '' ? 0 : Number(v) })),
      })
      const errs: Record<number, string> = {}
      for (const e of res.errors) errs[e.entry_id] = e.detail || e.code || ''
      setCellErrors(errs)
      // Keep only the refused cells as drafts so the operator sees what did not go through.
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => errs[Number(id)] !== undefined)))
      if (res.errors.length) toast.error(t('kpi.monthClose.savedWithErrors', { count: res.updated, errors: res.errors.length }))
      else toast.ok(t('kpi.monthClose.saved', { count: res.updated }))
      await qc.invalidateQueries({ queryKey: ['kpi', 'fact-grid', month] })
      onSaved?.()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setSaving(false)
    }
  }

  if (q.isLoading) return <CenteredSpinner />
  if (q.isError) {
    return (
      <Card className="p-6 text-sm text-danger">
        {errorMessage(q.error, t('common.actionFailed'))}
      </Card>
    )
  }
  if (!data || data.rows.length === 0) {
    return <EmptyState title={t('kpi.monthClose.gridEmpty')} />
  }

  const ncols = 3 + indicators.length
  let n = 0
  // A group name shared by several columns (the client's «Maqsadli
  // ko'rsatkichlar…» group holds nine targets) tells the columns apart by
  // nothing, so those columns show the indicator's own name instead.
  const groupCount = new Map<string, number>()
  for (const i of indicators) if (i.group_name) groupCount.set(i.group_name, (groupCount.get(i.group_name) ?? 0) + 1)
  const headerOf = (i: GridIndicator) =>
    i.group_name && groupCount.get(i.group_name) === 1 ? i.group_name : i.name

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-fg">{t('kpi.monthClose.gridTitle')}</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-fg-muted">{t('kpi.monthClose.gridHint')}</p>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder={t('kpi.monthClose.gridSearch')} className="w-56 max-w-full" />
        <Checkbox
          label={t('kpi.monthClose.onlyWithFact')}
          checked={onlyWithFact}
          onChange={(e) => setOnlyWithFact(e.target.checked)}
        />
        <Button
          size="sm"
          variant={showSignals ? 'secondary' : 'outline'}
          leftIcon={<ShieldAlert size={14} />}
          loading={showSignals && sig.isFetching}
          onClick={() => setShowSignals((v) => !v)}
          title={t('kpi.monthClose.signalsHint')}
        >
          {t('kpi.monthClose.signalsShow')}
        </Button>
        {changed.length > 0 && (
          <Button size="sm" variant="ghost" leftIcon={<Undo2 size={14} />} onClick={() => { setDrafts({}); setCellErrors({}) }}>
            {t('kpi.monthClose.discard')}
          </Button>
        )}
        <Button size="sm" leftIcon={<Save size={14} />} disabled={changed.length === 0} loading={saving} onClick={save}>
          {t('kpi.monthClose.save', { count: changed.length })}
        </Button>
      </div>
      {showSignals && (
        <p className="border-b border-line bg-warning-soft/40 px-4 py-2 text-xs text-fg-muted">{t('kpi.monthClose.signalsHint')}</p>
      )}

      {/* Its own scroll box, as tall as the screen allows, so the indicator
          header stays on top and the name column on the left while 150 people
          × 14 indicators are filled in. With the page scrolling instead, the
          header left the screen after the first department and every cell
          became «which column was this?». */}
      <div className="scroll-thin max-h-[calc(100dvh-11rem)] overflow-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 360 + indicators.length * 112 }}>
          <thead className="sticky top-0 z-20 bg-surface-2 shadow-[0_1px_0_rgb(var(--border))]">
            <tr>
              <th className={cn(TH, 'sticky left-0 z-30 w-12 min-w-12 max-w-12 px-2 text-center bg-surface-2')}>№</th>
              <th className={cn(TH, 'sticky left-12 z-30 min-w-[220px] bg-surface-2 shadow-[1px_0_0_rgb(var(--border))]')}>{t('kpi.colEmployee')}</th>
              {indicators.map((ind) => (
                <th
                  key={ind.id}
                  title={ind.name}
                  className={cn(TH, 'min-w-[104px] text-center normal-case tracking-normal', ind.direction === 'L' && 'text-danger')}
                >
                  <span className="line-clamp-3">{headerOf(ind)}</span>
                  {!ind.editable && <span className="mt-0.5 block text-[10px] font-normal text-fg-subtle">{t('kpi.monthClose.computed')}</span>}
                </th>
              ))}
              <th className={cn(TH, 'text-right')}>{t('kpi.monthClose.total')}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.division}>
                <tr className="bg-fg/[0.03]">
                  {/* The department label rides along when the grid is scrolled
                      sideways — otherwise it scrolled out with column one. */}
                  <td colSpan={ncols} className="px-4 py-2 text-xs font-semibold text-fg-muted">
                    <span className="sticky left-4">{sec.division}</span>
                  </td>
                </tr>
                {sec.rows.map((row) => {
                  n += 1
                  const s = sig.data?.employees?.[String(row.employee_id)]
                  return (
                    <tr key={row.employee_id} className="border-t border-line">
                      <td className={cn(TD_COMPACT, 'sticky left-0 z-10 w-12 min-w-12 max-w-12 bg-surface px-2 text-center text-fg-subtle tabular-nums')}>{n}</td>
                      <td className={cn(TD_COMPACT, 'sticky left-12 z-10 bg-surface shadow-[1px_0_0_rgb(var(--border))]')}>
                        <div className="font-medium text-fg">{row.name}</div>
                        {row.job && <div className="text-xs text-fg-subtle">{row.job}</div>}
                      </td>
                      {indicators.map((ind) => {
                        const c = row.cells[String(ind.id)]
                        if (!c) return <td key={ind.id} className={cn(TD_COMPACT, 'text-center text-fg-subtle')}>—</td>
                        const frozen = c.locked && !canEditLocked
                        const editable = ind.editable && !frozen
                        const draft = drafts[c.entry_id]
                        const err = cellErrors[c.entry_id]
                        const isL = ind.direction === 'L'
                        const showSig = isL && showSignals && s && (s.late_days || s.absent_days || s.early_leave_days || s.overdue_tasks)
                        return (
                          <td key={ind.id} className={cn(TD_COMPACT, 'text-center align-top')}>
                            {editable ? (
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                aria-label={`${row.name} — ${headerOf(ind)}`}
                                title={err || ind.name}
                                value={draft ?? (c.fact ? String(c.fact) : '')}
                                placeholder="0"
                                onChange={(e) => setDrafts((d) => ({ ...d, [c.entry_id]: e.target.value }))}
                                className={cn(
                                  'h-8 w-20 rounded-[var(--r-xs)] border bg-surface px-2 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand/40',
                                  draft !== undefined ? 'border-brand bg-brand-soft/40' : 'border-line',
                                  isL && (draft ?? c.fact) && Number(draft ?? c.fact) !== 0 && 'text-danger',
                                  err && 'border-danger ring-1 ring-danger/40',
                                )}
                              />
                            ) : (
                              <span
                                className={cn('inline-flex items-center gap-1 tabular-nums text-fg-muted', isL && c.fact && 'text-danger')}
                                title={frozen ? t('kpi.monthClose.locked') : t('kpi.monthClose.computed')}
                              >
                                {frozen && <Lock size={11} />}
                                {c.fact ? (isL ? -c.fact : c.fact) : '·'}
                              </span>
                            )}
                            {showSig ? (
                              <div
                                className="mt-1 text-[10.5px] leading-tight text-warning"
                                title={`${t('kpi.monthClose.sigLate')}: ${s!.late_days} · ${t('kpi.monthClose.sigAbsent')}: ${s!.absent_days} · ${t('kpi.monthClose.sigEarly')}: ${s!.early_leave_days} · ${t('kpi.monthClose.sigOverdue')}: ${s!.overdue_tasks}`}
                              >
                                {[
                                  s!.late_days ? `${t('kpi.monthClose.sigLate')} ${s!.late_days}` : null,
                                  s!.absent_days ? `${t('kpi.monthClose.sigAbsent')} ${s!.absent_days}` : null,
                                  s!.early_leave_days ? `${t('kpi.monthClose.sigEarly')} ${s!.early_leave_days}` : null,
                                  s!.overdue_tasks ? `${t('kpi.monthClose.sigOverdue')} ${s!.overdue_tasks}` : null,
                                ].filter(Boolean).join(' · ')}
                              </div>
                            ) : null}
                          </td>
                        )
                      })}
                      <td className={cn(TD_COMPACT, 'text-right font-semibold tabular-nums text-fg')}>
                        {Math.round(rowTotal(row) * 100) / 100}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
