import { useEffect, useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import {
  useChildSettingMutations,
  useChildSettings,
  type KpiChildGradation,
  type KpiChildSetting,
} from './useKpiChildSettings'
import type { Objective } from './useKpiOkr'

/**
 * HOW A PARENT OBJECTIVE'S GRADE IS BUILT FROM ITS CHILDREN — weight, direct
 * vs. gradation, and add vs. subtract, per child.
 *
 * ⚠️ THREE ROUTES WITH NO CALLER ANYWHERE. `GET/POST
 * /kpi/objectives/{id}/child-settings` and `DELETE /kpi/child-settings/{pk}`
 * have been live since the OKR engine landed and neither frontend ever touched
 * them, so every child rolled up on the server's defaults (weight 1, direct,
 * addition) and there was no way to say that one key result matters twice as
 * much as another, or that a child is a penalty rather than a contribution.
 *
 * ⚠️ AN UNCONFIGURED CHILD STILL COUNTS. The server LEFT JOINs these rows, so
 * clearing a setting does NOT drop the child from the parent's grade — it puts
 * it back on the defaults. The action is labelled accordingly.
 */
type Child = {
  kind: 'O' | 'K'
  id: number
  title: string
}

const CALC_DIRECT = 'D'
const CALC_GRADATION = 'G'
const OP_ADD = 'A'
const OP_SUB = 'S'

export function ChildSettingsModal({
  objective,
  children,
  onClose,
}: {
  objective: Objective | null
  /** The parent's DIRECT children — sub-objectives plus key results. */
  children: Child[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const list = useChildSettings(objective?.id ?? null)
  const mut = useChildSettingMutations()
  const [picked, setPicked] = useState<string>('')

  const byChild = useMemo(() => {
    const map = new Map<string, KpiChildSetting>()
    for (const s of list.rows) {
      const key = s.child_type === 'O' ? `O:${s.child_objective_id}` : `K:${s.child_key_result_id}`
      map.set(key, s)
    }
    return map
  }, [list.rows])

  useEffect(() => {
    if (!objective) return
    setPicked(children.length ? `${children[0].kind}:${children[0].id}` : '')
  }, [objective, children])

  if (!objective) return null

  const child = children.find((c) => `${c.kind}:${c.id}` === picked) ?? null
  const existing = picked ? (byChild.get(picked) ?? null) : null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('kpi.childSettingsTitle')}
      description={objective.title ?? undefined}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {children.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-subtle">{t('kpi.childSettingsNoChildren')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-fg-muted">{t('kpi.childSettingsHint')}</p>

          <Field label={t('kpi.childSettingsChild')}>
            <Select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              options={children.map((c) => ({
                value: `${c.kind}:${c.id}`,
                label: `${c.kind === 'O' ? '▸ ' : '· '}${c.title}${
                  byChild.has(`${c.kind}:${c.id}`) ? '' : `  (${t('kpi.childSettingsDefault')})`
                }`,
              }))}
            />
          </Field>

          {child && (
            <ChildForm
              key={picked}
              objectiveId={objective.id}
              child={child}
              existing={existing}
              onSaved={() => toast.ok(t('kpi.childSettingsSaved'))}
              onCleared={() => toast.ok(t('kpi.childSettingsCleared'))}
              saving={mut.save.isPending}
              clearing={mut.remove.isPending}
              save={mut.save.mutateAsync}
              remove={mut.remove.mutateAsync}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

function ChildForm({
  objectiveId,
  child,
  existing,
  onSaved,
  onCleared,
  saving,
  clearing,
  save,
  remove,
}: {
  objectiveId: number
  child: Child
  existing: KpiChildSetting | null
  onSaved: () => void
  onCleared: () => void
  saving: boolean
  clearing: boolean
  save: (v: {
    objectiveId: number
    body: {
      child_type: string
      child_objective_id?: number | null
      child_key_result_id?: number | null
      weight: number
      calc_type: string
      operation: string
      gradation_rules: KpiChildGradation[]
    }
  }) => Promise<unknown>
  remove: (id: number) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [weight, setWeight] = useState(String(existing?.weight ?? 1))
  const [calcType, setCalcType] = useState(existing?.calc_type ?? CALC_DIRECT)
  const [operation, setOperation] = useState(existing?.operation ?? OP_ADD)
  const [bands, setBands] = useState<KpiChildGradation[]>([])
  const [error, setError] = useState('')

  const addBand = () => setBands((b) => [...b, { from_percent: 0, to_percent: 0, result_percent: 0 }])
  const setBand = (i: number, patch: Partial<KpiChildGradation>) =>
    setBands((b) => b.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const submit = async () => {
    const w = Number(weight)
    if (Number.isNaN(w) || w <= 0) return setError(t('kpi.childSettingsWeightInvalid'))
    if (calcType === CALC_GRADATION && bands.length === 0) {
      return setError(t('kpi.childSettingsBandsRequired'))
    }
    setError('')
    try {
      await save({
        objectiveId,
        body: {
          child_type: child.kind,
          child_objective_id: child.kind === 'O' ? child.id : null,
          child_key_result_id: child.kind === 'K' ? child.id : null,
          weight: w,
          calc_type: calcType,
          operation,
          // The server replaces the whole set on every save, so an empty list
          // on a direct child is how its old bands get cleared.
          gradation_rules: calcType === CALC_GRADATION ? bands : [],
        },
      })
      onSaved()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-inner border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('kpi.childSettingsWeight')} hint={t('kpi.childSettingsWeightHint')}>
          <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t('kpi.childSettingsCalc')}>
          <Select
            value={calcType}
            onChange={(e) => setCalcType(e.target.value)}
            options={[
              { value: CALC_DIRECT, label: t('kpi.childSettingsCalcDirect') },
              { value: CALC_GRADATION, label: t('kpi.childSettingsCalcGradation') },
            ]}
          />
        </Field>
        <Field label={t('kpi.childSettingsOperation')} hint={t('kpi.childSettingsOperationHint')}>
          <Select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            options={[
              { value: OP_ADD, label: t('kpi.childSettingsOpAdd') },
              { value: OP_SUB, label: t('kpi.childSettingsOpSub') },
            ]}
          />
        </Field>
      </div>

      {calcType === CALC_GRADATION && (
        <div className="rounded-inner border border-line p-2.5">
          <p className="mb-2 text-[12px] text-fg-muted">{t('kpi.childSettingsBandsHint')}</p>
          <ul className="mb-2 flex flex-col gap-1.5">
            {bands.map((b, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <Input
                  value={String(b.from_percent)}
                  onChange={(e) => setBand(i, { from_percent: Number(e.target.value) || 0 })}
                  className="w-20"
                  inputMode="decimal"
                />
                <Input
                  value={String(b.to_percent)}
                  onChange={(e) => setBand(i, { to_percent: Number(e.target.value) || 0 })}
                  className="w-20"
                  inputMode="decimal"
                />
                <span className="text-fg-subtle">→</span>
                <Input
                  value={String(b.result_percent)}
                  onChange={(e) => setBand(i, { result_percent: Number(e.target.value) || 0 })}
                  className="w-20"
                  inputMode="decimal"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-danger"
                  aria-label={t('common.delete')}
                  onClick={() => setBands((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={addBand}>
            {t('kpi.childSettingsAddBand')}
          </Button>
        </div>
      )}

      <div className={cn('flex flex-wrap items-center gap-2')}>
        <Button onClick={submit} loading={saving}>
          {t('common.save')}
        </Button>
        {existing?.id != null && (
          <Button
            variant="ghost"
            leftIcon={<RotateCcw size={14} />}
            loading={clearing}
            onClick={async () => {
              if (!(await confirm({ kind: 'delete', confirmLabel: t('kpi.childSettingsClear') }))) return
              try {
                await remove(existing.id as number)
                onCleared()
              } catch (e) {
                setError(errorMessage(e, t('common.actionFailed')))
              }
            }}
          >
            {t('kpi.childSettingsClear')}
          </Button>
        )}
      </div>

      <FormError className="text-[12px] text-[12px]">{error}</FormError>
    </div>
  )
}
