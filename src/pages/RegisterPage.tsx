import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Trash2, Upload } from 'lucide-react'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { checkPassword } from '@/lib/passwordStrength'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { Textarea } from '@/components/ui/Textarea'
import { LogoMark } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { LowVisionPanel } from '@/a11y/LowVisionPanel'
import { BackgroundDecor } from '@/components/layout/BackgroundDecor'
import { useDynamicT } from '@/i18n/dynamicKey'
import { cn } from '@/lib/cn'
import {
  CONFLICT_KEYS,
  DOC_RULES,
  MASKS,
  useRegisterOptions,
  useSubmitRegistration,
  type RegistrationOption,
  type RegistrationPayload,
} from '@/features/registration/useRegistration'

/**
 * Ro'yxatdan o'tish — TZ 4.2.2
 * («Система должна позволять пользователям самостоятельно пройти
 * регистрацию… Авторизованные пользователи могут быть сотрудниками
 * структурных организаций УГЭ или „Гостями“»).
 *
 * Uch qadam: shaxsiy → hujjatlar → hisob. TZ da sanab o'tilgan maydonlarning
 * HAMMASI shu formada; ariza berilgach hisob «Mehmon» rolida ochiladi va
 * administrator shaxsni tasdiqlaguncha shunday qoladi.
 *
 * ⚠️ Formadagi filial/bo'lim/lavozim — DA'VO, haqiqat emas. Uni foydalanuvchi
 * o'zi tanlaydi, tasdiqlash oynasida esa administrator qayta belgilaydi.
 */

const STEP_KEYS = ['register.stepPersonal', 'register.stepDocs', 'register.stepAccount'] as const

const EMPTY = {
  last_name: '',
  first_name: '',
  middle_name: '',
  birth_date: '',
  gender: '',
  birth_place: '',
  address: '',
  phone_number: '',
  birth_country_id: '',
  nationality_id: '',
  citizenship_id: '',
  pinfl: '',
  inn: '',
  passport_number: '',
  passport_issued_by: '',
  passport_issue_date: '',
  passport_expiry_date: '',
  photo_base64: '',
  username: '',
  email: '',
  password: '',
  password2: '',
  is_uge_employee: false,
  claimed_branch_id: '',
  claimed_department_id: '',
  claimed_job_position_id: '',
}

type FormState = typeof EMPTY

const numOrNull = (v: string) => (v === '' ? null : Number(v))
const trimOrNull = (v: string) => (v.trim() ? v.trim() : null)
const toOptions = (list: RegistrationOption[] | undefined) =>
  (list ?? []).map((o) => ({ value: String(o.id), label: o.name }))

export function RegisterPage() {
  const { t } = useTranslation()
  const tk = useDynamicT()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const options = useRegisterOptions()
  const submit = useSubmitRegistration()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')

  /**
   * ⚠️ ALREADY SIGNED IN? THEN THIS FORM IS NOT FOR YOU.
   *
   * `LoginPage` has always sent an authenticated visitor home; this page did
   * not, so a logged-in user who reached /royxatdan-otish was handed a blank
   * sign-up wizard for an account they already have. Same rule, same place.
   */
  if (isAuthenticated) return <Navigate to="/" replace />
  const [photoPreview, setPhotoPreview] = useState('')
  const [done, setDone] = useState(false)

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: value }))

  const setMasked = (key: keyof typeof MASKS) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: MASKS[key](e.target.value) }))

  // Bo'lim va lavozim TANLANGAN filialga bog'liq — `parent_id` shuni aytadi.
  const departments = useMemo(
    () =>
      toOptions(
        (options.data?.departments ?? []).filter(
          (d) => String(d.parent_id ?? '') === String(form.claimed_branch_id),
        ),
      ),
    [options.data, form.claimed_branch_id],
  )
  const positions = useMemo(
    () =>
      toOptions(
        (options.data?.job_positions ?? []).filter(
          (p) => String(p.parent_id ?? '') === String(form.claimed_branch_id),
        ),
      ),
    [options.data, form.claimed_branch_id],
  )

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // ⚠️ Clear the input before any early return. A photo rejected for size
    // leaves the value in place, and picking the SAME file again fires no
    // `change` — the user retries and nothing happens.
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError(t('register.errPhotoBig'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      setPhotoPreview(result)
      setForm((f) => ({ ...f, photo_base64: result }))
    }
    reader.readAsDataURL(file)
  }

  const validateStep = (): string => {
    if (step === 0 && (!form.last_name.trim() || !form.first_name.trim())) {
      return t('register.errName')
    }
    if (step === 2) {
      if (!form.username.trim()) return t('register.errUsername')
      if (!form.email.trim()) return t('register.errEmail')
      // ⚠️ 8, 6 EMAS: `UserService._MIN_PASSWORD_LEN` — foydalanuvchi O'ZI
      // tanlagan parol uchun chegara 8. 6 da to'xtatilsa backend 400
      // (`weak_password`) qaytarardi va foydalanuvchi INGLIZCHA xatoni ko'rardi.
      if (checkPassword(form.password, form.username).failed.length) return t('password.notStrongEnough')
      if (form.password !== form.password2) return t('register.errPasswordMismatch')
      if (form.is_uge_employee && !form.claimed_branch_id) return t('register.errBranch')
    }
    return ''
  }

  const validateDocs = (): string => {
    for (const [key, re, messageKey] of DOC_RULES) {
      const val = (form[key] || '').trim()
      if (val && !re.test(val)) return tk(messageKey)
    }
    return ''
  }

  const next = () => {
    const msg = validateStep()
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1))
  }

  const back = () => {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const msg = validateStep() || validateDocs()
    if (msg) {
      setError(msg)
      return
    }
    setError('')

    const payload: RegistrationPayload = {
      username: form.username.trim(),
      password: form.password,
      email: form.email.trim(),
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      middle_name: trimOrNull(form.middle_name),
      pinfl: trimOrNull(form.pinfl),
      inn: trimOrNull(form.inn),
      passport_number: trimOrNull(form.passport_number),
      passport_issued_by: trimOrNull(form.passport_issued_by),
      passport_issue_date: form.passport_issue_date || null,
      passport_expiry_date: form.passport_expiry_date || null,
      birth_date: form.birth_date || null,
      gender: numOrNull(form.gender),
      address: trimOrNull(form.address),
      birth_place: trimOrNull(form.birth_place),
      birth_country_id: numOrNull(form.birth_country_id),
      nationality_id: numOrNull(form.nationality_id),
      citizenship_id: numOrNull(form.citizenship_id),
      phone_number: trimOrNull(form.phone_number),
      photo_base64: form.photo_base64 || null,
      is_uge_employee: form.is_uge_employee,
      claimed_branch_id: numOrNull(form.claimed_branch_id),
      claimed_department_id: numOrNull(form.claimed_department_id),
      claimed_job_position_id: numOrNull(form.claimed_job_position_id),
    }

    try {
      await submit.mutateAsync(payload)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 5000)
    } catch (err) {
      // ⚠️ Xato tanasi YASSI keladi: {code, i18n_key, params, message} —
      // `detail` ni o'qish bilan cheklanilsa foydalanuvchi 409 SABABINI
      // umuman ko'rmasdi va «nega ishlamadi» deb qolardi.
      const data = axios.isAxiosError(err)
        ? (err.response?.data as { code?: string; message?: string; detail?: unknown } | undefined)
        : undefined
      const key = data?.code ? CONFLICT_KEYS[data.code] : undefined
      const raw =
        data?.message ??
        (typeof data?.detail === 'object'
          ? (data?.detail as { message?: string })?.message
          : (data?.detail as string | undefined))
      setError(key ? tk(key) : raw || t('register.errFailed'))
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 size={56} className="text-success" />
          <h2 className="mt-5 text-2xl font-bold text-fg">{t('register.doneTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t('register.doneText')}</p>
          <Link to="/login" className="mt-6">
            <Button size="lg">{t('register.toLogin')}</Button>
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell wide>
      <h2 className="text-2xl font-bold text-fg">{t('register.title')}</h2>
      <p className="mt-1.5 text-sm text-fg-muted">{t('register.subtitle')}</p>

      {/* Qadamlar chizig'i */}
      <ol className="mt-6 flex items-center gap-2">
        {STEP_KEYS.map((k, i) => (
          <li key={k} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'grid h-icon-xs w-icon-xs shrink-0 place-items-center rounded-pill text-xs font-bold',
                i < step
                  ? 'bg-success text-fg-on-brand'
                  : i === step
                    ? 'bg-brand text-fg-on-brand'
                    : 'bg-surface-2 text-fg-subtle',
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                'hidden text-xs font-medium sm:block',
                i === step ? 'text-fg' : 'text-fg-subtle',
              )}
            >
              {tk(k)}
            </span>
            {i < STEP_KEYS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="mt-6">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('register.lastName')} required>
              <Input value={form.last_name} onChange={(e) => set('last_name')(e.target.value)} />
            </Field>
            <Field label={t('register.firstName')} required>
              <Input value={form.first_name} onChange={(e) => set('first_name')(e.target.value)} />
            </Field>
            <Field label={t('register.middleName')}>
              <Input value={form.middle_name} onChange={(e) => set('middle_name')(e.target.value)} />
            </Field>
            <Field label={t('register.birthDate')}>
              <DateInput value={form.birth_date} onChange={set('birth_date')} />
            </Field>
            <Field label={t('register.gender')}>
              <Select
                value={form.gender}
                onChange={(e) => set('gender')(e.target.value)}
                placeholder={t('register.notSelected')}
                options={[
                  { value: '1', label: t('register.male') },
                  { value: '2', label: t('register.female') },
                ]}
              />
            </Field>
            <Field label={t('register.phone')}>
              <Input
                value={form.phone_number}
                onChange={setMasked('phone_number')}
                placeholder="+998 90 123 45 67"
                inputMode="tel"
              />
            </Field>
            <Field label={t('register.birthPlace')}>
              <Input value={form.birth_place} onChange={(e) => set('birth_place')(e.target.value)} />
            </Field>
            <Field label={t('register.birthCountry')}>
              <Combobox
                value={form.birth_country_id}
                onChange={set('birth_country_id')}
                options={toOptions(options.data?.countries)}
                placeholder={t('register.notSelected')}
              />
            </Field>
            <Field label={t('register.nationality')}>
              <Combobox
                value={form.nationality_id}
                onChange={set('nationality_id')}
                options={toOptions(options.data?.nationalities)}
                placeholder={t('register.notSelected')}
              />
            </Field>
            <Field label={t('register.citizenship')}>
              <Combobox
                value={form.citizenship_id}
                onChange={set('citizenship_id')}
                options={toOptions(options.data?.citizenships)}
                placeholder={t('register.notSelected')}
              />
            </Field>
            <Field label={t('register.address')} wide>
              <Textarea
                rows={2}
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('register.pinfl')} hint={t('register.pinflHint')}>
              <Input value={form.pinfl} onChange={setMasked('pinfl')} inputMode="numeric" />
            </Field>
            <Field label={t('register.inn')} hint={t('register.innHint')}>
              <Input value={form.inn} onChange={setMasked('inn')} inputMode="numeric" />
            </Field>
            <Field label={t('register.passport')} hint={t('register.passportHint')}>
              <Input value={form.passport_number} onChange={setMasked('passport_number')} />
            </Field>
            <Field label={t('register.passportIssuedBy')}>
              <Input
                value={form.passport_issued_by}
                onChange={(e) => set('passport_issued_by')(e.target.value)}
              />
            </Field>
            <Field label={t('register.passportIssueDate')}>
              <DateInput value={form.passport_issue_date} onChange={set('passport_issue_date')} />
            </Field>
            <Field label={t('register.passportExpiryDate')}>
              <DateInput value={form.passport_expiry_date} onChange={set('passport_expiry_date')} />
            </Field>

            <Field label={t('register.photo')} hint={t('register.photoHint')} wide>
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <>
                    <img loading="lazy" decoding="async"
                      src={photoPreview}
                      alt=""
                      className="h-24 w-20 rounded-inner border border-line object-cover"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      leftIcon={<Trash2 size={14} />}
                      onClick={() => {
                        setPhotoPreview('')
                        set('photo_base64')('')
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </>
                ) : (
                  <label className="flex h-24 w-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-inner border border-dashed border-line text-fg-subtle transition-colors hover:border-brand hover:text-brand-strong">
                    <Upload size={18} />
                    <span className="text-[10px]">{t('register.upload')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                  </label>
                )}
              </div>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('register.username')} required>
              <Input
                value={form.username}
                onChange={(e) => set('username')(e.target.value)}
                autoComplete="username"
              />
            </Field>
            <Field label={t('register.email')} required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label={t('register.password')} required hint={form.password ? undefined : t('register.passwordHint')}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label={t('register.passwordRepeat')} required>
              <Input
                type="password"
                value={form.password2}
                onChange={(e) => set('password2')(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <PasswordStrength value={form.password} username={form.username} className="-mt-2 sm:col-span-2" />

            <div className="sm:col-span-2">
              <Checkbox
                checked={form.is_uge_employee}
                onChange={(e) => set('is_uge_employee')(e.target.checked)}
                label={t('register.isUgeEmployee')}
              />
              <p className="mt-1 text-xs text-fg-subtle">{t('register.isUgeEmployeeHint')}</p>
            </div>

            {form.is_uge_employee && (
              <>
                <Field label={t('register.branch')} required>
                  <Combobox
                    value={form.claimed_branch_id}
                    onChange={(v) => {
                      set('claimed_branch_id')(v)
                      // Filial almashsa eski bo'lim/lavozim BOSHQA filialniki
                      // bo'lib qolardi — tozalanadi.
                      set('claimed_department_id')('')
                      set('claimed_job_position_id')('')
                    }}
                    options={toOptions(options.data?.branches)}
                    placeholder={t('register.notSelected')}
                  />
                </Field>
                <Field label={t('register.department')}>
                  <Combobox
                    value={form.claimed_department_id}
                    onChange={set('claimed_department_id')}
                    options={departments}
                    disabled={!form.claimed_branch_id}
                    placeholder={t('register.notSelected')}
                  />
                </Field>
                <Field label={t('register.position')}>
                  <Combobox
                    value={form.claimed_job_position_id}
                    onChange={set('claimed_job_position_id')}
                    options={positions}
                    disabled={!form.claimed_branch_id}
                    placeholder={t('register.notSelected')}
                  />
                </Field>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={back} leftIcon={<ArrowLeft size={15} />}>
              {t('common.previous')}
            </Button>
          )}
          {step < STEP_KEYS.length - 1 ? (
            <Button
              type="button"
              onClick={next}
              className="ml-auto"
              rightIcon={<ArrowRight size={15} />}
            >
              {t('common.next')}
            </Button>
          ) : (
            <Button type="submit" className="ml-auto" loading={submit.isPending}>
              {t('register.submit')}
            </Button>
          )}
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-fg-muted">
        {t('register.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-brand-strong hover:underline">
          {t('register.toLogin')}
        </Link>
      </p>
    </Shell>
  )
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="app-bg relative flex min-h-full items-center justify-center px-5 py-10">
      <BackgroundDecor variant="panel" />
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <LowVisionPanel />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-sm')}>
        <div className="mb-7 flex flex-col items-center text-center">
          <LogoMark size={44} />
        </div>
        {children}
      </div>
    </div>
  )
}
