import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Check, FileText, Pencil, RotateCcw, Send, Stamp, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatAppDate } from '@/lib/format'
import { useLetterMutations, type LetterFull } from './useLetters'
import { DateInput } from '@/components/ui/DateInput'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { Select } from '@/components/ui/Select'
import { useLeadershipOptions } from '@/features/employees/useLeadershipOptions'
import { todayIso } from '@/lib/today'

// ⚠️ `toISOString()` formats the UTC date — yesterday before 05:00 here.
const today = todayIso

/**
 * Business-trip report: the traveller submits it, the approver confirms, then
 * the chancellery registers it. The report carries its OWN two numbers —
 * `report_number` (department index, printed in the document) and
 * `report_registered_number` (the branch stamp).
 */
export function LetterReportPanel({
  letter,
  canRegister,
  onDone,
}: {
  letter: LetterFull
  canRegister: boolean
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mut = useLetterMutations()
  const confirm = useConfirm()

  const [submitting, setSubmitting] = useState(false)
  const [stamping, setStamping] = useState(false)
  const [returning, setReturning] = useState(false)
  const [form, setForm] = useState({
    report_number: '',
    report_date: today(),
    report_summary: '',
    report_task: '',
    report_content: '',
    management_signer_id: '',
  })
  const [stampNumber, setStampNumber] = useState('')
  const [stampDate, setStampDate] = useState(today())
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingStamp, setEditingStamp] = useState(false)
  const [editNumber, setEditNumber] = useState('')
  const [editDate, setEditDate] = useState(today())
  const [resetting, setResetting] = useState(false)
  const [busy, setBusy] = useState(false)

  // `has_report` is not a field the server emits (2026-09-11 audit); a report
  // that exists only as an uploaded FILE has neither number nor summary, so
  // the file path is the third real signal.
  const hasReport = !!(letter.report_number || letter.report_summary || letter.report_attachment_path)

  /**
   * ⚠️ "HISOBOT BOR" ≠ "HISOBOTGA TEGIB BO'LMAYDI".
   *
   * `submit-report` is ONE endpoint for filing and for correcting: a report the
   * chancellery returned (`report_returned`), one still awaiting the approver,
   * or one being reviewed can all be edited and re-sent by its author. This
   * screen used to offer the button only when `!hasReport`, so a returned
   * report was a dead end — nothing on the page could touch it again.
   *
   * The gate is the server's own (`available_actions.can_submit_report`),
   * copied from `submit_report`, not re-derived here.
   */
  const canSubmitReport = letter.available_actions?.can_submit_report ?? !hasReport
  const canApproveReport = letter.available_actions?.can_approve_report ?? false
  /* Stamping and returning are the SAME gate on the server (report_submitted +
     registrar); resetting belongs to the author or HR, not the chancellery.
     All three used to be drawn on `hasReport && canRegister`, which is wider
     than any of them and produced buttons that answered 400. */
  const canRegisterReport = letter.available_actions?.can_register_report ?? false
  const canResetReport = letter.available_actions?.can_reset_report ?? false

  /** The leader who approves the report — swappable at filing time, because
   *  the one picked when the trip started may now be away. */
  const currentManagerId =
    (letter.assigned_signers ?? []).find((sg) => sg.signer_type === 'management')?.employee_id ?? null
  const { options: managerOptions } = useLeadershipOptions(
    letter.organization_branch_id ?? null,
    submitting,
  )

  /** Open the form on what is already stored, so an edit is an edit. */
  const openSubmit = () => {
    setError(null)
    setForm({
      report_number: letter.report_number ?? '',
      report_date: letter.report_date?.slice(0, 10) || today(),
      report_summary: letter.report_summary ?? '',
      report_task: letter.report_task ?? '',
      report_content: letter.report_content ?? '',
      management_signer_id: currentManagerId ? String(currentManagerId) : '',
    })
    setSubmitting(true)
  }

  const run = async (p: Promise<unknown>, msg: string, close: () => void) => {
    setBusy(true)
    try {
      await p
      close()
      onDone(msg)
    } catch {
      onDone(t('letters.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-fg">{t('letters.secReport')}</h3>
          <div className="ml-auto flex flex-wrap gap-2">
            {canSubmitReport && (
              <Button
                size="sm"
                leftIcon={hasReport ? <Pencil size={14} /> : <Send size={14} />}
                onClick={openSubmit}
              >
                {hasReport ? t('letters.editReport') : t('letters.submitReport')}
              </Button>
            )}
            {/* The approver's button, on the APPROVER's gate. It used to appear
                for anyone looking at a report at any stage and answered 403. */}
            {canApproveReport && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Check size={14} />}
                onClick={async () => {
                  if (!(await confirm({ kind: 'approve', confirmLabel: t('letters.approveReport') }))) return
                  await run(mut.approveReport.mutateAsync(letter.id), t('letters.actionDone'), () => {})
                }}
              >
                {t('letters.approveReport')}
              </Button>
            )}
            {canRegisterReport && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Stamp size={14} />}
                onClick={() => {
                  setStampNumber('')
                  setStampDate(today())
                  setStamping(true)
                }}
              >
                {t('letters.stampReport')}
              </Button>
            )}
            {/* Editing a report stamp that is already on the document — the
                number or the date was typed wrong and the file must agree with
                the register. Distinct from stamping it in the first place. */}
            {canRegister && !!letter.report_registered_number && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Pencil size={14} />}
                onClick={() => {
                  setEditNumber(letter.report_registered_number ?? '')
                  setEditDate(letter.report_date?.slice(0, 10) ?? today())
                  setEditingStamp(true)
                }}
              >
                {t('letters.reportStampEdit')}
              </Button>
            )}
            {/* Throwing the report away so a new one can be filed. */}
            {canResetReport && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                leftIcon={<RotateCcw size={14} />}
                onClick={() => setResetting(true)}
              >
                {t('letters.resetReport')}
              </Button>
            )}
            {canRegisterReport && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Undo2 size={14} />}
                onClick={() => {
                  setReason('')
                  setError(null)
                  setReturning(true)
                }}
              >
                {t('letters.returnReport')}
              </Button>
            )}
          </div>
        </div>

        {!hasReport ? (
          <p className="py-6 text-center text-sm text-fg-subtle">{t('letters.reportEmpty')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Meta label={t('letters.reportNumber')} value={letter.report_number || '—'} />
              <Meta
                label={t('letters.reportDate')}
                value={letter.report_date ? formatAppDate(letter.report_date) : '—'}
              />
              <Meta
                label={t('letters.reportRegisteredNumber')}
                value={letter.report_registered_number || '—'}
              />
              <Meta label={t('letters.reportSummary')} value={letter.report_summary || '—'} wide />
            </dl>
            <div className="mt-4">
              <Button
                size="sm"
                leftIcon={<FileText size={14} />}
                onClick={() => navigate(`/hujjatlar/edit/letter-report-${letter.id}`)}
              >
                {t('letters.openFile')}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Submit report */}
      <Modal
        open={submitting}
        onClose={() => setSubmitting(false)}
        title={t('letters.submitReport')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSubmitting(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                // Without a rahbar the report lands in report_management_review
                // where no deputy can see it (only the assigned management signer
                // is shown the trip) — the server refuses it too.
                if (!form.management_signer_id && !currentManagerId) return setError(t('letters.reportManagerRequired'))
                return run(
                  mut.submitReport.mutateAsync({
                    id: letter.id,
                    body: {
                      report_number: form.report_number || null,
                      report_date: form.report_date || null,
                      report_summary: form.report_summary || null,
                      report_task: form.report_task || null,
                      report_content: form.report_content || null,
                      // Omitted = keep whoever is already assigned; the server
                      // only swaps the `management` signer when a value comes.
                      management_signer_id: form.management_signer_id
                        ? Number(form.management_signer_id)
                        : null,
                    },
                  }),
                  t('letters.actionDone'),
                  () => setSubmitting(false),
                )
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.reportManager')} *</span>
            <Select
              value={form.management_signer_id}
              onChange={(e) => setForm({ ...form, management_signer_id: e.target.value })}
              options={managerOptions}
              placeholder={t('letters.reportManagerPick')}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('letters.reportNumber')}</span>
              <Input
                value={form.report_number}
                onChange={(e) => setForm({ ...form, report_number: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('letters.reportDate')}</span>
              <DateInput value={form.report_date} onChange={(v) => setForm({ ...form, report_date: v })} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.reportSummary')}</span>
            <Input
              value={form.report_summary}
              onChange={(e) => setForm({ ...form, report_summary: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.reportTask')}</span>
            <Textarea
              rows={2}
              value={form.report_task}
              onChange={(e) => setForm({ ...form, report_task: e.target.value })}
      
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.reportContent')}</span>
            <Textarea
              rows={3}
              value={form.report_content}
              onChange={(e) => setForm({ ...form, report_content: e.target.value })}
      
            />
          </label>
          <FormError className="text-xs">{error}</FormError>
        </div>
      </Modal>

      {/* Correct an existing report stamp */}
      <Modal
        open={editingStamp}
        onClose={() => setEditingStamp(false)}
        title={t('letters.reportStampEdit')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingStamp(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.updateReportStamp.mutateAsync({
                    id: letter.id,
                    body: {
                      report_registered_number: editNumber.trim() || null,
                      report_date: editDate || null,
                    },
                  }),
                  t('common.saved'),
                  () => setEditingStamp(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('letters.reportNumber')}>
            <Input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} />
          </Field>
          <Field label={t('letters.reportDate')}>
            <DateInput value={editDate} onChange={setEditDate} />
          </Field>
        </div>
      </Modal>

      {/* Discard the report */}
      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() =>
          run(mut.resetReport.mutateAsync(letter.id), t('letters.reportReset'), () => setResetting(false))
        }
        danger
        title={t('letters.resetReport')}
        description={t('letters.resetReportConfirm')}
        confirmLabel={t('letters.resetReport')}
      />

      {/* Register report */}
      <Modal
        open={stamping}
        onClose={() => setStamping(false)}
        title={t('letters.stampReport')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStamping(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.stampReport.mutateAsync({
                    id: letter.id,
                    letter_number: stampNumber,
                    letter_date: stampDate,
                  }),
                  t('letters.stamped'),
                  () => setStamping(false),
                )
              }
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.stampNumber')}</span>
            <Input value={stampNumber} onChange={(e) => setStampNumber(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.stampDate')}</span>
            <DateInput value={stampDate} onChange={setStampDate} />
          </label>
        </div>
      </Modal>

      {/* Return report */}
      <Modal
        open={returning}
        onClose={() => setReturning(false)}
        title={t('letters.returnReport')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReturning(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!reason.trim()) return setError(t('letters.returnReasonRequired'))
                void run(
                  mut.returnReport.mutateAsync({ id: letter.id, reason: reason.trim() }),
                  t('letters.returned'),
                  () => setReturning(false),
                )
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-fg-muted">{t('letters.returnReason')}</span>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
      
          />
        </label>
        <FormError className="mt-2 text-xs">{error}</FormError>
      </Modal>
    </>
  )
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  )
}
