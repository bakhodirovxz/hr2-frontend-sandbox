import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '@/api/errorMessage'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { BulkBar } from '@/components/data/BulkBar'
import { useConfirm } from '@/components/data/useConfirm'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { KpiCalculationPanel } from './KpiCalculationPanel'
import { KpiBonusesAdminPanel } from './KpiBonusesAdminPanel'
import { KpiRolesPanel } from './KpiRolesPanel'
import { KpiSeedPanel } from './KpiSeedPanel'
import {
  useAllKeyResultTypes,
  useIntervals,
  useJustifications,
  useKpiExtrasMutations,
  type KeyResultTypeRow,
  type KpiInterval,
} from './useKpiExtras'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import { BonusRangesEditor } from './BonusRangesEditor'
import type { KpiIndicator, KpiTaskStatus } from './useKpi'
import {
  useAllTaskStatuses,
  useIndicatorGroups,
  useIndicators,
  useKpiAdminMutations,
  type KpiIndicatorGroup,
} from './useKpiAdmin'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { isInvalidRange } from '@/lib/dateRange'
import { control } from '@/components/ui/control'

type Section =
  | 'indicators'
  | 'groups'
  | 'statuses'
  | 'krtypes'
  | 'intervals'
  | 'justifications'
  | 'calculation'
  | 'bonuses'
  | 'roles'
  | 'seeds'
type Notice = (kind: 'ok' | 'warn', text: string) => void

export function KpiSettingsTab({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  // The global justification catalog applies to EVERY branch — strictly the
  // site master-admin, never HR or a KPI admin.
  const isMasterAdmin = roles.isSiteMasterAdmin(user)
  const [section, setSection] = useState<Section>('indicators')

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={section}
        onChange={(v) => setSection(v)}
        options={[
          { value: 'indicators', label: t('kpi.secIndicators') },
          { value: 'groups', label: t('kpi.secGroups') },
          { value: 'statuses', label: t('kpi.secTaskStatuses') },
          { value: 'krtypes', label: t('kpi.secKrTypes') },
          { value: 'intervals', label: t('kpi.secIntervals') },
          { value: 'calculation', label: t('kpi.secCalculation') },
          { value: 'bonuses', label: t('kpi.secBonuses') },
          // Server `_assert_kpi_role_admin` = master admin only; HR opened the
          // tab and met GET kpi/roles 403 (audit 2026-09-22).
          ...(isMasterAdmin ? [{ value: 'roles' as Section, label: t('kpi.secRoles') }] : []),
          ...(isMasterAdmin ? [{ value: 'justifications' as Section, label: t('kpi.secJustifications') }] : []),
          // Reference-data seeders write catalogue rows for the whole system —
          // head admin only, matching the strictest of the three server gates.
          ...(isMasterAdmin ? [{ value: 'seeds' as Section, label: t('kpi.secSeeds') }] : []),
        ]}
      />
      {section === 'indicators' && <IndicatorsSection onNotice={onNotice} />}
      {section === 'groups' && <GroupsSection onNotice={onNotice} />}
      {section === 'statuses' && <TaskStatusesSection onNotice={onNotice} />}
      {section === 'krtypes' && <KrTypesSection onNotice={onNotice} />}
      {section === 'intervals' && <IntervalsSection onNotice={onNotice} />}
      {section === 'calculation' && <KpiCalculationPanel />}
      {section === 'bonuses' && <KpiBonusesAdminPanel canManage />}
      {section === 'roles' && <KpiRolesPanel />}
      {section === 'justifications' && isMasterAdmin && <JustificationsSection onNotice={onNotice} />}
      {section === 'seeds' && isMasterAdmin && <KpiSeedPanel />}
    </div>
  )
}

// ─── Indicators ───────────────────────────────────────────────────────────────

const EMPTY_INDICATOR = {
  name: '',
  description: '',
  direction: 'M',
  measure: '%',
  max_percent: '',
  group_name: '',
  order_no: '',
  scope: 'branch',
  department_id: '',
  has_tasks: false,
  is_active: true,
}
type IndicatorForm = typeof EMPTY_INDICATOR

function IndicatorsSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  /* v1's indicator catalogue filtered by group and direction; v2 rendered a
     plain unfiltered card list even though `useIndicators` already forwards
     both parameters to the server. */
  const [group, setGroup] = useState('')
  const [direction, setDirection] = useState('')
  const { indicators, loading } = useIndicators({ group, direction })
  // v1's catalogue lets you clear several indicators at once; v2 had a delete
  // button per row only. The pattern is one file away — `KpiResultsTab` already
  // uses exactly this selection + bulk bar.
  // `KpiIndicator.id` is optional in the type; an unsaved row cannot be selected.
  // Not server-paginated: every matching row is already here. `resetKey` drops
  // ticks made under another group/direction filter (hidden rows).
  const selection = useRowSelection(indicators.filter((i) => i.id != null) as { id: number }[], {
    resetKey: JSON.stringify([group, direction]),
  })
  const bulk = useBulkAction()
  const [confirmBulk, setConfirmBulk] = useState(false)

  const runBulkDelete = async () => {
    setConfirmBulk(false)
    const failed = await bulk.run(selection.selectedIds as number[], (id) =>
      mut.deleteIndicator.mutateAsync(id),
    )
    selection.clear()
    if (failed.length) onNotice('warn', t('kpi.bulkDeletePartial', { failed: failed.length }))
    else onNotice('ok', t('kpi.bulkDeleteDone'))
  }
  const { groups } = useIndicatorGroups()
  // The department picker needs every department, not the management screen's
  // first page of 25 (see KpiResultsTab for the measurement).
  const departments = useDepartmentOptions()
  const mut = useKpiAdminMutations()

  const [editing, setEditing] = useState<KpiIndicator | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<IndicatorForm>(EMPTY_INDICATOR)
  const [confirmDelete, setConfirmDelete] = useState<KpiIndicator | null>(null)

  const openCreate = () => {
    setForm(EMPTY_INDICATOR)
    setEditing(null)
    setCreating(true)
  }
  const openEdit = (i: KpiIndicator) => {
    setForm({
      name: i.name ?? '',
      description: i.description ?? '',
      direction: i.direction ?? 'M',
      measure: i.measure ?? '%',
      max_percent: i.max_percent != null ? String(i.max_percent) : '',
      group_name: i.group_name ?? '',
      order_no: i.order_no != null ? String(i.order_no) : '',
      scope: 'branch',
      department_id: '',
      has_tasks: !!i.has_tasks,
      is_active: i.is_active !== false,
    })
    setEditing(i)
    setCreating(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      direction: form.direction,
      // Was a hard-coded '%': every edit silently reset an indicator's unit.
      measure: form.measure.trim() || '%',
      max_percent: form.max_percent.trim() === '' ? null : Number(form.max_percent),
      group_name: form.group_name || null,
      order_no: form.order_no.trim() === '' ? null : Number(form.order_no),
      has_tasks: form.has_tasks,
      is_active: form.is_active,
    }
    if (!editing) {
      body.scope = form.scope
      if (form.scope === 'department') body.department_id = Number(form.department_id) || null
    }
    try {
      if (editing?.id) await mut.updateIndicator.mutateAsync({ id: editing.id, body })
      else await mut.createIndicator.mutateAsync(body)
      mut.invalidate()
      setCreating(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteIndicator.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch {
      // The backend refuses to delete an indicator that already has entries —
      // cascading would wipe the history (it did once, irrecoverably).
      onNotice('warn', t('kpi.deleteHasEntries'))
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secIndicators')}</h3>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus size={14} /> {t('kpi.addIndicator')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2.5">
        <Select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder={t('kpi.filterAll')}
          options={groups.map((g) => ({ value: g.name ?? '', label: g.name ?? '' }))}
          wrapperClassName="w-52"
        />
        <Select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder={t('kpi.filterAll')}
          options={[
            { value: 'M', label: t('kpi.dirMore') },
            { value: 'L', label: t('kpi.dirLess') },
          ]}
          wrapperClassName="w-44"
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : indicators.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.indicatorsEmpty')}</p>
      ) : (
        <ul>
          {indicators.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
            >
              {i.id != null && (
                <Checkbox
                  checked={selection.isSelected(i.id)}
                  onChange={() => selection.toggle(i.id as number)}
                  srLabel={i.name ?? String(i.id)}
                />
              )}
              {i.order_no != null && i.order_no < 100 && (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold tabular-nums text-fg-muted">
                  {i.order_no}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', i.is_active === false ? 'text-fg-subtle line-through' : 'text-fg')}>
                  {i.name ?? '—'}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {i.group_name ? `${i.group_name} · ` : ''}
                  {t('kpi.maxBall', { count: i.max_percent ?? 0 })}
                  {/* source list: «Тип расчёта факта» / «Тип расчёта плана» */}
                  {' · '}
                  {t('kpi.factBy')}: {t(`kpi.src_${i.fact_source ?? (i.has_tasks ? 'task' : 'manual')}` as never, { defaultValue: i.fact_source ?? '' }) as string}
                  {' · '}
                  {t('kpi.planBy')}: {t(`kpi.src_${i.plan_source ?? 'manual'}` as never, { defaultValue: i.plan_source ?? '' }) as string}
                </p>
              </div>
              {i.direction === 'L' && (
                <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
                  {t('kpi.penalty')}
                </span>
              )}
              {i.has_tasks && (
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand-strong">
                  {t('kpi.tasksTitle')}
                </span>
              )}
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openEdit(i)}>
                <Pencil size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(i)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress}>
        <Button size="sm" variant="danger" onClick={() => setConfirmBulk(true)}>
          {t('common.delete')}
        </Button>
      </BulkBar>

      <ConfirmDialog
        open={confirmBulk}
        title={t('kpi.bulkDeleteTitle')}
        description={t('kpi.bulkDeleteBody', { count: selection.count })}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setConfirmBulk(false)}
        onConfirm={runBulkDelete}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? t('kpi.editIndicator') : t('kpi.addIndicator')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!form.name.trim()} loading={mut.createIndicator.isPending || mut.updateIndicator.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.fieldName')}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t('kpi.fieldDescription')}>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldDirection')}>
              <Select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
                options={[
                  { value: 'M', label: t('kpi.dirMore') },
                  { value: 'L', label: t('kpi.dirLess') },
                ]}
              />
            </Field>
            <Field label={t('kpi.fieldMaxPercent')}>
              <Input
                type="number"
                value={form.max_percent}
                onChange={(e) => setForm({ ...form, max_percent: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldMeasure')} hint={t('kpi.fieldMeasureHint')}>
              <Input
                value={form.measure}
                onChange={(e) => setForm({ ...form, measure: e.target.value })}
                list="kpi-measure-options"
                maxLength={50}
              />
              <datalist id="kpi-measure-options">
                {['%', 'ball', 'dona', 'soat', 'kun', 'so‘m'].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label={t('kpi.fieldGroup')}>
              <Select
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                placeholder={t('kpi.filterAll')}
                options={groups.map((g) => ({ value: g.name ?? '', label: g.name ?? '' }))}
              />
            </Field>
            <Field label={t('kpi.fieldOrderNo')}>
              <Input
                type="number"
                value={form.order_no}
                onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              />
            </Field>
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('kpi.fieldScope')}>
                <Select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  options={[
                    { value: 'branch', label: t('kpi.scopeBranch') },
                    { value: 'department', label: t('kpi.scopeDepartment') },
                  ]}
                />
              </Field>
              {form.scope === 'department' && (
                <Field label={t('kpi.filterDepartment')}>
                  <Select
                    value={form.department_id}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    placeholder={t('kpi.filterDepartment')}
                    options={departments}
                  />
                </Field>
              )}
            </div>
          )}
          <Checkbox
            checked={form.has_tasks}
            onChange={(e) => setForm({ ...form, has_tasks: e.target.checked })}
            label={t('kpi.fieldHasTasks')}
          />
          <Checkbox
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            label={t('kpi.fieldActive')}
          />

          {/* Only on an EXISTING indicator: a bonus range is posted with an
              `indicator_id`, so there is nothing to attach one to until the
              indicator has been saved once. */}
          {/* The LIVE row, not the snapshot taken when the modal opened:
              adding or deleting a band refetches the indicator list, and the
              snapshot never saw it — the band list did not change until the
              modal was closed and reopened. */}
          {editing?.id != null && (
            <BonusRangesEditor indicator={indicators.find((i) => i.id === editing.id) ?? editing} />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteIndicatorTitle')}
        description={t('kpi.deleteIndicatorConfirm')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

// ─── Groups ───────────────────────────────────────────────────────────────────

function GroupsSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const { groups, loading } = useIndicatorGroups()
  const mut = useKpiAdminMutations()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KpiIndicatorGroup | null>(null)
  const [name, setName] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [weight, setWeight] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<KpiIndicatorGroup | null>(null)

  const openForm = (g?: KpiIndicatorGroup) => {
    setEditing(g ?? null)
    setName(g?.name ?? '')
    setOrderNo(g?.order_no != null ? String(g.order_no) : '')
    setWeight(g?.weight != null ? String(g.weight) : '')
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return
    const body = {
      name: name.trim(),
      order_no: orderNo.trim() === '' ? 0 : Number(orderNo),
      weight: weight.trim() === '' ? null : Number(weight),
    }
    try {
      if (editing?.id) await mut.updateGroup.mutateAsync({ id: editing.id, body })
      else await mut.createGroup.mutateAsync(body)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteGroup.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const seed = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('kpi.seedGroups') }))) return
    try {
      await mut.seedGroups.mutateAsync()
      mut.invalidate()
      onNotice('ok', t('kpi.seeded'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secGroups')}</h3>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={seed}>
            <Download size={14} /> {t('kpi.seedGroups')}
          </Button>
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={14} /> {t('kpi.addGroup')}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.groupsEmpty')}</p>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold tabular-nums text-fg-muted">
                {g.order_no ?? 0}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{g.name ?? '—'}</span>
              {g.weight != null && (
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-fg-muted">
                  {g.weight}%
                </span>
              )}
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(g)}>
                <Pencil size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(g)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editGroup') : t('kpi.addGroup')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim()} loading={mut.createGroup.isPending || mut.updateGroup.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.fieldName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldOrderNo')}>
              <Input type="number" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            </Field>
            <Field label={t('kpi.fieldWeight')}>
              <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-fg-subtle">{t('kpi.weightHint')}</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteGroupTitle')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

// ─── Task statuses ────────────────────────────────────────────────────────────

function TaskStatusesSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const { statuses, loading } = useAllTaskStatuses()
  const mut = useKpiAdminMutations()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KpiTaskStatus | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [orderNo, setOrderNo] = useState('')
  const [countsForFact, setCountsForFact] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<KpiTaskStatus | null>(null)

  const openForm = (s?: KpiTaskStatus) => {
    setEditing(s ?? null)
    setName(s?.name ?? '')
    setColor(s?.color ?? '#6b7280')
    setOrderNo(s?.order_no != null ? String(s.order_no) : '')
    setCountsForFact(!!s?.counts_for_fact)
    setIsActive(s?.is_active !== false)
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return
    const body = {
      name: name.trim(),
      color,
      order_no: orderNo.trim() === '' ? 0 : Number(orderNo),
      counts_for_fact: countsForFact,
      is_active: isActive,
    }
    try {
      if (editing?.id) await mut.updateTaskStatus.mutateAsync({ id: editing.id, body })
      else await mut.createTaskStatus.mutateAsync(body)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteTaskStatus.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const seed = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('kpi.seedTaskStatuses') }))) return
    try {
      await mut.seedTaskStatuses.mutateAsync()
      mut.invalidate()
      onNotice('ok', t('kpi.seeded'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secTaskStatuses')}</h3>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={seed}>
            <Download size={14} /> {t('kpi.seedTaskStatuses')}
          </Button>
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={14} /> {t('kpi.addTaskStatus')}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : statuses.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.taskStatusesEmpty')}</p>
      ) : (
        <ul>
          {statuses.map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
                style={{ background: s.color ?? 'transparent' }}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-medium',
                  s.is_active === false ? 'text-fg-subtle line-through' : 'text-fg',
                )}
              >
                {s.name ?? '—'}
              </span>
              {s.counts_for_fact && (
                <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                  {t('kpi.fieldCountsForFact')}
                </span>
              )}
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(s)}>
                <Pencil size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(s)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editTaskStatus') : t('kpi.addTaskStatus')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim()} loading={mut.createTaskStatus.isPending || mut.updateTaskStatus.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.fieldName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldColor')}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className={control({ className: 'w-full cursor-pointer px-1' })}
              />
            </Field>
            <Field label={t('kpi.fieldOrderNo')}>
              <Input type="number" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            </Field>
          </div>
          <Checkbox
            checked={countsForFact}
            onChange={(e) => setCountsForFact(e.target.checked)}
            label={t('kpi.fieldCountsForFact')}
          />
          <p className="text-xs text-fg-subtle">{t('kpi.countsHint')}</p>
          <Checkbox
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            label={t('kpi.fieldActive')}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteTaskStatusTitle')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

// ─── Evaluation intervals ─────────────────────────────────────────────────────

function IntervalsSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const { intervals, loading } = useIntervals()
  const mut = useKpiExtrasMutations()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KpiInterval | null>(null)
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<KpiInterval | null>(null)
  const [busy, setBusy] = useState(false)

  const openForm = (iv?: KpiInterval) => {
    setEditing(iv ?? null)
    setName(iv?.name ?? '')
    setFrom(iv?.begin_date?.slice(0, 10) ?? '')
    setTo(iv?.end_date?.slice(0, 10) ?? '')
    setIsActive(iv?.is_active !== false)
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim() || !from || !to) return
    const body = { name: name.trim(), begin_date: from, end_date: to, is_active: isActive }
    try {
      if (editing?.id) await mut.updateInterval.mutateAsync({ id: editing.id, body })
      else await mut.createInterval.mutateAsync(body)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteInterval.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      mut.invalidate()
      onNotice('ok', t('kpi.generated'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secIntervals')}</h3>
        <Button size="sm" className="ml-auto" onClick={() => openForm()}>
          <Plus size={14} /> {t('kpi.addInterval')}
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : intervals.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.intervalsEmpty')}</p>
      ) : (
        <ul>
          {intervals.map((iv) => (
            <li
              key={iv.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    iv.is_active === false ? 'text-fg-subtle line-through' : 'text-fg',
                  )}
                >
                  {iv.name ?? '—'}
                </p>
                <p className="truncate text-xs tabular-nums text-fg-subtle">
                  {iv.begin_date?.slice(0, 10)} — {iv.end_date?.slice(0, 10)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({ kind: 'action', subject: iv.name, confirmLabel: t('kpi.generateScorecards') })
                  if (ok) await run(() => mut.generateScorecards.mutateAsync(iv.id))
                }}
              >
                {t('kpi.generateScorecards')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  // Closes the period for good — the heaviest button on this screen.
                  const ok = await confirm({ kind: 'status', subject: iv.name, confirmLabel: t('kpi.finalizeInterval') })
                  if (ok) await run(() => mut.finalizeInterval.mutateAsync(iv.id))
                }}
              >
                {t('kpi.finalizeInterval')}
              </Button>
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(iv)}>
                <Pencil size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(iv)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editInterval') : t('kpi.addInterval')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim() || !from || !to || isInvalidRange(from, to)} loading={mut.createInterval.isPending || mut.updateInterval.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.intervalName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.intervalFrom')} error={isInvalidRange(from, to) ? t('list.invalidRange') : undefined}>
              <DateInput value={from} onChange={setFrom} invalid={isInvalidRange(from, to)} />
            </Field>
            <Field label={t('kpi.intervalTo')}>
              <DateInput value={to} onChange={setTo} invalid={isInvalidRange(from, to)} />
            </Field>
          </div>
          <Checkbox
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            label={t('kpi.fieldActive')}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteIntervalTitle')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

// ─── Justification catalog (master-admin only) ────────────────────────────────

function JustificationsSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const { justifications, loading } = useJustifications()
  const mut = useKpiExtrasMutations()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KpiIndicator | null>(null)
  const [name, setName] = useState('')
  const [direction, setDirection] = useState('M')
  const [maxPercent, setMaxPercent] = useState('')
  const [periodType, setPeriodType] = useState('month')
  const [confirmDelete, setConfirmDelete] = useState<KpiIndicator | null>(null)

  const openForm = (j?: KpiIndicator) => {
    setEditing(j ?? null)
    setName(j?.name ?? '')
    setDirection(j?.direction ?? 'M')
    setMaxPercent(j?.max_percent != null ? String(j.max_percent) : '')
    setPeriodType('month')
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return
    const body: Record<string, unknown> = {
      name: name.trim(),
      direction,
      measure: '%',
      max_percent: maxPercent.trim() === '' ? null : Number(maxPercent),
      period_type: periodType,
    }
    try {
      if (editing?.id) await mut.updateJustification.mutateAsync({ id: editing.id, body })
      else await mut.createJustification.mutateAsync(body)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteJustification.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.deleteHasEntries')))
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secJustifications')}</h3>
        <Button size="sm" className="ml-auto" onClick={() => openForm()}>
          <Plus size={14} /> {t('kpi.addJustification')}
        </Button>
      </div>

      <p className="border-b border-line px-4 py-2 text-xs text-fg-subtle">
        {t('kpi.justificationsHint')}
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : justifications.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.justificationsEmpty')}</p>
      ) : (
        <ul>
          {justifications.map((j) => (
            <li key={j.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{j.name ?? '—'}</span>
              <span className="shrink-0 text-xs text-fg-subtle">
                {t('kpi.maxBall', { count: j.max_percent ?? 0 })}
              </span>
              {j.direction === 'L' && (
                <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
                  {t('kpi.penalty')}
                </span>
              )}
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(j)}>
                <Pencil size={15} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                aria-label={t('common.delete')}
                onClick={() => setConfirmDelete(j)}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editJustification') : t('kpi.addJustification')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim()} loading={mut.createJustification.isPending || mut.updateJustification.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.fieldName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldDirection')}>
              <Select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                options={[
                  { value: 'M', label: t('kpi.dirMore') },
                  { value: 'L', label: t('kpi.dirLess') },
                ]}
              />
            </Field>
            <Field label={t('kpi.fieldMaxPercent')}>
              <Input
                type="number"
                value={maxPercent}
                onChange={(e) => setMaxPercent(e.target.value)}
              />
            </Field>
          </div>
          <Field label={t('kpi.periodType')}>
            <Select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              options={[
                { value: 'month', label: t('kpi.periodMonth') },
                { value: 'quarter', label: t('kpi.periodQuarter') },
                { value: 'year', label: t('kpi.periodYear') },
              ]}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteJustificationTitle')}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

// ─── Key result types ─────────────────────────────────────────────────────────

/** Source `value_input_type` of a key result type: where plan / fact come from. */
const KR_INPUTS = ['M', 'T', 'S', 'G', 'F'] as const

/**
 * Source `key_result_type_list` (+add / +edit). The goals screen picks a type
 * per key result; until now the catalogue could only be seeded, not edited.
 */
function KrTypesSection({ onNotice }: { onNotice: Notice }) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { types, loading } = useAllKeyResultTypes(branchId)
  const mut = useKpiExtrasMutations()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KeyResultTypeRow | null>(null)
  const [name, setName] = useState('')
  const [measure, setMeasure] = useState('')
  const [input, setInput] = useState<string>('M')
  const [orderNo, setOrderNo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<KeyResultTypeRow | null>(null)

  const inputLabel = (v?: string | null) => t(`kpi.krInput_${v ?? 'M'}` as never, { defaultValue: v ?? '' }) as string

  const openForm = (r?: KeyResultTypeRow) => {
    setEditing(r ?? null)
    setName(r?.name ?? '')
    setMeasure(r?.measure ?? '')
    setInput(r?.value_input_type ?? 'M')
    setOrderNo(r?.order_no != null ? String(r.order_no) : '')
    setIsActive(r?.is_active !== false)
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return
    const body = {
      name: name.trim(),
      measure: measure.trim() || null,
      value_input_type: input,
      order_no: orderNo.trim() === '' ? 100 : Number(orderNo),
      is_active: isActive,
    }
    try {
      if (editing?.id) await mut.updateKrType.mutateAsync({ id: editing.id, body })
      else await mut.createKrType.mutateAsync(body)
      mut.invalidate()
      setOpen(false)
      onNotice('ok', t('kpi.saved'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    try {
      await mut.deleteKrType.mutateAsync(target.id)
      mut.invalidate()
      onNotice('ok', t('kpi.deleted'))
    } catch (e) {
      onNotice('warn', errorMessage(e, t('kpi.saveFailed')))
    }
  }

  const sorted = [...types].sort((a, b) => (a.order_no ?? 100) - (b.order_no ?? 100) || (a.name ?? '').localeCompare(b.name ?? ''))

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{t('kpi.secKrTypes')}</h3>
        <span className="text-xs text-fg-subtle">{t('kpi.krTypesHint')}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={14} /> {t('kpi.addKrType')}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">…</p>
      ) : sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('kpi.krTypesEmpty')}</p>
      ) : (
        <ul>
          {sorted.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', r.is_active === false ? 'text-fg-subtle line-through' : 'text-fg')}>
                  {r.name ?? '—'}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {inputLabel(r.value_input_type)}
                  {r.measure ? ` · ${r.measure}` : ''}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(r)}>
                <Pencil size={15} />
              </Button>
              <Button size="icon" variant="ghost" className="text-danger" aria-label={t('common.delete')} onClick={() => setConfirmDelete(r)}>
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editKrType') : t('kpi.addKrType')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim()} loading={mut.createKrType.isPending || mut.updateKrType.isPending}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.fieldName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label={t('kpi.okrValueType')} hint={t('kpi.krInputHint')}>
            <Select
              value={input}
              onChange={(e) => setInput(e.target.value)}
              options={KR_INPUTS.map((v) => ({ value: v, label: inputLabel(v) }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kpi.fieldMeasure')}>
              <Input value={measure} onChange={(e) => setMeasure(e.target.value)} maxLength={50} />
            </Field>
            <Field label={t('kpi.fieldOrderNo')}>
              <Input type="number" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            </Field>
          </div>
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} label={t('kpi.fieldActive')} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteKrTypeTitle')}
        description={confirmDelete?.name ?? ''}
        confirmLabel={t('common.delete')}
        danger
      />
    </Card>
  )
}
