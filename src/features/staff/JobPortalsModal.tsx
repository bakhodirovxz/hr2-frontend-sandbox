import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { LoadError } from '@/components/data/LoadError'
import { errorMessage } from '@/api/errorMessage'
import { inTashkent } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  PORTAL_SECRET_MASK,
  useJobPortals,
  useSaveJobPortals,
  useVacancyPushJobs,
  type JobPortal,
  type PortalDelivery,
} from './useStaffPositions'

const BLANK: JobPortal = { name: '', url: '', auth_header: null, format: 'json', enabled: true }

/**
 * TZ V1 1277 «Публикация на внешних ресурсах — система отправляет данные
 * вакансии на подключённые job-порталы». The site master admin connects the
 * portals (`/system/settings/vacancies`); a saved authorization header comes
 * back masked and is kept when the mask is sent back. Below — the delivery
 * log (`background_jobs` kind `vacancy_push`, the admin's own pushes).
 */
export function JobPortalsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const settings = useJobPortals(open)
  const save = useSaveJobPortals()
  const jobs = useVacancyPushJobs(open)
  const [rows, setRows] = useState<JobPortal[]>([])
  const [errors, setErrors] = useState<Record<number, { name?: string; url?: string }>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !settings.data) return
    setRows((settings.data.job_portals ?? []).map((p) => ({ ...BLANK, ...p })))
    setErrors({})
    setFormError(null)
  }, [open, settings.data])

  const patch = (i: number, p: Partial<JobPortal>) => {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
    setErrors((e) => {
      const { [i]: _drop, ...rest } = e
      return rest
    })
    setFormError(null)
  }

  const submit = async () => {
    const e: typeof errors = {}
    const names = new Set<string>()
    rows.forEach((r, i) => {
      const name = r.name.trim()
      if (!name) e[i] = { ...e[i], name: t('ordVac.portalNameRequired') }
      else if (names.has(name.toLowerCase())) e[i] = { ...e[i], name: t('ordVac.portalNameDuplicate') }
      names.add(name.toLowerCase())
      if (!/^https?:\/\/.{4,}/i.test(r.url.trim())) e[i] = { ...e[i], url: t('ordVac.portalUrlInvalid') }
    })
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      await save.mutateAsync(
        rows.map((r) => ({
          name: r.name.trim(),
          url: r.url.trim(),
          format: r.format,
          enabled: r.enabled,
          auth_header: r.auth_header?.trim() ? r.auth_header.trim() : null,
        })),
      )
      toast.ok(t('ordVac.portalsSaved'))
      onClose()
    } catch (err) {
      setFormError(errorMessage(err, t('staff.saveFailed')))
    }
  }

  const deliveries: (PortalDelivery & { job: number; sp?: number | null })[] = (jobs.data ?? []).flatMap((j) =>
    (j.result?.deliveries ?? []).map((d) => ({ ...d, job: j.id, sp: j.result?.staff_position_id })),
  )
  const pending = (jobs.data ?? []).filter((j) => j.status === 'pending' || j.status === 'running').length

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="lg"
      title={t('ordVac.portalsTitle')}
      description={t('ordVac.portalsHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!settings.data}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {settings.error ? (
        <LoadError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            {settings.isLoading ? (
              <p className="text-sm text-fg-subtle">{t('common.loading')}</p>
            ) : rows.length === 0 ? (
              <p className="rounded-inner border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-subtle">
                {t('ordVac.portalsEmpty')}
              </p>
            ) : (
              rows.map((r, i) => (
                <div key={i} className="rounded-panel border border-line bg-surface-2/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <Field label={t('ordVac.portalName')} required error={errors[i]?.name}>
                      <Input value={r.name} maxLength={120} invalid={!!errors[i]?.name} onChange={(e) => patch(i, { name: e.target.value })} />
                    </Field>
                    <Field label={t('ordVac.portalFormat')}>
                      <Select
                        value={r.format}
                        onChange={(e) => patch(i, { format: e.target.value as JobPortal['format'] })}
                        options={[
                          { value: 'json', label: 'JSON' },
                          { value: 'xml', label: 'XML' },
                        ]}
                      />
                    </Field>
                    <div className="flex items-end justify-end pb-1">
                      <IconButton size="sm" label={t('common.delete')} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                        <Trash2 size={15} className="text-danger" />
                      </IconButton>
                    </div>
                    <div className="sm:col-span-3">
                    <Field label={t('ordVac.portalUrl')} required error={errors[i]?.url}>
                      <Input
                        value={r.url}
                        maxLength={1000}
                        inputMode="url"
                        placeholder="https://"
                        invalid={!!errors[i]?.url}
                        onChange={(e) => patch(i, { url: e.target.value })}
                      />
                    </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Field label={t('ordVac.portalAuth')} hint={r.auth_header === PORTAL_SECRET_MASK ? t('ordVac.portalAuthKept') : t('ordVac.portalAuthHint')}>
                        <Input
                          value={r.auth_header ?? ''}
                          type="password"
                          autoComplete="new-password"
                          maxLength={2000}
                          placeholder="Bearer …"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => patch(i, { auth_header: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-3">
                      <Checkbox checked={r.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} label={t('ordVac.portalEnabled')} />
                    </div>
                  </div>
                </div>
              ))
            )}
            <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} onClick={() => setRows((x) => [...x, { ...BLANK }])} disabled={!settings.data || rows.length >= 20}>
              {t('ordVac.portalAdd')}
            </Button>
            <FormError>{formError}</FormError>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-[14px] font-bold text-fg">{t('ordVac.deliveryLog')}</h4>
              <IconButton size="sm" label={t('ordVac.refresh')} onClick={() => void jobs.refetch()}>
                <RefreshCw size={14} className={cn(jobs.isFetching && 'animate-spin')} />
              </IconButton>
            </div>
            {pending > 0 && <p className="mb-2 text-[12px] text-warning">{t('ordVac.deliveryPending', { n: pending })}</p>}
            {jobs.error ? (
              <LoadError error={jobs.error} onRetry={() => void jobs.refetch()} />
            ) : deliveries.length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">{jobs.isLoading ? t('common.loading') : t('ordVac.deliveryEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-panel border border-line">
                {deliveries.map((d, i) => (
                  <li key={`${d.job}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                    <Badge tone={d.ok ? 'success' : 'danger'} dot>
                      {d.ok ? t('ordVac.deliveryOk') : t('ordVac.deliveryFailed')}
                    </Badge>
                    <span className="font-semibold text-fg">{d.portal || '—'}</span>
                    <span className="text-fg-muted">
                      {d.action === 'remove' ? t('ordVac.actionRemove') : t('ordVac.actionUpsert')}
                      {d.sp ? ` · ${t('ordVac.vacancyNo', { id: d.sp })}` : ''}
                    </span>
                    <span className="tabnum text-fg-subtle">{d.status_code ?? ''}</span>
                    {d.error && <span className="min-w-0 basis-full truncate text-danger" title={d.error}>{d.error}</span>}
                    <span className="ml-auto tabnum text-fg-subtle">{d.at ? inTashkent(d.at).format('DD.MM.YYYY HH:mm') : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
