import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Checkbox } from '@/components/ui/Checkbox'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import type { SelectOption } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { useUserMutations, type UserAdminRow, type UserPayload } from './useUserAdmin'

const LOGIN_RE = /^[A-Za-z0-9._@-]{3,64}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Form {
  username: string
  full_name: string
  email: string
  role_id: string
  password: string
  organization_branch_id: string
  department_id: string
  job_position_id: string
  is_active: boolean
}

const EMPTY: Form = {
  username: '',
  full_name: '',
  email: '',
  role_id: '',
  password: '',
  organization_branch_id: '',
  department_id: '',
  job_position_id: '',
  is_active: true,
}

type Errors = Partial<Record<keyof Form, string>>

/**
 * Foydalanuvchi yaratish / tahrirlash paneli (TZ A3).
 *
 * Login va pochta yagonaligini backend tekshiradi: 409 `username_taken` /
 * `email_taken` — xato tegishli maydon ostida chiqadi. Filial
 * administratorida filial uning filialiga qulflangan. O'z hisobida rol va
 * faollik o'zgarmaydi (backend `self_modification`).
 */
export function UserDrawer({
  open,
  initial,
  isSelf,
  roleOptions,
  branchOptions,
  lockedBranchId,
  onClose,
}: {
  open: boolean
  initial: UserAdminRow | null
  isSelf: boolean
  roleOptions: SelectOption[]
  branchOptions: SelectOption[]
  lockedBranchId: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { save } = useUserMutations()
  const isEdit = !!initial
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setShowPw(false)
    const locked = lockedBranchId ? String(lockedBranchId) : ''
    setForm(
      initial
        ? {
            username: initial.username ?? '',
            full_name: initial.full_name ?? '',
            email: initial.email ?? '',
            role_id: initial.role?.id ? String(initial.role.id) : '',
            password: '',
            organization_branch_id: initial.organization_branch?.id ? String(initial.organization_branch.id) : locked,
            department_id: initial.department_id ? String(initial.department_id) : '',
            job_position_id: initial.job_position_id ? String(initial.job_position_id) : '',
            is_active: initial.is_active !== false,
          }
        : { ...EMPTY, organization_branch_id: locked },
    )
  }, [open, initial, lockedBranchId])

  const branchId = form.organization_branch_id ? Number(form.organization_branch_id) : null
  const deptOptions = useDepartmentOptions(branchId)
  const posOptions = useJobPositionOptions(branchId)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.full_name.trim()) e.full_name = t('userAdmin.errFullName')
    if (!form.username.trim()) e.username = t('userAdmin.errLogin')
    else if (!LOGIN_RE.test(form.username.trim())) e.username = t('userAdmin.errLoginFormat')
    if (!form.email.trim()) e.email = t('userAdmin.errEmail')
    else if (!EMAIL_RE.test(form.email.trim())) e.email = t('userAdmin.errEmailFormat')
    if (!form.role_id) e.role_id = t('userAdmin.errRole')
    if (!isEdit && form.password.length < PASSWORD_MIN_LENGTH) e.password = t('userAdmin.errPasswordShort')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault()
    if (!validate()) return
    const body: UserPayload = {
      username: form.username.trim(),
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      role_id: Number(form.role_id),
      organization_branch_id: branchId,
      department_id: form.department_id ? Number(form.department_id) : null,
      job_position_id: form.job_position_id ? Number(form.job_position_id) : null,
      is_active: form.is_active,
    }
    if (!isEdit) body.password = form.password
    try {
      await save.mutateAsync({ id: initial?.id, body })
      toast.ok(isEdit ? t('userAdmin.saved') : t('userAdmin.created'))
      onClose()
    } catch (err) {
      const code = errorCode(err)
      const msg = errorMessage(err, t('common.actionFailed'))
      if (code === 'username_taken') setErrors((e) => ({ ...e, username: msg }))
      else if (code === 'email_taken') setErrors((e) => ({ ...e, email: msg }))
      else toast.error(msg)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title={isEdit ? t('userAdmin.editTitle') : t('userAdmin.createTitle')}
      description={isEdit ? initial?.username : t('userAdmin.createHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Save size={15} />} loading={save.isPending} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate autoComplete="off">
        <Field label={t('userAdmin.fullName')} required error={errors.full_name}>
          <Input
            value={form.full_name}
            invalid={!!errors.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('userAdmin.login')} required error={errors.username}>
            <Input
              value={form.username}
              invalid={!!errors.username}
              autoComplete="off"
              onChange={(e) => set('username', e.target.value)}
            />
          </Field>
          <Field label={t('userAdmin.email')} required error={errors.email}>
            <Input
              type="email"
              value={form.email}
              invalid={!!errors.email}
              autoComplete="off"
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={t('userAdmin.role')}
          required
          error={errors.role_id}
          hint={isSelf ? t('userAdmin.selfRoleHint') : undefined}
        >
          <Combobox
            value={form.role_id}
            onChange={(v) => set('role_id', v)}
            options={roleOptions}
            placeholder={t('userAdmin.pickRole')}
            invalid={!!errors.role_id}
            disabled={isSelf}
            clearable={false}
          />
        </Field>
        {!isEdit && (
          <Field label={t('userAdmin.initialPassword')} required error={errors.password} hint={t('userAdmin.passwordHint')}>
            <Input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              invalid={!!errors.password}
              autoComplete="new-password"
              onChange={(e) => set('password', e.target.value)}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </Field>
        )}
        {!isEdit && <PasswordStrength value={form.password} username={form.username} className="-mt-2" />}
        <Field label={t('userAdmin.branch')}>
          <Combobox
            value={form.organization_branch_id}
            onChange={(v) =>
              setForm((f) => ({ ...f, organization_branch_id: v, department_id: '', job_position_id: '' }))
            }
            options={branchOptions}
            placeholder={t('userAdmin.pickBranch')}
            disabled={!!lockedBranchId}
            clearable={!lockedBranchId}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('userAdmin.department')}>
            <Combobox
              value={form.department_id}
              onChange={(v) => set('department_id', v)}
              options={branchId ? deptOptions : []}
              placeholder={t('userAdmin.pickOptional')}
              disabled={!branchId}
            />
          </Field>
          <Field label={t('userAdmin.position')}>
            <Combobox
              value={form.job_position_id}
              onChange={(v) => set('job_position_id', v)}
              options={branchId ? posOptions : []}
              placeholder={t('userAdmin.pickOptional')}
              disabled={!branchId}
            />
          </Field>
        </div>
        {!isEdit && <p className="m-0 text-xs leading-relaxed text-fg-muted">{t('userAdmin.cardHint')}</p>}
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox
            inLabel
            checked={form.is_active}
            disabled={isSelf}
            onChange={(e) => set('is_active', e.target.checked)}
          />
          <span className="text-sm text-fg">{t('userAdmin.activeField')}</span>
        </label>
        {/* Enter bilan yuborish uchun — tugmalar footer'da, forma tashqarisida. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
