import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import {
  useBonuses,
  useKpiExtrasMutations,
  type KpiBonus,
  type KpiObjectType,
} from './useKpiExtras'

/**
 * Bonuses attached to one object. Scope matters: an `entry` bonus belongs to a
 * single employee's KPI, while an `indicator` one would be visible to everyone
 * holding that indicator — so entry detail always passes objectType="entry".
 * Read-only unless `canManage` (the backend enforces the same rule).
 */
export function BonusesPanel({
  objectType,
  objectId,
  canManage,
}: {
  objectType: KpiObjectType
  objectId: number
  canManage: boolean
}) {
  const { t } = useTranslation()
  const { bonuses, loading } = useBonuses(objectType, objectId)
  const mut = useKpiExtrasMutations()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KpiBonus | null>(null)
  const [name, setName] = useState('')
  const [percent, setPercent] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<KpiBonus | null>(null)

  const openForm = (b?: KpiBonus) => {
    setEditing(b ?? null)
    setName(b?.oper_type_name ?? '')
    setPercent(b?.bonus_percent != null ? String(b.bonus_percent) : '')
    setOpen(true)
  }

  const save = async () => {
    if (!name.trim()) return
    const bonus_percent = percent.trim() === '' ? null : Number(percent)
    if (editing?.id) {
      await mut.updateBonus.mutateAsync({
        id: editing.id,
        body: { oper_type_name: name.trim(), bonus_percent },
      })
    } else {
      await mut.createBonus.mutateAsync({
        object_type: objectType,
        object_id: objectId,
        oper_type_name: name.trim(),
        bonus_percent,
      })
    }
    mut.invalidate()
    setOpen(false)
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    await mut.deleteBonus.mutateAsync(target.id)
    mut.invalidate()
  }

  return (
    <div>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={14} /> {t('kpi.addBonus')}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-fg-subtle">…</p>
      ) : bonuses.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t('kpi.bonusesEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bonuses.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{b.oper_type_name ?? '—'}</span>
              {b.bonus_percent != null && (
                <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">
                  {b.bonus_percent}%
                </span>
              )}
              {b.amount != null && (
                <span className="shrink-0 text-xs tabular-nums text-fg-muted">{b.amount}</span>
              )}
              {canManage && (
                <>
                  <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => openForm(b)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-danger"
                    aria-label={t('common.delete')}
                    onClick={() => setConfirmDelete(b)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('kpi.editBonus') : t('kpi.addBonus')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!name.trim()}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('kpi.bonusType')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('kpi.bonusPercent')}</span>
            <Input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteBonusTitle')}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
