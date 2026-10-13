import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCircle2, DatabaseZap, Lock, LockOpen, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { useConfirm } from '@/components/data/useConfirm'
import { apiGet, apiPost, apiPut } from '@/api/http'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { SuggestRestoreBox } from './OpsReportView'
import { OPS, type BlockedModules, type IntegrityResult, type OpsSettings, type SuggestRestore } from './systemOps'

const NB = { _no_branch_inject: true }

/**
 * BUTUNLIK TEKSHIRUVI — TZ E3 «Система проверяет целостность базы данных»;
 * buzilgan bo'lsa (1729) eng so'nggi tekshirilgan to'liq nusxa va uning
 * tasdiqlash iborasi taklif qilinadi, tugma tiklash ustasini ochadi.
 */
export function IntegrityCard({ onRestore }: { onRestore: (s: SuggestRestore) => void }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['sysops', 'integrity'],
    queryFn: () => apiGet<IntegrityResult>(OPS.integrity, NB),
    enabled: false,
  })
  const r = q.data
  return (
    <Card className="p-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <DatabaseZap size={17} className="text-brand" aria-hidden />
          {t('sysOps.integrityTitle')}
        </h2>
        <Button size="sm" variant="outline" loading={q.isFetching} leftIcon={<RotateCw size={14} />} onClick={() => void q.refetch()}>
          {t('sysOps.integrityRun')}
        </Button>
      </div>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !r ? (
        <p className="text-[12.5px] text-fg-subtle">{t('sysOps.integrityHint')}</p>
      ) : (
        <div className="grid gap-3">
          <p className={cn('flex items-center gap-2 text-[13px] font-medium', r.ok ? 'text-success' : 'text-danger')}>
            {r.ok ? <CheckCircle2 size={15} aria-hidden /> : <X size={15} aria-hidden />}
            {r.ok ? t('sysHealth.repIntegrityOk') : t('sysHealth.repProblems', { count: r.problems.length })}
            <span className="font-normal text-fg-subtle">· {t('sysHealth.msValue', { n: r.elapsed_ms ?? 0 })}</span>
          </p>
          {r.problems.length > 0 && (
            <ul className="grid gap-1 text-[12px] text-fg-muted">
              {r.problems.slice(0, 10).map((p, i) => (
                <li key={i} className="break-words">
                  <span className="font-mono text-fg">{p.object || p.kind}</span> — {p.detail || p.kind}
                </li>
              ))}
            </ul>
          )}
          {r.suggest_restore ? (
            <SuggestRestoreBox s={r.suggest_restore} onRestore={onRestore} />
          ) : (
            !r.ok && <p className="text-[12.5px] text-warning">{t('sysOps.suggestNone')}</p>
          )}
        </div>
      )}
    </Card>
  )
}

/** TZ E3 1729: sinovdan o'tmagani uchun bloklangan modullar va blokdan chiqarish. */
export function BlockedModulesCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sysops', 'blocked'], queryFn: () => apiGet<BlockedModules>(OPS.modulesBlocked, NB) })
  const unblock = useMutation({
    mutationFn: (m: string) => apiPost(OPS.unblock(m), {}, { params: NB }),
    onSuccess: () => {
      toast.ok(t('sysOps.unblocked'))
      void qc.invalidateQueries({ queryKey: ['sysops', 'blocked'] })
    },
  })
  const name = (code: string, fallback?: string) =>
    t(`roleAdmin.mod_${code}` as never, { defaultValue: fallback || code }) as string
  const entries = Object.entries(q.data ?? {})
  return (
    <Card className="p-card">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Lock size={17} className="text-warning" aria-hidden />
        {t('sysOps.blockedTitle')}
      </h2>
      {q.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">{t('sysOps.blockedNone')}</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-lg border border-line">
          {entries.map(([code, info]) => (
            <li key={code} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-fg">{name(code, info.module)}</span>
                <span className="block break-words text-[12px] text-fg-muted">
                  {info.reason || '—'}
                  {info.blocked_at ? ` · ${formatDateTime(info.blocked_at)}` : ''}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<LockOpen size={14} />}
                loading={unblock.isPending && unblock.variables === code}
                onClick={async () => {
                  const ok = await confirm({
                    kind: 'action',
                    title: t('sysOps.unblock'),
                    description: t('sysOps.unblockConfirm', { module: name(code, info.module) }),
                    confirmLabel: t('sysOps.unblock'),
                  })
                  if (ok) unblock.mutate(code)
                }}
              >
                {t('sysOps.unblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-fg-subtle">{t('sysOps.blockedHint')}</p>
    </Card>
  )
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DEFAULTS: OpsSettings = {
  auto_restart: { enabled: false, delay_s: 60, healthy_checks: 3 },
  escalation: { enabled: false, after_minutes: 15, user_ids: [], emails: [] },
}

interface UserRow {
  id: number
  username: string
  full_name?: string | null
}

/**
 * TZ E2 1699 «Автоматический перезапуск» va «Эскалация инцидента» sozlamalari
 * (`system/settings/ops`). Rahbariyat hisoblari eskalatsiyada doim xabardor
 * qilinadi; bu yerdagilar — qo'shimcha qabul qiluvchilar.
 */
export function OpsSettingsCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sysops', 'settings'], queryFn: () => apiGet<OpsSettings>(OPS.settings, NB) })
  const [form, setForm] = useState<OpsSettings | null>(null)
  const [emails, setEmails] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const debounced = useDebounce(userSearch, 250)

  useEffect(() => {
    if (!q.data) return
    const v = {
      auto_restart: { ...DEFAULTS.auto_restart, ...q.data.auto_restart },
      escalation: { ...DEFAULTS.escalation, ...q.data.escalation },
    }
    setForm(v)
    setEmails(v.escalation.emails.join('\n'))
  }, [q.data])

  const users = useQuery({
    queryKey: ['sysops', 'user-search', debounced],
    queryFn: () => apiGet<{ items?: UserRow[] }>('users', { search: debounced || undefined, size: 20, ...NB }),
    enabled: !!form?.escalation.enabled,
  })
  // Tanlangan hisoblarning nomlari (ro'yxat sahifasida bo'lmasligi mumkin).
  const picked = useQueries({
    queries: (form?.escalation.user_ids ?? []).map((id) => ({
      queryKey: ['sysops', 'user', id],
      queryFn: () => apiGet<UserRow>(`users/${id}`, NB),
      staleTime: 10 * 60_000,
      meta: { silent: true },
    })),
  })

  const save = useMutation({
    mutationFn: (body: OpsSettings) => apiPut<OpsSettings>(OPS.settings, body, { params: NB }),
    meta: { silent: true },
    onSuccess: () => {
      toast.ok(t('common.saved'))
      void qc.invalidateQueries({ queryKey: ['sysops', 'settings'] })
    },
  })

  if (q.isError)
    return (
      <Card className="p-card">
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    )

  const setAR = (k: keyof OpsSettings['auto_restart'], v: number | boolean) =>
    setForm((f) => (f ? { ...f, auto_restart: { ...f.auto_restart, [k]: v } } : f))
  const setEsc = (patch: Partial<OpsSettings['escalation']>) =>
    setForm((f) => (f ? { ...f, escalation: { ...f.escalation, ...patch } } : f))

  const submit = async () => {
    if (!form) return
    const list = emails
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    const next: Record<string, string> = {}
    const bad = list.filter((x) => !EMAIL_RE.test(x))
    if (bad.length) next.emails = t('sysOps.badEmails', { list: bad.join(', ') })
    const ar = form.auto_restart
    if (!(ar.delay_s >= 5 && ar.delay_s <= 86400)) next.delay_s = t('sysOps.rangeErr', { min: 5, max: 86400 })
    if (!(ar.healthy_checks >= 1 && ar.healthy_checks <= 100)) next.healthy_checks = t('sysOps.rangeErr', { min: 1, max: 100 })
    if (!(form.escalation.after_minutes >= 1 && form.escalation.after_minutes <= 10080))
      next.after_minutes = t('sysOps.rangeErr', { min: 1, max: 10080 })
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ ...form, escalation: { ...form.escalation, emails: list } })
    } catch (e) {
      const fields = errorCode(e) === 'validation_error' ? errorParams(e).fields : null
      if (fields && typeof fields === 'object') {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(fields as Record<string, unknown>)) out[k.split('.').slice(-1)[0]] = String(v)
        setErrors(out)
      }
      setFormError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const userOptions = (users.data?.items ?? [])
    .filter((u) => !form?.escalation.user_ids.includes(u.id))
    .map((u) => ({ value: String(u.id), label: u.full_name || u.username, subLabel: u.username }))

  return (
    <Card className="p-card">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-fg">
        <BellRing size={17} className="text-brand" aria-hidden />
        {t('sysOps.settingsTitle')}
      </h2>
      {!form ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <fieldset className="grid content-start gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-fg">{t('sysOps.autoRestart')}</legend>
            <Checkbox
              checked={form.auto_restart.enabled}
              onChange={(e) => setAR('enabled', e.target.checked)}
              label={t('sysOps.autoRestartOn')}
            />
            <p className="text-[12px] text-fg-subtle">{t('sysOps.autoRestartHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('sysOps.delayS')} error={errors.delay_s}>
                <Input
                  type="number"
                  min={5}
                  max={86400}
                  value={form.auto_restart.delay_s}
                  disabled={!form.auto_restart.enabled}
                  onChange={(e) => setAR('delay_s', Number(e.target.value))}
                  aria-label={t('sysOps.delayS')}
                />
              </Field>
              <Field label={t('sysOps.healthyChecks')} error={errors.healthy_checks}>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.auto_restart.healthy_checks}
                  disabled={!form.auto_restart.enabled}
                  onChange={(e) => setAR('healthy_checks', Number(e.target.value))}
                  aria-label={t('sysOps.healthyChecks')}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid content-start gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-fg">{t('sysOps.escalation')}</legend>
            <Checkbox
              checked={form.escalation.enabled}
              onChange={(e) => setEsc({ enabled: e.target.checked })}
              label={t('sysOps.escalationOn')}
            />
            <p className="text-[12px] text-fg-subtle">{t('sysOps.escalationHint')}</p>
            <Field label={t('sysOps.afterMinutes')} error={errors.after_minutes}>
              <Input
                type="number"
                min={1}
                max={10080}
                value={form.escalation.after_minutes}
                disabled={!form.escalation.enabled}
                onChange={(e) => setEsc({ after_minutes: Number(e.target.value) })}
                aria-label={t('sysOps.afterMinutes')}
              />
            </Field>
            <Field label={t('sysOps.extraUsers')}>
              <div className="grid gap-2">
                {form.escalation.user_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.escalation.user_ids.map((id, i) => {
                      const u = picked[i]?.data
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-2.5 pr-1 text-[12.5px] font-medium text-brand-strong"
                        >
                          {u ? u.full_name || u.username : `#${id}`}
                          <button
                            type="button"
                            aria-label={t('common.clearValue')}
                            className="rounded-full p-0.5 hover:bg-brand/10"
                            onClick={() => setEsc({ user_ids: form.escalation.user_ids.filter((x) => x !== id) })}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <Combobox
                  value=""
                  onChange={(v) => v && setEsc({ user_ids: [...form.escalation.user_ids, Number(v)] })}
                  options={userOptions}
                  onSearchChange={setUserSearch}
                  loading={users.isFetching}
                  error={users.error}
                  disabled={!form.escalation.enabled}
                  placeholder={t('sysOps.addUser')}
                  hidePlaceholderOption
                />
              </div>
            </Field>
            <Field label={t('sysOps.emails')} hint={t('sysOps.emailsHint')} error={errors.emails}>
              <Textarea
                rows={2}
                value={emails}
                disabled={!form.escalation.enabled}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="it@example.uz"
              />
            </Field>
          </fieldset>
          <div className="flex items-center justify-between gap-3 lg:col-span-2">
            <FormError>{formError}</FormError>
            <Button className="ml-auto" loading={save.isPending} onClick={() => void submit()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
