import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DoorClosed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useHikDeviceActions } from './useDevices'
import type { HikDevice } from './useSystemAdmin'

/**
 * EDITING A DEVICE THE APPLIANCE OWNS.
 *
 * Both fields here are HR-side overrides, because HikCentral will not take our
 * writes: this edition refuses a device rename outright (code 8), and it has no
 * idea which way our attendance wants to read a door. So the name is stored
 * beside the appliance's own — which stays visible, since it is the only handle
 * that matches what an engineer sees in HikCentral — and the direction is
 * stored on our door row.
 *
 * Direction saves ON CLICK rather than on a Save button. It changes how every
 * future pass is interpreted, and half-applied intent (two doors changed, the
 * third lost to a closed dialog) is worse than an extra request.
 */
export function HikDeviceModal({ device, onClose }: { device: HikDevice | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { rename, setDoorDirection } = useHikDeviceActions()
  const [displayName, setDisplayName] = useState('')
  // Applied directions are mirrored locally so the toggle reflects the click
  // immediately; the list itself only refreshes on the next fetch.
  const [dirs, setDirs] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!device) return
    setDisplayName(device.display_name ?? '')
    setDirs(Object.fromEntries((device.doors ?? []).map((d) => [d.id, d.direction_type ?? ''])))
  }, [device])

  const doors = device?.doors ?? []

  const save = async () => {
    if (!device) return
    try {
      // An empty field CLEARS the override rather than storing "", which is what
      // makes the appliance's own name come back.
      await rename.mutateAsync({ id: device.id, displayName: displayName.trim() || null })
      toast.ok(t('hik.deviceNameSaved'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const applyDirection = async (doorId: number, direction: string) => {
    if (!device) return
    const door = doors.find((d) => d.id === doorId)
    const ok = await confirm({
      kind: 'status',
      subject: door?.door_name || door?.door_index_code,
      confirmLabel: direction === 'exit' ? t('turnstiles.dirExit') : t('turnstiles.dirEntrance'),
    })
    if (!ok) return
    try {
      await setDoorDirection.mutateAsync({ turnstileId: device.id, doorId, direction })
      setDirs((p) => ({ ...p, [doorId]: direction }))
      toast.ok(t('turnstiles.doorDirectionSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!device}
      onClose={onClose}
      title={t('hik.deviceEditTitle')}
      description={device?.effective_name || device?.acs_dev_name || ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={rename.isPending}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={rename.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('hik.deviceName')} hint={t('hik.deviceNameHint')}>
          <Input
            value={displayName}
            placeholder={device?.acs_dev_name ?? ''}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[12px] text-fg-muted">{t('hik.deviceAddress')}</p>
          <p className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px] text-fg">
            {[device?.acs_dev_ip, device?.acs_dev_port].filter(Boolean).join(':') || '—'}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-fg">{t('turnstiles.doorsTab')}</p>
          {doors.length === 0 ? (
            <EmptyState icon={<DoorClosed size={20} />} title={t('turnstiles.doorsEmpty')} />
          ) : (
            <ul className="space-y-2">
              {doors.map((d) => (
                <li key={d.id} className="rounded-lg border border-line bg-surface-2 p-3">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {d.door_name || t('turnstiles.doorFallbackName', { no: d.id })}
                  </p>
                  <p className="truncate font-mono text-[11.5px] text-fg-subtle">{d.door_index_code || '—'}</p>
                  <div className="mt-2">
                    <Segmented
                      size="sm"
                      value={(dirs[d.id] || d.direction_type) === 'exit' ? 'exit' : 'entrance'}
                      onChange={(v) => applyDirection(d.id, v)}
                      options={[
                        { value: 'entrance', label: t('turnstiles.dirEntrance') },
                        { value: 'exit', label: t('turnstiles.dirExit') },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
