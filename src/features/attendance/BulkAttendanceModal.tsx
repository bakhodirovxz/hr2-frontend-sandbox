import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, CheckCircle2, Clock, Loader2, UsersRound, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { TD_COMPACT, TH } from '@/components/data/tableStyles'
import { fetchAllPages } from '@/api/fetchAll'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import type { Employee } from '@/types'
import { cn } from '@/lib/cn'
import { dmy, formatHm } from './period'
import {
  BULK_MAX_CELLS,
  BULK_MAX_DAYS,
  BULK_MAX_EMPLOYEES,
  dayTypeNeedsBasis,
  diffMinutes,
  useBulkManualAttendance,
  useManualMeta,
  type BulkResult,
  type BulkResultRow,
} from './useManualAttendance'

/** Natija jadvalida bir yo'la chiziladigan qatorlar (5000 tagacha bo'lishi mumkin). */
const RESULT_RENDER_CAP = 300

type ResultFilter = 'all' | 'ok' | 'failed'

/**
 * DAVOMATNI OMMAVIY TO'LDIRISH — TZ I2 1639 «Массовое заполнение —
 * запускается при необходимости заполнить данные для группы сотрудников.
 * Система позволяет применить значения ко всем выбранным сотрудникам».
 *
 * Bitta qo'lda tuzatish formasining o'sha maydonlari (kun turi, kelish/ketish,
 * yo'qlik asosi, izoh) — tanlangan xodimlar va sanalar oralig'ining har bir
 * kuniga. Xodimlar bittalab yoki butun bo'lim bilan qo'shiladi. Server har
 * katakni bitta yozuvdagi kabi tekshiradi (ko'lam, kelajak sana, vaqt tartibi)
 * va qator bo'yicha natija qaytaradi — rad etilgani boshqalarini to'xtatmaydi.
 */
export function BulkAttendanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { dayTypes } = useManualMeta(open)
  const departments = useDepartmentOptions()
  const bulk = useBulkManualAttendance()

  const today = dayjs().format('YYYY-MM-DD')
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [dept, setDept] = useState('')
  const [deptLoading, setDeptLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [dayType, setDayType] = useState('present')
  const [checkIn, setCheckIn] = useState('09:00')
  const [checkOut, setCheckOut] = useState('18:00')
  const [basis, setBasis] = useState('')
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [result, setResult] = useState<BulkResult | null>(null)
  const [filter, setFilter] = useState<ResultFilter>('failed')

  useEffect(() => {
    if (!open) return
    setPeople([])
    setDept('')
    setDateFrom(today)
    setDateTo(today)
    setDayType('present')
    setCheckIn('09:00')
    setCheckOut('18:00')
    setBasis('')
    setComment('')
    setErrors({})
    setFormError('')
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const isWork = dayType === 'present'
  const needsBasis = dayTypeNeedsBasis(dayType)
  const minutes = isWork ? diffMinutes(checkIn, checkOut) : null
  const timeInvalid = isWork && minutes != null && minutes < 0
  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo
  const days = dateFrom && dateTo && !rangeInvalid ? dayjs(dateTo).diff(dayjs(dateFrom), 'day') + 1 : 0
  const cells = days * people.length
  const tooMany =
    days > BULK_MAX_DAYS
      ? t('sysOps.bulkTooManyDays', { max: BULK_MAX_DAYS })
      : people.length > BULK_MAX_EMPLOYEES
        ? t('sysOps.bulkTooManyPeople', { max: BULK_MAX_EMPLOYEES })
        : cells > BULK_MAX_CELLS
          ? t('sysOps.bulkTooManyCells', { max: BULK_MAX_CELLS })
          : ''

  /** Bo'limning barcha faol xodimlari (sizning darajangizda) — tanlovga qo'shiladi. */
  const addDepartment = async () => {
    if (!dept) return
    setDeptLoading(true)
    try {
      const rows = await fetchAllPages<Employee>(EMPLOYEES_LIST, { department_id: Number(dept) })
      const have = new Set(people.map((p) => p.id))
      const added = rows
        .filter((e) => !have.has(e.id))
        .map((e) => ({ id: e.id, legal_name: e.legal_name, photo_thumb_path: e.photo_thumb_path }))
      setPeople((p) => [...p, ...added])
      toast.ok(t('sysOps.bulkDeptAdded', { count: added.length }))
      setDept('')
    } catch (e) {
      toast.error(errorMessage(e, t('list.loadFailed')))
    } finally {
      setDeptLoading(false)
    }
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!people.length) next.people = t('sysOps.bulkPickPeople')
    if (!dateFrom) next.dateFrom = t('davomat.dateRequired')
    if (!dateTo) next.dateTo = t('davomat.dateRequired')
    else if (rangeInvalid) next.dateTo = t('davomat.rangeInvalid')
    if (isWork) {
      if (!checkIn) next.checkIn = t('davomat.checkInRequired')
      if (!checkOut) next.checkOut = t('davomat.checkOutRequired')
      else if (timeInvalid) next.checkOut = t('davomat.timeOrder')
    }
    setErrors(next)
    return Object.keys(next).length === 0 && !tooMany
  }

  const submit = async () => {
    setFormError('')
    if (!validate()) return
    const ok = await confirm({
      kind: 'action',
      title: t('sysOps.bulkTitle'),
      description: t('sysOps.bulkConfirm', {
        people: people.length,
        days,
        cells,
        type: t(`davomat.dt_${dayType}` as never),
      }),
      confirmLabel: t('sysOps.bulkApply'),
    })
    if (!ok) return
    try {
      const r = await bulk.mutateAsync({
        employee_ids: people.map((p) => p.id),
        date_from: dateFrom,
        date_to: dateTo,
        day_type: dayType,
        check_in: isWork ? checkIn : null,
        check_out: isWork ? checkOut : null,
        absence_basis: needsBasis ? basis.trim() || null : null,
        comment: comment.trim() || null,
      })
      setResult(r)
      setFilter(r.failed > 0 ? 'failed' : 'all')
      if (r.failed === 0) toast.ok(t('sysOps.bulkAllSaved', { count: r.saved }))
    } catch (e) {
      if (errorCode(e) === 'bulk_too_large') {
        const p = errorParams(e)
        setFormError(
          t('sysOps.bulkTooLarge', {
            days: Number(p.max_days ?? BULK_MAX_DAYS),
            cells: Number(p.max_cells ?? BULK_MAX_CELLS),
          }),
        )
      } else {
        setFormError(errorMessage(e, t('common.actionFailed')))
      }
    }
  }

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.legal_name || `#${p.id}`])), [people])

  return (
    <Modal
      open={open}
      onClose={bulk.isPending ? () => undefined : onClose}
      size="lg"
      title={t('sysOps.bulkTitle')}
      description={result ? t('sysOps.bulkResultSub') : t('sysOps.bulkSub')}
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={() => setResult(null)}>
              {t('sysOps.bulkBack')}
            </Button>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={bulk.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submit()} loading={bulk.isPending} disabled={timeInvalid || rangeInvalid || !!tooMany}>
              {t('sysOps.bulkApply')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <BulkResultView result={result} names={names} filter={filter} onFilter={setFilter} />
      ) : (
        <div className="grid gap-4">
          <div className="flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <span className="text-[12px] text-fg-muted">
              {t('davomat.manualWarning')} {t('sysOps.bulkOverwrite')}
            </span>
          </div>

          <Field label={t('sysOps.bulkPeople')} required error={errors.people}>
            <EmployeeMultiPicker
              value={people}
              onChange={(v) => {
                setPeople(v)
                if (errors.people) setErrors((x) => ({ ...x, people: '' }))
              }}
              invalid={!!errors.people}
              placeholder={t('sysOps.bulkPeoplePh')}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('sysOps.bulkByDept')} className="min-w-[16rem] flex-1">
              <Combobox
                value={dept}
                onChange={setDept}
                options={departments}
                placeholder={t('davomat.allDepartments')}
              />
            </Field>
            <Button
              variant="secondary"
              leftIcon={deptLoading ? <Loader2 size={14} className="animate-spin" /> : <UsersRound size={14} />}
              disabled={!dept || deptLoading}
              onClick={() => void addDepartment()}
            >
              {t('sysOps.bulkAddDept')}
            </Button>
            {people.length > 0 && (
              <Button variant="ghost" onClick={() => setPeople([])}>
                {t('sysOps.bulkClearPeople', { count: people.length })}
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('davomat.dateFrom')} required error={errors.dateFrom}>
              <DateInput value={dateFrom} onChange={setDateFrom} max={today} invalid={!!errors.dateFrom} aria-label={t('davomat.dateFrom')} />
            </Field>
            <Field label={t('davomat.dateTo')} required error={errors.dateTo || (rangeInvalid ? t('davomat.rangeInvalid') : undefined)}>
              <DateInput
                value={dateTo}
                onChange={setDateTo}
                max={today}
                invalid={!!errors.dateTo || rangeInvalid}
                aria-label={t('davomat.dateTo')}
              />
            </Field>
            <Field label={t('davomat.fieldDayType')}>
              <Select
                value={dayType}
                onChange={(e) => {
                  setDayType(e.target.value)
                  setErrors((x) => ({ ...x, checkIn: '', checkOut: '' }))
                }}
                options={dayTypes.map((d) => ({ value: d.value, label: t(`davomat.dt_${d.value}`) }))}
              />
            </Field>
            {isWork && (
              <>
                <Field label={t('davomat.fieldCheckIn')} required error={errors.checkIn}>
                  <TimeInput value={checkIn} onChange={setCheckIn} invalid={!!errors.checkIn} aria-label={t('davomat.fieldCheckIn')} />
                </Field>
                <Field
                  label={t('davomat.fieldCheckOut')}
                  required
                  error={errors.checkOut || (timeInvalid ? t('davomat.timeOrder') : undefined)}
                >
                  <TimeInput
                    value={checkOut}
                    onChange={setCheckOut}
                    invalid={!!errors.checkOut || timeInvalid}
                    aria-label={t('davomat.fieldCheckOut')}
                  />
                </Field>
                <div className="flex items-end">
                  {minutes != null && !timeInvalid && (
                    <div className="flex h-control w-full items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-inner border border-brand/25 bg-brand-soft px-3 text-[12px]">
                      <Clock size={13} className="shrink-0 text-brand" />
                      <span className="truncate text-fg-muted">{t('davomat.worked')}:</span>
                      <span className="shrink-0 font-semibold text-fg">{formatHm(minutes, t)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {needsBasis && (
            <Field label={t('davomat.fieldBasis')}>
              <Input
                value={basis}
                maxLength={255}
                onChange={(e) => setBasis(e.target.value)}
                placeholder={t('davomat.basisPlaceholder')}
                aria-label={t('davomat.fieldBasis')}
              />
            </Field>
          )}
          <Field label={t('davomat.fieldComment')}>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('davomat.commentPlaceholder')}
              aria-label={t('davomat.fieldComment')}
            />
          </Field>

          <p
            className={cn(
              'rounded-inner px-3 py-2 text-[12.5px] tabular-nums',
              tooMany ? 'bg-danger-soft text-danger' : 'bg-fg/[0.04] text-fg-muted',
            )}
            aria-live="polite"
          >
            {tooMany || t('sysOps.bulkSummary', { people: people.length, days, cells })}
          </p>
          <FormError>{formError}</FormError>
        </div>
      )}
    </Modal>
  )
}

function BulkResultView({
  result,
  names,
  filter,
  onFilter,
}: {
  result: BulkResult
  names: Map<number, string>
  filter: ResultFilter
  onFilter: (f: ResultFilter) => void
}) {
  const { t } = useTranslation()
  const rows = result.items.filter((r) => (filter === 'all' ? true : filter === 'ok' ? r.ok : !r.ok))
  const shown = rows.slice(0, RESULT_RENDER_CAP)
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t('sysOps.bulkTotal')} value={result.total} />
        <Stat label={t('sysOps.bulkSaved')} value={result.saved} tone="success" />
        <Stat label={t('sysOps.bulkRefused')} value={result.failed} tone={result.failed ? 'danger' : undefined} />
      </div>
      <Segmented
        size="sm"
        value={filter}
        onChange={onFilter}
        aria-label={t('sysOps.bulkFilter')}
        options={[
          { value: 'failed', label: t('sysOps.bulkRefused'), count: result.failed },
          { value: 'ok', label: t('sysOps.bulkSaved'), count: result.saved },
          { value: 'all', label: t('sysOps.bulkAll'), count: result.total },
        ]}
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-fg-subtle">{t('sysOps.bulkNoRows')}</p>
      ) : (
        <div className="scroll-thin max-h-[22rem] overflow-auto rounded-inner border border-line">
          <table className="w-full min-w-[560px] text-left">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th scope="col" className={TH}>{t('davomat.colEmployee')}</th>
                <th scope="col" className={cn(TH, 'w-28')}>{t('davomat.fieldDate')}</th>
                <th scope="col" className={cn(TH, 'w-32')}>{t('sysOps.bulkColResult')}</th>
                <th scope="col" className={TH}>{t('sysOps.bulkColReason')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <ResultRow key={`${r.employee_id}-${r.work_date ?? 'x'}-${i}`} r={r} name={names.get(r.employee_id) ?? `#${r.employee_id}`} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown.length && (
        <p className="text-[11.5px] text-fg-subtle">{t('sysOps.bulkCapped', { shown: shown.length, total: rows.length })}</p>
      )}
    </div>
  )
}

function ResultRow({ r, name }: { r: BulkResultRow; name: string }) {
  const { t } = useTranslation()
  return (
    <tr className="border-t border-line/60">
      <td className={cn(TD_COMPACT, 'text-fg')}>{name}</td>
      <td className={cn(TD_COMPACT, 'tabular-nums text-fg-muted')}>{r.work_date ? dmy(r.work_date) : t('sysOps.bulkAllDays')}</td>
      <td className={TD_COMPACT}>
        {r.ok ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-success">
            <CheckCircle2 size={13} aria-hidden /> {t('sysOps.bulkSavedOne')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-danger">
            <XCircle size={13} aria-hidden /> {t('sysOps.bulkRefusedOne')}
          </span>
        )}
      </td>
      <td className={cn(TD_COMPACT, 'text-[12.5px] text-fg-muted')}>{r.ok ? '' : r.error || r.code || '—'}</td>
    </tr>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-control bg-fg/[0.04] px-2 py-2.5">
      <p
        className={cn(
          'text-[18px] font-bold tabular-nums',
          tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-fg-subtle">{label}</p>
    </div>
  )
}
