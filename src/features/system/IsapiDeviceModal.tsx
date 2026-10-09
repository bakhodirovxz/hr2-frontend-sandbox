import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useBranches } from '@/hooks/useBranches'
import { useLocations } from './useSystemAdmin'
import { useIsapiDevices } from './useDevices'

/**
 * REGISTERING AN ISAPI TERMINAL.
 *
 * The server connects to the device before it writes anything, so a wrong IP or
 * password ends in an error here rather than in a turnstile that exists on
 * paper and answers nobody. That is also why this cannot be folded into the
 * ordinary "add turnstile" form: that one creates a record, this one has to
 * reach a machine.
 *
 * Two rules are the operator's to know and the form's to state:
 *  - the DIRECTION is a property of the whole terminal, because attendance
 *    reads it off the door the device owns — an entrance and an exit are two
 *    separate registrations, not one device with two modes;
 *  - at least one LOCATION is mandatory, because a turnstile reaches its branch
 *    only through its location. A device without one belongs to no branch: no
 *    employee is ever written to it and its events arrive ownerless.
 */
export function IsapiDeviceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { branches } = useBranches()
  const { register } = useIsapiDevices(false)

  const [branchId, setBranchId] = useState('')
  const [locIds, setLocIds] = useState<number[]>([])
  const [form, setForm] = useState({ name: '', ip: '', port: '80', username: 'admin', password: '' })
  const [direction, setDirection] = useState('entrance')
  const [error, setError] = useState('')

  // Only the chosen branch's locations are offered — picking one from another
  // branch produces a device that reports into a branch nobody expected.
  const { locations } = useLocations(branchId ? Number(branchId) : null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const close = () => {
    setBranchId('')
    setLocIds([])
    setForm({ name: '', ip: '', port: '80', username: 'admin', password: '' })
    setDirection('entrance')
    setError('')
    onClose()
  }

  const submit = async () => {
    if (!form.ip.trim()) return setError(t('turnstiles.isapiIpRequired'))
    if (!form.password) return setError(t('turnstiles.isapiPasswordRequired'))
    if (locIds.length === 0) return setError(t('turnstiles.isapiLocationRequired'))
    setError('')
    try {
      await register.mutateAsync({
        ip: form.ip.trim(),
        port: Number(form.port) || 80,
        name: form.name.trim() || null,
        direction_type: direction,
        location_ids: locIds,
        username: form.username.trim() || null,
        password: form.password,
      })
      toast.ok(t('turnstiles.isapiRegistered'))
      close()
    } catch (e) {
      toast.error(errorMessage(e, t('turnstiles.isapiUnreachable')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('turnstiles.isapiAdd')}
      description={t('turnstiles.isapiAddHint')}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={register.isPending}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={register.isPending}>{t('turnstiles.isapiConnectAndAdd')}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('turnstiles.fieldName')} wide hint={t('turnstiles.isapiNameHint')}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.fieldIp')} required>
          <Input value={form.ip} onChange={(e) => set('ip', e.target.value)} placeholder="10.2.90.6" />
        </Field>
        <Field label={t('turnstiles.fieldPort')}>
          <Input inputMode="numeric" value={form.port} onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={t('turnstiles.isapiLogin')}>
          <Input value={form.username} autoComplete="off" onChange={(e) => set('username', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.isapiPassword')} required>
          <Input type="password" value={form.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} />
        </Field>
        <Field label={t('turnstiles.isapiDirection')} wide hint={t('turnstiles.isapiDirectionHint')}>
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'entrance', label: t('turnstiles.dirEntrance') },
              { value: 'exit', label: t('turnstiles.dirExit') },
            ]}
          />
        </Field>
        <Field label={t('turnstiles.fieldBranch')} hint={t('turnstiles.branchHint')}>
          <Combobox
            value={branchId}
            onChange={(v) => {
              setBranchId(v)
              // Locations belong to a branch; keeping the old picks would ship
              // another branch's addresses with this device.
              setLocIds([])
            }}
            options={branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        <Field label={t('turnstiles.fieldLocations')} required hint={t('turnstiles.isapiLocationHint')}>
          <div className="space-y-1.5">
            <Combobox
              value=""
              onChange={(v) => {
                const id = Number(v)
                if (id) setLocIds((p) => (p.includes(id) ? p : [...p, id]))
              }}
              options={locations
                .filter((l) => !locIds.includes(l.id))
                .map((l) => ({ value: String(l.id), label: l.name ?? `#${l.id}` }))}
              placeholder={branchId ? t('t2.pick') : t('turnstiles.isapiPickBranchFirst')}
              disabled={!branchId}
              className="w-full"
            />
            {locIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {locIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLocIds((p) => p.filter((x) => x !== id))}
                    className="inline-flex items-center gap-1 rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand"
                  >
                    {locations.find((l) => l.id === id)?.name ?? `#${id}`} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}
