import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  AtSign,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarPlus,
  ConciergeBell,
  Eye,
  EyeOff,
  ImageIcon,
  LogIn,
  Mail,
  Save,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { apiPatch } from '@/api/http'
import { EMPLOYEE_SELF_UPDATE, USER_INFO } from '@/api/endpoints'
import { EditConflictDialog, editConflictOf, recordOwnWrite, resolveBase, type EditConflictInfo } from '../editConflict'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { displayName } from '@/auth/permissions'
import { inTashkent } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import {
  MAX_PHOTO_BYTES,
  accountEmail,
  readImage,
  roleLabel,
  useRefreshAccount,
  type MeUser,
  type MyEmployee,
} from './useMyAccount'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const fmtDateTime = (d?: string | null) => (d ? inTashkent(d).format('DD.MM.YYYY HH:mm') : '—')

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-b-0">
      <span className="mt-0.5 shrink-0 text-fg-subtle [&>svg]:h-[15px] [&>svg]:w-[15px]" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
        <dt className="text-[12.5px] text-fg-muted">{label}</dt>
        <dd className="break-words text-right text-[13px] text-fg">{value || '—'}</dd>
      </div>
    </div>
  )
}

/**
 * «Shaxsiy kabinet» — TZ 4.2.4 (1932–1935), L1 (931, 938), L2.
 *
 * Har bir hisob uchun: hisob ma'lumotlari (F.I.Sh., login, pochta, rol,
 * lavozim, bo'lim, ro'yxatdan o'tgan sana, oxirgi kirish), ikki bosqichli
 * kirish, «Mening so'rovlarim» va hisob ma'lumotlarini tahrirlash.
 *
 * Saqlash yo'li hisob turiga qarab:
 *   • xodim kartasi bor — `PATCH /employees/me/self-update`
 *     (legal_name, phone_number, photo_base64, email, username, current_password);
 *   • kartasiz hisob (administrator, mehmon) — `PATCH /auth/me`
 *     (full_name, email, username, current_password).
 * Login yoki pochta o'zgarsa joriy parol majburiy (server ham tekshiradi).
 */
export function AccountPanel({ employee }: { employee: MyEmployee | null }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user) as MeUser | null
  // Karta hali yuklanmagan bo'lsa — `/auth/me` dagi xodim (lavozim, bo'lim bor).
  const emp = employee ?? ((user?.employee as unknown as MyEmployee | undefined) || null)
  const role = roleLabel(user, t)
  const photoSrc = emp?.photo_thumb_path || emp?.photo_path || null

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="p-card">
            <div className="mb-3 flex items-center gap-3">
              <Avatar src={photoSrc} fallbackSrc={emp?.photo_path} name={displayName(user)} size={56} />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-fg">{displayName(user) || '—'}</p>
                <p className="text-xs text-fg-muted">{role}</p>
              </div>
            </div>
            <dl>
              <InfoRow icon={<AtSign />} label={t('account.login')} value={user?.username} />
              <InfoRow icon={<Mail />} label={t('account.email')} value={accountEmail(user)} />
              <InfoRow icon={<ShieldCheck />} label={t('account.role')} value={role} />
              <InfoRow icon={<Briefcase />} label={t('account.position')} value={ln(emp?.job_position) || undefined} />
              <InfoRow icon={<Building2 />} label={t('account.department')} value={ln(emp?.department) || undefined} />
              <InfoRow icon={<CalendarPlus />} label={t('account.createdAt')} value={fmtDateTime(user?.created_at)} />
              <InfoRow icon={<LogIn />} label={t('account.lastLogin')} value={fmtDateTime(user?.last_login_at)} />
            </dl>
          </CardBody>
        </Card>

        <TwoFactorCard />

        <Card>
          <CardHeader title={t('account.myRequests')} />
          <CardBody className="flex flex-col gap-1.5 p-3">
            <RequestLink to="/services" icon={<ConciergeBell size={16} />} label={t('account.myServiceRequests')} />
            <RequestLink to="/vacancies" icon={<BriefcaseBusiness size={16} />} label={t('account.myApplications')} />
          </CardBody>
        </Card>
      </div>

      <AccountEditCard employee={emp} />
    </div>
  )
}

function RequestLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-inner px-3 py-2.5 text-[13px] text-fg transition-colors hover:bg-surface-2"
    >
      <span className="text-brand" aria-hidden>{icon}</span>
      <span className="flex-1">{label}</span>
      <ArrowRight size={14} className="text-fg-subtle" aria-hidden />
    </Link>
  )
}

/**
 * TZ U1 · 772 — ikki bosqichli autentifikatsiya (pochtaga bir martalik kod).
 * `PATCH /auth/me {two_factor_enabled, current_password}`. Pochtasiz hisob →
 * 422 `email_required_for_2fa`; pochta serveri sozlanmagan → 422
 * `smtp_not_configured` / 503 `two_factor_unavailable` — server matni
 * ko'rsatiladi.
 */
function TwoFactorCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefreshAccount()
  const user = useAuthStore((s) => s.user)
  const enabled = !!user?.two_factor_enabled
  const [target, setTarget] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const checked = target ?? enabled
  const pending = target !== null && target !== enabled
  const hasEmail = !!accountEmail(user)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError(t('account.currentPasswordRequired'))
    setSaving(true)
    setError('')
    try {
      await apiPatch(USER_INFO, { two_factor_enabled: target, current_password: password })
      toast.ok(target ? t('account.tfaEnabled') : t('account.tfaDisabled'))
      setTarget(null)
      setPassword('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err, t('account.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title={t('account.securityTitle')} icon={<ShieldCheck />} />
      <CardBody className="p-card">
        <form onSubmit={save} className="flex flex-col gap-3" data-testid="two-factor-panel">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              inLabel
              checked={checked}
              onChange={(e) => {
                setTarget(e.target.checked)
                setError('')
              }}
              aria-describedby="two-factor-hint"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-fg">{t('account.tfaLabel')}</span>
              <span id="two-factor-hint" className="text-xs text-fg-muted">{t('account.tfaHint')}</span>
              <span className="mt-1">
                <Badge tone={enabled ? 'success' : 'neutral'} dot>
                  {enabled ? t('account.tfaOn') : t('account.tfaOff')}
                </Badge>
              </span>
            </span>
          </label>
          {!hasEmail && checked && <p className="text-xs text-warning">{t('account.tfaNeedsEmail')}</p>}
          {pending && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={t('account.currentPassword')} required className="flex-1">
                <Input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                />
              </Field>
              <Button type="submit" loading={saving} leftIcon={<ShieldCheck size={15} />}>
                {t('common.save')}
              </Button>
            </div>
          )}
          <FormError>{error}</FormError>
        </form>
      </CardBody>
    </Card>
  )
}

type Errors = Partial<Record<'full_name' | 'username' | 'email' | 'current_password' | 'phone_number', string>>

/** «Hisob ma'lumotlarini tahrirlash» (TZ 4.2.4 · 1933–1934, L2). */
function AccountEditCard({ employee }: { employee: MyEmployee | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefreshAccount()
  const user = useAuthStore((s) => s.user)
  const hasEmployee = !!user?.employee?.id
  const fileRef = useRef<HTMLInputElement>(null)

  const initial = {
    full_name: displayName(user),
    phone_number: employee?.phone_number || user?.employee?.phone_number || user?.phone_number || '',
    email: accountEmail(user),
    username: user?.username || '',
  }
  const [form, setForm] = useState(initial)
  const [currentPassword, setCurrentPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [photo, setPhoto] = useState<{ preview: string; base64: string } | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const seed = JSON.stringify(initial)
  useEffect(() => {
    setForm(JSON.parse(seed) as typeof initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])
  // TZ C3 1062: the card's `updated_at` the form was filled from.
  const [base, setBase] = useState<string | null | undefined>(employee?.updated_at)
  const [conflict, setConflict] = useState<EditConflictInfo | null>(null)
  useEffect(() => {
    setBase(employee?.updated_at)
  }, [seed, employee?.updated_at])

  const credentialsChanged =
    form.username.trim() !== (user?.username || '') || form.email.trim() !== accountEmail(user)

  const set = (k: keyof typeof initial, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('account.photoOnlyImage'))
    if (file.size > MAX_PHOTO_BYTES) return toast.error(t('account.photoTooBig'))
    setPhoto(await readImage(file))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Errors = {}
    if (!form.full_name.trim()) errs.full_name = t('account.errFullName')
    if (!form.username.trim()) errs.username = t('account.errUsername')
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errs.email = t('account.errEmail')
    if (credentialsChanged && !currentPassword) errs.current_password = t('account.errCurrentForCredentials')
    // TZ L2 963 «подсвечивает некорректные поля»: +998 XX XXX-XX-XX.
    const phoneDigits = form.phone_number.replace(/\D/g, '')
    if (form.phone_number.trim() && !(phoneDigits.length === 9 || (phoneDigits.length === 12 && phoneDigits.startsWith('998'))))
      errs.phone_number = t('account.errPhone')
    setErrors(errs)
    if (Object.keys(errs).length) return

    const payload: Record<string, unknown> = {}
    if (credentialsChanged) {
      if (form.username.trim() !== (user?.username || '')) payload.username = form.username.trim()
      if (form.email.trim() !== accountEmail(user)) payload.email = form.email.trim()
      payload.current_password = currentPassword
    }
    if (hasEmployee) {
      // F.I.Sh. of an employee card is changed by HR (TZ C3), not here.
      if (form.phone_number.trim() !== initial.phone_number) payload.phone_number = form.phone_number.trim() || null
      if (photo?.base64) payload.photo_base64 = photo.base64
    } else {
      // TZ L2 950/961: an account without a card keeps phone and photo itself.
      if (form.full_name.trim() !== (user?.full_name || '')) payload.full_name = form.full_name.trim()
      if (form.phone_number.trim() !== initial.phone_number) payload.phone_number = form.phone_number.trim()
      if (photo?.base64) payload.photo_base64 = photo.base64
    }
    if (!Object.keys(payload).length) return toast.info(t('account.noChanges'))

    setSaving(true)
    try {
      if (hasEmployee) {
        const empId = user!.employee!.id
        const expected = resolveBase(empId, base)
        const res = await apiPatch<{ employee?: { updated_at?: string | null } }>(EMPLOYEE_SELF_UPDATE, { ...payload, expected_updated_at: expected })
        recordOwnWrite(empId, expected, res?.employee?.updated_at)
      } else await apiPatch(USER_INFO, payload)
      await refresh(user?.employee?.id)
      setCurrentPassword('')
      setPhoto(null)
      toast.ok(t('account.saved'))
    } catch (err) {
      const clash = editConflictOf(err)
      if (clash) {
        setConflict(clash)
        return
      }
      const code = errorCode(err)
      const msg = errorMessage(err, t('account.saveFailed'))
      if (code === 'username_taken' || code === 'user_username_exists' || code === 'username_too_short') setErrors({ username: msg })
      else if (code === 'email_taken' || code === 'invalid_email_format') setErrors({ email: msg })
      else if (code === 'invalid_current_password') setErrors({ current_password: msg })
      else if (code === 'invalid_phone_number') setErrors({ phone_number: msg })
      else toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title={t('account.editTitle')} icon={<UserCog />} />
      <CardBody className="p-card">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {(
            <div className="flex items-center gap-3">
              <Avatar
                src={photo?.preview || employee?.photo_thumb_path || employee?.photo_path || user?.photo_url}
                fallbackSrc={employee?.photo_path}
                name={form.full_name}
                size={48}
              />
              <Button type="button" variant="outline" size="sm" leftIcon={<ImageIcon size={14} />} onClick={() => fileRef.current?.click()}>
                {t('account.changePhoto')}
              </Button>
              {photo && <span className="text-xs text-brand-strong">{t('account.photoPicked')}</span>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} aria-label={t('account.changePhoto')} />
            </div>
          )}

          <Field label={t('account.fullName')} required error={errors.full_name}>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" invalid={!!errors.full_name} disabled={hasEmployee} />
          </Field>
          <Field label={t('account.phone')} error={errors.phone_number}>
            <Input
              value={form.phone_number}
              inputMode="tel"
              placeholder="+998901234567"
              autoComplete="tel"
              invalid={!!errors.phone_number}
              onChange={(e) => set('phone_number', e.target.value.replace(/[^\d+]/g, '').slice(0, 13))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('account.login')} required error={errors.username}>
              <Input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" invalid={!!errors.username} />
            </Field>
            <Field label={t('account.email')} error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" invalid={!!errors.email} />
            </Field>
          </div>

          {credentialsChanged && (
            <Field
              label={t('account.currentPassword')}
              required
              hint={t('account.currentPasswordHint')}
              error={errors.current_password}
            >
              <Input
                type={showPw ? 'text' : 'password'}
                value={currentPassword}
                autoComplete="current-password"
                invalid={!!errors.current_password}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  setErrors((x) => ({ ...x, current_password: undefined }))
                }}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                    className="text-fg-subtle hover:text-fg"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />
            </Field>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={saving} leftIcon={<Save size={15} />}>
              {t('common.save')}
            </Button>
          </div>
        </form>
        <EditConflictDialog
          conflict={conflict}
          onReload={async () => {
            setPhoto(null)
            await refresh(user?.employee?.id)
          }}
          onClose={() => setConflict(null)}
        />
      </CardBody>
    </Card>
  )
}
