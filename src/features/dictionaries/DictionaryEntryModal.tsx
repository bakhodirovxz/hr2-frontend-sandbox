import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Combobox, Field, Input, Modal, Textarea, useToast } from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import type { DictionaryEntry, DictionaryType } from './useDictionaries'
import { useDictionaryMutations } from './useDictionaries'

interface Props {
  open: boolean
  onClose: () => void
  type: DictionaryType
  /** null = create. */
  entry: DictionaryEntry | null
  parentOptions: { value: string; label: string }[]
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

/**
 * One dictionary row.
 *
 * `code` is left blank on create on purpose: the backend derives a stable slug
 * from the name, and a hand-typed code is the single most common way two
 * dictionaries end up unable to reference each other. It stays editable for
 * the cases where the code has to match an external register.
 */
export function DictionaryEntryModal({ open, onClose, type, entry, parentOptions }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const { create, update } = useDictionaryMutations()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
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

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t('dictionaries.nameRequired'))
      return
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      name_ru: form.name_ru.trim() || null,
      description: form.description.trim() || null,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    }
    if (form.code.trim()) body.code = form.code.trim()

    try {
      if (entry) await update.mutateAsync({ id: entry.id, body })
      else await create.mutateAsync({ code: type.code, body })
      toast.ok(entry ? t('dictionaries.saved') : t('dictionaries.created'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('dictionaries.saveFailed')))
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? t('dictionaries.editEntry') : t('dictionaries.newEntry')}
      description={type.name}
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
        <Field label={t('dictionaries.colName')} required wide>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
            placeholder={t('dictionaries.namePlaceholder')}
          />
        </Field>
        <Field label={t('dictionaries.colNameRu')}>
          <Input value={form.name_ru} onChange={(e) => set('name_ru', e.target.value)} />
        </Field>
        <Field label={t('dictionaries.colCode')} hint={t('dictionaries.codeHint')}>
          <Input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder={entry ? '' : t('dictionaries.codeAuto')}
          />
        </Field>
        {type.is_hierarchical && (
          <Field label={t('dictionaries.colParent')} wide>
            <Combobox
              value={form.parent_id}
              onChange={(v) => set('parent_id', v)}
              options={parentOptions}
              placeholder={t('dictionaries.parentPlaceholder')}
            />
          </Field>
        )}
        <Field label={t('dictionaries.colDescription')} wide>
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
          />
        </Field>
        <Field label={t('dictionaries.colSort')}>
          <Input
            type="number"
            value={form.sort_order}
            onChange={(e) => set('sort_order', e.target.value)}
          />
        </Field>
        <Field label={t('dictionaries.colStatus')}>
          <Checkbox
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            label={t('dictionaries.active')}
          />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
