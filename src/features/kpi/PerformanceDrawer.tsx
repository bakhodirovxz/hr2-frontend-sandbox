import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Layers, Pencil, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react'
import { apiGet } from '@/api/http'
import { KPI_PERFORMANCES } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button, Combobox, EmptyState, Field, Input, Modal, Select, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useConfirm } from '@/components/data/useConfirm'
import { useKpiEntries } from './useKpiAdmin'
import { useKpiOps } from './useKpiOps'
import { BonusesPanel } from './BonusesPanel'

interface Argument {
  id: number
  source_type?: string | null
  source_entry_id?: number | null
  weight?: number | null
  calc_type?: string | null
  operation?: string | null
  sort_order?: number | null
  /** Bosqichli hisob (`calc_type: 'G'`) diapazonlari. */
  gradation_rules?: { from_percent?: number; to_percent?: number; result_percent?: number }[] | null
  source_entry?: {
    id?: number
    indicator?: { name?: string | null } | null
    plan_value?: number | null
    fact_value?: number | null
    result_percent?: number | null
    status?: string | null
  } | null
}

/** Entry lifecycle labels (the results tab keeps the same map). */
const ENTRY_STATUS_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}

interface PerformanceDetail {
  id: number
  employee?: { legal_name?: string | null } | null
  /** Source sheet's left card (the API has always sent it; nothing read it). */
  employee_profile?: {
    legal_name?: string | null
    photo_thumb_path?: string | null
    job_position_name?: string | null
    department_name?: string | null
    supervisor_name?: string | null
  } | null
  weights_sum?: number | null
  department_name?: string | null
  interval?: { name?: string | null; begin_date?: string | null; end_date?: string | null } | null
  status?: string | null
  result_percent?: number | null
  arguments?: Argument[]
}

/**
 * BAHOLASH VARAQASI — the arguments a scorecard result is assembled from.
 *
 * A scorecard is not a number someone types: it is a weighted combination of
 * KPI entries. This drawer is where that combination is built, and the three
 * buttons at the top are the operations that make it real — pull what the
 * engine can read by itself, recompute, then move the sheet along its status
 * chain. Without them the sheets tab could list scorecards but never finish one.
 */
export function PerformanceDrawer({
  performanceId,
  onClose,
  onOpenEntry,
}: {
  performanceId: number | null
  onClose: () => void
  /** Source `kpi_edit` on the sheet grid: open the KPI record behind a row. */
  onOpenEntry?: (entryId: number) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useKpiOps()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [entryId, setEntryId] = useState('')
  const [weight, setWeight] = useState('1')
  const [calcType, setCalcType] = useState('D')
  const [operation, setOperation] = useState('A')
  /** Gradatsiya oynasi ochilgan argument. */
  const [grading, setGrading] = useState<Argument | null>(null)

  const q = useQuery({
    queryKey: ['kpi', 'performance', performanceId],
    queryFn: () => apiGet<PerformanceDetail>(`${KPI_PERFORMANCES}/${performanceId}`),
    enabled: !!performanceId,
    retry: false,
  })
  const perf = q.data ?? null
  const args = perf?.arguments ?? []

  // The picker offers entries; a scorecard argument is normally one KPI entry.
  // ⚠️ fastapi-pagination caps `size` at 100 — 200 comes back as a 422.
  const { entries } = useKpiEntries({ page: 1, size: 100 })

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.ok(ok)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.roleFailed')))
    }
  }

  return (
    <Modal
      open={!!performanceId}
      onClose={onClose}
      size="lg"
      title={t('kpi.argumentsTitle')}
      description={perf?.employee?.legal_name ?? undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {q.isLoading ? (
        <CenteredSpinner />
      ) : q.isError || !perf ? (
        <EmptyState icon={<Layers size={20} />} title={t('kpi.rolesDenied')} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Source sheet's left card: who, where, whose team, which period. */}
          <div className="flex items-center gap-3 rounded-inner bg-surface-2 px-3 py-2.5">
            <Avatar
              src={perf.employee_profile?.photo_thumb_path}
              name={perf.employee_profile?.legal_name ?? perf.employee?.legal_name}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">
                {perf.employee_profile?.legal_name ?? perf.employee?.legal_name ?? '—'}
              </p>
              <p className="truncate text-[11px] text-fg-subtle">
                {[perf.employee_profile?.job_position_name, perf.employee_profile?.department_name ?? perf.department_name]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </div>
            <dl className="hidden shrink-0 gap-x-4 gap-y-0.5 text-[11px] sm:grid sm:grid-cols-[auto_auto]">
              <dt className="text-fg-subtle">{t('kpi.colInterval')}</dt>
              <dd className="text-fg">{perf.interval?.name ?? '—'}</dd>
              <dt className="text-fg-subtle">{t('kpi.sheetSupervisor')}</dt>
              <dd className="truncate text-fg">{perf.employee_profile?.supervisor_name ?? '—'}</dd>
              <dt className="text-fg-subtle">{t('kpi.sheetWeightsSum')}</dt>
              <dd className="tabnum text-fg">{perf.weights_sum ?? '—'}</dd>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabnum text-[15px] font-semibold text-fg">
              {perf.result_percent == null ? '—' : `${Math.round(Number(perf.result_percent))}%`}
            </span>
            <Button
              size="sm"
              variant="outline"
              loading={ops.fillArguments.isPending}
              leftIcon={<Wand2 size={14} />}
              onClick={async () => {
                const ok = await confirm({
                  kind: 'action',
                  subject: perf.employee?.legal_name,
                  confirmLabel: t('kpi.fillArguments'),
                })
                if (ok) await run(() => ops.fillArguments.mutateAsync(perf.id), t('kpi.argumentsFilled'))
              }}
            >
              {t('kpi.fillArguments')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={ops.recomputePerformance.isPending}
              leftIcon={<RefreshCw size={14} />}
              onClick={async () => {
                const ok = await confirm({
                  kind: 'action',
                  subject: perf.employee?.legal_name,
                  confirmLabel: t('kpi.recompute'),
                })
                if (ok) await run(() => ops.recomputePerformance.mutateAsync(perf.id), t('kpi.recomputed'))
              }}
            >
              {t('kpi.recompute')}
            </Button>
            <Select
              value={perf.status ?? ''}
              onChange={async (e) => {
                const status = e.target.value
                if (!(await confirm({ kind: 'status', subject: perf.employee?.legal_name }))) return
                await run(
                  () =>
                    ops.setPerformanceStatus.mutateAsync({
                      id: perf.id,
                      current: perf.status,
                      status,
                    }),
                  t('kpi.statusChanged'),
                )
              }}
              options={[
                { value: 'N', label: t('kpi.statusN') },
                { value: 'I', label: t('kpi.statusI') },
                { value: 'D', label: t('kpi.statusD') },
              ]}
              aria-label={t('kpi.changeStatus')}
              wrapperClassName="w-40"
            />
          </div>

          <p className="text-xs text-fg-muted">{t('kpi.argumentsHint')}</p>

          {args.length === 0 ? (
            <EmptyState title={t('kpi.argumentsEmpty')} />
          ) : (
            <ul className="divide-y divide-line rounded-inner border border-line">
              {args.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[13px] text-fg"
                      title={a.source_entry?.indicator?.name ?? undefined}
                    >
                      {a.source_entry?.indicator?.name ??
                        // The KPI row behind the argument was deleted (FK SET
                        // NULL) — «#27» told the reader nothing.
                        (a.source_entry_id == null ? t('kpi.argumentSourceDeleted') : `#${a.source_entry_id}`)}
                    </span>
                    {/* Source sheet grid: plan / fact / result / status of the
                        KPI row behind the argument, so the sheet reads without
                        opening every entry. */}
                    {a.source_entry && (
                      <span className="block truncate text-[11px] tabular-nums text-fg-subtle">
                        {t('kpi.summaryPlan')} {a.source_entry.plan_value ?? 0} · {t('kpi.summaryFact')}{' '}
                        {a.source_entry.fact_value ?? 0} · {Math.round(Number(a.source_entry.result_percent ?? 0))}% ·{' '}
                        {t((ENTRY_STATUS_KEY[a.source_entry.status ?? 'draft'] ?? 'kpi.statusDraft') as never)}
                      </span>
                    )}
                  </span>
                  {/* Vazn, tur va amal TAHRIRLANADI. `updateArgument` yozilgan
                      edi, hech kim chaqirmasdi — ya'ni argumentni faqat
                      qo'shish va o'chirish mumkin edi, og'irligini o'zgartirish
                      esa yo'q. The controls sit on their own line: with the
                      record's status and «edit» added, one line squeezed the
                      indicator name to «M…». */}
                  <span className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={String(a.weight ?? 1)}
                    aria-label={t('kpi.argumentWeight')}
                    className="h-8 w-20 tabular-nums"
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isFinite(v) || v === (a.weight ?? 1)) return
                      void run(
                        () => ops.updateArgument.mutateAsync({ id: a.id, body: { weight: v } }),
                        t('kpi.saved'),
                      )
                    }}
                  />
                  <Select
                    value={a.operation ?? 'A'}
                    aria-label={t('kpi.argumentOperation')}
                    wrapperClassName="w-32 shrink-0"
                    className="h-8"
                    onChange={(e) =>
                      run(
                        () => ops.updateArgument.mutateAsync({ id: a.id, body: { operation: e.target.value } }),
                        t('kpi.saved'),
                      )
                    }
                    options={[
                      { value: 'A', label: t('kpi.argumentOpAdd') },
                      { value: 'S', label: t('kpi.argumentOpSub') },
                    ]}
                  />
                  {/* Source sheet grid: the KPI record's own status is set
                      here (kpi_set_done / kpi_clear_*), and «edit» opens it. */}
                  {a.source_entry?.id != null && (
                    <Select
                      value={(a.source_entry.status ?? 'N').toUpperCase() === 'LOCKED' ? 'D' : (a.source_entry.status ?? 'N')}
                      aria-label={t('kpi.changeStatus')}
                      wrapperClassName="w-32 shrink-0"
                      className="h-8"
                      onChange={async (e) => {
                        const status = e.target.value
                        if (!(await confirm({ kind: 'status', subject: a.source_entry?.indicator?.name }))) return
                        await run(
                          () =>
                            ops.setEntryStatus.mutateAsync({
                              id: a.source_entry!.id as number,
                              current: a.source_entry?.status,
                              status,
                            }),
                          t('kpi.statusChanged'),
                        )
                      }}
                      options={[
                        { value: 'N', label: t('kpi.statusN') },
                        { value: 'I', label: t('kpi.statusI') },
                        { value: 'D', label: t('kpi.statusD') },
                      ]}
                    />
                  )}
                  {onOpenEntry && a.source_entry?.id != null && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('common.edit')}
                      onClick={() => onOpenEntry(a.source_entry!.id as number)}
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                  <Select
                    value={a.calc_type ?? 'D'}
                    aria-label={t('kpi.argumentCalc')}
                    wrapperClassName="w-36 shrink-0"
                    className="h-8"
                    onChange={(e) =>
                      run(
                        () => ops.updateArgument.mutateAsync({ id: a.id, body: { calc_type: e.target.value } }),
                        t('kpi.saved'),
                      )
                    }
                    options={[
                      { value: 'D', label: t('kpi.argumentCalcDirect') },
                      { value: 'G', label: t('kpi.argumentCalcGradation') },
                    ]}
                  />
                  {a.calc_type === 'G' && (
                    <Button size="sm" variant="outline" onClick={() => setGrading(a)}>
                      {t('kpi.gradation')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'delete', subject: a.source_entry?.indicator?.name }))) return
                      await run(() => ops.removeArgument.mutateAsync(a.id), t('kpi.argumentRemoved'))
                    }}
                  >
                    <Trash2 size={13} className="text-danger" />
                  </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {adding ? (
            <div className="flex flex-wrap items-end gap-2 rounded-inner border border-line p-3">
              <Field label={t('kpi.argumentSource')} className="min-w-[260px] flex-1">
                <Combobox
                  value={entryId}
                  onChange={setEntryId}
                  options={entries.map((e) => ({
                    value: String(e.id),
                    label: `${e.employee?.legal_name ?? ''} — ${e.indicator?.name ?? `#${e.id}`}`,
                  }))}
                  placeholder={t('t2.pick')}
                />
              </Field>
              <Field label={t('kpi.argumentWeight')} className="w-28">
                <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </Field>
              {/* Ikkisi ham serverda standartga tushardi, ya'ni AYIRUVCHI
                  (jazo) yoki BOSQICHLI argument yaratib bo'lmasdi. */}
              <Field label={t('kpi.argumentOperation')} className="w-36">
                <Select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  options={[
                    { value: 'A', label: t('kpi.argumentOpAdd') },
                    { value: 'S', label: t('kpi.argumentOpSub') },
                  ]}
                />
              </Field>
              <Field label={t('kpi.argumentCalc')} className="w-40">
                <Select
                  value={calcType}
                  onChange={(e) => setCalcType(e.target.value)}
                  options={[
                    { value: 'D', label: t('kpi.argumentCalcDirect') },
                    { value: 'G', label: t('kpi.argumentCalcGradation') },
                  ]}
                />
              </Field>
              <Button
                loading={ops.addArgument.isPending}
                disabled={!entryId}
                onClick={async () => {
                  await run(
                    () =>
                      ops.addArgument.mutateAsync({
                        id: perf.id,
                        body: {
                          source_type: 'K',
                          source_entry_id: Number(entryId),
                          weight: Number(weight) || 1,
                          calc_type: calcType,
                          operation: operation,
                        },
                      }),
                    t('kpi.roleSaved'),
                  )
                  setEntryId('')
                  setAdding(false)
                }}
              >
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              leftIcon={<Plus size={14} />}
              onClick={() => setAdding(true)}
            >
              {t('kpi.argumentAdd')}
            </Button>
          )}

          {/* Source `employee_performance` form: bonuses live ON the sheet
              (save_bonus / delete_bonuses) — v2 only had them on entries. */}
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-[11.5px] font-semibold text-fg-muted">{t('kpi.secBonuses')}</h3>
            <BonusesPanel objectType="performance" objectId={perf.id} canManage />
          </div>
        </div>
      )}

      <GradationModal
        argument={grading}
        onClose={() => setGrading(null)}
        onSaved={() => {
          setGrading(null)
          toast.ok(t('kpi.saved'))
        }}
      />
    </Modal>
  )
}

/**
 * BOSQICHLI HISOB (`calc_type: 'G'`) — "80–90% bajarilsa natija 100%".
 *
 * `KpiArgumentUpdate.gradation_rules` berilsa mavjud qoidalar TO'LIQ
 * almashtiriladi, shu bois oyna doim to'liq ro'yxatni yuboradi. v2 da bu
 * ekran umuman yo'q edi — argumentni 'G' ga o'tkazish mumkin bo'lsa ham,
 * diapazonlarini kiritib bo'lmasdi, ya'ni u har doim bo'sh ishlardi.
 */
function GradationModal({
  argument,
  onClose,
  onSaved,
}: {
  argument: Argument | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const ops = useKpiOps()
  const [rows, setRows] = useState<{ from: string; to: string; result: string }[]>([])

  useEffect(() => {
    if (!argument) return
    setRows(
      (argument.gradation_rules ?? []).map((r) => ({
        from: String(r.from_percent ?? 0),
        to: String(r.to_percent ?? 0),
        result: String(r.result_percent ?? 0),
      })),
    )
  }, [argument])

  const save = async () => {
    if (!argument) return
    await ops.updateArgument.mutateAsync({
      id: argument.id,
      body: {
        gradation_rules: rows.map((r) => ({
          from_percent: Number(r.from) || 0,
          to_percent: Number(r.to) || 0,
          result_percent: Number(r.result) || 0,
        })),
      },
    })
    onSaved()
  }

  return (
    <Modal
      open={!!argument}
      onClose={onClose}
      title={t('kpi.gradation')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={ops.updateArgument.isPending}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-fg-muted">{t('kpi.gradationHint')}</p>
        {rows.length === 0 && <EmptyState title={t('kpi.gradationEmpty')} />}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            <Field label={i === 0 ? t('kpi.gradationFrom') : undefined}>
              <Input
                type="number"
                value={r.from}
                onChange={(e) =>
                  setRows((prev) => prev.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))
                }
              />
            </Field>
            <Field label={i === 0 ? t('kpi.gradationTo') : undefined}>
              <Input
                type="number"
                value={r.to}
                onChange={(e) =>
                  setRows((prev) => prev.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))
                }
              />
            </Field>
            <Field label={i === 0 ? t('kpi.gradationResult') : undefined}>
              <Input
                type="number"
                value={r.result}
                onChange={(e) =>
                  setRows((prev) => prev.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))
                }
              />
            </Field>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('common.delete')}
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} className="text-danger" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          leftIcon={<Plus size={14} />}
          onClick={() => setRows((prev) => [...prev, { from: '0', to: '0', result: '0' }])}
        >
          {t('kpi.gradationAdd')}
        </Button>
      </div>
    </Modal>
  )
}
