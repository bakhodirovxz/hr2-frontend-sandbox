import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Pencil, RefreshCw, Stamp, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/data/useConfirm'
import { formatAppDate } from '@/lib/format'
import {
  normalizeLetterType,
  useLetterMutations,
  useRegisteredNumberAvailability,
  type LetterFull,
} from './useLetters'
import { NumberTakenHint } from '@/components/ui/NumberTakenHint'
import { useDebounce } from '@/hooks/useDebounce'
import { DateInput } from '@/components/ui/DateInput'
import { Textarea } from '@/components/ui/Textarea'
import { todayIso } from '@/lib/today'

// ⚠️ `toISOString()` formats the UTC date — yesterday before 05:00 here.
const today = todayIso

/**
 * Chancellery strip: register (draw number + date onto the branch stamp), fix a
 * wrong stamp, or return the document to its author.
 *
 * There is deliberately NO "Devonxonaga yuborish" here — that is the AUTHOR's
 * step and it lives in the detail action bar. Offering it to the chancellery
 * asked them to send a document to themselves.
 *
 * The manual register button is likewise hidden once a number already exists:
 * for a bildirgi/ariza the number and stamp are applied automatically when the
 * agreement closes, and the chancellery's only remaining act is "Ro'yxatga
 * olishni tasdiqlash" (confirm_registration) in the action bar. The backend
 * agrees — `stamp_document` rejects those with `use_send_to_registry`.
 */
const inReviewStatus = (l: { status?: string | null }) => (l.status ?? '').toLowerCase() === 'review'

export function LetterStampBar({
  letter,
  canRegister,
  canEditGuvohnoma = false,
  onDone,
}: {
  letter: LetterFull
  canRegister: boolean
  /** The certificate number has its own gate (`update_guvohnoma_stamp`):
   *  the trip's branch HR may fix it without being the registrar. */
  canEditGuvohnoma?: boolean
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const mut = useLetterMutations()
  const confirm = useConfirm()

  const [stamping, setStamping] = useState(false)
  const [editing, setEditing] = useState(false)
  const [returning, setReturning] = useState(false)
  const [number, setNumber] = useState('')
  /* Both dialogs below edit this one field. The letter's own id is excluded so
     re-saving a stamp with its existing number is not reported as a clash.
     Asked only while one of them is open, and only by the registrar: the
     server answers the check to the registrar alone, so a branch HR who may
     fix just the certificate number got a 403 on every letter they opened
     (role sweep 2026-09-25). */
  const numberCheck = useRegisteredNumberAvailability(
    letter.organization_branch_id ?? null,
    useDebounce(number, 400).trim(),
    letter.id,
    canRegister && (stamping || editing),
  )
  const [date, setDate] = useState(today())
  const [guvohnoma, setGuvohnoma] = useState('')
  /* Only a business trip has a certificate; the field is meaningless on a
     bildirgi/ariza and the server refuses it there. */
  const isTrip = normalizeLetterType(letter.letter_type) === 'business_trip'
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const openEdit = () => {
    setNumber(letter.registered_number ?? '')
    setDate(letter.registered_date?.slice(0, 10) ?? today())
    setGuvohnoma(letter.guvohnoma_number ?? '')
    setEditing(true)
  }

  if (!letter.is_stamped && !(canRegister && inReviewStatus(letter))) return null

  // A number is already on the document (auto-assigned when the agreement
  // closed, or stamped earlier) → nothing left to register by hand.
  const hasNumber = letter.is_stamped || !!letter.registered_number
  // `pending_registration` means exactly "numbered, awaiting the chancellery's
  // confirmation" — the confirm button in the action bar is the right action.
  const awaitingConfirm = (letter.status ?? '').toLowerCase() === 'pending_registration'
  // v1 (`showAgreementRegister/Return`): the chancellery registers or returns
  // a bildirgi/ariza only while it is IN REVIEW. The bar used to offer
  // «Ro'yxatga olish» / «Qaytarish» on a draft nobody had sent yet
  // (audit 2026-09-21).
  const inReview = (letter.status ?? '').toLowerCase() === 'review'
  const canStampManually = canRegister && !hasNumber && !awaitingConfirm && inReview
  // «Qaytarish» also on `pending_registration`: `send_to_registry` never
  // produces `review` any more, so gating on review alone meant the button
  // could never appear (09-25 sweep). The server accepts a return there.
  const canReturn = canRegister && (inReview || awaitingConfirm)

  return (
    <>
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <Stamp size={18} className="shrink-0 text-brand" />
        {letter.is_stamped ? (
          <span className="text-sm text-fg">
            <span className="font-semibold text-success">{t('letters.stamped')}</span>
            {letter.registered_number && (
              <span className="ml-2 tabular-nums text-fg-muted">
                {t('letters.stampedInfo', {
                  number: letter.registered_number,
                  date: letter.registered_date ? formatAppDate(letter.registered_date) : '—',
                })}
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-fg-muted">{t('letters.secRegistry')}</span>
        )}

        {(canRegister || canEditGuvohnoma) && (
          <div className="ml-auto flex flex-wrap gap-2">
            {canStampManually && (
              <Button
                size="sm"
                leftIcon={<Stamp size={14} />}
                onClick={() => {
                  setNumber('')
                  setDate(today())
                  setStamping(true)
                }}
              >
                {t('letters.stampAction')}
              </Button>
            )}
            {letter.is_stamped && (canRegister || canEditGuvohnoma) && (
              <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={openEdit}>
                {t('letters.stampEdit')}
              </Button>
            )}
            {/* Rewrites the letterhead (number + date) from the database
                WITHOUT regenerating the file, so the signature, QR and stamp
                survive. For documents whose number was filled in later and
                whose header still shows the old blank. */}
            {letter.is_stamped && canRegister && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<RefreshCw size={14} />}
                onClick={async () => {
                  if (!(await confirm({ kind: 'action', confirmLabel: t('letters.refreshHeader') }))) return
                  await run(mut.refreshHeader.mutateAsync(letter.id), t('letters.headerRefreshed'), () => {})
                }}
              >
                {t('letters.refreshHeader')}
              </Button>
            )}
            {canReturn && (
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
                {t('letters.returnAction')}
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Register */}
      <Modal
        open={stamping}
        onClose={() => setStamping(false)}
        title={t('letters.stampAction')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStamping(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.stamp.mutateAsync({ id: letter.id, letter_number: number, letter_date: date }),
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
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            <NumberTakenHint
              available={numberCheck.available}
              suggested={numberCheck.suggested}
              onUse={setNumber}
            />
            {/* The sequence is the branch's, not the operator's — typing a number
                by hand is the exception, not the expected path. */}
            <span className="text-xs text-fg-subtle">{t('letters.stampNumberAuto')}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.stampDate')}</span>
            <DateInput value={date} onChange={setDate} />
          </label>
        </div>
      </Modal>

      {/* Fix an existing stamp */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('letters.stampEdit')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  (async () => {
                    // The register's number and date belong to the registrar;
                    // an HR opening this dialog only holds the certificate field.
                    if (canRegister) {
                      await mut.updateStamp.mutateAsync({
                        id: letter.id,
                        body: {
                          registered_number: number || null,
                          registered_date: date || null,
                        },
                      })
                    }
                    // The certificate number lives behind its OWN endpoint —
                    // see `updateGuvohnomaStamp`. Only sent when it actually
                    // changed, because the server rejects an empty value.
                    const next = guvohnoma.trim()
                    if (isTrip && next && next !== (letter.guvohnoma_number ?? '')) {
                      await mut.updateGuvohnomaStamp.mutateAsync({
                        id: letter.id,
                        guvohnoma_number: next,
                      })
                    }
                  })(),
                  t('common.save'),
                  () => setEditing(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.stampNumber')}</span>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} disabled={!canRegister} />
            {canRegister && (
              <NumberTakenHint
                available={numberCheck.available}
                suggested={numberCheck.suggested}
                onUse={setNumber}
              />
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.stampDate')}</span>
            <DateInput value={date} onChange={setDate} disabled={!canRegister} />
          </label>
          {/* Hidden on a bildirgi/ariza: they have no certificate, and the
              field used to sit there collecting a number nothing could store. */}
          {isTrip && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('letters.guvohnomaNumber')}</span>
              <Input value={guvohnoma} onChange={(e) => setGuvohnoma(e.target.value)} />
            </label>
          )}
        </div>
      </Modal>

      {/* Return to author */}
      <Modal
        open={returning}
        onClose={() => setReturning(false)}
        title={t('letters.returnAction')}
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
                  mut.returnLetter.mutateAsync({ id: letter.id, reason: reason.trim() }),
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
