import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { useDictionaryTypes } from '@/features/dictionaries/useDictionaries'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { canManageStructure } from '@/auth/canManage'
import { useListParams } from '@/hooks/useListParams'
import { errorMessage } from '@/api/errorMessage'
import {
  useCustomFieldGroups,
  useCustomFieldMeta,
  type CustomField,
  type CustomFieldGroup,
} from '@/features/system/useCustomFields'

function CustomFieldsPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const { meta } = useCustomFieldMeta()
  const { filters, setFilter } = useListParams(['entity'])
  const entityType = filters.entity || 'employee'
  const g = useCustomFieldGroups(entityType)

  /**
   * The page is reachable by `canAccessSystemAdmin` (AKT included), but the
   * definition routes are `require_structure_manager` — admin, master-admin or
   * HR. Verified live: an AKT account was shown "Yangi guruh" and got 403 from
   * `POST /custom-fields/groups`.
   */
  const canWriteFields = canManageStructure(useAuthStore((st) => st.user))
  const [groupModal, setGroupModal] = useState<CustomFieldGroup | 'new' | null>(null)
  const [fieldModal, setFieldModal] = useState<{ group: CustomFieldGroup; field: CustomField | null } | null>(null)
  const [removingGroup, setRemovingGroup] = useState<CustomFieldGroup | null>(null)
  const [removingField, setRemovingField] = useState<CustomField | null>(null)

  const typeLabel = (v?: string | null) => meta?.field_types.find((f) => f.value === v)?.label ?? v ?? '—'

  return (
    <PageContainer>
      <PageHeader
        title={t('customFields.title')}
        subtitle={t('customFields.subtitle')}
        actions={
          canWriteFields ? (
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setGroupModal('new')}>
              {t('customFields.addGroup')}
            </Button>
          ) : undefined
        }
      />

      {meta && (
        <div className="mb-4">
          <Segmented
            value={entityType}
            onChange={(v) => setFilter('entity', v === 'employee' ? '' : v)}
            options={meta.entity_types.map((e) => ({ value: e.value, label: e.label }))}
          />
        </div>
      )}

      {g.loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : g.groups.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<Layers size={22} />} title={t('customFields.empty')} description={t('customFields.emptyHint')} /></Card>
      ) : (
        <div className="space-y-3">
          {g.groups.map((grp) => (
            <Card key={grp.id} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-fg">{grp.title}</span>
                  {grp.description && <span className="block truncate text-[11.5px] text-fg-subtle">{grp.description}</span>}
                </span>
                {grp.is_active === false && <Badge tone="neutral">{t('customFields.inactive')}</Badge>}
                <span className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="outline" leftIcon={<Plus size={13} />} onClick={() => setFieldModal({ group: grp, field: null })}>
                    {t('customFields.addField')}
                  </Button>
                  <IconButton size="sm" label={t('common.edit')} onClick={() => setGroupModal(grp)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton size="sm" label={t('common.delete')} onClick={() => setRemovingGroup(grp)}>
                    <Trash2 size={14} />
                  </IconButton>
                </span>
              </div>

              {(grp.fields ?? []).length === 0 ? (
                <p className="px-4 py-3 text-[12.5px] text-fg-subtle">{t('customFields.noFields')}</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {(grp.fields ?? []).map((f) => (
                    <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">
                          {f.label}
                          {f.is_required && <span className="text-danger"> *</span>}
                        </span>
                        <span className="block truncate text-[11.5px] text-fg-subtle">{f.key}</span>
                      </span>
                      <Badge tone="neutral">{typeLabel(f.field_type)}</Badge>
                      {f.show_in_list && <Badge tone="info">{t('customFields.inList')}</Badge>}
                      {f.is_active === false && <Badge tone="neutral">{t('customFields.inactive')}</Badge>}
                      <IconButton size="sm" label={t('common.edit')} onClick={() => setFieldModal({ group: grp, field: f })}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton size="sm" label={t('common.delete')} onClick={() => setRemovingField(f)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <GroupModal
        value={groupModal}
        entityType={entityType}
        saving={g.createGroup.isPending || g.updateGroup.isPending}
        onClose={() => setGroupModal(null)}
        onSave={async (body, id) => {
          try {
            if (id) await g.updateGroup.mutateAsync({ id, body })
            else await g.createGroup.mutateAsync(body)
            toast.ok(t('common.saved'))
            setGroupModal(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />

      <FieldModal
        value={fieldModal}
        fieldTypes={meta?.field_types ?? []}
        saving={g.createField.isPending || g.updateField.isPending}
        onClose={() => setFieldModal(null)}
        onSave={async (body, id) => {
          try {
            if (id) await g.updateField.mutateAsync({ id, body })
            else await g.createField.mutateAsync(body)
            toast.ok(t('common.saved'))
            setFieldModal(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />

      <ConfirmDialog
        open={!!removingGroup}
        danger
        confirmLabel={t('common.delete')}
        title={t('customFields.removeGroupTitle')}
        description={t('customFields.removeGroupConfirm', { name: removingGroup?.title ?? '' })}
        loading={g.removeGroup.isPending}
        onClose={() => setRemovingGroup(null)}
        onConfirm={async () => {
          if (!removingGroup) return
          try {
            await g.removeGroup.mutateAsync(removingGroup.id)
            toast.ok(t('common.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemovingGroup(null)
          }
        }}
      />

      <ConfirmDialog
        open={!!removingField}
        danger
        confirmLabel={t('common.delete')}
        title={t('customFields.removeFieldTitle')}
        description={t('customFields.removeFieldConfirm', { name: removingField?.label ?? '' })}
        loading={g.removeField.isPending}
        onClose={() => setRemovingField(null)}
        onConfirm={async () => {
          if (!removingField) return
          try {
            await g.removeField.mutateAsync(removingField.id)
            toast.ok(t('common.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemovingField(null)
          }
        }}
      />
    </PageContainer>
  )
}

function GroupModal({
  value,
  entityType,
  onClose,
  onSave,
  saving,
}: {
  value: CustomFieldGroup | 'new' | null
  entityType: string
  onClose: () => void
  onSave: (body: Record<string, unknown>, id?: number) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  const seedKey = open ? String(row?.id ?? 'new') : null
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setTitle(row?.title ?? '')
    setDescription(row?.description ?? '')
    setActive(row?.is_active !== false)
    setError('')
  }

  const submit = () => {
    if (!title.trim()) return setError(t('customFields.titleRequired'))
    onSave(
      // `entity_type` is fixed once the group exists; the update schema
      // forbids it (422 «Extra inputs are not permitted», agent sweep 09-25).
      {
        title: title.trim(),
        ...(row ? {} : { entity_type: entityType }),
        description: description.trim() || null,
        is_active: active,
      },
      row?.id,
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? t('customFields.editGroup') : t('customFields.addGroup')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('customFields.groupTitle')} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('customFields.groupDescription')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} label={t('customFields.activeLabel')} />
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

function FieldModal({
  value,
  fieldTypes,
  onClose,
  onSave,
  saving,
}: {
  value: { group: CustomFieldGroup; field: CustomField | null } | null
  fieldTypes: { value: string; label: string }[]
  onClose: () => void
  onSave: (body: Record<string, unknown>, id?: number) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const open = !!value
  const field = value?.field ?? null
  const [label, setLabel] = useState('')
  /**
   * ⚠️ The server REQUIRES `key` (`CustomFieldCreate`), and this page did not
   * send one — every field creation answered 422. It is derived from the label
   * while the admin has not touched it, and frozen after creation: changing a
   * key would orphan every value already stored under the old one.
   */
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [type, setType] = useState('text')
  const [required, setRequired] = useState(false)
  const [showInList, setShowInList] = useState(false)
  const [active, setActive] = useState(true)
  const [help, setHelp] = useState('')
  const [optionsText, setOptionsText] = useState('')
  /** `field_type: 'dictionary'` maydonlari QAYSI ma'lumotnomadan o'qishini
   *  aytadi. Usiz ular ro'yxatda ko'rinardi-yu, sozlab bo'lmasdi. */
  const [dictType, setDictType] = useState('')
  /** Son maydoni uchun chegaralar. */
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  /** Guruh ichidagi tartib — v2 da doim serverning 0 standarti qolardi. */
  const [position, setPosition] = useState('')
  const [error, setError] = useState('')
  const { types: dictionaryTypes } = useDictionaryTypes()
  const [seeded, setSeeded] = useState<string | null>(null)

  const seedKey = open ? `${value!.group.id}:${field?.id ?? 'new'}` : null
  if (open && seeded !== seedKey) {
    setSeeded(seedKey)
    setLabel(field?.label ?? '')
    setKey(field?.key ?? '')
    setKeyTouched(!!field?.key)
    setType(field?.field_type ?? 'text')
    setRequired(!!field?.is_required)
    setShowInList(!!field?.show_in_list)
    setActive(field?.is_active !== false)
    setHelp(field?.help_text ?? '')
    setOptionsText((field?.options ?? []).map((o) => o.label ?? o.value ?? '').join('\n'))
    setDictType(field?.dictionary_type_code ?? '')
    setMinValue(field?.min_value != null ? String(field.min_value) : '')
    setMaxValue(field?.max_value != null ? String(field.max_value) : '')
    setPosition(field?.position != null ? String(field.position) : '')
    setError('')
  }

  // Only the choice types carry a list; asking for one on a date field would
  // save options nothing ever reads.
  const needsOptions = ['select', 'multiselect', 'radio'].includes(type)
  const needsDictionary = type === 'dictionary'
  const isNumeric = type === 'number'

  const submit = () => {
    if (!label.trim()) return setError(t('customFields.labelRequired'))
    if (!(key || slugKey(label)).trim()) return setError(t('customFields.keyRequired'))
    const options = needsOptions
      ? optionsText
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => ({ value: x, label: x }))
      : null
    onSave(
      {
        // A field stays in its group; `group_id` is create-only (the update
        // schema forbids it — every edit was a 422).
        ...(field ? {} : { group_id: value!.group.id }),
        key: (key || slugKey(label)).trim(),
        label: label.trim(),
        field_type: type,
        is_required: required,
        show_in_list: showInList,
        is_active: active,
        help_text: help.trim() || null,
        options,
        dictionary_type_code: needsDictionary ? dictType || null : null,
        min_value: isNumeric && minValue.trim() !== '' ? Number(minValue) : null,
        max_value: isNumeric && maxValue.trim() !== '' ? Number(maxValue) : null,
        position: position.trim() === '' ? 0 : Number(position),
      },
      field?.id,
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={field ? t('customFields.editField') : t('customFields.addField')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('customFields.fieldLabel')} required>
          <Input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              if (!keyTouched) setKey(slugKey(e.target.value))
            }}
          />
        </Field>
        <Field label={t('customFields.fieldKey')} required hint={t('customFields.keyHint')}>
          <Input
            value={key}
            disabled={!!field}
            onChange={(e) => {
              setKeyTouched(true)
              setKey(slugKey(e.target.value))
            }}
          />
        </Field>
        <Field label={t('customFields.fieldType')} required>
          <Combobox
            value={type}
            onChange={(v) => v && setType(v)}
            options={fieldTypes}
            clearable={false}
            placeholder={t('t2.pick')}
            className="w-full"
          />
        </Field>
        {needsOptions && (
          <Field label={t('customFields.options')} hint={t('customFields.optionsHint')}>
            <Textarea rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
          </Field>
        )}
        {needsDictionary && (
          <Field label={t('customFields.dictionaryType')} hint={t('customFields.dictionaryTypeHint')} required>
            <Combobox
              value={dictType}
              onChange={setDictType}
              options={dictionaryTypes.map((d) => ({ value: d.code ?? '', label: d.name ?? d.code ?? '' }))}
              placeholder={t('t2.pick')}
              className="w-full"
            />
          </Field>
        )}
        {isNumeric && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('customFields.minValue')}>
              <Input type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)} />
            </Field>
            <Field label={t('customFields.maxValue')}>
              <Input type="number" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={t('customFields.position')} hint={t('customFields.positionHint')}>
          <Input type="number" value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
        <Field label={t('customFields.helpText')}>
          <Input value={help} onChange={(e) => setHelp(e.target.value)} />
        </Field>
        <div className="space-y-2">
          <Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} label={t('customFields.requiredLabel')} />
          <Checkbox checked={showInList} onChange={(e) => setShowInList(e.target.checked)} label={t('customFields.showInListLabel')} />
          <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} label={t('customFields.activeLabel')} />
        </div>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
/**
 * Label → storage key. Uzbek letters lose their apostrophes (o‘ → o, g‘ → g)
 * rather than becoming underscores, so «Ish o‘rni» reads as `ish_orni` and not
 * `ish_o_rni`.
 */
function slugKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’ʻʼ']/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

export function CustomFieldsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.canAccessSystemAdmin(user)} title={t('customFields.title')}>
      <CustomFieldsPageInner />
    </RequireRole>
  )
}

