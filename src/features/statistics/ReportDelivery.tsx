import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Download, FileArchive, Mail, X } from 'lucide-react'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { inTashkent } from '@/lib/format'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import {
  DELIVERY_FORMATS,
  downloadRunFile,
  downloadStatisticsBundle,
  fetchReportRuns,
  sendReportByEmail,
  setTemplateSchedule,
  type DeliveryFormat,
  type ExportParams,
  type ReportRun,
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportSchedule,
  type ReportTemplate,
} from './api'

/**
 * R1 · e-mail bilan yuborish, bir nechta format (zip) va avtomatik
 * shakllantirish jadvali. Hisobot ko'rinishlari (katalog va konstruktor)
 * `DeliveryActions` ni, saqlangan shablonlar `TemplateScheduleButton` ni ishlatadi.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_RECIPIENTS = 20
const FORMAT_LABEL: Record<DeliveryFormat, string> = { xlsx: 'Excel', pdf: 'PDF', docx: 'Word' }

function FormatPicker({ value, onChange }: { value: DeliveryFormat[]; onChange: (v: DeliveryFormat[]) => void }) {
  return (
    <div className="flex flex-wrap gap-4">
      {DELIVERY_FORMATS.map((f) => (
        <Checkbox
          key={f}
          label={FORMAT_LABEL[f]}
          checked={value.includes(f)}
          onChange={(e) => onChange(DELIVERY_FORMATS.filter((x) => (x === f ? e.target.checked : value.includes(x))))}
        />
      ))}
    </div>
  )
}

/** Manzillar chip ko'rinishida: Enter / vergul / bo'sh joy / fokus ketganda qo'shiladi. */
function EmailChips({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')

  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
    if (!parts.length) return
    const bad = parts.find((p) => !EMAIL_RE.test(p))
    if (bad) {
      setLocalError(t('statDelivery.badEmail', { email: bad }))
      setDraft(raw)
      return
    }
    const next = Array.from(new Set([...value, ...parts]))
    if (next.length > MAX_RECIPIENTS) {
      setLocalError(t('statDelivery.tooMany', { max: MAX_RECIPIENTS }))
      return
    }
    setLocalError('')
    setDraft('')
    onChange(next)
  }

  return (
    <Field label={t('statDelivery.recipients')} hint={t('statDelivery.recipientsHint', { max: MAX_RECIPIENTS })} error={localError || error}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((e) => (
          <span key={e} className="flex items-center gap-1 rounded-pill border border-line bg-surface-2 py-0.5 pl-3 pr-1 text-xs">
            {e}
            <button
              type="button"
              aria-label={t('statDelivery.removeEmail', { email: e })}
              onClick={() => onChange(value.filter((x) => x !== e))}
              className="grid h-5 w-5 place-items-center rounded-pill text-fg-subtle transition-colors hover:text-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <Input
        type="text"
        inputMode="email"
        value={draft}
        invalid={!!localError}
        placeholder={t('statDelivery.emailPlaceholder')}
        onChange={(e) => {
          setDraft(e.target.value)
          setLocalError('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault()
            commit(draft)
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />
    </Field>
  )
}

/** Xato matni: SMTP sozlanmagan holat aniq, tilga mos xabar bilan. */
function deliveryError(e: unknown, t: (k: 'statDelivery.smtpOff' | 'common.actionFailed') => string): string {
  return errorCode(e) === 'smtp_not_configured' ? t('statDelivery.smtpOff') : errorMessage(e, t('common.actionFailed'))
}

// ── Hisobot ko'rinishidagi tugmalar ──────────────────────────────────────

interface DeliveryActionsProps {
  /** Ekrandagi hisobotning eksport tanasi (PNG rasmsiz). */
  buildParams: () => ExportParams
  fallbackName: string
  disabled?: boolean
}

export function DeliveryActions({ buildParams, fallbackName, disabled }: DeliveryActionsProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'bundle' | 'mail' | null>(null)
  return (
    <>
      <Button size="sm" variant="outline" leftIcon={<FileArchive size={14} />} disabled={disabled} onClick={() => setMode('bundle')}>
        {t('statDelivery.multiFormat')}
      </Button>
      <Button size="sm" variant="outline" leftIcon={<Mail size={14} />} disabled={disabled} onClick={() => setMode('mail')}>
        {t('statDelivery.sendMail')}
      </Button>
      {mode === 'bundle' && <BundleModal buildParams={buildParams} fallbackName={fallbackName} onClose={() => setMode(null)} />}
      {mode === 'mail' && <MailModal buildParams={buildParams} onClose={() => setMode(null)} />}
    </>
  )
}

function BundleModal({ buildParams, fallbackName, onClose }: Omit<DeliveryActionsProps, 'disabled'> & { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [formats, setFormats] = useState<DeliveryFormat[]>(['xlsx', 'pdf', 'docx'])
  const run = useMutation({
    mutationFn: () => downloadStatisticsBundle(buildParams(), formats, fallbackName),
    onSuccess: () => {
      toast.ok(t('statistics.exported'))
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e, t('statistics.exportFailed'))),
  })
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('statDelivery.multiFormatTitle')}
      description={t('statDelivery.multiFormatHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={run.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Download size={14} />} loading={run.isPending} disabled={!formats.length} onClick={() => run.mutate()}>
            {t('statDelivery.downloadZip')}
          </Button>
        </>
      }
    >
      <FormatPicker value={formats} onChange={setFormats} />
    </Modal>
  )
}

function MailModal({ buildParams, onClose }: Pick<DeliveryActionsProps, 'buildParams'> & { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [emails, setEmails] = useState<string[]>([])
  const [formats, setFormats] = useState<DeliveryFormat[]>(['xlsx'])
  const [error, setError] = useState('')
  const send = useMutation({
    mutationFn: () => sendReportByEmail({ params: buildParams(), formats, emails }),
    onSuccess: (r) => {
      if (r.failed?.length) toast.error(t('statDelivery.partFailed', { emails: r.failed.map((f) => f.email).join(', ') }))
      else toast.ok(t('statDelivery.sent', { count: r.sent.length }))
      onClose()
    },
    onError: (e) => setError(deliveryError(e, t)),
  })
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('statDelivery.mailTitle')}
      description={t('statDelivery.mailHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Mail size={14} />} loading={send.isPending} disabled={!emails.length || !formats.length} onClick={() => send.mutate()}>
            {t('statDelivery.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <EmailChips value={emails} onChange={(v) => { setEmails(v); setError('') }} />
        <Field label={t('statDelivery.formats')}>
          <FormatPicker value={formats} onChange={setFormats} />
        </Field>
        {error && (
          <p role="alert" className="rounded-inner border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Shablon jadvali ──────────────────────────────────────────────────────

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DEFAULT_SCHEDULE: ReportSchedule = { enabled: true, frequency: 'daily', hour: 8, weekday: 0, day: 1, period_preset: 'last_30_days' }

export function TemplateScheduleButton({ tpl }: { tpl: ReportTemplate }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  // Faqat egasi yoki bosh administrator jadvalni o'zgartira oladi.
  if (!tpl.is_mine && !isSiteMasterAdmin(user)) return null
  const on = !!tpl.schedule?.enabled
  return (
    <>
      <button
        type="button"
        aria-label={t('statDelivery.scheduleOf', { name: tpl.name })}
        title={t('statDelivery.schedule')}
        onClick={() => setOpen(true)}
        className={`grid h-5 w-5 place-items-center rounded-pill transition-colors hover:text-brand ${on ? 'text-brand' : 'text-fg-subtle'}`}
      >
        <CalendarClock size={12} />
      </button>
      {open && <ScheduleModal tpl={tpl} onClose={() => setOpen(false)} />}
    </>
  )
}

const RUN_TONE: Record<string, BadgeTone> = { sent: 'success', failed: 'danger', smtp_not_configured: 'warning', no_recipients: 'neutral' }

function ScheduleModal({ tpl, onClose }: { tpl: ReportTemplate; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [sch, setSch] = useState<ReportSchedule>(tpl.schedule ?? DEFAULT_SCHEDULE)
  const [emails, setEmails] = useState<string[]>(tpl.recipients ?? [])
  const [formats, setFormats] = useState<DeliveryFormat[]>(tpl.formats?.length ? tpl.formats : ['xlsx'])
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => setTemplateSchedule(tpl.id, { schedule: sch, recipients: emails, formats }),
    onSuccess: () => {
      toast.ok(t('statDelivery.scheduleSaved'))
      void qc.invalidateQueries({ queryKey: ['statistics-templates'] })
      onClose()
    },
    onError: (e) => setError(errorMessage(e, t('common.actionFailed'))),
  })

  const runs = useQuery({ queryKey: ['statistics-report-runs'], queryFn: fetchReportRuns, retry: false })
  const mine = (runs.data ?? []).filter((r) => r.result?.template_id === tpl.id || (r.result?.template_id == null && r.status === 'failed'))

  const set = (patch: Partial<ReportSchedule>) => {
    setSch((s) => ({ ...s, ...patch }))
    setError('')
  }
  const needMail = sch.enabled && !emails.length

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('statDelivery.scheduleTitle', { name: tpl.name })}
      description={t('statDelivery.scheduleHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!formats.length || needMail} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Checkbox label={t('statDelivery.enabled')} checked={sch.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('statDelivery.frequency')}>
            <Select
              value={sch.frequency}
              onChange={(e) => set({ frequency: e.target.value as ReportSchedule['frequency'] })}
              options={[
                { value: 'daily', label: t('statDelivery.daily') },
                { value: 'weekly', label: t('statDelivery.weekly') },
                { value: 'monthly', label: t('statDelivery.monthly') },
              ]}
            />
          </Field>
          {sch.frequency === 'weekly' && (
            <Field label={t('statDelivery.weekday')}>
              <Select
                value={String(sch.weekday)}
                onChange={(e) => set({ weekday: Number(e.target.value) })}
                options={WEEKDAYS.map((d, i) => ({ value: String(i), label: t(`statDelivery.wd_${d}` as 'statDelivery.wd_mon') }))}
              />
            </Field>
          )}
          {sch.frequency === 'monthly' && (
            <Field label={t('statDelivery.monthDay')}>
              <Select
                value={String(sch.day)}
                onChange={(e) => set({ day: Number(e.target.value) })}
                options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              />
            </Field>
          )}
          <Field label={t('statDelivery.hour')} hint={t('statDelivery.hourHint')}>
            <Select
              value={String(sch.hour)}
              onChange={(e) => set({ hour: Number(e.target.value) })}
              options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))}
            />
          </Field>
        </div>
        {/* TZ R1 1503: each run covers a period relative to its own date. */}
        <Field label={t('statDelivery.periodPreset')} hint={t('statDelivery.periodPresetHint')}>
          <Select
            value={sch.period_preset ?? 'fixed'}
            onChange={(e) => set({ period_preset: e.target.value as PeriodPreset })}
            options={PERIOD_PRESETS.map((p) => ({ value: p, label: t(`statDelivery.pp_${p}` as 'statDelivery.pp_fixed') }))}
          />
        </Field>
        <EmailChips value={emails} onChange={(v) => { setEmails(v); setError('') }} error={needMail ? t('statDelivery.recipientsRequired') : undefined} />
        <Field label={t('statDelivery.formats')}>
          <FormatPicker value={formats} onChange={setFormats} />
        </Field>
        <p className="text-xs text-fg-subtle">
          {t('statDelivery.lastRun')}: {tpl.last_run_at ? inTashkent(tpl.last_run_at).format('DD.MM.YYYY HH:mm') : t('statDelivery.never')}
        </p>
        {error && (
          <p role="alert" className="rounded-inner border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}

        <section aria-label={t('statDelivery.runs')} className="border-t border-line pt-3">
          <h3 className="mb-2 text-[12px] font-semibold text-fg">{t('statDelivery.runs')}</h3>
          {runs.isLoading ? (
            <p className="text-xs text-fg-subtle">{t('common.loading')}</p>
          ) : runs.error ? (
            <p className="text-xs text-danger">{errorMessage(runs.error, t('statistics.loadFailed'))}</p>
          ) : !mine.length ? (
            <p className="text-xs text-fg-subtle">{t('statDelivery.noRuns')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mine.slice(0, 10).map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

function RunRow({ run }: { run: ReportRun }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const status = run.status === 'failed' ? 'failed' : (run.result?.delivery?.status ?? run.status)
  const known = status in RUN_TONE
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-xs">
      <span className="tabular-nums text-fg-muted">
        {run.created_at ? inTashkent(run.created_at).format('DD.MM.YYYY HH:mm') : '—'}
      </span>
      <Badge tone={RUN_TONE[status] ?? 'neutral'}>
        {known ? t(`statDelivery.run_${status}` as 'statDelivery.run_sent') : status}
      </Badge>
      {run.error && <span className="min-w-0 flex-1 truncate text-danger" title={run.error}>{run.error}</span>}
      {run.result?.delivery?.sent?.length ? <span className="text-fg-subtle">{run.result.delivery.sent.join(', ')}</span> : null}
      {run.has_file && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          leftIcon={<Download size={12} />}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadRunFile(run.id, run.file_name || `hisobot-${run.id}.zip`)
            } catch (e) {
              toast.error(errorMessage(e, t('statistics.exportFailed')))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('statDelivery.file')}
        </Button>
      )}
    </li>
  )
}
