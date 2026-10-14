import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { useBranchStore } from '@/store/branchStore'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { BasisFields, EMPTY_BASIS, isBasisComplete } from './BasisFields'
import { ExtraAttributesFields } from './ExtraAttributesFields'
import { buildTree, descendantIds, indexTree, parentOptions } from './structureTree'
import {
  useDepartmentAdminMutations,
  useDepartmentDetail,
  UNIT_TYPES,
  type Basis,
  type DepartmentRow,
  type UnitType,
} from './useDepartmentAdmin'

const ROOT = ''

/**
 * Bo'lim yaratish / tahrirlash (TZ S1, S2).
 *
 * S1 kiruvchi ma'lumotlari: nomi, kodi (filial ichida noyob), yuqori bo'lim,
 * boshliqlari, tashkil etilgan sanasi, funksiyalari tavsifi + qo'shimcha
 * ma'lumotlar. S2: tahrirda o'zgartirish asosi — buyruq raqami va sanasi
 * MAJBURIY. Yuqori bo'lim tanlagichida bo'limning o'zi va avlodlari yo'q —
 * sikl yaratib bo'lmaydi.
 */
export function DepartmentFormModal({
  open,
  value,
  all,
  onClose,
}: {
  open: boolean
  /** null — yangi bo'lim. */
  value: DepartmentRow | null
  /** Filialning barcha bo'limlari (ota tanlagichi uchun). */
  all: DepartmentRow[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const mut = useDepartmentAdminMutations()
  const isEdit = !!value
  const detail = useDepartmentDetail(open && value ? value.id : null)

  const [name, setName] = useState('')
  const [nameRu, setNameRu] = useState('')
  const [code, setCode] = useState('')
  const [unitType, setUnitType] = useState<UnitType>('division')
  const [parentId, setParentId] = useState(ROOT)
  const [heads, setHeads] = useState<PickedPerson[]>([])
  const [established, setEstablished] = useState('')
  const [functions, setFunctions] = useState('')
  const [attributes, setAttributes] = useState<Record<string, unknown>>({})
  const [basis, setBasis] = useState<Basis>(EMPTY_BASIS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [seeded, setSeeded] = useState(false)

  // Yangi oyna — maydonlar ro'yxat qatoridan; `extra` batafsil so'rov kelgach.
  useEffect(() => {
    if (!open) {
      setSeeded(false)
      return
    }
    setName(value?.name ?? '')
    setNameRu(value?.name_ru ?? (value as { extra?: { name_ru?: string | null } } | null | undefined)?.extra?.name_ru ?? '')
    setCode(value?.code ?? '')
    setUnitType(value?.unit_type ?? 'division')
    setParentId(value?.parent_id != null ? String(value.parent_id) : ROOT)
    setHeads((value?.heads ?? []).map((h) => ({ id: h.id, legal_name: h.legal_name, photo_thumb_path: h.photo_thumb_path })))
    setEstablished('')
    setFunctions('')
    setAttributes({})
    setBasis(EMPTY_BASIS)
    setErrors({})
    setFormError('')
  }, [open, value])

  useEffect(() => {
    if (!open || !isEdit || seeded || !detail.data) return
    const ex = detail.data.extra ?? {}
    setEstablished(ex.established_at ?? '')
    setFunctions(ex.functions ?? '')
    setAttributes(ex.attributes && typeof ex.attributes === 'object' ? ex.attributes : {})
    setSeeded(true)
  }, [open, isEdit, seeded, detail.data])

  const branchId = value?.organization_branch_id ?? selectedBranchId
  const parentChoices = useMemo(() => {
    const inBranch = all.filter((d) => !branchId || d.organization_branch_id === branchId)
    const roots = buildTree(inBranch)
    let exclude = new Set<number>()
    if (value) {
      exclude = descendantIds(indexTree(roots).get(value.id))
      exclude.add(value.id)
    }
    // Qisqartirilgan bo'lim ostiga bo'lim qo'yilmaydi (409 department_parent_closed).
    for (const d of inBranch) if (d.closed_at && d.id !== value?.parent_id) exclude.add(d.id)
    return [{ value: ROOT, label: t('orgAdmin.rootLevel') }, ...parentOptions(roots, exclude)]
  }, [all, branchId, value, t])

  const clearError = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: '' } : e))

  const submit = async () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = t('orgAdmin.nameRequired')
    if (!branchId) next.name = next.name || t('orgAdmin.branchRequired')
    if (isEdit && !isBasisComplete(basis)) next.basis = t('orgAdmin.basisRequired')
    setErrors(next)
    setFormError('')
    if (Object.values(next).some(Boolean)) return

    const body: Record<string, unknown> = {
      name: name.trim(),
      name_ru: nameRu.trim() || null,
      code: code.trim() || null,
      organization_branch_id: branchId,
      head_ids: heads.map((h) => h.id),
      parent_id: parentId ? Number(parentId) : null,
      extra: {
        unit_type: unitType,
        functions: functions.trim() || null,
        established_at: established || null,
        attributes,
      },
    }
    if (isEdit) {
      body.basis_number = basis.number.trim()
      body.basis_date = basis.date
    }
    try {
      if (value) await mut.update.mutateAsync({ id: value.id, body })
      else await mut.create.mutateAsync(body)
      toast.ok(isEdit ? t('orgAdmin.deptUpdated') : t('orgAdmin.deptCreated'))
      onClose()
    } catch (e) {
      const msg = errorMessage(e, t('common.actionFailed'))
      const c = errorCode(e)
      if (c === 'department_code_taken') setErrors({ code: msg })
      else if (c === 'department_head_not_found' || c === 'department_head_foreign') setErrors({ heads: msg })
      else if (c === 'department_cycle' || c === 'department_parent_closed' || c === 'department_parent_branch_mismatch')
        setErrors({ parent: msg })
      else if (c === 'basis_required') setErrors({ basis: msg })
      else setFormError(msg)
    }
  }

  const saving = mut.create.isPending || mut.update.isPending
  const waiting = isEdit && detail.isLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title={isEdit ? t('orgAdmin.deptEditTitle') : t('orgAdmin.deptCreateTitle')}
      description={isEdit ? value?.name : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          {/* Tahrirda saqlangan `extra` kelmaguncha saqlash to'xtatiladi —
              aks holda bo'sh funksiyalar mavjudining ustiga yozilardi. */}
          <Button onClick={submit} loading={saving} disabled={waiting}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('orgAdmin.deptName')} required error={errors.name} wide>
          <Input
            value={name}
            invalid={!!errors.name}
            placeholder={t('orgAdmin.deptNamePlaceholder')}
            onChange={(e) => {
              setName(e.target.value)
              clearError('name')
            }}
          />
        </Field>
        <Field label={t('fields.name_ru')} wide>
          <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
        </Field>
        <Field label={t('orgAdmin.deptCode')} hint={t('orgAdmin.deptCodeHint')} error={errors.code}>
          <Input
            value={code}
            invalid={!!errors.code}
            placeholder={t('orgAdmin.deptCodePlaceholder')}
            onChange={(e) => {
              setCode(e.target.value)
              clearError('code')
            }}
          />
        </Field>
        <Field label={t('orgAdmin.unitType')} hint={t('orgAdmin.unitTypeHint')}>
          <Select
            value={unitType}
            onChange={(e) => setUnitType(e.target.value as UnitType)}
            options={UNIT_TYPES.map((u) => ({ value: u, label: t(`orgAdmin.unit_${u}`) }))}
          />
        </Field>
        <Field label={t('orgAdmin.established')}>
          <DateInput value={established} onChange={setEstablished} aria-label={t('orgAdmin.established')} />
        </Field>
        <Field label={t('orgAdmin.parent')} hint={t('orgAdmin.parentHint')} error={errors.parent} wide>
          <Combobox
            value={parentId}
            onChange={(v) => {
              setParentId(v)
              clearError('parent')
            }}
            options={parentChoices}
            placeholder={t('orgAdmin.rootLevel')}
            searchPlaceholder={t('orgAdmin.searchDept')}
            invalid={!!errors.parent}
            hidePlaceholderOption
            clearable={false}
          />
        </Field>
        <Field label={t('orgAdmin.heads')} error={errors.heads} wide>
          <EmployeeMultiPicker value={heads} onChange={setHeads} branchId={branchId} placeholder={t('orgAdmin.headsPlaceholder')} />
        </Field>
        <Field label={t('orgAdmin.functions')} wide>
          <Textarea
            rows={4}
            maxLength={5000}
            value={functions}
            placeholder={t('orgAdmin.functionsPlaceholder')}
            onChange={(e) => setFunctions(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <ExtraAttributesFields target="department" value={attributes} onChange={setAttributes} />
        </div>
        {isEdit && (
          <div className="sm:col-span-2">
            <BasisFields
              value={basis}
              onChange={(b) => {
                setBasis(b)
                clearError('basis')
              }}
              title={t('orgAdmin.basisEditTitle')}
              error={errors.basis}
            />
          </div>
        )}
      </div>
      <FormError className="mt-3 text-xs">{formError}</FormError>
    </Modal>
  )
}
