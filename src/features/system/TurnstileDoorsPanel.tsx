import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { DoorClosed, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useTurnstileDoors, type TurnstileDoor } from './useDevices'

/**
 * THE DOORS INSIDE ONE TURNSTILE.
 *
 * A turnstile is a cabinet; the door is what a person actually walks through,
 * and its `direction_type` is the single fact attendance uses to tell an
 * arrival from a departure. A door left without a direction is not an aesthetic
 * problem — every pass through it drops out of the kel-ket calculation, and the
 * employee looks like they never came in. Hence the direction is the one
 * control that applies IMMEDIATELY, with no save step to forget.
 *
 * Adding a door by hand is the exception, not the rule: doors normally arrive
 * from the HikCentral sync, and for an ISAPI terminal one is created with the
 * device. The form is here for the case the sync cannot cover — a device the
 * appliance no longer knows about, whose door row was lost.
 */
export function TurnstileDoorsPanel({
  turnstileId,
  deviceIndexCode,
}: {
  turnstileId: number
  /** Copied into new doors so the row still points at its device without the operator retyping it. */
  deviceIndexCode?: string | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { doors, loading, create, update, remove } = useTurnstileDoors(turnstileId)
  const [adding, setAdding] = useState(false)
  const [removingDoor, setRemovingDoor] = useState<TurnstileDoor | null>(null)
  const [form, setForm] = useState({ door_index_code: '', door_no: '', door_name: '', direction_type: 'entrance' })
  const [error, setError] = useState('')

  const setDirection = async (door: TurnstileDoor, direction: string) => {
    // Flipping a door re-labels every pass through it — ask; a «no» leaves the
    // control on the stored value because it is driven by the row.
    const ok = await confirm({
      kind: 'status',
      subject: door.door_name || door.door_no || door.door_index_code,
      confirmLabel: direction === 'exit' ? t('turnstiles.dirExit') : t('turnstiles.dirEntrance'),
    })
    if (!ok) return
    try {
      await update.mutateAsync({ id: door.id, body: { direction_type: direction } })
      toast.ok(t('turnstiles.doorDirectionSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const submitNew = async () => {
    if (!form.door_index_code.trim()) {
      setError(t('turnstiles.doorCodeRequired'))
      return
    }
    setError('')
    try {
      await create.mutateAsync({
        turnstile_id: turnstileId,
        door_index_code: form.door_index_code.trim(),
        acs_dev_index_code: deviceIndexCode ?? '',
        door_no: form.door_no.trim() || null,
        door_name: form.door_name.trim() || null,
        direction_type: form.direction_type,
      })
      toast.ok(t('common.saved'))
      setForm({ door_index_code: '', door_no: '', door_name: '', direction_type: 'entrance' })
      setAdding(false)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : doors.length === 0 ? (
        <EmptyState icon={<DoorClosed size={22} />} title={t('turnstiles.doorsEmpty')} description={t('turnstiles.doorsEmptyHint')} />
      ) : (
        <ul className="space-y-2">
          {doors.map((d) => (
            <li key={d.id} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {d.door_name || t('turnstiles.doorFallbackName', { no: d.door_no || d.id })}
                  </span>
                  <span className="block truncate font-mono text-[11.5px] text-fg-subtle">
                    {t('turnstiles.doorCodeLine', { no: d.door_no || '—', code: d.door_index_code || '—' })}
                  </span>
                </span>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemovingDoor(d)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <div className="mt-2">
                <Segmented
                  size="sm"
                  value={d.direction_type === 'exit' ? 'exit' : 'entrance'}
                  onChange={(v) => setDirection(d, v)}
                  options={[
                    { value: 'entrance', label: t('turnstiles.dirEntrance') },
                    { value: 'exit', label: t('turnstiles.dirExit') },
                  ]}
                />
                {!d.direction_type && <p className="mt-1 text-[11.5px] text-warning">{t('turnstiles.doorDirectionUnset')}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('turnstiles.doorFieldCode')} required hint={t('turnstiles.doorCodeHint')}>
              <Input value={form.door_index_code} onChange={(e) => setForm((f) => ({ ...f, door_index_code: e.target.value }))} />
            </Field>
            <Field label={t('turnstiles.doorFieldNo')}>
              <Input value={form.door_no} onChange={(e) => setForm((f) => ({ ...f, door_no: e.target.value }))} />
            </Field>
            <Field label={t('turnstiles.doorFieldName')}>
              <Input value={form.door_name} onChange={(e) => setForm((f) => ({ ...f, door_name: e.target.value }))} />
            </Field>
            <Field label={t('turnstiles.doorFieldDirection')}>
              <Segmented
                size="sm"
                value={form.direction_type}
                onChange={(v) => setForm((f) => ({ ...f, direction_type: v }))}
                options={[
                  { value: 'entrance', label: t('turnstiles.dirEntrance') },
                  { value: 'exit', label: t('turnstiles.dirExit') },
                ]}
              />
            </Field>
          </div>
          <FormError className="text-xs">{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError('') }}>{t('common.cancel')}</Button>
            <Button size="sm" loading={create.isPending} onClick={submitNew}>{t('common.save')}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
          {t('turnstiles.doorAdd')}
        </Button>
      )}

      <ConfirmDialog
        open={!!removingDoor}
        danger
        confirmLabel={t('common.delete')}
        title={t('turnstiles.doorRemoveTitle')}
        description={t('turnstiles.doorRemoveConfirm', { name: removingDoor?.door_name || removingDoor?.door_index_code || '' })}
        loading={remove.isPending}
        onClose={() => setRemovingDoor(null)}
        onConfirm={async () => {
          if (!removingDoor) return
          try {
            await remove.mutateAsync(removingDoor.id)
            toast.ok(t('common.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemovingDoor(null)
          }
        }}
      />
    </div>
  )
}
