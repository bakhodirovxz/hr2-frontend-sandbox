import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CalendarPlus, Car, Check, FileSignature, ScrollText, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, type ConfirmOptions } from '@/components/data/useConfirm'
import { Textarea } from '@/components/ui/Textarea'
import { errorMessage } from '@/api/errorMessage'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useLetterMutations, type LetterFull } from './useLetters'
import { todayIso } from '@/lib/today'

// ⚠️ `toISOString()` formats the UTC date — yesterday before 05:00 here.
const today = todayIso

/**
 * THE TRIP'S OWN LIFECYCLE, which the registration flow does not cover.
 *
 * A business trip keeps moving after it is registered: it can be called off,
 * pushed out, confirmed as returned by the traveller when no turnstile caught
 * them, and finally signed off on its certificate. Each of those is a separate
 * server step with its own stage window, and none of them had a button — a trip
 * could be created and registered in v2 and then never finished.
 *
 * Every gate below mirrors the backend's own: the stage FIRST, the role second.
 */
export function TripActionsBar({
  letter,
  onDone,
}: {
  letter: LetterFull
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const mut = useLetterMutations()
  const confirm = useConfirm()

  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [extending, setExtending] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [note, setNote] = useState('')
  const [basis, setBasis] = useState(false)
  const [basisNumber, setBasisNumber] = useState('')
  const [basisDate, setBasisDate] = useState(today())
  const [finishing, setFinishing] = useState(false)
  const [finishDate, setFinishDate] = useState('')
  const [fixing, setFixing] = useState(false)
  const [fixDate, setFixDate] = useState('')
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [vehicleNote, setVehicleNote] = useState('')
  const [busy, setBusy] = useState(false)

  const st = (letter.status ?? '').toLowerCase()
  // ⚠️ These four come from the SERVER, not from a local role test. The four
  // endpoints do not share one gate: cancelling demands membership of the
  // trip's OWN branch, the rest also accept the destination branch's HR. A
  // single `isHR(user)` check here offered Cancel on another branch's trip and
  // the server answered 403 — seen live on letter 6834 (branch 25) with an HR
  // who belongs only to branch 1.
  const acts = letter.available_actions ?? {}
  const canCancel = !!acts.can_cancel_trip
  const canExtend = !!acts.can_extend_trip
  /* ⚠️ SERVER FLAGS, not a client re-derivation. Both of these were computed
   * here from roles, and both were wrong in BOTH directions:
   *
   *  - extension: `isLeadership || isMasterAdmin` — each of those includes the
   *    MINISTR, whom the server excludes (`_can_approve_report`: site
   *    master-admin, global deputy, the letter's `management` signer, or a
   *    branch deputy/trip_approver). Measured live: ministr → 403. It also
   *    HID the button from the assigned management signer, who is the
   *    documented primary approver.
   *  - guvohnoma: the gate is `trip_approver` on the letter's branch, and /me
   *    carries no `trip_approver_branch_ids` bucket at all — so this could
   *    never be computed correctly on the client.
   *
   * Rejecting an extension is deliberately WIDER than approving it (trip-scoped
   * HR may reject), hence two flags rather than one. */
  const canApproveExtension = !!acts.can_approve_extension
  const canRejectExtension = !!acts.can_reject_extension
  const canDecideExtension = canApproveExtension || canRejectExtension
  const canApproveGuvohnoma = !!acts.can_approve_guvohnoma
  const canSetBasis = !!acts.can_set_basis_decree
  // KADR CORRECTS an arrival date that is already on record. Only meaningful
  // once there IS one — before that "Keldi" is the action, not a correction.
  const canFixReturnDate = !!acts.can_fix_return_date
  // The traveller asks for (or gives up) a car. The fleet desk picks WHICH car,
  // so this stays available after submission: a refusal can be answered by
  // asking again. Closed once the trip is dead or fully reported.
  const isTraveller =
    !!user?.employee?.id &&
    [letter.creator_employee?.id ?? letter.creator_employee_id, letter.submitter_id].includes(
      user.employee.id,
    )
  // ⚠️ `isSiteMasterAdmin`, not `isMasterAdmin`: the server allows only the
  // traveller/submitter or a real master-admin (`set_trip_vehicle`), and the
  // wider predicate also matches a ministr, who gets 403.
  const canSetVehicle =
    (isTraveller || roles.isSiteMasterAdmin(user)) &&
    !['cancelled', 'rejected', 'report_approved'].includes(st)
  // P1: a trip INTO another branch needs that branch's head to confirm after
  // the chancellery has registered it. Without this the letter sat in
  // `registered_pending_rahbar` with nobody able to move it.
  /* ⚠️ Server flag. `canApproveTripForBranch` guessed director/deputy; the
   * server (`_is_trip_approver`) wants the letter's `management` signer or the
   * branch's `trip_approver` leaders — a bucket /me never exposes. Both false
   * promise (directors → 403) and false hide (the actual signer). */
  const canApproveRegistration = !!acts.can_approve_trip_registration
  // ⚠️ The SERVER decides this one. The rule is not just "traveller + right
  // stage": self-finishing only opens once a turnstile on the traveller's OWN
  // branch has seen them (Face ID), and the finish is recorded with that
  // turnstile date. The local guess below used to show the button whenever the
  // stage looked right, so a traveller with no turnstile pass got a 400 from a
  // button that promised to work.
  const canSelfConfirm = !!acts.can_self_finish_trip
  // Every day a turnstile saw them; the traveller picks which one is the
  // return. Falls back to the server's own default when there is only one.
  const finishOptions = acts.self_finish_date_options ?? []
  const finishDefault = acts.self_finish_date ?? finishOptions[0] ?? ''

  const anything =
    canCancel || canExtend || canDecideExtension || canApproveGuvohnoma || canSetBasis ||
    canSelfConfirm || canFixReturnDate || canSetVehicle || canApproveRegistration
  if (!anything) return null

  const run = async (p: Promise<unknown>, msg: string, close?: () => void) => {
    setBusy(true)
    try {
      await p
      mut.invalidate()
      close?.()
      onDone(msg)
    } catch (e) {
      onDone(errorMessage(e, t('letters.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  // One-click trip decisions are asked first; the number names the trip.
  const confirmThen = async (o: ConfirmOptions, go: () => Promise<unknown>) => {
    if (await confirm({ subject: letter.letter_number ? `№${letter.letter_number}` : undefined, ...o })) await go()
  }

  return (
    <>
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-fg">{t('letters.secTrip')}</h3>
          <div className="ml-auto flex flex-wrap gap-2">
            {canSelfConfirm && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Check size={14} />}
                onClick={() => { setFinishDate(finishDefault); setFinishing(true) }}
              >
                {t('letters.tripSelfFinish')}
              </Button>
            )}
            {canApproveRegistration && (
              <Button
                size="sm"
                leftIcon={<Check size={14} />}
                onClick={() =>
                  void confirmThen({ kind: 'approve', confirmLabel: t('letters.approveTripRegistration') }, () => run(
                    mut.approveTripRegistration.mutateAsync(letter.id),
                    t('letters.tripRegistrationApproved'),
                  ))
                }
              >
                {t('letters.approveTripRegistration')}
              </Button>
            )}
            {canFixReturnDate && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<CalendarPlus size={14} />}
                onClick={() => { setFixDate(letter.arrival_date?.slice(0, 10) ?? today()); setFixing(true) }}
              >
                {t('letters.fixReturnDate')}
              </Button>
            )}
            {canSetVehicle && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Car size={14} />}
                onClick={() => { setVehicleNote(letter.vehicle_request?.request_note ?? ''); setVehicleOpen(true) }}
              >
                {letter.vehicle_request ? t('letters.vehicleEdit') : t('letters.vehicleAsk')}
              </Button>
            )}
            {canApproveGuvohnoma && (
              <Button
                size="sm"
                leftIcon={<ScrollText size={14} />}
                onClick={() =>
                  void confirmThen({ kind: 'approve', confirmLabel: t('letters.approveGuvohnoma') }, () => run(
                    mut.approveGuvohnoma.mutateAsync(letter.id),
                    t('letters.guvohnomaApproved'),
                  ))
                }
              >
                {t('letters.approveGuvohnoma')}
              </Button>
            )}
            {canDecideExtension && (
              <>
                {/* Approve and reject are gated SEPARATELY: trip-scoped HR may
                  * reject an extension but not approve it. Showing both under
                  * one flag offered HR an Approve that 403s. */}
                {canApproveExtension && (
                <Button
                  size="sm"
                  leftIcon={<Check size={14} />}
                  onClick={() =>
                    void confirmThen({ kind: 'approve', confirmLabel: t('letters.approveExtension') }, () => run(
                      mut.approveExtension.mutateAsync(letter.id),
                      t('letters.extensionApproved'),
                    ))
                  }
                >
                  {t('letters.approveExtension')}
                </Button>
                )}
                {canRejectExtension && (
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={<X size={14} />}
                  onClick={() =>
                    void confirmThen({ kind: 'reject', confirmLabel: t('letters.rejectExtension') }, () => run(
                      mut.rejectExtension.mutateAsync(letter.id),
                      t('letters.extensionRejected'),
                    ))
                  }
                >
                  {t('letters.rejectExtension')}
                </Button>
                )}
              </>
            )}
            {canExtend && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<CalendarPlus size={14} />}
                onClick={() => {
                  setNewDate(letter.arrival_date ?? today())
                  setNote('')
                  setExtending(true)
                }}
              >
                {t('letters.extendTrip')}
              </Button>
            )}
            {canSetBasis && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<FileSignature size={14} />}
                onClick={() => {
                  setBasisNumber(letter.basis_decree_number ?? '')
                  setBasisDate(letter.basis_decree_date ?? today())
                  setBasis(true)
                }}
              >
                {t('letters.basisDecree')}
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="danger-ghost"
                leftIcon={<Ban size={14} />}
                onClick={() => {
                  setReason('')
                  setCancelling(true)
                }}
              >
                {t('letters.cancelTrip')}
              </Button>
            )}
          </div>
        </div>
        {letter.basis_decree_number && (
          <p className="mt-2 text-[12px] text-fg-muted">
            {t('letters.basisDecree')}: {letter.basis_decree_number}
            {letter.basis_decree_date ? ` · ${letter.basis_decree_date}` : ''}
          </p>
        )}
      </Card>

      {/* Cancel — irreversible, so it asks first and records why. */}
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t('letters.cancelTrip')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                void run(
                  mut.cancelTrip.mutateAsync({ id: letter.id, reason: reason.trim() }),
                  t('letters.tripCancelled'),
                  () => setCancelling(false),
                )
              }
            >
              {t('letters.cancelTrip')}
            </Button>
          </>
        }
      >
        <Field label={t('letters.cancelReason')} hint={t('letters.cancelReasonHint')}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={extending}
        onClose={() => setExtending(false)}
        title={t('letters.extendTrip')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtending(false)}>{t('common.cancel')}</Button>
            <Button
              loading={busy}
              disabled={!newDate}
              onClick={() =>
                void run(
                  mut.extendTrip.mutateAsync({ id: letter.id, arrival_date: newDate, note: note.trim() }),
                  t('letters.extensionSent'),
                  () => setExtending(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('letters.newArrival')} required>
            <DateInput value={newDate} onChange={setNewDate} />
          </Field>
          <Field label={t('letters.extendNote')}>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={basis}
        onClose={() => setBasis(false)}
        title={t('letters.basisDecree')}
        size="sm"
        description={t('letters.basisDecreeHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBasis(false)}>{t('common.cancel')}</Button>
            <Button
              loading={busy}
              disabled={!basisNumber.trim() || !basisDate}
              onClick={() =>
                void run(
                  mut.setBasisDecree.mutateAsync({
                    id: letter.id,
                    number: basisNumber.trim(),
                    date: basisDate,
                  }),
                  t('common.saved'),
                  () => setBasis(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('letters.basisNumber')} required>
            <Input value={basisNumber} onChange={(e) => setBasisNumber(e.target.value)} />
          </Field>
          <Field label={t('letters.basisDate')} required>
            <DateInput value={basisDate} onChange={setBasisDate} />
          </Field>
        </div>
      </Modal>

      {/* KADR corrects the recorded arrival date. */}
      <Modal
        open={fixing}
        onClose={() => setFixing(false)}
        title={t('letters.fixReturnDate')}
        size="sm"
        description={t('letters.fixReturnDateHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFixing(false)}>{t('common.cancel')}</Button>
            <Button
              loading={busy}
              disabled={!fixDate}
              onClick={() =>
                void run(
                  mut.setReturnDate.mutateAsync({ id: letter.id, return_date: fixDate }),
                  t('common.saved'),
                  () => setFixing(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('letters.tripReturnDate')} required>
          <DateInput value={fixDate} onChange={setFixDate} />
        </Field>
      </Modal>

      {/* Asking for a car. The note reaches the fleet desk, which decides which
          vehicle is assigned — the traveller never picks one. */}
      <Modal
        open={vehicleOpen}
        onClose={() => setVehicleOpen(false)}
        title={t('letters.vehicleAsk')}
        size="sm"
        description={t('letters.vehicleHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVehicleOpen(false)}>{t('common.cancel')}</Button>
            {letter.vehicle_request && (
              <Button
                variant="danger"
                loading={busy}
                onClick={() =>
                  void confirmThen({ kind: 'action', confirmLabel: t('letters.vehicleDrop') }, () => run(
                    mut.setVehicle.mutateAsync({ id: letter.id, needed: false }),
                    t('letters.vehicleDropped'),
                    () => setVehicleOpen(false),
                  ))
                }
              >
                {t('letters.vehicleDrop')}
              </Button>
            )}
            <Button
              loading={busy}
              onClick={() =>
                void run(
                  mut.setVehicle.mutateAsync({
                    id: letter.id,
                    needed: true,
                    note: vehicleNote.trim() || undefined,
                  }),
                  t('letters.vehicleAsked'),
                  () => setVehicleOpen(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('letters.vehicleNote')}>
          <Textarea rows={3} value={vehicleNote} onChange={(e) => setVehicleNote(e.target.value)} />
        </Field>
      </Modal>

      {/* Finishing the trip yourself. The date is not free text: it must be a
          day a turnstile actually saw the traveller, so the choice is limited
          to the days the server offers. */}
      <Modal
        open={finishing}
        onClose={() => setFinishing(false)}
        title={t('letters.tripSelfFinish')}
        size="sm"
        description={t('letters.tripSelfFinishHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinishing(false)}>{t('common.cancel')}</Button>
            <Button
              loading={busy}
              onClick={() =>
                void run(
                  mut.selfConfirmReturn.mutateAsync({
                    id: letter.id,
                    return_date: finishDate || undefined,
                  }),
                  t('letters.tripFinished'),
                  () => setFinishing(false),
                )
              }
            >
              {t('letters.tripSelfFinish')}
            </Button>
          </>
        }
      >
        {finishOptions.length > 1 ? (
          <Field label={t('letters.tripReturnDate')} required>
            <div className="flex flex-wrap gap-2">
              {finishOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFinishDate(d)}
                  aria-pressed={finishDate === d}
                  className={
                    finishDate === d
                      ? 'rounded-pill bg-brand px-3 py-1.5 text-[13px] font-semibold text-fg-on-brand'
                      : 'rounded-pill bg-fg/[0.06] px-3 py-1.5 text-[13px] text-fg-muted hover:bg-fg/[0.12]'
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <p className="text-sm text-fg-muted">
            {finishDefault || t('letters.tripSelfFinishHint')}
          </p>
        )}
      </Modal>
    </>
  )
}
