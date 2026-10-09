import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Checkbox } from '@/components/ui/Checkbox'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { maskValue, type MaskKind } from '@/lib/fieldMask'
import {
  useCustomFieldRawValues,
  useCustomFieldSchema,
  useCustomFieldValueMutations,
  useCustomFieldValues,
  type CustomField,
} from '@/features/system/useCustomFields'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'

/** Which of the mask rules a custom field's own type implies. */
const TYPE_MASK: Record<string, MaskKind> = { phone: 'phone' }

/**
 * THE CUSTOM FIELDS ON THIS RECORD.
 *
 * Driven by the field DEFINITIONS, not by the values that happen to be stored.
 * The display endpoint omits every field that was never filled in, so a section
 * built from it could only ever edit fields that already had a value — a new
 * field an administrator added stayed invisible and unfillable on every card.
 * The groups give the full list; `/raw` gives what to put in the inputs.
 *
 * Only the plainly editable types are offered here (text, number, date, yes/no,
 * e-mail, phone, url). A dictionary reference, an employee link or a multi-select
 * is shown READ-ONLY with the label the server already resolved: those need the
 * same pickers the definition screen has, and a half-working picker that writes
 * a raw id would be worse than showing the value.
 */
const EDITABLE = new Set(['text', 'textarea', 'number', 'date', 'boolean', 'email', 'phone', 'url'])

export function CustomFieldsSection({
  entityType,
  entityId,
  canEdit,
}: {
  entityType: string
  entityId: number | null
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { groups, loading: schemaLoading } = useCustomFieldSchema(entityType)
  // An employee's custom fields are free-form HR data: the server shows them
  // to HR / the site administrator and to the person themselves only
  // (custom_field.assert_entity_access). Mirrored here so a deputy or
  // minister opening a card does not fire a request that can only be a 403.
  const user = useAuthStore((st) => st.user)
  const mayRead =
    entityType !== 'employee' ||
    roles.isHR(user) ||
    roles.isSiteMasterAdmin(user) ||
    (entityId != null && user?.employee?.id === entityId)
  const { values, loading, denied: refused } = useCustomFieldValues(entityType, entityId, mayRead)
  const denied = refused || !mayRead
  const { raw } = useCustomFieldRawValues(entityType, entityId, canEdit)
  const save = useCustomFieldValueMutations(entityType, entityId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  /** Groups that actually ask something — an empty group draws nothing. */
  const filled = useMemo(
    () => groups.filter((g) => (g.fields ?? []).some((f) => f.is_active !== false)),
    [groups],
  )
  /** The server-rendered text for a key, when it has a value. */
  const shownByKey = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of values) m[v.key] = v.text ?? (v.value == null || v.value === '' ? '' : String(v.value))
    return m
  }, [values])

  useEffect(() => {
    if (!editing) setDraft({ ...raw })
  }, [raw, editing])

  if (loading || schemaLoading) return <CenteredSpinner />
  // No fields defined for this entity, or no permission — say nothing at all
  // rather than showing an empty panel on every profile.
  if (denied || filled.length === 0) return null

  const set = (k: string, v: unknown) => setDraft((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    try {
      const only: Record<string, unknown> = {}
      for (const g of filled) {
        for (const f of g.fields ?? []) {
          if (!f.key || f.is_active === false || !EDITABLE.has(f.field_type ?? '')) continue
          const v = draft[f.key]
          only[f.key] = v === '' ? null : (v ?? null)
        }
      }
      await save.mutateAsync(only)
      setEditing(false)
      toast.ok(t('common.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{t('customFields.sectionTitle')}</h3>
        {canEdit && !editing && (
          <Button size="sm" variant="secondary" className="ml-auto" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
        )}
        {editing && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            <Button size="sm" loading={save.isPending} onClick={() => submit()}>{t('common.save')}</Button>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {filled.map((g) => {
          const fields = (g.fields ?? []).filter((f) => f.is_active !== false && !!f.key)
          return (
            <div key={g.id}>
              {/* The group title is the section heading the administrator wrote;
                  with one group it would only repeat the panel's own title. */}
              {filled.length > 1 && g.title && (
                <p className="mb-2 text-[12px] font-semibold text-fg-subtle">{g.title}</p>
              )}
              <div className="grid gap-3.5 sm:grid-cols-2">
                {fields.map((f) => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    editing={editing && EDITABLE.has(f.field_type ?? '')}
                    shown={shownByKey[f.key as string]}
                    value={draft[f.key as string]}
                    onChange={(x) => set(f.key as string, x)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function FieldRow({
  field,
  editing,
  shown,
  value,
  onChange,
}: {
  field: CustomField
  editing: boolean
  shown?: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const label = field.label || field.key || ''

  if (!editing) {
    return (
      <div>
        <p className="text-[11.5px] text-fg-subtle">{label}</p>
        <p className="text-[13.5px] text-fg">
          {field.field_type === 'boolean' ? (value ? '✓' : '—') : shown || '—'}
        </p>
      </div>
    )
  }

  const str = value == null ? '' : String(value)
  const mask = TYPE_MASK[field.field_type ?? '']

  return (
    <Field label={label} required={field.is_required} hint={field.help_text ?? undefined}>
      {field.field_type === 'textarea' ? (
        <Textarea rows={2} value={str} placeholder={field.placeholder ?? undefined} onChange={(e) => onChange(e.target.value)} />
      ) : field.field_type === 'date' ? (
        <DateInput value={str} onChange={onChange} />
      ) : field.field_type === 'boolean' ? (
        <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <Input
          value={str}
          placeholder={field.placeholder ?? undefined}
          inputMode={field.field_type === 'number' ? 'decimal' : undefined}
          onChange={(e) =>
            onChange(
              mask
                ? maskValue(mask, e.target.value)
                : field.field_type === 'number'
                  ? e.target.value.replace(/[^\d.,-]/g, '')
                  : e.target.value,
            )
          }
        />
      )}
    </Field>
  )
}
