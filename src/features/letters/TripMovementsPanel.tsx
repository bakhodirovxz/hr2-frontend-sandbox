import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, LogIn, LogOut, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Combobox } from '@/components/ui/Combobox'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useBranchStore } from '@/store/branchStore'
import { formatAppDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useLetterMutations, useTripMovements, type TripMovement } from './useLetters'
import { DateInput } from '@/components/ui/DateInput'
import { todayIso } from '@/lib/today'

// ⚠️ `toISOString()` formats the UTC date — yesterday before 05:00 here.
const today = todayIso

/**
 * Trip legs (departed / arrived per branch). Turnstile-derived legs come back
 * `is_confirmed` — those are facts from the access-control system, so they are
 * marked rather than presented as hand-entered.
 */
export function TripMovementsPanel({
  letterId,
  canManage,
  canConfirmReturn,
  onDone,
}: {
  letterId: number
  canManage: boolean
  /**
   * NARROWER THAN `canManage`. Adding a leg is allowed to the KADR of the home
   * branch OR of any destination branch, but CONFIRMING THE RETURN is the home
   * branch's call alone — the server answers 403 `not_home_branch_hr` to a
   * destination-branch KADR (`BusinessTripMovementService`, the `_is_home_hr`
   * check). Sharing one flag drew the button for people it refuses.
   */
  canConfirmReturn: boolean
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const branches = useBranchStore((s) => s.branches)
  const { movements, loading } = useTripMovements(letterId, true)
  const mut = useLetterMutations()

  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [eventType, setEventType] = useState('departed')
  const [branchId, setBranchId] = useState('')
  const [eventDate, setEventDate] = useState(today())
  const [note, setNote] = useState('')
  const [returnDate, setReturnDate] = useState(today())
  const [confirmDelete, setConfirmDelete] = useState<TripMovement | null>(null)
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

  return (
    <>
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[15px] font-semibold text-fg">{t('letters.secMovements')}</h3>
          {(canManage || canConfirmReturn) && (
            <div className="ml-auto flex gap-2">
              {canConfirmReturn && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<CheckCircle2 size={14} />}
                onClick={() => {
                  setReturnDate(today())
                  setConfirming(true)
                }}
              >
                {t('letters.confirmReturn')}
              </Button>
              )}
              {canManage && (
              <Button
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => {
                  setEventType('departed')
                  setBranchId('')
                  setEventDate(today())
                  setNote('')
                  setAdding(true)
                }}
              >
                {t('letters.addMovement')}
              </Button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-fg-subtle">…</p>
        ) : movements.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-subtle">{t('letters.movementsEmpty')}</p>
        ) : (
          <ol className="p-4">
            {movements.map((m, i) => {
              const departed = m.event_type === 'departed'
              return (
                <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* timeline rail */}
                  {i < movements.length - 1 && (
                    <span className="absolute left-[15px] top-8 h-full w-px bg-line" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                      departed ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success',
                    )}
                  >
                    {departed ? <LogOut size={15} /> : <LogIn size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {departed ? t('letters.movementDeparted') : t('letters.movementArrived')}
                      {m.branch?.name && <span className="text-fg-muted"> · {m.branch.name}</span>}
                    </p>
                    <p className="text-xs tabular-nums text-fg-subtle">
                      {m.event_date ? formatAppDate(m.event_date) : '—'}
                      {m.note && <span> · {m.note}</span>}
                    </p>
                  </div>
                  {m.is_confirmed && (
                    <span
                      className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand"
                      title={t('letters.movementConfirmed')}
                    >
                      {t('letters.movementConfirmed')}
                    </span>
                  )}
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-danger"
                      aria-label={t('common.delete')}
                      onClick={() => setConfirmDelete(m)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      {/* Add movement */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('letters.addMovement')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.addMovement.mutateAsync({
                    id: letterId,
                    body: {
                      event_type: eventType,
                      event_date: eventDate,
                      branch_id: branchId ? Number(branchId) : null,
                      note: note || null,
                    },
                  }),
                  t('letters.actionDone'),
                  () => setAdding(false),
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
            <span className="text-sm text-fg-muted">{t('letters.movementType')}</span>
            <Select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              options={[
                { value: 'departed', label: t('letters.movementDeparted') },
                { value: 'arrived', label: t('letters.movementArrived') },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.movementBranch')}</span>
            <Combobox
              value={branchId}
              onChange={setBranchId}
              placeholder={t('letters.movementBranch')}
              options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.movementDate')}</span>
            <DateInput value={eventDate} onChange={setEventDate} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('letters.movementNote')}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </Modal>

      {/* Confirm return */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('letters.confirmReturn')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.confirmReturn.mutateAsync({ id: letterId, return_date: returnDate }),
                  t('letters.actionDone'),
                  () => setConfirming(false),
                )
              }
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-fg-muted">{t('letters.returnDate')}</span>
          <DateInput value={returnDate} onChange={setReturnDate} />
        </label>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete
          setConfirmDelete(null)
          if (!target) return
          await run(
            mut.deleteMovement.mutateAsync({ id: letterId, mid: target.id }),
            t('letters.actionDone'),
            () => {},
          )
        }}
        title={t('letters.deleteMovementTitle')}
        confirmLabel={t('common.delete')}
      />
    </>
  )
}
