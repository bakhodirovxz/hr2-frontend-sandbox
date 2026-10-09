import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { UserPlus, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { localToIso } from '@/lib/format'
import { useEmployeeSearch, type GuestEmployeeOption } from '@/features/employees/useEmployeeSearch'
import { useBranchStore } from '@/store/branchStore'
import { PhotoField } from './PhotoField'
import { useGuestMutations, type Guest } from './useGuests'
import { maskValue } from '@/lib/fieldMask'

type Mode = 'external' | 'employee'


/**
 * Create / edit a visitor. Mirrors v1's AddGuestDrawer: the same fields the
 * backend's VisitorCreate accepts, nothing invented.
 *
 * Two ways in, as in v1:
 *  - "Tashqi mehmon" — an outsider, typed in by hand.
 *  - "Tizimdagi xodim" — somebody who already exists in the system (a colleague
 *    visiting from another branch). Only their id is posted: the server copies
 *    the name, position, branch and — importantly — the MinIO photo, so the
 *    turnstile enrols the same face that is already on file.
 *
 * `valid_from` / `valid_until` bound the access window — a visitor past
 * `valid_until` is removed from the turnstile access group by the nightly
 * sweep, so leaving it empty means "no expiry".
 */
export function GuestFormModal({
  open,
  guest,
  onClose,
  onSaved,
}: {
  open: boolean
  /** Present → edit; absent → create. */
  guest?: Guest | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const mut = useGuestMutations()

  const isEdit = !!guest
  const [mode, setMode] = useState<Mode>('external')
  const [pickBranch, setPickBranch] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [selectedEmp, setSelectedEmp] = useState<GuestEmployeeOption | null>(null)

  const [legalName, setLegalName] = useState('')
  const [organization, setOrganization] = useState('')
  const [position, setPosition] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [photoBase64, setPhotoBase64] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState('')

  const employeeMode = !isEdit && mode === 'employee'
  const {
    options: employeeOptions,
    employees,
    loading: employeesLoading,
    hasMore: employeesHasMore,
    loadMore: loadMoreEmployees,
  } = useEmployeeSearch(pickBranch ? Number(pickBranch) : null, open && employeeMode, empSearch)

  const resetPerson = () => {
    setLegalName('')
    setOrganization('')
    setPosition('')
    setPhone('')
    setTelegram('')
    setPhotoBase64('')
    setPhotoPreview('')
  }

  useEffect(() => {
    if (!open) return
    setError('')
    setMode('external')
    setPickBranch('')
    setEmpSearch('')
    setSelectedEmp(null)
    setPhotoBase64('')
    setLegalName(guest?.legal_name ?? '')
    setOrganization(guest?.organization_name ?? '')
    setPosition(guest?.job_position ?? '')
    setPhone(guest?.phone_number ?? '')
    setTelegram(guest?.telegram_username ?? '')
    setPhotoPreview(guest?.photo_path ?? '')
    // API sends full ISO; the control wants local `YYYY-MM-DDTHH:mm`.
    // Both ends are mandatory, so a new visitor starts with a sane window
    // (now → tomorrow) instead of two empty fields the user must discover.
    setValidFrom(toLocalInput(guest?.valid_from) || nowLocal(0))
    setValidUntil(toLocalInput(guest?.valid_until) || nowLocal(1))
  }, [open, guest])

  /** Employee picked → mirror v1: name, position, branch, phone and photo come
   *  from their profile and are shown read-only. */
  const chooseEmployee = (id: string) => {
    const emp = employees.find((e) => String(e.id) === id) ?? null
    setSelectedEmp(emp)
    if (!emp) {
      resetPerson()
      return
    }
    setLegalName(emp.legal_name ?? '')
    // Filial nomi SERVERDAN keladi (ko'rinish filiali: asosiy filial, bo'lmasa
    // bo'lim filiali) — mijoz `organization_branches[0]` dan olganda ko'p
    // filialli xodimda noto'g'ri filial tushardi.
    setOrganization(emp.organization_name ?? '')
    setPosition(emp.job_position_name ?? '')
    // TELEFON mijozga berilmaydi — server mehmon yozuviga xodim kartasidan
    // o'zi ko'chiradi (`VisitorService.create_visitor`).
    setPhone('')
    setPhotoBase64('') // the server copies the stored photo itself
    setPhotoPreview(emp.photo_path ?? '')
    setError('')
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setSelectedEmp(null)
    setPickBranch('')
    setEmpSearch('')
    setError('')
    resetPerson()
  }

  const submit = async () => {
    setError('')
    if (employeeMode && !selectedEmp) return setError(t('guests.employeeRequired'))
    if (!legalName.trim()) return setError(t('guests.nameRequired'))
    // Never open-ended: the access window is what the nightly sweep uses to
    // pull an expired visitor out of the turnstile group. No end, no removal.
    if (!isCompleteDateTime(validFrom) || !isCompleteDateTime(validUntil)) {
      return setError(t('guests.validRequired'))
    }
    if (validFrom >= validUntil) return setError(t('guests.validRangeInvalid'))

    const body: Record<string, unknown> = {
      legal_name: legalName.trim(),
      organization_name: organization.trim(),
      job_position: position.trim(),
      phone_number: phone.trim(),
      telegram_username: telegram.trim(),
      valid_from: localToIso(validFrom),
      valid_until: localToIso(validUntil),
    }
    if (photoBase64) body.photo_base64 = photoBase64
    if (!guest) {
      body.organization_branch_id = branchId
      if (employeeMode && selectedEmp) body.source_employee_id = selectedEmp.id
    }

    try {
      if (guest) await mut.update.mutateAsync({ id: guest.id, body })
      else await mut.create.mutateAsync(body)
      mut.invalidate()
      onSaved(guest ? t('guests.saved') : t('guests.created'))
    } catch (err) {
      setError(errorMessage(err, t('guests.actionFailed')))
    }
  }

  const busy = mut.create.isPending || mut.update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={guest ? t('guests.editTitle') : t('guests.createTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={photoBusy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="flex gap-1 rounded-[var(--r-md)] bg-surface-2 p-1">
            {(
              [
                { key: 'external', label: t('guests.modeExternal'), Icon: UserPlus },
                { key: 'employee', label: t('guests.modeEmployee'), Icon: Users },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => switchMode(key)}
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] text-[13px] font-medium transition-colors',
                  mode === key ? 'bg-elevated text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        {employeeMode && (
          <div className="space-y-3 rounded-[var(--r-md)] border border-line bg-surface-2/50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('guests.fieldBranch')}>
                <Select
                  value={pickBranch}
                  onChange={(e) => {
                    setPickBranch(e.target.value)
                    setSelectedEmp(null)
                    resetPerson()
                  }}
                  placeholder={t('header.allBranches')}
                  options={branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
                />
              </Field>
              <Field label={t('guests.fieldEmployee')} required>
                <Combobox
                  value={selectedEmp ? String(selectedEmp.id) : ''}
                  onChange={chooseEmployee}
                  options={employeeOptions}
                  onSearchChange={setEmpSearch}
                  loading={employeesLoading}
                  hasMore={employeesHasMore}
                  onLoadMore={loadMoreEmployees}
                  placeholder={t('guests.employeeSelect')}
                  searchPlaceholder={t('guests.employeePlaceholder')}
                  className="w-full"
                />
              </Field>
            </div>

            {selectedEmp ? (
              <div className="flex items-center gap-3 rounded-[var(--r-sm)] bg-elevated p-3">
                <Avatar
                  src={selectedEmp.photo_path ?? undefined}
                  name={legalName}
                  size={48}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{legalName || '—'}</p>
                  {position && <p className="truncate text-xs text-fg-muted">{position}</p>}
                  {organization && <p className="truncate text-xs text-brand">{organization}</p>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-fg-subtle">{t('guests.employeeHint')}</p>
            )}
          </div>
        )}

        {!employeeMode && (
          <>
            <Field label={t('guests.fieldPhoto')}>
              <PhotoField
                value={photoBase64}
                preview={photoPreview}
                name={legalName}
                disabled={busy}
                onBusyChange={setPhotoBusy}
                onChange={(b64, prev) => {
                  setPhotoBase64(b64)
                  setPhotoPreview(prev)
                }}
              />
            </Field>

            <Field label={t('guests.fieldName')} required>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('guests.fieldOrganization')}>
                <Input value={organization} onChange={(e) => setOrganization(e.target.value)} />
              </Field>
              <Field label={t('guests.fieldPosition')}>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </Field>
              <Field label={t('guests.fieldPhone')}>
                <Input value={phone} onChange={(e) => setPhone(maskValue('phone', e.target.value))} inputMode="tel" />
              </Field>
              <Field label={t('guests.fieldTelegram')}>
                <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('guests.fieldValidFrom')} required hint={t('guests.validHint')}>
            <DateTimeInput
              value={validFrom}
              onChange={setValidFrom}
              invalid={!!error && !isCompleteDateTime(validFrom)}
              aria-label={t('guests.fieldValidFrom')}
            />
          </Field>
          <Field label={t('guests.fieldValidUntil')} required>
            <DateTimeInput
              value={validUntil}
              onChange={setValidUntil}
              invalid={!!error && !isCompleteDateTime(validUntil)}
              aria-label={t('guests.fieldValidUntil')}
            />
          </Field>
        </div>

        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}

/** Both halves filled — DateTimeInput keeps a half-typed pair local. */
function isCompleteDateTime(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)
}

/** Now (+N days) as the control's local `YYYY-MM-DDTHH:mm`. */
function nowLocal(addDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + addDays)
  return toLocalInput(d.toISOString())
}

/** ISO instant → the local `YYYY-MM-DDTHH:mm` the datetime control expects. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
