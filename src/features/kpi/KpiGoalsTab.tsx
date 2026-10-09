import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Copy, Pencil, Plus, Scale, Target, Trash2 } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  EmptyState,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { SearchInput } from '@/components/data/SearchInput'
import { TD, TH } from '@/components/data/tableStyles'
import { useListParams } from '@/hooks/useListParams'
import { cn } from '@/lib/cn'
import { formatUzShort } from '@/lib/format'
import { errorMessage } from '@/api/errorMessage'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useBranchStore } from '@/store/branchStore'
import { useIntervals, type KpiInterval } from './useKpiExtras'
import {
  useAllGoals,
  useGoalHierarchy,
  useKeyResultTypes,
  useOkrMutations,
  type KeyResult,
  type Objective,
} from './useKpiOkr'
import { ChildSettingsModal } from './ChildSettingsModal'
import { useKpiPermissions } from './useKpiPermissions'
import { goalStatusAction } from './useKpiOps'

/** Verifix HPM_GOALS lifecycle — NOT the entry status set. */
const GOAL_STATUSES = ['F', 'I', 'D', 'R'] as const

/** Goal kinds as the server spells them: personal / department. */
const GOAL_KINDS = ['P', 'D'] as const

/**
 * URL-held state of this tab. Prefixed `g*` on purpose: the Results tab on the
 * same page drives its own `useListParams` off `q`/`indicator`/`dept`/…, and a
 * shared key there would mean switching tabs silently carried one screen's
 * filter into the other's request.
 */
const FILTER_KEYS = ['gview', 'gint', 'gst', 'gkind', 'gdept', 'gowner', 'gq'] as const

/** Progress of one key result against its plan, clamped for the bar only. */
function pct(kr: KeyResult): number {
  const plan = Number(kr.plan ?? 0)
  const fact = Number(kr.fact ?? 0)
  if (!plan) return fact > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((fact / plan) * 100)))
}

/** Grade as a whole percent, or an em dash when the server has none yet. */
function gradePct(grade?: number | null): string {
  return grade == null ? '—' : `${Math.round(Number(grade))}%`
}

/**
 * MAQSADLAR (OKR) — the goal tree and the measurable results under it.
 *
 * TWO VIEWS, deliberately, exactly as web v1 (`pages/kpi/GoalsPanel.jsx`):
 *
 *   · IERARXIYA — the tree. A department objective parents the personal ones
 *     that carry it, and seeing a personal goal without the branch target above
 *     it is exactly how OKR turns into a to-do list.
 *   · BARCHA MAQSADLAR — the flat, filterable list (`GET /kpi/goals`). A tree
 *     cannot answer "every rejected department goal this period" without the
 *     reader expanding every node by hand, which is why Verifix ships both.
 *
 * Only the visible view fetches: the tree query is disabled while the flat list
 * is on screen and vice versa, so switching does not leave two lists of the
 * same goals racing each other into the cache.
 */
export function KpiGoalsTab({ canManage }: { canManage: boolean }) {
  // Grant-gated actions (status, copy) read the server matrix; CRUD keeps the
  // broader `_can_manage` gate the server uses for those. See the hook.
  const perms = useKpiPermissions()
  const canCopy = perms.can('goal_list', 'copy')
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { intervals } = useIntervals()
  const { filters, setFilter } = useListParams(FILTER_KEYS)

  const view = filters.gview === 'flat' ? 'flat' : 'tree'
  const intervalId = filters.gint

  const { rows, loading: treeLoading, denied: treeDenied } = useGoalHierarchy(
    intervalId,
    view === 'tree',
  )
  const {
    goals,
    loading: flatLoading,
    denied: flatDenied,
  } = useAllGoals(
    {
      intervalId,
      status: filters.gst,
      goalKind: filters.gkind,
      divisionId: filters.gdept,
      ownerId: filters.gowner,
      search: filters.gq,
    },
    view === 'flat',
  )

  const { types } = useKeyResultTypes()
  const departments = useDepartmentOptions()
  const { options: employees } = useEmployeeOptions(branchId, true)
  const mut = useOkrMutations()
  const confirm = useConfirm()

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [objModal, setObjModal] = useState<{ open: boolean; row: Objective | null; parentId?: number | null }>({
    open: false,
    row: null,
  })
  /* Which objective's child-rollup settings are open. */
  const [childSettings, setChildSettings] = useState<Objective | null>(null)
  const [krModal, setKrModal] = useState<{ open: boolean; objectiveId: number | null; row: KeyResult | null }>({
    open: false,
    objectiveId: null,
    row: null,
  })
  const [deleteObj, setDeleteObj] = useState<Objective | null>(null)
  const [deleteKr, setDeleteKr] = useState<KeyResult | null>(null)
  const [copyObj, setCopyObj] = useState<Objective | null>(null)

  const intervalOptions = intervals.map((i) => ({
    value: String(i.id),
    label: i.name ?? `#${i.id}`,
  }))

  /* The department list is a picker of {value,label}; the flat table needs the
     other direction (division_id → name), and the owner may arrive either
     nested on the row or only as an id. */
  const deptName = (id?: number | null) =>
    id == null ? '—' : (departments.find((d) => d.value === String(id))?.label ?? '—')
  const ownerName = (o: Objective) =>
    o.owner?.legal_name ??
    (o.owner_id == null
      ? '—'
      : (employees.find((e) => e.value === String(o.owner_id))?.label ?? '—'))

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    try {
      await fn()
      toast.ok(okText)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.okrFailed')))
    }
  }

  const loading = view === 'tree' ? treeLoading : flatLoading
  const denied = view === 'tree' ? treeDenied : flatDenied
  const empty = view === 'tree' ? rows.length === 0 : goals.length === 0

  /** Status cell — a live control for managers, plain text for everyone else. */
  const statusCell = (o: Objective) =>
    canManage && perms.can('goal_list') ? (
      <Select
        value={o.status ?? 'F'}
        onChange={async (e) => {
          const status = e.target.value
          if (!(await confirm({ kind: 'status', subject: o.title }))) return
          await run(
            () => mut.setObjectiveStatus.mutateAsync({ id: o.id, current: o.status, status }),
            t('kpi.okrSaved'),
          )
        }}
        options={GOAL_STATUSES.map((v) => ({
          value: v,
          label: t(`kpi.goalStatus_${v}` as never),
          // A transition whose grant is missing is offered greyed, not hidden:
          // the person sees the lifecycle but cannot pick what 403s.
          disabled: v !== (o.status ?? 'F') && !perms.can('goal_list', goalStatusAction(o.status, v)),
        }))}
        aria-label={t('kpi.changeStatus')}
        className="h-8 text-[12.5px]"
        wrapperClassName="w-36 shrink-0"
      />
    ) : (
      <span className="shrink-0 text-[11px] text-fg-subtle">
        {t(`kpi.goalStatus_${o.status ?? 'F'}` as never)}
      </span>
    )

  /** Edit / copy / delete, shared by both views — three icons with tooltips
   *  (a text «Tahrirlash» next to two bare icons read as a different kind of
   *  control). */
  const rowActions = (o: Objective) => (
    <span className="flex shrink-0 gap-0.5">
      <IconButton size="sm" label={t('common.edit')} onClick={() => setObjModal({ open: true, row: o })}>
        <Pencil size={15} />
      </IconButton>
      {canCopy && (
        <IconButton size="sm" label={t('kpi.okrCopy')} onClick={() => setCopyObj(o)}>
          <Copy size={15} />
        </IconButton>
      )}
      <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleteObj(o)}>
        <Trash2 size={15} className="text-danger" />
      </IconButton>
    </span>
  )

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Segmented
          value={view}
          onChange={(v) => setFilter('gview', v === 'flat' ? 'flat' : '')}
          size="sm"
          options={[
            { value: 'tree', label: t('kpi.okrViewTree') },
            { value: 'flat', label: t('kpi.okrViewFlat') },
          ]}
        />
        <Combobox
          value={intervalId}
          onChange={(v) => setFilter('gint', v)}
          options={intervalOptions}
          placeholder={t('kpi.okrAllIntervals')}
          className="w-56"
        />
        {/* Every filter below is sent to the server — the endpoint does the
            narrowing, so what the screen shows is what the API scoped. */}
        {view === 'flat' && (
          <>
            <SearchInput
              value={filters.gq}
              onChange={(v) => setFilter('gq', v)}
              placeholder={t('kpi.okrSearch')}
              className="w-56 max-w-full"
            />
            <Select
              wrapperClassName="w-36"
              value={filters.gst}
              onChange={(e) => setFilter('gst', e.target.value)}
              aria-label={t('kpi.filterStatus')}
              placeholder={t('kpi.filterStatus')}
              options={GOAL_STATUSES.map((v) => ({
                value: v,
                label: t(`kpi.goalStatus_${v}` as never),
              }))}
            />
            <Select
              wrapperClassName="w-36"
              value={filters.gkind}
              onChange={(e) => setFilter('gkind', e.target.value)}
              aria-label={t('kpi.okrKind')}
              placeholder={t('kpi.okrFilterKind')}
              options={GOAL_KINDS.map((v) => ({
                value: v,
                label: t(v === 'D' ? 'kpi.okrKindDept' : 'kpi.okrKindPersonal'),
              }))}
            />
            <Combobox
              className="w-44"
              value={filters.gdept}
              onChange={(v) => setFilter('gdept', v)}
              placeholder={t('kpi.filterDepartment')}
              options={departments}
            />
            <Combobox
              className="w-48"
              value={filters.gowner}
              onChange={(v) => setFilter('gowner', v)}
              placeholder={t('kpi.okrFilterOwner')}
              options={employees}
            />
          </>
        )}
        {canManage && (
          <Button
            size="sm"
            className="ml-auto"
            leftIcon={<Plus size={15} />}
            onClick={() => setObjModal({ open: true, row: null })}
          >
            {t('kpi.okrNewObjective')}
          </Button>
        )}
      </div>

      {loading ? (
        <CenteredSpinner />
      ) : denied ? (
        <EmptyState icon={<Target size={20} />} title={t('kpi.okrDenied')} />
      ) : empty ? (
        <EmptyState
          title={view === 'flat' ? t('kpi.okrFlatEmpty') : t('kpi.okrEmpty')}
          description={view === 'flat' ? t('kpi.okrFlatEmptyHint') : t('kpi.okrEmptyHint')}
        />
      ) : view === 'flat' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>{t('kpi.okrColGoal')}</th>
                <th className={TH}>{t('employees.colDepartment')}</th>
                <th className={TH}>{t('kpi.okrOwner')}</th>
                <th className={TH}>{t('kpi.okrColResult')}</th>
                <th className={TH}>{t('kpi.okrKind')}</th>
                <th className={TH}>{t('kpi.okrColLevel')}</th>
                <th className={TH}>{t('kpi.filterStatus')}</th>
                <th className={TH} aria-label={t('kpi.okrColActions')} />
              </tr>
            </thead>
            <tbody>
              {goals.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-fg/[0.02]">
                  <td className={cn(TD, 'font-medium text-fg')}>
                    <span className="block max-w-[320px] truncate">{o.title ?? '—'}</span>
                  </td>
                  <td className={cn(TD, 'text-fg-muted')}>{deptName(o.division_id)}</td>
                  <td className={cn(TD, 'text-fg-muted')}>
                    <span className="flex min-w-0 items-center gap-2">
                      {o.owner?.legal_name && <Avatar src={o.owner.photo_thumb_path} name={o.owner.legal_name} size={24} />}
                      <span className="truncate">{ownerName(o)}</span>
                    </span>
                  </td>
                  <td className={cn(TD, 'tabnum font-semibold text-fg')}>{gradePct(o.grade)}</td>
                  <td className={cn(TD, 'text-fg-muted')}>
                    {t(o.goal_kind === 'D' ? 'kpi.okrKindDept' : 'kpi.okrKindPersonal')}
                  </td>
                  <td className={cn(TD, 'text-fg-muted')}>
                    {t(o.parent_id ? 'kpi.okrLevelChild' : 'kpi.okrLevelRoot')}
                  </td>
                  <td className={TD}>{statusCell(o)}</td>
                  <td className={TD}>{canManage && rowActions(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ objective: o, depth }) => {
            const open = expanded.has(o.id)
            const krs = o.key_results ?? []
            return (
              <li key={o.id}>
                <div
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ paddingLeft: 16 + depth * 22 }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    aria-expanded={open}
                    // An objective saved without a title left this button
                    // nameless for screen readers (audit 2026-09-18).
                    aria-label={`${open ? t('kpi.okrCollapse') : t('kpi.okrExpand')}: ${o.title || t('kpi.okrUntitled')}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-tag text-fg-subtle transition-colors hover:bg-fg/[0.08] hover:text-fg"
                  >
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <span
                    className={cn(
                      'shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold',
                      o.goal_kind === 'D'
                        ? 'bg-brand/[0.14] text-brand-strong'
                        : 'bg-fg/[0.06] text-fg-muted',
                    )}
                  >
                    {t(o.goal_kind === 'D' ? 'kpi.okrKindDept' : 'kpi.okrKindPersonal')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">
                      {o.title ?? '—'}
                    </span>
                    {o.owner?.legal_name && (
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-subtle">
                        <Avatar src={o.owner.photo_thumb_path} name={o.owner.legal_name} size={18} />
                        <span className="truncate">{o.owner.legal_name}</span>
                      </span>
                    )}
                  </span>
                  <span className="tabnum shrink-0 text-[13px] font-semibold text-fg">
                    {gradePct(o.grade)}
                  </span>
                  {statusCell(o)}
                  {canManage && rowActions(o)}
                </div>

                {open && (
                  <div className="bg-fg/[0.02] px-4 pb-3" style={{ paddingLeft: 60 + depth * 22 }}>
                    {krs.length === 0 ? (
                      <p className="py-2 text-xs text-fg-subtle">{t('kpi.okrNoKeyResults')}</p>
                    ) : (
                      <ul className="flex flex-col gap-2 py-2">
                        {krs.map((kr) => (
                          <li key={kr.id} className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                              {kr.title ?? '—'}
                            </span>
                            <span className="h-1.5 w-32 shrink-0 overflow-hidden rounded-pill bg-fg/[0.08]">
                              <span
                                className="block h-full rounded-pill bg-brand"
                                style={{ width: `${pct(kr)}%` }}
                              />
                            </span>
                            <span className="tabnum w-24 shrink-0 text-right text-[12px] text-fg-muted">
                              {kr.fact ?? 0} / {kr.plan ?? 0}
                            </span>
                            {canManage && (
                              <>
                                {/* Kalit natijaning O'Z statusi. v2 da faqat
                                    maqsadniki bor edi, KR niki emas. */}
                                <Select
                                  value={kr.status ?? 'F'}
                                  onChange={async (e) => {
                                    const status = e.target.value
                                    if (!(await confirm({ kind: 'status', subject: kr.title }))) return
                                    await run(
                                      () =>
                                        mut.setKeyResultStatus.mutateAsync({
                                          id: kr.id,
                                          current: kr.status,
                                          status,
                                        }),
                                      t('kpi.okrSaved'),
                                    )
                                  }}
                                  options={GOAL_STATUSES.map((v) => ({
                                    value: v,
                                    label: t(`kpi.goalStatus_${v}` as never),
                                  }))}
                                  aria-label={t('kpi.changeStatus')}
                                  wrapperClassName="w-32 shrink-0"
                                  className="h-8"
                                />
                                <IconButton
                                  size="sm"
                                  label={t('common.edit')}
                                  onClick={() =>
                                    setKrModal({ open: true, objectiveId: o.id, row: kr })
                                  }
                                >
                                  <Pencil size={14} />
                                </IconButton>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={t('common.delete')}
                                  onClick={() => setDeleteKr(kr)}
                                >
                                  <Trash2 size={14} className="text-danger" />
                                </Button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canManage && (
                      <span className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Plus size={14} />}
                          onClick={() => setKrModal({ open: true, objectiveId: o.id, row: null })}
                        >
                          {t('kpi.okrNewKeyResult')}
                        </Button>
                        {/* Ichki maqsad — daraxtning keyingi qavati. */}
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Plus size={14} />}
                          onClick={() => setObjModal({ open: true, row: null, parentId: o.id })}
                        >
                          {t('kpi.okrNewChild')}
                        </Button>
                        {/* How this objective's grade is built from its
                            children — weight, gradation, penalty. The routes
                            existed from the start with no caller, so every
                            child rolled up on the server's defaults. */}
                        {(krs.length > 0 || goals.some((g) => g.parent_id === o.id)) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Scale size={14} />}
                            onClick={() => setChildSettings(o)}
                          >
                            {t('kpi.childSettingsAction')}
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ChildSettingsModal
        objective={childSettings}
        children={
          childSettings
            ? [
                ...goals
                  .filter((g) => g.parent_id === childSettings.id)
                  .map((g) => ({ kind: 'O' as const, id: g.id, title: g.title ?? `#${g.id}` })),
                ...(childSettings.key_results ?? []).map((kr) => ({
                  kind: 'K' as const,
                  id: kr.id,
                  title: kr.title ?? `#${kr.id}`,
                })),
              ]
            : []
        }
        onClose={() => setChildSettings(null)}
      />

      <ObjectiveModal
        state={objModal}
        onClose={() => setObjModal({ open: false, row: null })}
        intervalOptions={intervalOptions}
        departments={departments}
        employees={employees}
        objectives={goals}
      />
      <KeyResultModal
        state={krModal}
        onClose={() => setKrModal({ open: false, objectiveId: null, row: null })}
        types={types}
      />
      <CopyObjectiveModal
        row={copyObj}
        intervals={intervals}
        onClose={() => setCopyObj(null)}
        onCopy={async (intervalId, deep) => {
          if (!copyObj) return
          await run(
            () => mut.copyObjective.mutateAsync({ id: copyObj.id, intervalId, deep }),
            t('kpi.okrCopied'),
          )
          setCopyObj(null)
        }}
        loading={mut.copyObjective.isPending}
      />
      <ConfirmDialog
        open={!!deleteObj}
        onClose={() => setDeleteObj(null)}
        onConfirm={async () => {
          if (!deleteObj) return
          await run(() => mut.removeObjective.mutateAsync(deleteObj.id), t('kpi.okrDeleted'))
          setDeleteObj(null)
        }}
        title={t('kpi.okrDeleteTitle')}
        description={deleteObj?.title ?? ''}
        danger
        confirmLabel={t('common.delete')}
        loading={mut.removeObjective.isPending}
      />
      {/* Kalit natijani o'chirish — `removeKeyResult` yozilgan edi, hech kim
          chaqirmasdi, ya'ni KR ni yaratib va tahrirlab bo'lardi, o'chirib emas. */}
      <ConfirmDialog
        open={!!deleteKr}
        onClose={() => setDeleteKr(null)}
        onConfirm={async () => {
          if (!deleteKr) return
          await run(() => mut.removeKeyResult.mutateAsync(deleteKr.id), t('kpi.okrDeleted'))
          setDeleteKr(null)
        }}
        title={t('kpi.okrDeleteKrTitle')}
        description={deleteKr?.title ?? ''}
        danger
        confirmLabel={t('common.delete')}
        loading={mut.removeKeyResult.isPending}
      />
    </Card>
  )
}

/**
 * Source `goal_list.copyModal`: the copy asks WHERE it lands (an interval,
 * defaulting to the source one, with its dates shown) and whether the child
 * objectives go along («deep copy»). The one-click copy this replaced always
 * landed in the source interval, which is the least useful target — a goal is
 * usually copied to put it up again for the next period.
 */
function CopyObjectiveModal({
  row,
  intervals,
  onClose,
  onCopy,
  loading,
}: {
  row: Objective | null
  intervals: KpiInterval[]
  onClose: () => void
  onCopy: (intervalId: number, deep: boolean) => Promise<void>
  loading: boolean
}) {
  const { t } = useTranslation()
  const [intervalId, setIntervalId] = useState('')
  const [deep, setDeep] = useState(false)
  useEffect(() => {
    if (row) {
      setIntervalId(row.interval_id ? String(row.interval_id) : '')
      setDeep(false)
    }
  }, [row])
  // The dates are part of the label: several intervals may share a name
  // (one per branch, or a re-created month), and the name alone does not say
  // which period the copy lands in.
  const options = intervals.map((i) => ({
    value: String(i.id),
    label:
      i.begin_date && i.end_date
        ? `${i.name ?? `#${i.id}`} · ${formatUzShort(i.begin_date)} — ${formatUzShort(i.end_date)}`
        : (i.name ?? `#${i.id}`),
  }))
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('kpi.okrCopyTitle')}
      description={row?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={loading}
            disabled={!intervalId}
            onClick={() => intervalId && onCopy(Number(intervalId), deep)}
          >
            {t('kpi.okrCopy')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label={t('kpi.okrInterval')} required>
          <Combobox
            value={intervalId}
            onChange={setIntervalId}
            options={options}
            placeholder={t('kpi.okrAllIntervals')}
          />
        </Field>
        <Checkbox
          checked={deep}
          onChange={(e) => setDeep(e.target.checked)}
          label={t('kpi.okrDeepCopy')}
        />
        <p className="text-xs text-fg-subtle">{t('kpi.okrDeepCopyHint')}</p>
      </div>
    </Modal>
  )
}

function ObjectiveModal({
  state,
  onClose,
  intervalOptions,
  departments,
  employees,
  objectives,
}: {
  state: { open: boolean; row: Objective | null; parentId?: number | null }
  onClose: () => void
  intervalOptions: { value: string; label: string }[]
  departments: { value: string; label: string }[]
  employees: { value: string; label: string }[]
  /** Candidates for "ota maqsad" — the tree cannot be built without them. */
  objectives: Objective[]
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useOkrMutations()
  const row = state.row
  const [form, setForm] = useState({
    title: '',
    description: '',
    interval_id: '',
    goal_kind: 'P',
    division_id: '',
    owner_id: '',
    parent_id: '',
    status: 'F',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.open) return
    setError(null)
    setForm({
      title: row?.title ?? '',
      description: row?.description ?? '',
      interval_id: row?.interval_id ? String(row.interval_id) : '',
      goal_kind: row?.goal_kind ?? 'P',
      division_id: row?.division_id ? String(row.division_id) : '',
      owner_id: row?.owner_id ? String(row.owner_id) : '',
      parent_id: row?.parent_id ? String(row.parent_id) : String(state.parentId ?? ''),
      status: row?.status ?? 'F',
    })
  }, [state.open, row])

  const submit = async () => {
    if (!form.title.trim()) return setError(t('kpi.okrTitleRequired'))
    if (!row && !form.interval_id) return setError(t('kpi.okrIntervalRequired'))
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      goal_kind: form.goal_kind,
      division_id: form.division_id ? Number(form.division_id) : null,
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      // ⚠️ THE TREE LIVES OR DIES HERE. Neither create nor update sent
      // `parent_id`, so the hierarchy the screen renders could only ever be
      // READ — a child objective was impossible to make from v2.
      parent_id: form.parent_id ? Number(form.parent_id) : null,
    }
    if (!row) body.interval_id = Number(form.interval_id)
    // Only an edit may move the status; create always starts at 'F'.
    if (row) body.status = form.status
    try {
      if (row) await mut.updateObjective.mutateAsync({ id: row.id, body })
      else await mut.createObjective.mutateAsync(body)
      toast.ok(t('kpi.okrSaved'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('kpi.okrFailed')))
    }
  }

  const saving = mut.createObjective.isPending || mut.updateObjective.isPending

  /** Every objective except this one and its descendants (no cycles). */
  const parentOptions = useMemo(() => {
    const banned = new Set<number>()
    if (row) {
      const walk = (id: number) => {
        banned.add(id)
        for (const o of objectives) if (o.parent_id === id) walk(o.id)
      }
      walk(row.id)
    }
    return objectives
      .filter((o) => !banned.has(o.id))
      .map((o) => ({ value: String(o.id), label: o.title ?? `#${o.id}` }))
  }, [objectives, row])

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={row ? t('kpi.okrEditObjective') : t('kpi.okrNewObjective')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kpi.okrTitle')} required wide>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
        </Field>
        <Field label={t('kpi.okrKind')}>
          <Select
            value={form.goal_kind}
            onChange={(e) => setForm((f) => ({ ...f, goal_kind: e.target.value }))}
            options={[
              { value: 'P', label: t('kpi.okrKindPersonal') },
              { value: 'D', label: t('kpi.okrKindDept') },
            ]}
          />
        </Field>
        <Field label={t('kpi.okrInterval')} required={!row}>
          <Combobox
            value={form.interval_id}
            onChange={(v) => setForm((f) => ({ ...f, interval_id: v }))}
            options={intervalOptions}
            placeholder={t('kpi.okrAllIntervals')}
            disabled={!!row}
          />
        </Field>
        <Field label={t('employees.colDepartment')}>
          <Combobox
            value={form.division_id}
            onChange={(v) => setForm((f) => ({ ...f, division_id: v }))}
            options={departments}
            placeholder={t('employees.allDepartments')}
          />
        </Field>
        <Field label={t('kpi.okrOwner')}>
          <Combobox
            value={form.owner_id}
            onChange={(v) => setForm((f) => ({ ...f, owner_id: v }))}
            options={employees}
            placeholder={t('t2.pick')}
          />
        </Field>
        {/* Ota maqsad — daraxtni AYNAN shu quradi. Ro'yxatdan maqsadning o'zi
            va uning avlodlari chiqarib tashlanadi, aks holda halqa hosil
            bo'lardi (server ham rad etadi). */}
        <Field label={t('kpi.okrParent')}>
          <Combobox
            value={form.parent_id}
            onChange={(v) => setForm((f) => ({ ...f, parent_id: v }))}
            options={parentOptions}
            placeholder={t('kpi.okrNoParent')}
          />
        </Field>
        {row && (
          <Field label={t('kpi.filterStatus')}>
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              options={GOAL_STATUSES.map((v) => ({
                value: v,
                label: t(`kpi.goalStatus_${v}` as never),
              }))}
            />
          </Field>
        )}
        <Field label={t('kpi.okrDescription')} wide>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
          />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}

function KeyResultModal({
  state,
  onClose,
  types,
}: {
  state: { open: boolean; objectiveId: number | null; row: KeyResult | null }
  onClose: () => void
  types: { id: number; name?: string | null }[]
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useOkrMutations()
  const row = state.row
  const [form, setForm] = useState({
    title: '',
    key_result_type_id: '',
    value_input_type: 'value',
    status: 'F',
    plan: '0',
    fact: '0',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.open) return
    setError(null)
    setForm({
      title: row?.title ?? '',
      key_result_type_id: row?.key_result_type_id ? String(row.key_result_type_id) : '',
      value_input_type: row?.value_input_type ?? 'value',
      status: row?.status ?? 'F',
      plan: String(row?.plan ?? 0),
      fact: String(row?.fact ?? 0),
    })
  }, [state.open, row])

  const submit = async () => {
    if (!form.title.trim()) return setError(t('kpi.okrTitleRequired'))
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      key_result_type_id: form.key_result_type_id ? Number(form.key_result_type_id) : null,
      // Ignored by the server when a TYPE is chosen (the catalogue decides),
      // but it is the only thing that decides for a type-less key result.
      value_input_type: form.value_input_type,
      plan: Number(form.plan) || 0,
      fact: Number(form.fact) || 0,
    }
    if (row) body.status = form.status
    try {
      if (row) await mut.updateKeyResult.mutateAsync({ id: row.id, body })
      else await mut.createKeyResult.mutateAsync({ ...body, objective_id: state.objectiveId })
      toast.ok(t('kpi.okrSaved'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('kpi.okrFailed')))
    }
  }

  const saving = mut.createKeyResult.isPending || mut.updateKeyResult.isPending

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={row ? t('kpi.okrEditKeyResult') : t('kpi.okrNewKeyResult')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kpi.okrTitle')} required wide>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
        </Field>
        <Field label={t('kpi.okrKrType')} hint={t('kpi.okrKrTypeHint')} wide>
          <Combobox
            value={form.key_result_type_id}
            onChange={(v) => setForm((f) => ({ ...f, key_result_type_id: v }))}
            options={types.map((x) => ({ value: String(x.id), label: x.name ?? `#${x.id}` }))}
            placeholder={t('t2.pick')}
          />
        </Field>
        {/* Tur tanlansa server buni e'tiborsiz qoldiradi (katalog hal qiladi);
            tursiz kalit natija uchun esa qiymatni AYNAN shu belgilaydi. */}
        <Field label={t('kpi.okrValueType')}>
          <Select
            value={form.value_input_type}
            onChange={(e) => setForm((f) => ({ ...f, value_input_type: e.target.value }))}
            options={[
              { value: 'value', label: t('kpi.okrValueTypeValue') },
              { value: 'percent', label: t('kpi.okrValueTypePercent') },
            ]}
            disabled={!!form.key_result_type_id}
          />
        </Field>
        {row && (
          <Field label={t('kpi.filterStatus')}>
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              options={GOAL_STATUSES.map((v) => ({
                value: v,
                label: t(`kpi.goalStatus_${v}` as never),
              }))}
            />
          </Field>
        )}
        <Field label={t('kpi.summaryPlan')}>
          <Input
            type="number"
            value={form.plan}
            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
          />
        </Field>
        <Field label={t('kpi.summaryFact')}>
          <Input
            type="number"
            value={form.fact}
            onChange={(e) => setForm((f) => ({ ...f, fact: e.target.value }))}
          />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
