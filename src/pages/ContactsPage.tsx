import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Contact, Mail, MapPin, Pencil, Phone, Plus, Save, Trash2 } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { LoadError } from '@/components/data/LoadError'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { telHref, useSiteInfo, useUpdateSiteInfo, type SiteContact, type SiteInfo } from '@/features/site/useSiteInfo'

/**
 * «Kontaktlar» (TZ 442, GEN-6 — pastki paneldagi «контакты»): tizim egasi,
 * manzil, texnik yordam telefoni va pochtasi, qo'shimcha aloqa ro'yxati.
 * `GET /site/info`; butun tizim administratori shu yerning o'zida
 * tahrirlaydi (`PUT /site/info`).
 */

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const looksLikePhone = (v: string) => /^[+\d][\d\s()-]{5,}$/.test(v)

function ContactValue({ value }: { value: string }) {
  if (looksLikeEmail(value))
    return (
      <a className="text-brand hover:underline" href={`mailto:${value}`}>
        {value}
      </a>
    )
  if (looksLikePhone(value))
    return (
      <a className="text-brand hover:underline" href={telHref(value)}>
        {value}
      </a>
    )
  return <span>{value}</span>
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line/60 py-3 last:border-b-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inner bg-brand-soft text-brand" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
        <div className="mt-0.5 break-words text-[14px] text-fg">{children}</div>
      </div>
    </div>
  )
}

export function ContactsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canEdit = isSiteMasterAdmin(user)
  const site = useSiteInfo()
  const info = site.data
  const [editing, setEditing] = useState(false)

  const contacts = (info?.contacts ?? []).filter((c) => c && (c.label || c.value))
  const empty = !!info && !info.owner_name && !info.owner_address && !info.support_phone && !info.support_email && !contacts.length

  return (
    <PageContainer>
      <PageHeader
        title={t('contactsPage.title')}
        subtitle={t('contactsPage.subtitle')}
        actions={
          canEdit && !editing && info ? (
            <Button leftIcon={<Pencil size={15} />} onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          ) : undefined
        }
      />

      {editing && info ? (
        <ContactsForm info={info} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="px-5 py-2">
            {site.isLoading ? (
              <div className="space-y-3 py-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : site.error ? (
              <LoadError error={site.error} onRetry={() => site.refetch()} />
            ) : empty ? (
              <EmptyState icon={<Contact size={22} />} title={t('contactsPage.empty')} />
            ) : (
              <>
                {info?.owner_name && (
                  <Row icon={<Building2 size={16} />} label={t('contactsPage.owner')}>
                    {info.owner_name}
                  </Row>
                )}
                {info?.owner_address && (
                  <Row icon={<MapPin size={16} />} label={t('contactsPage.address')}>
                    {info.owner_address}
                  </Row>
                )}
                {info?.support_phone && (
                  <Row icon={<Phone size={16} />} label={t('contactsPage.supportPhone')}>
                    <a className="text-brand hover:underline" href={telHref(info.support_phone)}>
                      {info.support_phone}
                    </a>
                  </Row>
                )}
                {info?.support_email && (
                  <Row icon={<Mail size={16} />} label={t('contactsPage.email')}>
                    <a className="text-brand hover:underline" href={`mailto:${info.support_email}`}>
                      {info.support_email}
                    </a>
                  </Row>
                )}
              </>
            )}
          </Card>

          {contacts.length > 0 && (
            <Card className="px-5 py-4">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-fg-muted">{t('contactsPage.other')}</h2>
              <dl>
                {contacts.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-line/60 py-2.5 last:border-b-0"
                  >
                    <dt className="text-[13px] text-fg-muted">{c.label}</dt>
                    <dd className="text-[13.5px] text-fg">
                      <ContactValue value={c.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  )
}

function ContactsForm({ info, onDone }: { info: SiteInfo; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useUpdateSiteInfo()
  const [form, setForm] = useState(() => ({
    owner_name: info.owner_name || '',
    owner_address: info.owner_address || '',
    support_phone: info.support_phone || '',
    support_email: info.support_email || '',
    contacts: (info.contacts ?? []).map((c) => ({ label: c.label || '', value: c.value || '' })),
  }))
  const [error, setError] = useState('')
  const set = (k: 'owner_name' | 'owner_address' | 'support_phone' | 'support_email', v: string) =>
    setForm((f) => ({ ...f, [k]: v }))
  const setContact = (i: number, k: keyof SiteContact, v: string) =>
    setForm((f) => ({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.support_email.trim() && !looksLikeEmail(form.support_email.trim())) return setError(t('contactsPage.badEmail'))
    try {
      await save.mutateAsync({
        owner_name: form.owner_name.trim(),
        owner_address: form.owner_address.trim(),
        support_phone: form.support_phone.trim(),
        support_email: form.support_email.trim(),
        contacts: form.contacts
          .map((c) => ({ label: c.label.trim(), value: c.value.trim() }))
          .filter((c) => c.label || c.value),
      })
      toast.ok(t('common.saved'))
      onDone()
    } catch (err) {
      setError(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <Card className="max-w-4xl p-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('contactsPage.owner')}>
            <Input value={form.owner_name} maxLength={500} onChange={(e) => set('owner_name', e.target.value)} />
          </Field>
          <Field label={t('contactsPage.address')}>
            <Input value={form.owner_address} maxLength={1000} onChange={(e) => set('owner_address', e.target.value)} />
          </Field>
          <Field label={t('contactsPage.supportPhone')}>
            <Input
              value={form.support_phone}
              maxLength={100}
              inputMode="tel"
              placeholder="+998 71 000 00 00"
              onChange={(e) => set('support_phone', e.target.value)}
            />
          </Field>
          <Field label={t('contactsPage.supportEmail')}>
            <Input
              type="email"
              value={form.support_email}
              maxLength={255}
              placeholder="support@uzgidro.uz"
              onChange={(e) => set('support_email', e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-fg">{t('contactsPage.other')}</legend>
          {form.contacts.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={c.label}
                maxLength={200}
                aria-label={t('contactsPage.contactLabel')}
                placeholder={t('contactsPage.contactLabelPh')}
                onChange={(e) => setContact(i, 'label', e.target.value)}
                wrapperClassName="flex-1"
              />
              <Input
                value={c.value}
                maxLength={500}
                aria-label={t('contactsPage.contactValue')}
                placeholder={t('contactsPage.contactValuePh')}
                onChange={(e) => setContact(i, 'value', e.target.value)}
                wrapperClassName="flex-1"
              />
              <IconButton
                label={t('common.delete')}
                onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, j) => j !== i) }))}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            leftIcon={<Plus size={14} />}
            disabled={form.contacts.length >= 50}
            onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, { label: '', value: '' }] }))}
          >
            {t('contactsPage.addContact')}
          </Button>
        </fieldset>

        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending} leftIcon={<Save size={15} />}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
