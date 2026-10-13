import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DatabaseBackup,
  KeyRound,
  Layers,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { apiPost } from '@/api/http'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { formatDateTime, inTashkent } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  BACKUP_RESTORE,
  NO_BRANCH,
  restorePhrase,
  useRestoreComponents,
  type RestorePlan,
  type RestoreReport,
} from './useBackups'
import { JobProgress, jobStageLabel } from './JobProgress'
import { isJobFinished, useJob } from './useJob'

/** Tiklanadigan nusxa — ro'yxat qatoridan yoki butunlik tekshiruvi taklifidan. */
export interface RestoreTarget {
  id: number
  type?: string | null
  when?: string | null
  file_name?: string | null
}

type Step = 'mode' | 'confirm' | 'auth' | 'run'

/** Preflight rad javoblari → lug'at (server matni o'zbekcha, ruschasi shu yerda). */
function restoreError(t: TFunction, e: unknown): string {
  const p = errorParams(e)
  switch (errorCode(e)) {
    case 'backup_schema_mismatch':
      return t('sysOps.errSchema', { backup: String(p.backup_revision ?? '—'), current: String(p.current_revision ?? '—') })
    case 'backup_corrupted':
      return t('sysOps.errCorrupted')
    case 'backup_chain_broken':
      return t('sysOps.errChain')
    case 'restore_requires_superuser':
      return t('sysOps.errSuperuser')
    case 'backup_in_progress':
      return t('sysOps.errBackupRunning')
    case 'restore_in_progress':
      return t('sysOps.errRestoreRunning')
    case 'backup_not_ready':
      return t('sysOps.errNotReady')
    case 'backup_file_missing':
      return t('sysOps.errFileMissing')
    default:
      return errorMessage(e, t('common.actionFailed'))
  }
}

/**
 * ZAXIRADAN TIKLASH USTASI — TZ E1 1669 «Восстановление из копии», E3 1729
 * «Восстановление из резервной копии» va «Частичное восстановление».
 *
 *   1. rejim: to'liq yoki qisman (komponentlar; FK bo'yicha birga tiklanadigan
 *      jadvallar va hech qachon tegilmaydigan himoyalangan jadvallar ko'rinadi);
 *   2. ogohlantirish: avval avtomatik xavfsizlik nusxasi, tizim tiklash
 *      rejimiga o'tadi, boshqa sessiyalar yopiladi;
 *   3. parol + qo'lda yozilgan ibora «TIKLASH <id>» (+ 2FA bo'lsa e-pochta kodi);
 *   4. fon vazifasi progressi (`GET /jobs/{id}`) va hisobot. Tiklashdan keyin
 *      tizim tiklash rejimida qoladi — «Tizim holati» da ish rejimiga qaytariladi.
 */
export function RestoreWizard({ target, onClose }: { target: RestoreTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const open = !!target
  const comps = useRestoreComponents(open)

  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [picked, setPicked] = useState<string[]>([])
  const [understood, setUnderstood] = useState(false)
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<{ id: string; sentTo?: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [plan, setPlan] = useState<RestorePlan | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('mode')
    setMode('full')
    setPicked([])
    setUnderstood(false)
    setPassword('')
    setPhrase('')
    setOtp('')
    setChallenge(null)
    setErrors({})
    setFormError(null)
    setJobId(null)
    setPlan(null)
  }, [open, target?.id])

  const job = useJob<RestoreReport>(jobId)
  const finished = isJobFinished(job.data)
  useEffect(() => {
    if (!finished) return
    void qc.invalidateQueries({ queryKey: ['backups', 'list'] })
    void qc.invalidateQueries({ queryKey: ['sysops'] })
    // Butunlik natijasi qo'lda so'raladi (`enabled:false`) — eski natija qolmasin.
    qc.removeQueries({ queryKey: ['sysops', 'integrity'] })
  }, [finished, qc])

  const components = comps.data?.components ?? []
  const pickedSet = new Set(picked)
  /** Qisman tiklashda tegadigan jadvallar: tanlangan guruhlar + FK yopilmasi. */
  const touched = useMemo(() => {
    const own = new Set<string>()
    const pulled = new Set<string>()
    for (const c of components) {
      if (!pickedSet.has(c.code)) continue
      c.tables.forEach((x) => own.add(x))
      c.closure.forEach((x) => pulled.add(x))
    }
    own.forEach((x) => pulled.delete(x))
    return { own: [...own], pulled: [...pulled].sort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, picked])

  const expected = target ? restorePhrase(target.id) : ''

  const start = useMutation({
    mutationFn: () =>
      apiPost<{ job_id: number; status: string; plan: RestorePlan }>(
        BACKUP_RESTORE(target!.id),
        {
          mode,
          components: mode === 'partial' ? picked : null,
          password,
          confirm: phrase.trim(),
          otp_code: challenge ? otp.trim() || null : null,
          challenge_id: challenge?.id ?? null,
        },
        { params: NO_BRANCH },
      ),
    // Har xato maydon ostida yoki oynaning o'zida ko'rsatiladi.
    meta: { silent: true },
  })

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!password) next.password = t('sysOps.restorePasswordRequired')
    if (phrase.trim() !== expected) next.confirm = t('sysOps.restorePhraseMismatch', { phrase: expected })
    if (challenge && !otp.trim()) next.otp = t('sysOps.restoreOtpRequired')
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    try {
      const r = await start.mutateAsync()
      setPlan(r.plan)
      setJobId(r.job_id)
      setPassword('')
      setOtp('')
      setStep('run')
    } catch (e) {
      const code = errorCode(e)
      if (code === 'invalid_password') setErrors({ password: t('sysOps.restoreBadPassword') })
      else if (code === 'confirmation_required') setErrors({ confirm: t('sysOps.restorePhraseMismatch', { phrase: expected }) })
      else if (code === 'two_factor_required') {
        const p = errorParams(e)
        setChallenge({ id: String(p.challenge_id ?? ''), sentTo: p.sent_to ? String(p.sent_to) : undefined })
        setOtp('')
      } else if (code === 'two_factor_invalid_code') setErrors({ otp: t('sysOps.restoreBadOtp') })
      else setFormError(restoreError(t, e))
    }
  }

  /** Asosiy bosqichlar (har jadval nusxasi `copied:<jadval>` — faqat joriy holatda). */
  const chainLen = plan?.chain.length ?? 1
  const milestones = (job.data?.result?.stages ?? []).filter(
    (x) => x.stage && !x.stage.startsWith('copied:') && (x.stage !== 'incremental_applied' || chainLen > 1),
  )

  const running = step === 'run' && !finished
  const close = () => {
    if (running) toast.info(t('sysOps.restoreContinues'))
    onClose()
  }

  const canNext =
    step === 'mode' ? mode === 'full' || picked.length > 0 : step === 'confirm' ? understood : true

  const footer =
    step === 'run' ? (
      <>
        {finished && (
          <Link
            to="/system-health"
            onClick={onClose}
            className="inline-flex h-control items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
          >
            {t('sysOps.goHealth')} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
        <Button variant={finished ? 'primary' : 'ghost'} onClick={close}>
          {t('common.close')}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={step === 'mode' ? close : () => setStep(step === 'auth' ? 'confirm' : 'mode')} disabled={start.isPending}>
          {step === 'mode' ? t('common.cancel') : t('sysOps.back')}
        </Button>
        {step === 'auth' ? (
          <Button variant="danger" leftIcon={<DatabaseBackup size={15} />} loading={start.isPending} onClick={() => void submit()}>
            {t('sysOps.restoreStart')}
          </Button>
        ) : (
          <Button disabled={!canNext} onClick={() => setStep(step === 'mode' ? 'confirm' : 'auth')}>
            {t('sysOps.next')}
          </Button>
        )}
      </>
    )

  return (
    <Modal
      open={open}
      onClose={start.isPending ? () => undefined : close}
      size="lg"
      title={t('sysOps.restoreTitle', { id: target?.id ?? '' })}
      description={
        target
          ? [
              target.type === 'incremental' ? t('backups.typeIncremental') : t('backups.typeFull'),
              target.when ? formatDateTime(target.when) : null,
              target.file_name,
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      footer={footer}
    >
      <StepDots step={step} />

      {step === 'mode' && (
        <div className="grid gap-4">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">{t('sysOps.restoreMode')}</legend>
            {(['full', 'partial'] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2.5 transition-colors',
                  mode === m ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="restore-mode"
                  className="mt-1 accent-brand"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span>
                  <span className="block text-[13.5px] font-semibold text-fg">
                    {m === 'full' ? t('sysOps.restoreFull') : t('sysOps.restorePartial')}
                  </span>
                  <span className="block text-[12px] text-fg-muted">
                    {m === 'full' ? t('sysOps.restoreFullHint') : t('sysOps.restorePartialHint')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {target?.type === 'incremental' && (
            <p className="flex items-start gap-2 rounded-inner bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Layers size={14} className="mt-0.5 shrink-0" aria-hidden />
              {t('sysOps.restoreChainHint')}
            </p>
          )}

          {mode === 'partial' &&
            (comps.isLoading ? (
              <div className="grid gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : comps.isError ? (
              <LoadError error={comps.error} onRetry={() => void comps.refetch()} />
            ) : (
              <>
                <ul className="scroll-thin grid max-h-[18rem] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {components.map((c) => {
                    const on = pickedSet.has(c.code)
                    return (
                      <li
                        key={c.code}
                        className={cn('rounded-control border px-3 py-2', on ? 'border-brand/50 bg-brand-soft' : 'border-line')}
                      >
                        <Checkbox
                          checked={on}
                          label={t(`sysOps.comp_${c.code}` as never, { defaultValue: c.label }) as string}
                          onChange={(e) =>
                            setPicked((p) => (e.target.checked ? [...p, c.code] : p.filter((x) => x !== c.code)))
                          }
                        />
                        <p className="mt-1 break-words pl-6 font-mono text-[11px] text-fg-subtle">{c.tables.join(', ')}</p>
                        {on && c.closure.length > 0 && (
                          <p className="mt-1 break-words pl-6 text-[11.5px] text-warning">
                            {t('sysOps.restorePulls', { tables: c.closure.join(', ') })}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {picked.length > 0 && (
                  <p className="text-[12.5px] text-fg-muted">
                    {t('sysOps.restoreTouched', { own: touched.own.length, pulled: touched.pulled.length })}
                  </p>
                )}
              </>
            ))}

          {comps.data?.protected_tables?.length ? (
            <p className="flex items-start gap-2 rounded-inner border border-line bg-surface-2 px-3 py-2 text-[12px] text-fg-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <span>
                {t('sysOps.restoreProtected')}{' '}
                <span className="font-mono text-[11.5px] text-fg">{comps.data.protected_tables.join(', ')}</span>
              </span>
            </p>
          ) : null}
        </div>
      )}

      {step === 'confirm' && (
        <div className="grid gap-3">
          <div className="rounded-inner border border-danger/35 bg-danger-soft px-4 py-3">
            <p className="flex items-center gap-2 text-[14px] font-bold text-danger">
              <ShieldAlert size={17} aria-hidden /> {t('sysOps.restoreWarnTitle')}
            </p>
            <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-[12.5px] text-fg">
              <li>
                {mode === 'full'
                  ? t('sysOps.restoreWarnFull')
                  : t('sysOps.restoreWarnPartial', { count: touched.own.length + touched.pulled.length })}
              </li>
              <li>{t('sysOps.restoreWarnSafety')}</li>
              <li>{t('sysOps.restoreWarnMode')}</li>
              <li>{t('sysOps.restoreWarnSessions')}</li>
              <li>{t('sysOps.restoreWarnAtomic')}</li>
              <li>{t('sysOps.restoreWarnResume')}</li>
            </ul>
          </div>
          <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)} label={t('sysOps.restoreUnderstood')} />
        </div>
      )}

      {step === 'auth' && (
        <div className="grid gap-4">
          <Field label={t('sysOps.restorePassword')} required error={errors.password}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              invalid={!!errors.password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label={t('sysOps.restorePassword')}
            />
          </Field>
          <Field
            label={t('sysOps.restorePhraseLabel', { phrase: expected })}
            required
            hint={t('sysOps.restorePhraseHint')}
            error={errors.confirm}
          >
            <Input
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              invalid={!!errors.confirm}
              placeholder={expected}
              onChange={(e) => setPhrase(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              className="font-mono"
              aria-label={t('sysOps.restorePhraseLabel', { phrase: expected })}
            />
          </Field>
          {challenge && (
            <Field
              label={t('sysOps.restoreOtp')}
              required
              hint={challenge.sentTo ? t('sysOps.restoreOtpSent', { to: challenge.sentTo }) : t('sysOps.restoreOtpSentPlain')}
              error={errors.otp}
            >
              <Input
                value={otp}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                invalid={!!errors.otp}
                onChange={(e) => setOtp(e.target.value)}
                aria-label={t('sysOps.restoreOtp')}
              />
            </Field>
          )}
          <p className="flex items-start gap-2 text-[12px] text-fg-subtle">
            <KeyRound size={13} className="mt-0.5 shrink-0" aria-hidden />
            {t('sysOps.restoreAuthHint')}
          </p>
          <FormError>{formError}</FormError>
        </div>
      )}

      {step === 'run' && (
        <div className="grid gap-4">
          <JobProgress job={job.data} />
          {plan && (
            <p className="text-[12.5px] text-fg-muted">
              {t('sysOps.restorePlan', {
                mode: plan.mode === 'full' ? t('sysOps.restoreFull') : t('sysOps.restorePartial'),
                tables: plan.tables.length,
                chain: plan.chain.map((x) => `#${x}`).join(' → '),
              })}
            </p>
          )}
          {milestones.length > 0 && (
            <ol className="grid gap-1 text-[12px] text-fg-muted">
              {milestones.map((s, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-success" aria-hidden />
                  {jobStageLabel(t, s.stage)}
                  {typeof s.backup_id === 'number' ? ` #${s.backup_id}` : ''}
                  {s.at ? <span className="tabular-nums text-fg-subtle">· {formatTime(s.at)}</span> : null}
                </li>
              ))}
            </ol>
          )}
          {job.data?.status === 'done' && <RestoreResult report={(job.data.result ?? {}) as RestoreReport} />}
          {job.data?.status === 'failed' && (
            <div className="rounded-inner border border-danger/35 bg-danger-soft px-4 py-3 text-[12.5px]">
              <p className="flex items-center gap-2 font-semibold text-danger">
                <XCircle size={15} aria-hidden /> {t('sysOps.restoreFailed')}
              </p>
              <p className="mt-1 break-words text-fg">{job.data.error || '—'}</p>
              <p className="mt-1 text-fg-muted">{t('sysOps.restoreRolledBack')}</p>
            </div>
          )}
          {job.isError && !job.data && <LoadError error={job.error} onRetry={() => void job.refetch()} />}
        </div>
      )}
    </Modal>
  )
}

const formatTime = (iso: string) => inTashkent(iso).format('HH:mm:ss')

function StepDots({ step }: { step: Step }) {
  const { t } = useTranslation()
  const steps: Step[] = ['mode', 'confirm', 'auth', 'run']
  const at = steps.indexOf(step)
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-1.5" aria-label={t('sysOps.progress')}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'rounded-pill px-2.5 py-1 text-[11px] font-semibold',
              i <= at ? 'bg-brand text-fg-on-brand' : 'bg-fg/[0.06] text-fg-muted',
            )}
          >
            {i + 1}. {t(`sysOps.step_${s}` as never)}
          </span>
          {i < steps.length - 1 && <span className={cn('h-px w-4', i < at ? 'bg-brand' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  )
}

/** Tugagan tiklash hisoboti. */
function RestoreResult({ report }: { report: RestoreReport }) {
  const { t } = useTranslation()
  const rows = Object.values(report.row_counts ?? {}).reduce((a, b) => a + Number(b || 0), 0)
  const detached = report.detached_references ?? []
  const integrityOk = report.integrity?.ok !== false
  return (
    <div className="grid gap-3">
      <div className="rounded-inner border border-success/35 bg-success-soft px-4 py-3 text-[12.5px]">
        <p className="flex items-center gap-2 font-semibold text-success">
          <CheckCircle2 size={15} aria-hidden /> {t('sysOps.restoreDone')}
        </p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-fg sm:grid-cols-2">
          <Item label={t('sysOps.repSafety')} value={report.safety_backup_id ? `#${report.safety_backup_id}` : '—'} />
          <Item label={t('sysOps.repTables')} value={String(report.tables?.length ?? Object.keys(report.row_counts ?? {}).length)} />
          <Item label={t('sysOps.repRows')} value={rows.toLocaleString('ru-RU')} />
          <Item label={t('sysOps.repElapsed')} value={t('sysHealth.seconds', { n: report.elapsed_seconds ?? 0 })} />
          <Item
            label={t('sysHealth.repIntegrity')}
            value={integrityOk ? t('sysHealth.repIntegrityOk') : t('sysHealth.repProblems', { count: report.integrity?.problems?.length ?? 0 })}
          />
          <Item label={t('sysOps.repDetached')} value={String(detached.length)} />
        </dl>
      </div>
      {detached.length > 0 && (
        <ul className="grid gap-1 text-[12px] text-fg-muted">
          {detached.map((d) => (
            <li key={d.constraint} className="font-mono">
              {d.table}.{d.columns.join(',')} → {d.parent}: {d.rows} ·{' '}
              {d.action === 'set_null' ? t('sysOps.repSetNull') : t('sysOps.repDeleted')}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-fg">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        {t('sysOps.restoreNextStep')}
      </p>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-fg-muted">{label}:</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
