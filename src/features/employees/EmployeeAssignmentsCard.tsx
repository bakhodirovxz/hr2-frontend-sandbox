import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Briefcase, Pencil, X } from 'lucide-react'
import { Button, Card, Field, Input, Modal, useToast } from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import { useConfirm } from '@/components/data/useConfirm'
import { useAssignmentMutations, useEmployeeAssignments, type Assignment } from './useEmployeeAssignments'

/**
 * XODIMNING ISH O'RINLARI — asosiy ish joyi + o'rindoshlik lavozimlari.
 *
 * Bitta shaxs bir nechta lavozimni egallashi mumkin, `employees` da esa lavozim
 * bitta (u asosiy ish o'rniniki). Kartochkani ochgan kadr shu ro'yxatsiz odam
 * boshqa filialda ham ishlayotganini KO'RMASDI — ekranda esa faqat bitta
 * bo'lim/lavozim turardi.
 *
 * Yopish FAQAT o'rindoshlik uchun: asosiy ish o'rni xodimni arxivlash orqali
 * yopiladi (server ham shuni talab qiladi).
 */
export function EmployeeAssignmentsCard({
  employeeId,
  canEdit,
}: {
  employeeId: number
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { items, isLoading } = useEmployeeAssignments(employeeId)
  const { close } = useAssignmentMutations()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Assignment | null>(null)

  // Asosiy ish o'rni yolg'iz bo'lsa qo'shimcha ma'lumot bermaydi — kartochkaning
  // "Umumiy" bo'limi allaqachon aynan o'shani ko'rsatib turibdi.
  const concurrent = items.filter((a) => a.employment_type !== 'main')
  if (isLoading || concurrent.length === 0) return null

  const label = (type: string) =>
    type === 'internal_concurrent'
      ? t('assignments.typeInternal')
      : type === 'external_concurrent'
        ? t('assignments.typeExternal')
        : t('assignments.typeMain')

  const onClose = async (id: number) => {
    if (!(await confirm({ kind: 'action', description: t('assignments.closeConfirm') }))) return
    setBusyId(id)
    try {
      await close.mutateAsync({ id, employeeId })
      toast.ok(t('assignments.closed'))
    } catch (e) {
      toast.error(errorMessage(e, t('assignments.closeFailed')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Briefcase size={16} className="text-fg-muted" />
        <h3 className="text-[13px] font-semibold text-fg">{t('assignments.sectionTitle')}</h3>
      </div>
      <ul className="divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="rounded-pill bg-fg/[0.06] px-2.5 py-1 text-[11px] text-fg-muted">
              {label(a.employment_type)}
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-fg">
              {a.organization_branch?.name || '—'}
              <span className="text-fg-muted">
                {a.department?.name ? ` · ${a.department.name}` : ''}
                {a.job_position?.name ? ` · ${a.job_position.name}` : ''}
                {a.stavka != null ? ` · ${a.stavka}` : ''}
              </span>
            </span>
            <span className="text-[12px] text-fg-subtle">
              {a.start_date ? `${dayjs(a.start_date).format('DD.MM.YYYY')} ${t('assignments.since')}` : ''}
              {a.end_date ? ` · ${t('assignments.closedOn')} ${dayjs(a.end_date).format('DD.MM.YYYY')}` : ''}
            </span>
            {canEdit && a.employment_type !== 'main' && !a.end_date && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Pencil size={14} />}
                  onClick={() => setEditing(a)}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<X size={14} />}
                  loading={busyId === a.id}
                  onClick={() => onClose(a.id)}
                >
                  {t('assignments.closeAction')}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">{t('assignments.sectionHint')}</p>

      <EditAssignmentModal
        assignment={editing}
        employeeId={employeeId}
        onClose={() => setEditing(null)}
      />
    </Card>
  )
}

/**
 * Correct a concurrent post in place.
 *
 * Only the fields `EmployeeAssignmentUpdate` accepts and a person plausibly
 * gets wrong are here: the department and position are deliberately NOT
 * editable, because moving a post to another position is a different act with
 * its own staffing consequences (the vacancy count on both positions) — that
 * is a close plus a new post, not an edit.
 */
function EditAssignmentModal({
  assignment,
  employeeId,
  onClose,
}: {
  assignment: Assignment | null
  employeeId: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { update } = useAssignmentMutations()
  const [stavka, setStavka] = useState('')
  const [hoursNorm, setHoursNorm] = useState('')
  const [orderReference, setOrderReference] = useState('')
  const [tabelNumber, setTabelNumber] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!assignment) return
    setError('')
    setStavka(assignment.stavka != null ? String(assignment.stavka) : '')
    setHoursNorm(assignment.hours_norm != null ? String(assignment.hours_norm) : '')
    setOrderReference(assignment.order_reference ?? '')
    setTabelNumber(assignment.tabel_number ?? '')
    setNote(assignment.note ?? '')
  }, [assignment])

  if (!assignment) return null

  const submit = async () => {
    const st = stavka.trim() ? Number(stavka) : null
    if (st != null && (Number.isNaN(st) || st <= 0 || st > 2)) {
      return setError(t('assignments.stavkaRange'))
    }
    const hn = hoursNorm.trim() ? Number(hoursNorm) : null
    if (hn != null && (Number.isNaN(hn) || hn <= 0 || hn > 744)) {
      return setError(t('assignments.hoursRange'))
    }
    try {
      await update.mutateAsync({
        id: assignment.id,
        employeeId,
        body: {
          stavka: st,
          hours_norm: hn,
          order_reference: orderReference.trim() || null,
          tabel_number: tabelNumber.trim() || null,
          note: note.trim() || null,
        },
      })
      toast.ok(t('assignments.updated'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('assignments.editTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('assignments.stavka')}>
          <Input value={stavka} onChange={(e) => setStavka(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t('assignments.hoursNorm')}>
          <Input value={hoursNorm} onChange={(e) => setHoursNorm(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t('assignments.orderReference')}>
          <Input value={orderReference} onChange={(e) => setOrderReference(e.target.value)} />
        </Field>
        <Field label={t('assignments.tabelNumber')}>
          <Input value={tabelNumber} onChange={(e) => setTabelNumber(e.target.value)} />
        </Field>
        <Field label={t('assignments.note')} className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <FormError className="mt-3 text-[13px] text-[13px]">{error}</FormError>
    </Modal>
  )
}
