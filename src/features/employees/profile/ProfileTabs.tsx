import { useEffect, useMemo, useState } from 'react'
import { isScheduledWeekday } from '@/lib/workCycle'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, GraduationCap, Briefcase, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { WORK_LEAVES } from '@/api/endpoints'
import { Card, EmptyState } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { DateInput } from '@/components/ui/DateInput'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { useCareerMutations } from '@/features/employees/useCareer'
import { cn } from '@/lib/cn'
import { toItems, type ListResponse, type Employee } from '@/types'
import { useAttendance } from '@/features/attendance/useAttendance'
import { DayDetailModal } from '@/features/attendance/DayDetailModal'
import { formatDayRange, useMonthEvents } from '@/features/attendance/useDayEvents'
import { useMonthDocuments } from '@/features/attendance/useDayDocuments'
import { CAL_COLOR, CAL_LABEL, LEGEND_STATUSES, mapCalStatus } from '@/features/attendance/attendanceStatus'
import { percentTone, useScorecard } from '@/features/kpi/api'
import { useAuthStore } from '@/store/authStore'
import { leaveStatusKey, type LeaveRequest } from '@/features/leave/useLeave'
import { StatusPill } from '@/features/dashboard/nocturne/rows'

/* ── KPI ─────────────────────────────────────────────────────────────────── */

/**
 * The person's own scorecard, read-only.
 *
 * The KPI screen proper is where entries are graded; here the question is
 * narrower — "how is this employee doing" — so it shows the result and the
 * indicators behind it and stops there.
 */
const PCT_TEXT: Record<string, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-fg-muted',
}

export function ProfileKpiTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  /* ⚠️ KPI IS BRANCH-BOUND (`/me` reports `kpi_enabled`). Asking for a
     scorecard from a branch where the module is switched off can only ever
     answer 403 — the tab already handled it gracefully, but it fired a request
     on every open that was guaranteed to fail and to log an error. */
  const kpiOff = useAuthStore((st) => st.user?.kpi_enabled) === false
  const { scorecard, loading, denied } = useScorecard(employeeId, null, !kpiOff)

  if (kpiOff)
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title={t('employeeProfile.kpiDenied')}
        description={t('employeeProfile.kpiDeniedHint')}
      />
    )
  if (loading) return <CenteredSpinner />
  if (denied)
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title={t('employeeProfile.kpiDenied')}
        description={t('employeeProfile.kpiDeniedHint')}
      />
    )
  const entries = scorecard?.entries ?? []
  const pct = scorecard?.result_percent

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-[11.5px] text-fg-subtle">
            {t('employeeProfile.kpiResult')}
          </p>
          <p
            className={cn(
              'tabnum text-[34px] font-bold leading-none',
              pct == null ? 'text-fg-subtle' : PCT_TEXT[percentTone(pct)],
            )}
          >
            {pct == null ? '—' : `${Math.round(pct)}%`}
          </p>
        </div>
        {scorecard?.period && (
          <div>
            <p className="text-[11.5px] text-fg-subtle">
              {t('employeeProfile.kpiPeriod')}
            </p>
            <p className="text-[15px] text-fg">{scorecard.period}</p>
          </div>
        )}
      </Card>

      {entries.length === 0 ? (
        <EmptyState title={t('employeeProfile.kpiEmpty')} description={t('employeeProfile.kpiEmptyHint')} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                  {e.indicator?.name ?? `#${e.id}`}
                </span>
                <span className="tabnum shrink-0 text-[13px] text-fg-muted">
                  {e.plan_value ?? '—'} / {e.fact_value ?? '—'}
                </span>
                <span className="tabnum w-16 shrink-0 text-right text-[13px] font-semibold text-fg">
                  {e.result_percent == null ? '—' : `${Math.round(Number(e.result_percent))}%`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* ── Shaxsiy tabel ───────────────────────────────────────────────────────── */

/**
 * One month of this person's attendance as the tabel keeps it.
 *
 * Deliberately a CALENDAR, not a list: the question people bring here is
 * "which days did they miss", and a grid answers it at a glance while a table
 * of forty rows does not.
 */
export function ProfileTabelTab({
  employeeId,
  showLegend = true,
  initialMonth,
}: {
  employeeId: number
  /** The nine-status key. Useful on the profile page, noise inside a modal
   *  where the day cells are already explained by their own tooltip. */
  showLegend?: boolean
  /** Month to open on (any date in it) — the attendance sheet opens on the
   *  month of the period being reviewed, not always on today's. */
  initialMonth?: string
}) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(() => {
    const m = initialMonth ? dayjs(initialMonth) : dayjs()
    return (m.isAfter(dayjs()) ? dayjs() : m).startOf('month')
  })
  const today = dayjs()
  const isCurrent = month.isSame(today, 'month')
  const from = month.format('YYYY-MM-DD')
  // Never ask past today: the API files every day with no event as "absent",
  // so a full future month would paint days that have not happened yet red.
  const to = (isCurrent ? today : month.endOf('month')).format('YYYY-MM-DD')

  const { rows, loading } = useAttendance({ from, to, page: 1, size: 1, employeeId })
  const me = rows.find((r) => r.id === employeeId)
  const summary = me?.attendance
  /* v1 opens a day when its cell is clicked — plan against fact, the breaks,
     and the raw pass log. The calendar alone answers "which days", the day
     modal answers "what happened on that one". */
  const [openDay, setOpenDay] = useState<string | null>(null)
  const { byDay } = useMonthEvents(employeeId, month)
  const docs = useMonthDocuments(employeeId, from, to)
  const calendar = summary?.calendar ?? {}

  const cells = useMemo(() => {
    const first = month.startOf('month')
    const lead = (first.day() + 6) % 7 // Monday-first
    const days = month.daysInMonth()
    const out: (null | { iso: string; day: number })[] = Array(lead).fill(null)
    for (let d = 1; d <= days; d++) {
      out.push({ iso: month.date(d).format('YYYY-MM-DD'), day: d })
    }
    return out
  }, [month])

  const weekdaysShort = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const months = t('date.months', { returnObjects: true }) as string[]

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <IconButton label={t('common.prev')} onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
          <ChevronLeft size={16} />
        </IconButton>
        <span className="min-w-[160px] text-center text-[15px] font-semibold capitalize text-fg">
          {months[month.month()]} {month.year()}
        </span>
        <IconButton
          label={t('common.next')}
          disabled={isCurrent}
          onClick={() => setMonth((m) => m.add(1, 'month'))}
        >
          <ChevronRight size={16} />
        </IconButton>
        {summary && (
          <div className="ml-auto flex flex-wrap gap-4 text-[12px] text-fg-muted">
            <span>
              {t('myAttendance.present')}:{' '}
              <b className="text-success">{summary.present_days_count ?? 0}</b>
            </span>
            <span>
              {t('myAttendance.late')}: <b className="text-warning">{summary.late_days_count ?? 0}</b>
            </span>
            <span>
              {t('myAttendance.absent')}: <b className="text-danger">{summary.absent_days_count ?? 0}</b>
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <CenteredSpinner />
      ) : (
        <>
          <div className="grid max-w-[680px] grid-cols-7 gap-1.5">
            {weekdaysShort.map((w, i) => (
              <div
                key={i}
                className="pb-1 text-center text-[11.5px] text-fg-subtle"
              >
                {w}
              </div>
            ))}
            {cells.map((c, i) =>
              c === null ? (
                <div key={`e${i}`} />
              ) : (
                (() => {
                  /* v1 wrote the day ON the cell — in and out times, or the
                     order's letter — and the colour alone left HR hovering
                     every square to read a month (2026-09-28). */
                  const range = formatDayRange(byDay.get(c.iso))
                  // A pass on a «rest» day (a duty worker's shift) is a day
                  // worked — v1 painted it as present, not grey.
                  const raw = mapCalStatus(calendar[c.iso])
                  const status = range && raw === 'day_off' ? 'present' : raw
                  const notYet = dayjs(c.iso).isAfter(today, 'day')
                  // A planned order / leave / trip on a coming day is real data —
                  // it keeps its colour and letter (the «Mening davomatim» rule);
                  // only a coming day with no status at all is greyed out.
                  const future = notYet && !calendar[c.iso]
                  const token = CAL_COLOR[status]
                  const late = summary?.daily_late_minutes?.[c.iso] ?? 0
                  const note = future || !calendar[c.iso]
                    ? ''
                    : range
                      ? ''
                      : status === 'work_leave'
                        ? `${hhmmOf(me?.working_hours_start) ?? '09:00'}–${hhmmOf(me?.working_hours_end) ?? '18:00'}`
                        : (CAL_SHORT[status] ?? t(`attendance.${CAL_LABEL[status]}` as never))
                  return (
                    <button
                      key={c.iso}
                      type="button"
                      // A day that has not happened has nothing to open.
                      disabled={notYet}
                      onClick={() => setOpenDay(c.iso)}
                      title={t(`attendance.${CAL_LABEL[status]}` as never)}
                      className={cn(
                        'flex h-[74px] flex-col items-center justify-center rounded-inner text-[13px] transition-[filter,transform]',
                        future
                          ? 'cursor-default'
                          : 'cursor-pointer hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]',
                      )}
                      style={
                        future
                          ? { background: 'rgb(var(--fg) / 0.03)', color: 'rgb(var(--fg-subtle))' }
                          : {
                              background: `rgb(var(${token}) / 0.14)`,
                              color: `rgb(var(${token}))`,
                            }
                      }
                    >
                      <span className="tabnum font-semibold">{c.day}</span>
                      {range && (
                        <span className="tabnum mt-1 text-[10.5px] font-medium leading-tight text-fg">
                          {range}
                          {late > 0 && <b className="ml-1 text-warning">+{late}</b>}
                        </span>
                      )}
                      {note && <span className="mt-1 max-w-full truncate px-1 text-[10px] font-medium leading-tight">{note}</span>}
                    </button>
                  )
                })()
              ),
            )}
          </div>

          {showLegend && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGEND_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: `rgb(var(${CAL_COLOR[s]}))` }}
                />
                {t(`attendance.${CAL_LABEL[s]}` as never)}
              </span>
            ))}
          </div>
          )}

          {/* The SAME modal «Mening davomatim» opens — plan against fact, the
              breaks, the pass log and the gate map. It was only ever reachable
              from a person's own page; the calendar of a colleague or of an
              employee being reviewed drew the colours and answered nothing. */}
          <DayDetailModal
            date={openDay}
            status={openDay ? mapCalStatus(calendar[openDay]) : 'day_off'}
            day={openDay ? byDay.get(openDay) : null}
            lateMinutes={openDay ? summary?.daily_late_minutes?.[openDay] : undefined}
            workingStart={hhmmOf(me?.working_hours_start)}
            workingEnd={hhmmOf(me?.working_hours_end)}
            lunchStart={me?.lunch_start_time}
            lunchEnd={me?.lunch_end_time}
            isWorkingDay={openDay ? isScheduledWeekday(me, openDay) : true}
            documents={docs.forDate(openDay)}
            onClose={() => setOpenDay(null)}
          />
        </>
      )}
    </Card>
  )
}

/** v1's letters for order days (the timesheet codes HR reads); other
 *  statuses print their own short word. */
const CAL_SHORT: Partial<Record<ReturnType<typeof mapCalStatus>, string>> = {
  sick_leave: 'Б',
  annual_leave: 'ОТ',
  business_trip: 'К',
  dekret: 'DT',
  unpaid_leave: 'БТ',
  dismissed: 'О',
}

/** API sends "09:00:00"; the modal wants "09:00". */
function hhmmOf(time?: string | null): string | undefined {
  return time ? time.slice(0, 5) : undefined
}

/* ── Karyera ─────────────────────────────────────────────────────────────── */

/**
 * ⚠️ MAYDON NOMLARI SERVERNIKI. Ilgari bu yerda `institution`, `organization`,
 * `specialty`, `degree` o'qilardi — server esa `institution_name`,
 * `company_name`, `faculty_name`, `degree_name` yuboradi, ya'ni ma'lumot
 * BO'LSA HAM ekranda «—» chiqardi.
 */
interface EducationRow {
  id?: number
  institution_name?: string | null
  faculty_name?: string | null
  degree_name?: string | null
  start_date?: string | null
  end_date?: string | null
}

interface ExperienceRow {
  id?: number
  company_name?: string | null
  position?: string | null
  start_date?: string | null
  end_date?: string | null
}

/**
 * Education and previous employers, as the personnel file records them.
 *
 * ⚠️ TAHRIRLANADI. Ilgari bu tab FAQAT O'QISH uchun edi — backendda to'liq
 * CRUD bo'lsa-da (`/employees/{id}/educations`, `.../work-experiences`), kadr
 * xodimning ta'limi yoki oldingi ish joyini kirita olmasdi. TZ 4.2.7 ikkalasini
 * ham talab qiladi: «период обучения (от и до) · учебное заведение ·
 * специальность» va «организация · должность · дата начала · дата завершения».
 */
export function ProfileCareerTab({
  employee,
  canEdit = false,
}: {
  employee: Employee
  canEdit?: boolean
}) {
  const { t } = useTranslation()
  const e = employee as unknown as Record<string, unknown>
  const educations = (e.educations as EducationRow[]) ?? []
  const experiences = (e.work_experiences as ExperienceRow[]) ?? []
  const mut = useCareerMutations(employee.id)
  const toast = useToast()
  const confirm = useConfirm()
  const [eduRow, setEduRow] = useState<EducationRow | 'new' | null>(null)
  const [expRow, setExpRow] = useState<ExperienceRow | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  const period = (r: { start_date?: string | null; end_date?: string | null }) => {
    const a = r.start_date ? dayjs(r.start_date).format('DD.MM.YYYY') : ''
    const b = r.end_date ? dayjs(r.end_date).format('DD.MM.YYYY') : ''
    if (!a && !b) return '—'
    return `${a || '…'} — ${b || t('employeeProfile.present')}`
  }

  const run = async (fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(true)
    try {
      await fn()
      mut.invalidate()
      toast.ok(t('common.saved'))
      done?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <GraduationCap size={15} className="text-brand-strong" />
          <h3 className="text-[14px] font-bold text-fg">{t('employeeProfile.education')}</h3>
          {canEdit && (
            <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => setEduRow('new')}>
              {t('common.add')}
            </Button>
          )}
        </div>
        {educations.length === 0 ? (
          <EmptyState title={t('employeeProfile.noEducation')} />
        ) : (
          <ul className="divide-y divide-line">
            {educations.map((r, i) => (
              <li key={r.id ?? i} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{r.institution_name || '—'}</p>
                  <p className="text-xs text-fg-muted">
                    {[r.faculty_name, r.degree_name].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="tabnum mt-0.5 text-[11px] text-fg-subtle">{period(r)}</p>
                </div>
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <IconButton size="sm" label={t('common.edit')} onClick={() => setEduRow(r)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton size="sm" label={t('common.delete')} onClick={async () => { if (!r.id || !(await confirm({ kind: 'delete', subject: r.institution_name }))) return; run(() => mut.removeEducation.mutateAsync(r.id!)) }}>
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Briefcase size={15} className="text-brand-strong" />
          <h3 className="text-[14px] font-bold text-fg">{t('employeeProfile.experience')}</h3>
          {canEdit && (
            <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => setExpRow('new')}>
              {t('common.add')}
            </Button>
          )}
        </div>
        {experiences.length === 0 ? (
          <EmptyState title={t('employeeProfile.noExperience')} />
        ) : (
          <ul className="divide-y divide-line">
            {experiences.map((r, i) => (
              <li key={r.id ?? i} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{r.company_name || '—'}</p>
                  <p className="text-xs text-fg-muted">{r.position || '—'}</p>
                  <p className="tabnum mt-0.5 text-[11px] text-fg-subtle">{period(r)}</p>
                </div>
                {canEdit && (
                  <span className="flex shrink-0 gap-1">
                    <IconButton size="sm" label={t('common.edit')} onClick={() => setExpRow(r)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton size="sm" label={t('common.delete')} onClick={async () => { if (!r.id || !(await confirm({ kind: 'delete', subject: r.company_name }))) return; run(() => mut.removeExperience.mutateAsync(r.id!)) }}>
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CareerModal
        open={!!eduRow}
        busy={busy}
        title={t('employeeProfile.education')}
        fields={[
          { key: 'institution_name', label: t('employeeProfile.fieldInstitution'), required: true },
          { key: 'faculty_name', label: t('employeeProfile.fieldFaculty'), required: true },
          { key: 'degree_name', label: t('employeeProfile.fieldDegree'), required: true },
          { key: 'start_date', label: t('employeeProfile.fieldFrom'), date: true, required: true },
          { key: 'end_date', label: t('employeeProfile.fieldTo'), date: true, required: true },
        ]}
        value={eduRow === 'new' ? {} : ((eduRow ?? {}) as Record<string, string>)}
        onClose={() => setEduRow(null)}
        onSubmit={(body) =>
          run(
            () =>
              eduRow !== 'new' && (eduRow as EducationRow)?.id
                ? mut.updateEducation.mutateAsync({ id: (eduRow as EducationRow).id!, body: body as never })
                : mut.createEducation.mutateAsync(body as never),
            () => setEduRow(null),
          )
        }
      />

      <CareerModal
        open={!!expRow}
        busy={busy}
        title={t('employeeProfile.experience')}
        fields={[
          { key: 'company_name', label: t('employeeProfile.fieldCompany'), required: true },
          { key: 'position', label: t('employeeProfile.fieldPosition'), required: true },
          { key: 'start_date', label: t('employeeProfile.fieldFrom'), date: true, required: true },
          { key: 'end_date', label: t('employeeProfile.fieldTo'), date: true, required: true },
        ]}
        value={expRow === 'new' ? {} : ((expRow ?? {}) as Record<string, string>)}
        onClose={() => setExpRow(null)}
        onSubmit={(body) =>
          run(
            () =>
              expRow !== 'new' && (expRow as ExperienceRow)?.id
                ? mut.updateExperience.mutateAsync({ id: (expRow as ExperienceRow).id!, body: body as never })
                : mut.createExperience.mutateAsync(body as never),
            () => setExpRow(null),
          )
        }
      />
    </div>
  )
}

/** Ta'lim va ish tajribasi uchun bitta forma — ikkalasi bir xil shaklda. */
function CareerModal({
  open,
  busy,
  title,
  fields,
  value,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  title: string
  fields: { key: string; label: string; date?: boolean; required?: boolean }[]
  value: Record<string, string>
  onClose: () => void
  onSubmit: (body: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(Object.fromEntries(fields.map((f) => [f.key, String(value[f.key] ?? '')])))
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = () => {
    const missing = fields.filter((f) => f.required && !String(form[f.key] ?? '').trim())
    if (missing.length) return setError(t('employeeProfile.fillRequired'))
    onSubmit(form)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} wide={!f.date}>
            {f.date ? (
              <DateInput
                value={form[f.key] ?? ''}
                onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))}
                aria-label={f.label}
              />
            ) : (
              <Input
                value={form[f.key] ?? ''}
                onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))}
                aria-label={f.label}
              />
            )}
          </Field>
        ))}
      </div>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}

/* ── Ruxsatlar ───────────────────────────────────────────────────────────── */

const LEAVE_TONE = { pending: 'warning', signed: 'success', rejected: 'danger' } as const

/** Every leave / permission request this person has filed. */
/* `work` / `personal` are what an employee's own request carries; an HR
 * order (sick leave, annual leave, …) carries the leave category, which used
 * to fall through to «Shaxsiy sabab» — a sick leave read as a personal day. */
const LEAVE_CATEGORIES = [
  'kasal', 'mehnat_tatili', 'xizmat_safari', 'dekret', 'haqsiz_tatil', 'ishdan_ozod',
  'tolanmaydigan_tatil', 'noaniq_sabab', 'harbiy_xizmat', 'progul', 'malumotnoma',
  'ish_haqi_saqlangan', 'malaka_oshirish', 'oquv_tatil', 'otgul',
  'boshqa_ishga_otkazish', 'mehnat_tatilidan_chaqirish', 'ruxsat',
] as const
function leaveTypeLabel(t: (k: never) => string, type?: string | null): string {
  const v = (type ?? '').toLowerCase()
  if (!v || v === 'work') return t('leave.typeWork' as never)
  if (v === 'personal') return t('leave.typePersonal' as never)
  return (LEAVE_CATEGORIES as readonly string[]).includes(v) ? t(`leave.cat_${v}` as never) : type || ''
}

export function ProfileLeavesTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['employee-leaves', employeeId],
    queryFn: () => apiGet<ListResponse<LeaveRequest>>(WORK_LEAVES, { employee_id: employeeId }),
    retry: false,
  })
  const rows = toItems(q.data)

  if (q.isLoading) return <CenteredSpinner />
  if (q.isError)
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title={t('employeeProfile.leavesDenied')}
        description={t('employeeProfile.leavesDeniedHint')}
      />
    )
  if (!rows.length)
    return <EmptyState title={t('leave.empty')} description={t('employeeProfile.noLeavesHint')} />

  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const key = leaveStatusKey(r.status)
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                {leaveTypeLabel(t, r.type)}
                {r.description ? ` · ${r.description}` : ''}
              </span>
              <span className="tabnum shrink-0 text-[12px] text-fg-muted">
                {dayjs(r.start_date).format('DD.MM.YYYY')} — {dayjs(r.end_date).format('DD.MM.YYYY')}
              </span>
              <StatusPill tone={LEAVE_TONE[key]}>
                {t(
                  key === 'pending'
                    ? 'leave.statusPending'
                    : key === 'signed'
                      ? 'leave.statusSigned'
                      : 'leave.statusRejected',
                )}
              </StatusPill>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
