import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, FileText, Pencil, Save, X } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { FormError } from '@/components/ui/FormError'
import { LoadError } from '@/components/data/LoadError'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import i18n from '@/i18n'
import { useServiceTemplates, type ServiceTemplate } from './useServices'
import { serviceLabel } from './serviceLabel'
import { fmtStamp } from './serviceUi'

const fmt = (v?: string | null) => fmtStamp(v)

/** O'rin egasi nomi — lug'atdan, server matni zaxira. */
function placeholderLabel(key: string, fallback: string): string {
  const k = `svc.ph_${key}`
  return i18n.exists(k) ? String((i18n.t as unknown as (x: string) => string)(k)) : fallback
}

function Preview({ title, body, signature }: { title: string; body: string; signature?: string | null }) {
  return (
    <div className="rounded-inner border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-fg">
      <p className="mb-2 text-center font-semibold">{title}</p>
      <p className="whitespace-pre-wrap leading-relaxed">{body}</p>
      {signature && <p className="mt-3 text-fg-muted">{signature} ____________</p>}
    </div>
  )
}

/**
 * HUJJAT SHABLONLARI — TZ 4.2.12 · 2304–2305 («Система генерирует
 * запрошенные документы по утвержденным шаблонам»).
 *
 * Bosh administrator matnni tahrirlaydi (qoralama) va «Tasdiqlash» ni bosadi;
 * hujjat har doim oxirgi TASDIQLANGAN matndan quriladi. Kadr faqat ko'radi.
 */
export function ServiceTemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const tpl = useServiceTemplates(true)
  const [editing, setEditing] = useState<string | null>(null)

  if (tpl.error) return <LoadError error={tpl.error} onRetry={() => tpl.refetch()} />
  if (tpl.loading || !tpl.data) return <CenteredSpinner />
  const placeholders = tpl.data.placeholders ?? []

  const approve = async (item: ServiceTemplate) => {
    const ok = await confirm({
      kind: 'approve',
      title: t('svc.tplApproveTitle'),
      description: t('svc.tplApproveText'),
      confirmLabel: t('svc.tplApprove'),
    })
    if (!ok) return
    try {
      await tpl.approve.mutateAsync(item.service_type)
      toast.ok(t('svc.tplApproved'))
    } catch (e) {
      toast.error(errorMessage(e, t('services.actionFailed')))
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="max-w-[820px] text-[12.5px] text-fg-muted">{t('svc.tplIntro')}</p>
      {tpl.data.items.map((item) => {
        const label = serviceLabel(item.service_type, item.label)
        return (
          <Card key={item.service_type} className="overflow-hidden" aria-label={label}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <FileText size={15} className="text-brand" aria-hidden="true" />
              <h3 className="text-[13.5px] font-semibold text-fg">{label}</h3>
              <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-muted">
                <CheckCircle2 size={12} className="text-success" aria-hidden="true" />
                {item.is_default
                  ? t('svc.tplApprovedSystem')
                  : t('svc.tplApprovedBy', { who: item.approved_by || '—', when: fmt(item.approved_at) })}
              </span>
              {canEdit && editing !== item.service_type && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  leftIcon={<Pencil size={13} />}
                  onClick={() => setEditing(item.service_type)}
                >
                  {t('svc.edit')}
                </Button>
              )}
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="engrave text-fg-subtle">{t('svc.tplCurrent')}</span>
                <Preview title={item.title} body={item.body} signature={item.signature} />
              </div>
              <div className="flex flex-col gap-1.5">
                {editing === item.service_type ? (
                  <>
                    <span className="engrave text-fg-subtle">{t('svc.edit')}</span>
                    <TemplateEditor
                      item={item}
                      placeholders={placeholders}
                      saving={tpl.save.isPending}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        await tpl.save.mutateAsync({ type: item.service_type, body })
                        toast.ok(t('svc.tplDraftSaved'))
                        setEditing(null)
                      }}
                    />
                  </>
                ) : item.draft ? (
                  <>
                    <span className="engrave inline-flex items-center gap-1 text-warning">
                      <Clock size={12} aria-hidden="true" /> {t('svc.tplDraft')}
                    </span>
                    <Preview title={item.draft.title} body={item.draft.body} signature={item.draft.signature} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11.5px] text-fg-subtle">
                        {t('svc.tplEditedBy', { who: item.draft.updated_by || '—', when: fmt(item.draft.updated_at) })}
                      </span>
                      {canEdit && (
                        <Button
                          size="sm"
                          leftIcon={<CheckCircle2 size={13} />}
                          loading={tpl.approve.isPending && tpl.approve.variables === item.service_type}
                          onClick={() => approve(item)}
                        >
                          {t('svc.tplApprove')}
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[12.5px] text-fg-muted">
                    <p className="mb-2">{t('svc.tplNoDraft')}</p>
                    <p className="text-[11.5px] text-fg-subtle">{t('svc.tplPlaceholders')}:</p>
                    <ul className="mt-1 grid gap-x-3 gap-y-0.5 text-[11.5px] sm:grid-cols-2">
                      {placeholders.map((p) => (
                        <li key={p.key}>
                          <code className="text-brand-strong">{`{{${p.key}}}`}</code> — {placeholderLabel(p.key, p.label)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function TemplateEditor({
  item,
  placeholders,
  saving,
  onCancel,
  onSave,
}: {
  item: ServiceTemplate
  placeholders: { key: string; label: string }[]
  saving: boolean
  onCancel: () => void
  onSave: (body: { title: string; body: string; signature: string | null }) => Promise<void>
}) {
  const { t } = useTranslation()
  const src = item.draft ?? item
  const [title, setTitle] = useState(src.title ?? '')
  const [body, setBody] = useState(src.body ?? '')
  const [signature, setSignature] = useState(src.signature ?? '')
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const el = bodyRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = async () => {
    setError(null)
    try {
      await onSave({ title: title.trim(), body, signature: signature.trim() || null })
    } catch (e) {
      setError(errorMessage(e, t('services.actionFailed')))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('svc.tplTitle')} required>
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('svc.tplBody')} required>
        <Textarea ref={bodyRef} rows={9} value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label={t('svc.tplPlaceholders')}>
        {placeholders.map((p) => (
          <button
            key={p.key}
            type="button"
            title={placeholderLabel(p.key, p.label)}
            onClick={() => insert(p.key)}
            className="h-6 rounded-xs border border-brand/30 bg-brand-soft px-2 font-mono text-[11px] text-brand-strong hover:border-brand/60"
          >
            {`{{${p.key}}}`}
          </button>
        ))}
      </div>
      <Field label={t('svc.tplSignature')}>
        <Input value={signature} maxLength={200} onChange={(e) => setSignature(e.target.value)} />
      </Field>
      <FormError>{error}</FormError>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" leftIcon={<X size={13} />} disabled={saving} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" leftIcon={<Save size={13} />} loading={saving} onClick={save}>
          {t('svc.tplSaveDraft')}
        </Button>
      </div>
    </div>
  )
}
