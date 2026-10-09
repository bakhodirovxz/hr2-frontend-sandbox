import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useRoleMutations, type RoleRow } from './useUserAdmin'

/**
 * Foydalanuvchilari bor rolni o'chirish: backend 409 `role_in_use` beradi,
 * administrator ularni o'tkazadigan rolni tanlaydi (`DELETE ?reassign_to=`).
 */
export function ReassignRoleModal({
  state,
  roles,
  onClose,
}: {
  state: { role: RoleRow; usersCount: number | null } | null
  roles: RoleRow[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { remove } = useRoleMutations()
  const [target, setTarget] = useState('')
  useEffect(() => setTarget(''), [state])

  const options = roles
    .filter((r) => r.id !== state?.role.id)
    .map((r) => ({ value: String(r.id), label: r.name }))

  const submit = async () => {
    if (!state || !target) return
    try {
      await remove.mutateAsync({ id: state.role.id, reassignTo: Number(target) })
      toast.ok(t('roleAdmin.reassigned'))
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      size="sm"
      title={t('roleAdmin.deleteTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            leftIcon={<Trash2 size={15} />}
            disabled={!target}
            loading={remove.isPending}
            onClick={() => void submit()}
          >
            {t('roleAdmin.reassignDo')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm leading-relaxed text-fg-muted">
          {t('roleAdmin.reassignText', { name: state?.role.name ?? '', count: state?.usersCount ?? '?' })}
        </p>
        <Field label={t('roleAdmin.newRole')} required>
          <Combobox
            value={target}
            onChange={setTarget}
            options={options}
            placeholder={t('userAdmin.pickRole')}
            clearable={false}
          />
        </Field>
      </div>
    </Modal>
  )
}
