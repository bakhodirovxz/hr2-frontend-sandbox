import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { BasisFields, EMPTY_BASIS } from './BasisFields'
import { ExtraAttributesFields } from './ExtraAttributesFields'
import type { Basis } from './useDepartmentAdmin'
import { usePositionAdminMutations, usePositionCategories, usePositionDetail, type PositionRow } from './usePositionAdmin'

/**
 * Lavozim yaratish / tahrirlash (TZ 4.2.6 · 2045, 2046, 2051): to'liq va
 * qisqartirilgan nom, razryad, toifa (`position_categories` ma'lumotnomasidan)
 * va qo'shimcha ma'lumotlar. Tahrirda asos ixtiyoriy — berilsa
 * `extra.change_log` ga yoziladi.
 */
export function PositionFormModal({
  open,
  value,
  onClose,
}: {
  open: boolean
  /** null — yangi lavozim. */
  value: PositionRow | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const mut = usePositionAdminMutations()
  const detail = usePositionDetail(open && value ? value.id : null)
  const isEdit = !!value

  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [razryad, setRazryad] = useState('')
  const [category, setCategory] = useState('')
  const [attributes, setAttributes] = useState<Record<string, unknown>>({})
  const [basis, setBasis] = useState<Basis>(EMPTY_BASIS)
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [seeded, setSeeded] = useState(false)
  const categories = usePositionCategories(category)

  useEffect(() => {
    if (!open) {
      setSeeded(false)
      return
    }
    setName(value?.name ?? '')
    setShortName(value?.short_name ?? '')
    setRazryad(value?.razryad != null ? String(value.razryad) : '')
    setCategory(value?.category ?? '')
    setAttributes(value?.extra?.attributes ?? {})
    setBasis(EMPTY_BASIS)
    setNameError('')
    setFormError('')
  }, [open, value])

  // Ro'yxat qatorida `extra` bo'lmasligi mumkin — batafsil so'rovdan.
  useEffect(() => {
    if (!open || !isEdit || seeded || !detail.data) return
    const d = detail.data
    setName((v) => v || d.name || '')
    setShortName((v) => v || d.short_name || '')
    setAttributes((v) => (Object.keys(v).length ? v : d.extra?.attributes ?? {}))
    setSeeded(true)
  }, [open, isEdit, seeded, detail.data])

  const branchId = value?.organization_branch_id ?? selectedBranchId

  const submit = async () => {
    if (!name.trim()) {
      setNameError(t('orgAdmin.posNameRequired'))
      return
    }
    if (!branchId) {
      setFormError(t('orgAdmin.branchRequired'))
      return
    }
    setFormError('')
    const body: Record<string, unknown> = {
      name: name.trim(),
      short_name: shortName.trim() || null,
      razryad: razryad === '' ? null : Number(razryad),
      category: category || null,
      organization_branch_id: branchId,
      extra: { attributes },
    }
    if (isEdit && basis.number.trim() && basis.date) {
      body.basis_number = basis.number.trim()
      body.basis_date = basis.date
    }
    try {
      if (value) await mut.update.mutateAsync({ id: value.id, body })
      else await mut.create.mutateAsync(body)
      toast.ok(isEdit ? t('orgAdmin.posUpdated') : t('orgAdmin.posCreated'))
      onClose()
    } catch (e) {
      setFormError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const saving = mut.create.isPending || mut.update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title={isEdit ? t('orgAdmin.posEditTitle') : t('orgAdmin.posCreateTitle')}
      description={isEdit ? value?.name : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving} disabled={isEdit && detail.isLoading}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('orgAdmin.posName')} required error={nameError} wide>
          <Input
            value={name}
            invalid={!!nameError}
            placeholder={t('orgAdmin.posNamePlaceholder')}
            onChange={(e) => {
              setName(e.target.value)
              setNameError('')
            }}
          />
        </Field>
        <Field label={t('orgAdmin.posShortName')} hint={t('orgAdmin.posShortNameHint')} wide>
          <Input value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </Field>
        <Field label={t('orgAdmin.colRazryad')} hint={t('orgAdmin.razryadHint')}>
          <Input
            inputMode="numeric"
            value={razryad}
            placeholder={t('orgAdmin.razryadPlaceholder')}
            onChange={(e) => setRazryad(e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label={t('orgAdmin.colCategory')} hint={t('orgAdmin.categoryHint')}>
          <Combobox
            value={category}
            onChange={setCategory}
            options={categories.options}
            placeholder={t('orgAdmin.categoryNone')}
          />
        </Field>
        <div className="sm:col-span-2">
          <ExtraAttributesFields target="job_position" value={attributes} onChange={setAttributes} />
        </div>
        {isEdit && (
          <div className="sm:col-span-2">
            <BasisFields value={basis} onChange={setBasis} required={false} title={t('orgAdmin.basisEditOptional')} />
          </div>
        )}
      </div>
      <FormError className="mt-3 text-xs">{formError}</FormError>
    </Modal>
  )
}
