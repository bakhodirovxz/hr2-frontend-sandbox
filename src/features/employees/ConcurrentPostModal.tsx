import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, UserPlus } from 'lucide-react'
import { Button, Combobox, DateInput, Field, Input, Modal, Select } from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { tabPill } from '@/components/ui/control'
import {
  useAssignmentMutations,
  useTransferMutations,
  type EmployeeLookupResult,
} from './useEmployeeAssignments'
import { Checkbox } from '@/components/ui/Checkbox'

/**
 * MAVJUD XODIMNI FILIALGA OLISH — IKKI XIL AMAL, BITTA OYNA.
 *
 * Nima uchun alohida oyna, xodim qo'shish formasining bir bo'limi emas: bu
 * BOSHQA amal. Xodim qo'shishda yangi shaxs yaratiladi (hisob, parol xati,
 * turniket yozuvi), bu yerda esa MAVJUD shaxs bilan ishlanadi — uning hisobi,
 * JSHSHIRi va turniket yozuvi bitta bo'lib qoladi.
 *
 *   · O'RINDOSHLIK — odam IKKALA filialda ishlaydi. Asosiy ish joyi tegilmaydi.
 *   · O'TKAZISH    — odamning ASOSIY ish joyi almashadi; u eski filial
 *                    ro'yxatidan chiqadi. Darhol kuchga kiradi, eski filial
 *                    esa uni o'z arxividan qabul qiladi yoki RAD ETADI (rad
 *                    etilsa hammasi qaytariladi).
 *
 * Ikkalasi bitta oynada, chunki kadr uchun boshlanish nuqtasi bir xil: "bu
 * odam menga kerak". Farqni tanlash rejim tugmalari bilan qilinadi va nima
 * bo'lishi har rejimda matn bilan aytiladi.
 */
type Mode = 'concurrent' | 'transfer'

export function ConcurrentPostModal({
  open,
  onClose,
  lookup,
  onDone,
}: {
  open: boolean
  onClose: () => void
  lookup: EmployeeLookupResult | null
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const branches = useBranchStore((s) => s.branches)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const [mode, setMode] = useState<Mode>('concurrent')
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [jobPositionId, setJobPositionId] = useState('')
  const [stavka, setStavka] = useState('0.5')
  const [startDate, setStartDate] = useState('')
  const [orderReference, setOrderReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  /**
   * SOAT BO'YICHA O'RINDOSHLIK. Xodim jismonan o'z filialida qoladi va bu
   * filialga kelishilgan soat hajmida ishlab beradi — ish KUNLARI
   * belgilanmaydi. Haqiqiy soat turniketdan olinadi, bu yerda faqat NORMA
   * kiritiladi.
   */
  const [hoursNorm, setHoursNorm] = useState('')
  const [hoursPeriod, setHoursPeriod] = useState('month')
  /**
   * TASDIQ. Bu odam boshqa filialning SHTATDAGI xodimi — uni tasodifan
   * qo'shib yuborish oson (JSHSHIR yozilgan, tugma bosilgan). O'rindoshlikda
   * savol faqat o'rindoshligi hali bo'lmagan xodimda beriladi; o'tkazishda esa
   * DOIM, chunki u odamni eski filialdan butunlay olib chiqadi.
   */
  const [confirmed, setConfirmed] = useState(false)

  const { create } = useAssignmentMutations()
  const { transfer } = useTransferMutations()

  // O'rindoshlikda: xodim allaqachon ish o'rniga ega filiallar chiqariladi
  // (takror biriktirish serverda 400 beradi). O'tkazishda: uning HOZIRGI
  // asosiy filiali chiqariladi (o'sha yerga o'tkazish ma'nosiz).
  const takenBranchIds = useMemo(
    () => new Set((lookup?.assignments ?? []).map((a) => a.organization_branch_id)),
    [lookup],
  )
  const branchOptions = useMemo(() => {
    const skip =
      mode === 'transfer'
        ? new Set([lookup?.primary_branch_id ?? -1])
        : takenBranchIds
    return branches
      .filter((b) => !skip.has(b.id))
      .map((b) => ({ value: String(b.id), label: b.name || `#${b.id}` }))
  }, [branches, takenBranchIds, mode, lookup])

  const numericBranch = branchId ? Number(branchId) : null
  const departmentOptions = useDepartmentOptions(numericBranch)
  const jobPositionOptions = useJobPositionOptions(numericBranch)

  const resetFields = () => {
    setError(null)
    setDepartmentId('')
    setJobPositionId('')
    setStavka('0.5')
    setStartDate('')
    setOrderReference('')
    setHoursNorm('')
    setHoursPeriod('month')
    setConfirmed(false)
  }

  useEffect(() => {
    if (!open) return
    setMode('concurrent')
    resetFields()
    const preferred =
      selectedBranchId && !takenBranchIds.has(selectedBranchId) ? String(selectedBranchId) : ''
    setBranchId(preferred || branchOptions[0]?.value || '')
    // `branchOptions` har renderda yangi massiv — faqat oyna ochilishida ishlasin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Filial almashsa bo'lim/lavozim ro'yxati ham almashadi — eski tanlov boshqa
  // filialga tegishli bo'lib qolardi va server `department_branch_mismatch`
  // qaytarardi.
  useEffect(() => {
    setDepartmentId('')
    setJobPositionId('')
  }, [branchId])

  // «O'rindoshligi tayyorlanmagan» = shu paytgacha hech qaysi filialda
  // o'rindoshlik ish o'rni ochilmagan, ya'ni u sof shtat xodimi.
  const hasConcurrentPost = (lookup?.assignments ?? []).some(
    (a) => a.employment_type !== 'main',
  )
  const isTransfer = mode === 'transfer'
  const needsConfirm = isTransfer || !hasConcurrentPost
  const busy = create.isPending || transfer.isPending

  const submit = async () => {
    setError(null)
    if (!lookup?.employee_id) return
    if (!branchId) return setError(t('assignments.branchRequired'))
    if (!departmentId || !jobPositionId) return setError(t('assignments.postRequired'))
    if (needsConfirm && !confirmed) return setError(t('assignments.confirmRequired'))

    try {
      if (isTransfer) {
        await transfer.mutateAsync({
          employeeId: lookup.employee_id,
          body: {
            organization_branch_id: Number(branchId),
            department_id: Number(departmentId),
            job_position_id: Number(jobPositionId),
            transfer_date: startDate || null,
            order_reference: orderReference.trim() || null,
          },
        })
        onClose()
        onDone(t('assignments.transferred'))
        return
      }

      const rate = Number(stavka)
      if (!Number.isFinite(rate) || rate <= 0 || rate > 2) {
        return setError(t('assignments.stavkaInvalid'))
      }
      const norm = hoursNorm.trim() ? Number(hoursNorm) : null
      if (norm !== null && (!Number.isFinite(norm) || norm <= 0 || norm > 744)) {
        return setError(t('assignments.hoursInvalid'))
      }
      await create.mutateAsync({
        employeeId: lookup.employee_id,
        body: {
          organization_branch_id: Number(branchId),
          department_id: Number(departmentId),
          job_position_id: Number(jobPositionId),
          employment_type: 'internal_concurrent',
          stavka: rate,
          hours_norm: norm,
          hours_period: norm !== null ? hoursPeriod : null,
          start_date: startDate || null,
          order_reference: orderReference.trim() || null,
        },
      })
      onClose()
      onDone(t('assignments.attached'))
    } catch (e) {
      setError(
        errorMessage(e, isTransfer ? t('assignments.transferFailed') : t('assignments.attachFailed')),
      )
    }
  }

  const currentPost = [lookup?.primary_department_name, lookup?.primary_job_position_name]
    .filter(Boolean)
    .join(' · ')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTransfer ? t('assignments.transferTitle') : t('assignments.attachTitle')}
      size="sm"
      description={lookup?.legal_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={busy}
            leftIcon={isTransfer ? <ArrowRightLeft size={15} /> : <UserPlus size={15} />}
            onClick={submit}
          >
            {isTransfer ? t('assignments.transferAction') : t('assignments.attachAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
          <Avatar src={lookup?.photo_thumb_path} name={lookup?.legal_name ?? '?'} size={40} />
          <div className="min-w-0">
            <p className="font-semibold text-fg">{lookup?.legal_name}</p>
            <p className="text-fg-muted">
              {t('assignments.mainPost')}: {lookup?.primary_branch_name || '—'}
              {currentPost ? ` · ${currentPost}` : ''}
            </p>
          </div>
        </div>

        {/* IKKI AMAL — farqi har rejimda matn bilan aytiladi, chunki tashqi
            ko'rinishi bir xil (ikkalasi ham "odamni o'zimga olaman"). */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('concurrent')
              resetFields()
            }}
            aria-pressed={!isTransfer}
            className={tabPill(!isTransfer)}
          >
            {t('assignments.modeConcurrent')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('transfer')
              resetFields()
            }}
            aria-pressed={isTransfer}
            className={tabPill(isTransfer)}
          >
            {t('assignments.modeTransfer')}
          </button>
        </div>
        <p className="text-[12px] text-fg-muted">
          {isTransfer ? t('assignments.transferHint') : t('assignments.attachHint')}
        </p>

        <Field
          label={isTransfer ? t('assignments.fieldTargetBranch') : t('assignments.fieldBranch')}
          required
        >
          <Select
            options={branchOptions}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder={t('common.choose')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('assignments.fieldDepartment')} required>
            <Combobox
              value={departmentId}
              onChange={setDepartmentId}
              options={departmentOptions}
              placeholder={t('common.choose')}
            />
          </Field>
          <Field label={t('assignments.fieldPosition')} required>
            <Combobox
              value={jobPositionId}
              onChange={setJobPositionId}
              options={jobPositionOptions}
              placeholder={t('common.choose')}
            />
          </Field>
          {!isTransfer && (
            <Field label={t('assignments.fieldStavka')} hint={t('assignments.stavkaHint')}>
              <Input
                value={stavka}
                onChange={(e) => setStavka(e.target.value)}
                inputMode="decimal"
                maxLength={4}
              />
            </Field>
          )}
          <Field
            label={isTransfer ? t('assignments.fieldTransferDate') : t('assignments.fieldStartDate')}
          >
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
        </div>

        {/* SOAT BO'YICHA ISHLASH — faqat o'rindoshlikda. Bo'sh qoldirilsa xodim
            shu filialning turniketidan o'tadi va tabeli kun-kun yuritiladi. */}
        {!isTransfer && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('assignments.fieldHoursNorm')} hint={t('assignments.hoursNormHint')}>
                <Input
                  value={hoursNorm}
                  onChange={(e) => setHoursNorm(e.target.value)}
                  inputMode="decimal"
                  maxLength={6}
                  placeholder="80"
                />
              </Field>
              <Field label={t('assignments.fieldHoursPeriod')}>
                <Select
                  options={[
                    { value: 'month', label: t('assignments.periodMonth') },
                    { value: 'week', label: t('assignments.periodWeek') },
                  ]}
                  value={hoursPeriod}
                  onChange={(e) => setHoursPeriod(e.target.value)}
                  disabled={!hoursNorm.trim()}
                />
              </Field>
            </div>
            {hoursNorm.trim() && (
              <p className="text-[12px] text-fg-muted">{t('assignments.hoursExplain')}</p>
            )}
          </>
        )}

        <Field label={t('assignments.fieldOrder')} hint={t('assignments.orderHint')}>
          <Input value={orderReference} onChange={(e) => setOrderReference(e.target.value)} />
        </Field>

        {/* Boshqa filialning shtat xodimini tasodifan qo'shib yubormaslik uchun. */}
        {needsConfirm && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3">
            <Checkbox inLabel checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span className="text-[13px] text-fg">
              {isTransfer
                ? t('assignments.confirmTransfer', {
                    branch: lookup?.primary_branch_name || '—',
                  })
                : t('assignments.confirmBranchStaff', {
                    branch: lookup?.primary_branch_name || '—',
                  })}
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
