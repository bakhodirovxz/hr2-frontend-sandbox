import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { ClipboardCheck, ListPlus, Repeat } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useBranchStore } from '@/store/branchStore'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'
import { useInspectionMutations, type Finding, type Inspection } from './useInspections'

/*
 * Auditlar — K5 · 1473–1475 «Возможные расширения»: corrective tasks of a
 * finding (they go to the work plan; when all are done the finding closes
 * itself) and a repeat audit linked to a completed one.
 */

const dmy = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—')
const TASK_TONE: Record<string, BadgeTone> = { planned: 'neutral', in_progress: 'warning', done: 'success', cancelled: 'danger' }

/** The corrective tasks of a finding: progress and the list. */
export function FindingTasks({ finding }: { finding: Finding }) {
  const { t } = useTranslation()
  const tasks = finding.tasks ?? []
  if (!tasks.length) return null
  const total = finding.tasks_total ?? 0
  const done = finding.tasks_done ?? 0
  const pctDone = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2">
      <div className="flex items-center gap-2 text-[12px]">
        <ClipboardCheck size={13} className="text-brand" aria-hidden />
        <span className="font-semibold text-fg-muted">{t('kpiExt.correctiveTasks')}</span>
        <span className="ml-auto tabular-nums text-fg-muted">{t('kpiExt.tasksProgress', { done, total })}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-surface-2"
        role="progressbar"
        aria-valuenow={pctDone}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('kpiExt.correctiveTasks')}
      >
        <div className={cn('h-full rounded-pill', pctDone >= 100 ? 'bg-success' : 'bg-brand')} style={{ width: `${pctDone}%` }} />
      </div>
      <ul className="flex flex-col gap-1">
        {tasks.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
            <Link to="/work-plans" className="min-w-0 flex-1 truncate text-fg hover:text-brand hover:underline" title={x.title}>
              {x.title}
            </Link>
            {x.end_date && <span className="tabular-nums text-fg-subtle">{t('inspections.dueUntil', { date: dmy(x.end_date) })}</span>}
            <Badge tone={TASK_TONE[x.status] ?? 'neutral'}>{t(`workPlan.status_${x.status}` as never, { defaultValue: x.status_label ?? x.status })}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * «Формирование плана корректирующих мероприятий»: a work-plan task for a
 * finding. Empty executor / dates = the finding's responsible and due date.
 */
export function FindingTaskModal({ inspection, finding, onClose }: { inspection: Inspection | null; finding: Finding | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const departments = useDepartmentOptions(branchId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [who, setWho] = useState<'default' | 'employee' | 'department'>('default')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [dept, setDept] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [priority, setPriority] = useState('high')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!finding) return
    setTitle('')
    setDescription('')
    setWho('default')
    setEmployee(null)
    setDept('')
    setStart(dayjs().format('YYYY-MM-DD'))
    setEnd(finding.due_date ? String(finding.due_date).slice(0, 10) : '')
    setPriority('high')
    setError('')
  }, [finding])

  const submit = async () => {
    if (!inspection || !finding) return
    setError('')
    if (who === 'employee' && !employee) return setError(t('kpiExt.taskExecutorRequired'))
    if (who === 'department' && !dept) return setError(t('kpiExt.taskExecutorRequired'))
    if (isInvalidRange(start, end)) return setError(t('list.invalidRange'))
    try {
      await mut.addFindingTask.mutateAsync({
        id: inspection.id,
        findingId: finding.id,
        body: {
          title: title.trim() || null,
          description: description.trim() || null,
          employee_id: who === 'employee' ? employee!.id : null,
          department_id: who === 'department' ? Number(dept) : null,
          start_date: start || null,
          end_date: end || null,
          priority,
        },
      })
      toast.ok(t('kpiExt.taskCreated'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!finding}
      onClose={onClose}
      size="md"
      title={t('kpiExt.correctiveTaskAdd')}
      description={finding?.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<ListPlus size={14} />} loading={mut.addFindingTask.isPending} onClick={submit}>
            {t('kpiExt.correctiveTaskCreate')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('workPlan.colTitle')} hint={t('kpiExt.taskTitleHint')} wide>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        </Field>
        <Field label={t('workPlan.fieldDescription')} hint={finding?.recommendation ? t('kpiExt.taskDescriptionHint') : undefined} wide>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('kpiExt.taskExecutor')} wide>
          <div className="flex flex-col gap-2">
            <Segmented
              size="sm"
              value={who}
              onChange={setWho}
              options={[
                { value: 'default', label: finding?.responsible_name ? t('kpiExt.taskExecutorDefaultName', { name: finding.responsible_name }) : t('kpiExt.taskExecutorDefault') },
                { value: 'employee', label: t('workPlan.colEmployee') },
                { value: 'department', label: t('kpi.colDepartment') },
              ]}
            />
            {who === 'employee' && <EmployeePicker value={employee} onChange={setEmployee} />}
            {who === 'department' && <Combobox value={dept} onChange={setDept} options={departments} placeholder={t('common.choose')} />}
          </div>
        </Field>
        <Field label={t('workPlan.fieldStart')}>
          <DateInput value={start} onChange={setStart} invalid={isInvalidRange(start, end)} />
        </Field>
        <Field label={t('workPlan.fieldEnd')} hint={finding?.due_date ? t('kpiExt.taskDueHint') : undefined}>
          <DateInput value={end} onChange={setEnd} min={start || undefined} invalid={isInvalidRange(start, end)} />
        </Field>
        <Field label={t('workPlan.colPriority')} wide>
          <Segmented
            size="sm"
            value={priority}
            onChange={setPriority}
            options={(['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: t(`workPlan.priority_${p}`) }))}
          />
        </Field>
        <FormError className="text-xs sm:col-span-2">{error}</FormError>
      </div>
    </Modal>
  )
}

/**
 * «Повторный аудит — проверка устранения замечаний»: a linked audit with the
 * same object, auditors and indicators; the open findings are carried over.
 */
export function FollowUpModal({ inspection, onClose, onCreated }: { inspection: Inspection | null; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useInspectionMutations()
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!inspection) return
    setTitle('')
    setPurpose('')
    setStart('')
    setEnd('')
    setError('')
  }, [inspection])

  const submit = async () => {
    if (!inspection) return
    setError('')
    if (isInvalidRange(start, end)) return setError(t('list.invalidRange'))
    try {
      const r = await mut.followUp.mutateAsync({
        id: inspection.id,
        body: { title: title.trim() || null, purpose: purpose.trim() || null, period_start: start || null, period_end: end || null },
      })
      toast.ok(t('kpiExt.followUpCreated'))
      onClose()
      if (r?.id) onCreated(r.id)
    } catch (e) {
      setError(errorCode(e) === 'inspection_not_completed' ? t('kpiExt.followUpNotCompleted') : errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!inspection}
      onClose={onClose}
      size="md"
      title={t('kpiExt.followUpTitle')}
      description={t('kpiExt.followUpHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Repeat size={14} />} loading={mut.followUp.isPending} onClick={submit}>
            {t('kpiExt.followUpCreate')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('inspections.fieldTitle')} wide>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={inspection ? t('kpiExt.followUpDefaultTitle', { title: inspection.title }) : undefined} maxLength={500} />
        </Field>
        <Field label={t('inspections.purpose')} wide>
          <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label={t('inspections.periodStart')}>
          <DateInput value={start} onChange={setStart} invalid={isInvalidRange(start, end)} />
        </Field>
        <Field label={t('inspections.periodEnd')}>
          <DateInput value={end} onChange={setEnd} min={start || undefined} invalid={isInvalidRange(start, end)} />
        </Field>
        <FormError className="text-xs sm:col-span-2">{error}</FormError>
      </div>
    </Modal>
  )
}
