import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Mail, Phone, RefreshCw, Save } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadError } from '@/components/data/LoadError'
import { TD, TD_MESSAGE, TH } from '@/components/data/tableStyles'
import { errorMessage } from '@/api/errorMessage'
import { useServerText } from '@/features/statistics/serverText'
import { inTashkent } from '@/lib/format'
import {
  useApplicationStatuses,
  useUpdateApplication,
  useVacancyApplications,
  type VacancyApplication,
} from './useStaffPositions'

/**
 * TZ V3 / 4.2.10 «Arizalar» — HR reviews candidates' applications: status
 * (new → invited → interviewed → hired / rejected), interview time and a note
 * the candidate sees in «Mening arizalarim».
 */
const TONE: Record<string, BadgeTone> = {
  new: 'info',
  invited: 'warning',
  interviewed: 'brand',
  hired: 'success',
  rejected: 'danger',
}

/** `datetime-local` value (YYYY-MM-DDTHH:mm) in Tashkent time. */
const toLocal = (v?: string | null) => (v ? inTashkent(v).format('YYYY-MM-DDTHH:mm') : '')

export function VacancyApplicationsPanel() {
  const { t } = useTranslation()
  const st = useServerText()
  const [status, setStatus] = useState('')
  const statuses = useApplicationStatuses()
  const list = useVacancyApplications(status, true)
  const statusOptions = useMemo(
    () => (statuses.data ?? []).map((s) => ({ value: s.value, label: st(s.label) })),
    [statuses.data, st],
  )
  const rows = list.data ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={statusOptions}
          placeholder={t('orgRef.allStatuses')}
          aria-label={t('orgRef.status')}
          wrapperClassName="w-[220px]"
        />
        <Button size="sm" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void list.refetch()}>
          {t('orgRef.refresh')}
        </Button>
        {list.data && <span className="text-[12px] text-fg-muted">{t('orgRef.total', { count: rows.length })}</span>}
      </div>
      {list.error ? (
        <div className="p-6">
          <LoadError error={list.error} onRetry={() => void list.refetch()} />
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="border-b border-line bg-surface-2/50">
              <tr>
                <th className={TH}>{t('orgRef.candidate')}</th>
                <th className={TH}>{t('orgRef.contact')}</th>
                <th className={TH}>{t('orgRef.vacancy')}</th>
                <th className={TH}>{t('orgRef.status')}</th>
                <th className={TH}>{t('orgRef.interviewAt')}</th>
                <th className={TH}>{t('staff.note')}</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td colSpan={7} className={TD_MESSAGE}>
                    {t('common.loading')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6">
                    <EmptyState title={t('orgRef.noApplications')} />
                  </td>
                </tr>
              ) : (
                rows.map((a) => <ApplicationRow key={a.id} app={a} statusOptions={statusOptions} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ApplicationRow({
  app,
  statusOptions,
}: {
  app: VacancyApplication
  statusOptions: { value: string; label: string }[]
}) {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  const save = useUpdateApplication()
  const [status, setStatus] = useState(app.status)
  const [interviewAt, setInterviewAt] = useState(toLocal(app.interview_at))
  const [note, setNote] = useState(app.review_note ?? '')
  useEffect(() => {
    setStatus(app.status)
    setInterviewAt(toLocal(app.interview_at))
    setNote(app.review_note ?? '')
  }, [app])
  const dirty = status !== app.status || interviewAt !== toLocal(app.interview_at) || note !== (app.review_note ?? '')

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: app.id,
        body: {
          status,
          // Entered in Tashkent time; sent with the offset so the server stores the right instant.
          interview_at: interviewAt
            ? `${interviewAt.includes('T') ? interviewAt : `${interviewAt}T00:00`}:00+05:00`
            : null,
          review_note: note.trim() || null,
        },
      })
      toast.ok(t('orgRef.applicationSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('staff.saveFailed')))
    }
  }

  const vacancy =
    app.vacancy_title ||
    [app.job_position_name, app.department_name].filter(Boolean).join(' — ') ||
    `#${app.staff_position_id}`

  return (
    <tr className="border-b border-line/60 align-top">
      <td className={TD}>
        <p className="font-semibold text-fg">{app.full_name}</p>
        <p className="tabnum text-[12px] text-fg-subtle">
          {app.created_at ? inTashkent(app.created_at).format('DD.MM.YYYY HH:mm') : ''}
        </p>
        {app.about && (
          <p className="mt-1 line-clamp-3 max-w-[280px] text-[12px] text-fg-muted" title={app.about}>
            {app.about}
          </p>
        )}
      </td>
      <td className={`${TD} text-[12px] text-fg-muted`}>
        {app.phone && (
          <span className="flex items-center gap-1.5">
            <Phone size={11} aria-hidden /> {app.phone}
          </span>
        )}
        {app.email && (
          <span className="flex items-center gap-1.5">
            <Mail size={11} aria-hidden /> {app.email}
          </span>
        )}
        {app.preferred_date && (
          <span className="mt-0.5 block text-fg-subtle">
            {t('orgRef.preferredDate')}: {dayjs(app.preferred_date).format('DD.MM.YYYY')}
          </span>
        )}
      </td>
      <td className={`${TD} text-fg-muted`}>{vacancy}</td>
      <td className={`${TD} min-w-[190px]`}>
        <Badge tone={TONE[app.status] ?? 'neutral'} className="mb-1.5">
          {st(app.status_label || app.status)}
        </Badge>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} aria-label={t('orgRef.status')} />
      </td>
      <td className={`${TD} min-w-[210px]`}>
        <DateTimeInput value={interviewAt} onChange={setInterviewAt} />
      </td>
      <td className={`${TD} min-w-[220px]`}>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label={t('staff.note')}
          placeholder={t('orgRef.notePlaceholder')}
        />
      </td>
      <td className={`${TD} text-right`}>
        <Button size="sm" leftIcon={<Save size={13} />} disabled={!dirty} loading={save.isPending} onClick={submit}>
          {t('common.save')}
        </Button>
      </td>
    </tr>
  )
}
