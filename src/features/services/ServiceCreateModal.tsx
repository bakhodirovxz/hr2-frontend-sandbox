import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import axios from 'axios'
import { Button, Combobox, Field, Input, Modal, Textarea, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { tabPill } from '@/components/ui/control'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { maskValue } from '@/lib/fieldMask'
import {
  JOB_APPLICATION,
  useApplicationBranches,
  useServiceMutations,
  type ServiceCatalogItem,
  type ServiceType,
} from './useServices'
import { serviceDescription, serviceLabel } from './serviceLabel'
import { ATTACH_MAX, useAttachmentQueue } from './serviceUi'
import { AttachmentDropZone, AttachmentQueueList } from './ServiceAttachments'

const BLANK = { last_name: '', first_name: '', middle_name: '', position: '', phone: '', email: '', note: '' }
type Payload = typeof BLANK

const CATEGORY_KEYS: Record<string, string> = {
  certificates: 'svc.cat_certificates',
  applications: 'svc.cat_applications',
  requests: 'svc.cat_requests',
}

/** Server maydon xatolari (422 `params.fields`): `payload.phone` → `phone`. */
function fieldErrorsOf(err: unknown): Record<string, string> | null {
  if (!axios.isAxiosError(err)) return null
  const fields = errorParams(err).fields
  if (!fields || typeof fields !== 'object') return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    out[k.replace(/^payload\./, '')] = Array.isArray(v) ? v.join('; ') : String(v)
  }
  return Object.keys(out).length ? out : null
}

/**
 * Yangi so'rov — TZ 4.2.12 §1 va TZ I1 (katalog toifalari, tavsif, ilovalar).
 *
 * Ariza (mehmon) — F.I.Sh., telefon, e-pochta, lavozim va qaysi tashkilotga;
 * ma'lumotnoma/tavsifnoma (xodim) — faqat maqsad: xodimni tizim o'zi biladi.
 * Ilovalar so'rov YARATILGANDAN keyin bitta-bittadan yuklanadi; birortasi
 * o'tmasa, oyna ochiq qoladi va o'sha fayl qayta yuborilishi mumkin — so'rov
 * ikkinchi marta yaratilmaydi.
 */
export function ServiceCreateModal({
  open,
  onClose,
  catalog,
  initialType,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  catalog: ServiceCatalogItem[]
  initialType?: ServiceType | null
  /** Yaratilgan so'rov (ilovalar yuklangach) — tafsilotni ochish uchun. */
  onCreated?: (id: number) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { create, settle } = useServiceMutations()
  const queue = useAttachmentQueue()

  const usable = useMemo(() => catalog.filter((c) => c.available), [catalog])
  const categories = useMemo(
    () => [...new Set(usable.map((c) => c.category).filter((c): c is string => !!c))],
    [usable],
  )
  const [category, setCategory] = useState('')
  const [type, setType] = useState<string>('')
  const [purpose, setPurpose] = useState('')
  const [branchId, setBranchId] = useState('')
  const [payload, setPayload] = useState<Payload>(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  /** So'rov yaratilgan, lekin ba'zi ilovalar o'tmagan — endi faqat ilovalar qayta yuboriladi. */
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const isApplication = type === JOB_APPLICATION
  const branches = useApplicationBranches(open && isApplication)

  const { clear } = queue
  useEffect(() => {
    if (!open) return
    setError(null)
    setFieldErrors({})
    setPurpose('')
    setPayload(BLANK)
    setBranchId('')
    setCategory('')
    setCreatedId(null)
    clear()
    setType(initialType ?? usable[0]?.type ?? '')
    // `usable` derived from catalog; keying on the modal opening is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialType])

  const visible = usable.filter((c) => !category || c.category === category)
  const selected = catalog.find((c) => c.type === type) ?? null
  const locked = createdId != null || busy

  const setField = (k: keyof Payload, v: string) => {
    setPayload((p) => ({ ...p, [k]: v }))
    setFieldErrors((x) => (x[k] || x.full_name ? { ...x, [k]: '', full_name: '' } : x))
  }

  const finish = (id: number) => {
    toast.ok(t('services.submitted'))
    onClose()
    onCreated?.(id)
  }

  const uploadAndFinish = async (id: number) => {
    const failed = await queue.uploadPending(id, settle)
    if (failed) {
      setError(t('svc.someFilesFailed'))
      return
    }
    finish(id)
  }

  const submit = async () => {
    setError(null)
    if (createdId != null) {
      // Faqat qolgan (qayta navbatga qo'yilgan) ilovalar.
      setBusy(true)
      try {
        await uploadAndFinish(createdId)
      } finally {
        setBusy(false)
      }
      return
    }
    if (!type) {
      setError(t('services.pickService'))
      return
    }
    const local: Record<string, string> = {}
    if (isApplication) {
      if (!payload.last_name.trim()) local.last_name = t('svc.required')
      if (!payload.first_name.trim()) local.first_name = t('svc.required')
      if (!payload.phone.trim()) local.phone = t('svc.required')
    } else if (purpose.trim().length < 3) {
      local.purpose = t('svc.purposeRequired')
    }
    if (Object.keys(local).length) {
      setFieldErrors(local)
      return
    }
    setBusy(true)
    setFieldErrors({})
    try {
      const fullName = [payload.last_name, payload.first_name, payload.middle_name]
        .map((x) => x.trim())
        .filter(Boolean)
        .join(' ')
      const d = await create.mutateAsync({
        service_type: type,
        purpose: purpose.trim() || null,
        organization_branch_id: isApplication && branchId ? Number(branchId) : null,
        payload: isApplication ? { ...payload, full_name: fullName || null } : null,
      })
      if (queue.items.some((x) => x.state === 'pending')) {
        setCreatedId(d.id)
        await uploadAndFinish(d.id)
      } else {
        finish(d.id)
      }
    } catch (e) {
      const fe = errorCode(e) === 'validation_error' ? fieldErrorsOf(e) : null
      if (fe) {
        setFieldErrors(fe)
        setError(t('svc.checkFields'))
      } else {
        setError(errorMessage(e, t('services.submitFailed')))
      }
    } finally {
      setBusy(false)
    }
  }

  const failedCount = queue.items.filter((x) => x.state === 'error').length
  const pendingCount = queue.items.filter((x) => x.state === 'pending').length

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="lg"
      title={t('services.newRequest')}
      footer={
        createdId != null ? (
          <>
            <Button variant="ghost" onClick={() => finish(createdId)} disabled={busy}>
              {t('svc.finishWithout')}
            </Button>
            <Button onClick={submit} loading={busy} disabled={pendingCount === 0}>
              {t('svc.uploadRest')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={busy} disabled={!type}>
              {t('services.send')}
            </Button>
          </>
        )
      }
    >
      {usable.length === 0 ? (
        <p className="flex items-start gap-2 rounded-inner bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {t('svc.noServices')}
        </p>
      ) : (
        <div className="grid gap-4">
          {createdId != null && (
            <p className="rounded-inner bg-info-soft px-3 py-2.5 text-[12.5px] text-info">{t('svc.createdUploadHint')}</p>
          )}

          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('svc.category')}>
              {['', ...categories].map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  disabled={locked}
                  className={tabPill(category === c)}
                  onClick={() => {
                    setCategory(c)
                    const first = usable.find((x) => !c || x.category === c)
                    if (first) setType(first.type)
                    setFieldErrors({})
                  }}
                >
                  {c ? t((CATEGORY_KEYS[c] ?? 'svc.cat_requests') as never) : t('svc.catAll')}
                </button>
              ))}
            </div>
          )}

          <Field label={t('services.serviceType')} required hint={selected ? serviceDescription(selected.type, selected.description) || undefined : undefined}>
            <Combobox
              value={type}
              onChange={(v) => {
                setType(v)
                setFieldErrors({})
              }}
              disabled={locked}
              options={visible.map((c) => ({ value: c.type, label: serviceLabel(c.type, c.label) }))}
              placeholder={t('services.pickService')}
            />
          </Field>

          {isApplication && (
            <>
              <Field label={t('svc.targetOrg')}>
                <Combobox
                  value={branchId}
                  onChange={setBranchId}
                  disabled={locked}
                  options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
                  placeholder={t('svc.pickOrg')}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                {(['last_name', 'first_name', 'middle_name'] as const).map((k) => (
                  <Field
                    key={k}
                    label={t(`svc.field_${k}` as never)}
                    required={k !== 'middle_name'}
                    error={fieldErrors[k] || (k === 'middle_name' && !fieldErrors.last_name && !fieldErrors.first_name ? fieldErrors.full_name : '') || undefined}
                  >
                    <Input value={payload[k]} disabled={locked} onChange={(e) => setField(k, e.target.value)} />
                  </Field>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('svc.field_position')}>
                  <Input value={payload.position} disabled={locked} onChange={(e) => setField('position', e.target.value)} />
                </Field>
                <Field label={t('svc.field_phone')} required error={fieldErrors.phone || undefined}>
                  <Input
                    value={payload.phone}
                    disabled={locked}
                    inputMode="tel"
                    placeholder="+998 __ ___ __ __"
                    onChange={(e) => setField('phone', maskValue('phone', e.target.value))}
                  />
                </Field>
              </div>
              <Field label={t('svc.field_email')} error={fieldErrors.email || undefined}>
                <Input
                  type="email"
                  value={payload.email}
                  disabled={locked}
                  placeholder="name@example.uz"
                  onChange={(e) => setField('email', e.target.value)}
                />
              </Field>
            </>
          )}

          <Field
            label={isApplication ? t('svc.aboutYou') : t('svc.purposeLabel')}
            required={!isApplication}
            error={fieldErrors.purpose || undefined}
          >
            <Textarea
              value={purpose}
              disabled={locked}
              rows={3}
              placeholder={isApplication ? t('svc.aboutYouPh') : t('svc.purposePh')}
              onChange={(e) => {
                setPurpose(e.target.value)
                setFieldErrors((x) => (x.purpose ? { ...x, purpose: '' } : x))
              }}
            />
          </Field>

          <div className="grid gap-2">
            <p className="text-[12.5px] font-medium text-fg">
              {t('svc.attachments')} <span className="font-normal text-fg-subtle">· {t('svc.optional')}</span>
            </p>
            <AttachmentQueueList
              items={queue.items}
              locked={busy}
              onRemove={queue.remove}
              onRetry={queue.requeue}
            />
            {createdId == null && queue.items.filter((x) => x.state !== 'error').length < ATTACH_MAX && (
              <AttachmentDropZone enabled={open} disabled={busy} onFiles={(f) => queue.add(f, ATTACH_MAX)} />
            )}
            {createdId != null && failedCount > 0 && pendingCount === 0 && (
              <p className="text-[11.5px] text-fg-subtle">{t('svc.retryHint')}</p>
            )}
          </div>
        </div>
      )}

      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
