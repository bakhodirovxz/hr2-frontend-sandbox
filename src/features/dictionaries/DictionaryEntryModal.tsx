import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Combobox, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorMessage, errorParams } from '@/api/errorMessage'
import { useServerText } from '@/features/statistics/serverText'
import type { DictionaryEntry, DictionaryType } from './useDictionaries'
import { localizedName, useDictionaryMutations } from './useDictionaries'

interface Props {
  open: boolean
  onClose: () => void
  type: DictionaryType
  /** null = create. */
  entry: DictionaryEntry | null
  parentOptions: { value: string; label: string }[]
  parentType: DictionaryType | null
}

const EMPTY = {
  name: '',
  name_ru: '',
  code: '',
  description: '',
  parent_id: '',
  sort_order: '0',
  is_active: true,
}

/** TZ D1 / 4.2.5 «Qo'shimcha ma'lumot turlari»: each kind says WHAT it belongs to and its value type. */
export const EXTRA_KINDS_CODE = 'extra_attribute_kinds'
export const EXTRA_TARGETS = ['employee', 'department', 'job_position'] as const
export const EXTRA_VALUE_TYPES = ['text', 'number', 'date', 'bool'] as const

/** «Xodim · Matn» — the kind's target and value type, in the current language. */
export function useExtraKindLabel() {
  const { t } = useTranslation()
  return (extra: Record<string, unknown> | null | undefined): string => {
    const target = extra?.target as string | undefined
    if (!target) return ''
    const vt = extra?.value_type as string | undefined
    const tl = (EXTRA_TARGETS as readonly string[]).includes(target)
      ? t(`orgRef.target_${target as (typeof EXTRA_TARGETS)[number]}`)
      : target
    const vl = vt && (EXTRA_VALUE_TYPES as readonly string[]).includes(vt)
      ? t(`orgRef.valueType_${vt as (typeof EXTRA_VALUE_TYPES)[number]}`)
      : vt
    return vl ? `${tl} · ${vl}` : tl
  }
}

/**
 * One dictionary row (TZ D1). `code` may stay blank on create — the backend
 * derives it from the name; it stays editable for rows that must match an
 * external register. An «extra attribute kind» also carries its target object
 * and value type, which the server requires (422 `extra_attribute_kind_invalid`).
 */
export function DictionaryEntryModal({ open, onClose, type, entry, parentOptions, parentType }: Props) {
  const { t, i18n } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  const { create, update } = useDictionaryMutations()
  const [form, setForm] = useState(EMPTY)
  const [extra, setExtra] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<{ name?: string; target?: string; value_type?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const isExtraKinds = type.code === EXTRA_KINDS_CODE

  useEffect(() => {
    if (!open) return
    setError(null)
    setErrors({})
    setExtra(entry?.extra && typeof entry.extra === 'object' ? { ...entry.extra } : {})
    setForm(
      entry
        ? {
            name: entry.name ?? '',
            name_ru: entry.name_ru ?? '',
            code: entry.code ?? '',
            description: entry.description ?? '',
            parent_id: entry.parent_id ? String(entry.parent_id) : '',
            sort_order: String(entry.sort_order ?? 0),
            is_active: entry.is_active ?? true,
          }
        : EMPTY,
    )
  }, [open, entry])

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    const errs: typeof errors = {}
    // B-D17: a name made of spaces only is rejected with a clear message.
    if (!form.name.trim()) errs.name = t('orgRef.nameRequired')
    if (isExtraKinds && !extra.target) errs.target = t('orgRef.required')
    if (isExtraKinds && !extra.value_type) errs.value_type = t('orgRef.required')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      name_ru: form.name_ru.trim() || null,
      description: form.description.trim() || null,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    }
    if (form.code.trim()) body.code = form.code.trim()
    if (isExtraKinds) body.extra = extra
    setError(null)
    try {
      if (entry) await update.mutateAsync({ id: entry.id, body })
      else await create.mutateAsync({ code: type.code, body })
      toast.ok(entry ? t('orgRef.entryEdited') : t('dictionaries.created'))
      onClose()
    } catch (e) {
      const fields = errorParams(e).fields as Record<string, unknown> | undefined
      if (isExtraKinds && fields && typeof fields === 'object') {
        setErrors({
          target: fields.target ? st(String(fields.target)) : undefined,
          value_type: fields.value_type ? st(String(fields.value_type)) : undefined,
        })
      }
      setError(errorMessage(e, t('dictionaries.saveFailed')))
    }
  }

  const saving = create.isPending || update.isPending
  const parentLabel = parentType
    ? `${t('dictionaries.colParent')} (${localizedName(parentType, i18n.language)})`
    : t('dictionaries.colParent')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? t('dictionaries.editEntry') : t('dictionaries.newEntry')}
      description={localizedName(type, i18n.language)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('dictionaries.colName')} required wide error={errors.name}>
          <Input
            value={form.name}
            maxLength={500}
            invalid={!!errors.name}
            onChange={(e) => {
              set('name', e.target.value)
              setErrors((x) => ({ ...x, name: undefined }))
            }}
            autoFocus
            placeholder={t('dictionaries.namePlaceholder')}
          />
        </Field>
        <Field label={t('orgRef.nameRu')}>
          <Input value={form.name_ru} maxLength={500} onChange={(e) => set('name_ru', e.target.value)} />
        </Field>
        <Field label={t('dictionaries.colCode')} hint={t('dictionaries.codeHint')}>
          <Input
            value={form.code}
            maxLength={64}
            onChange={(e) => set('code', e.target.value)}
            placeholder={entry ? '' : t('dictionaries.codeAuto')}
          />
        </Field>
        {isExtraKinds && (
          <>
            <Field label={t('orgRef.extraTarget')} required error={errors.target}>
              <Select
                value={String(extra.target ?? '')}
                onChange={(e) => {
                  setExtra((x) => ({ ...x, target: e.target.value || undefined }))
                  setErrors((x) => ({ ...x, target: undefined }))
                }}
                placeholder={t('common.choose')}
                invalid={!!errors.target}
                options={EXTRA_TARGETS.map((v) => ({ value: v, label: t(`orgRef.target_${v}`) }))}
              />
            </Field>
            <Field label={t('orgRef.extraValueType')} required error={errors.value_type}>
              <Select
                value={String(extra.value_type ?? '')}
                onChange={(e) => {
                  setExtra((x) => ({ ...x, value_type: e.target.value || undefined }))
                  setErrors((x) => ({ ...x, value_type: undefined }))
                }}
                placeholder={t('common.choose')}
                invalid={!!errors.value_type}
                options={EXTRA_VALUE_TYPES.map((v) => ({ value: v, label: t(`orgRef.valueType_${v}`) }))}
              />
            </Field>
          </>
        )}
        {type.is_hierarchical && (
          <Field label={parentLabel} wide>
            <Combobox
              value={form.parent_id}
              onChange={(v) => set('parent_id', v)}
              options={parentOptions}
              placeholder={t('dictionaries.parentPlaceholder')}
            />
          </Field>
        )}
        <Field label={t('dictionaries.colDescription')} wide>
          <Textarea value={form.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} rows={2} />
        </Field>
        <Field label={t('orgRef.sortOrder')}>
          <Input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </Field>
        <Field label={t('dictionaries.colStatus')}>
          <Checkbox checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} label={t('dictionaries.active')} />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
