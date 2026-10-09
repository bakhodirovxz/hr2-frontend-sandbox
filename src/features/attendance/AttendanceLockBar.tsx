import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Lock, LockOpen, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import {
  lockForRange,
  useAttendanceLockMutations,
  useAttendanceLocks,
  type AttendanceLock,
} from './useAttendanceLocks'

interface Props {
  /** Branch whose timesheet is on screen; without one there is nothing to close. */
  branchId: number | null
  /** The range the page is showing — the bar answers for THIS range. */
  from: string
  to: string
  /** May this person close and reopen a period? Read-only otherwise. */
  canManage: boolean
}

/**
 * CLOSING THE MONTH.
 *
 * The bar answers one question about the range on screen: is it still open?
 * A closed period refuses corrections and leave orders on the server, so
 * showing the state here is what stops someone typing a change that comes back
 * 409 — and, when passes arrive after the close, it is where that becomes
 * visible instead of silently changing a reported figure.
 */
export function AttendanceLockBar({ branchId, from, to, canManage }: Props) {
  const { t } = useTranslation()
  const { locks } = useAttendanceLocks(branchId, !!branchId)
  const lock = lockForRange(locks, from, to)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState<AttendanceLock | null>(null)

  if (!branchId) return null
  if (!lock && !canManage) return null

  return (
    <>
      {lock ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-r-md border border-warn/40 border-l-4 border-l-warn bg-warn/10 px-4 py-2.5">
          <Lock size={16} className="shrink-0 text-warn" />
          <span className="text-[14px] font-semibold text-fg">
            {t('attLock.closed', {
              from: dayjs(lock.period_start).format('DD.MM.YYYY'),
              to: dayjs(lock.period_end).format('DD.MM.YYYY'),
            })}
          </span>
          {lock.locked_by_name ? (
            <span className="text-[13px] text-fg-muted">
              {t('attLock.closedBy', {
                name: lock.locked_by_name,
                at: dayjs(lock.locked_at).format('DD.MM.YYYY HH:mm'),
              })}
            </span>
          ) : null}
          {lock.note ? <span className="text-[13px] text-fg-muted">· {lock.note}</span> : null}
          {lock.late_passes > 0 || lock.late_corrections > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[12px] font-semibold text-danger"
              title={t('attLock.lateHint')}
            >
              <TriangleAlert size={13} />
              {t('attLock.late', { passes: lock.late_passes, corrections: lock.late_corrections })}
            </span>
          ) : null}
          {canManage ? (
            <Button
              className="ml-auto"
              variant="outline"
              size="sm"
              leftIcon={<LockOpen size={14} />}
              onClick={() => setReopening(lock)}
            >
              {t('attLock.reopen')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-2 px-4 py-2.5">
          <LockOpen size={16} className="shrink-0 text-fg-muted" />
          <span className="text-[13px] text-fg-muted">{t('attLock.open')}</span>
          <Button
            className="ml-auto"
            variant="outline"
            size="sm"
            leftIcon={<Lock size={14} />}
            onClick={() => setClosing(true)}
          >
            {t('attLock.close')}
          </Button>
        </div>
      )}

      {closing ? (
        <ClosePeriodModal
          branchId={branchId}
          from={from}
          to={to}
          onClose={() => setClosing(false)}
        />
      ) : null}

      <ReopenDialog lock={reopening} onClose={() => setReopening(null)} />
    </>
  )
}

/** Closing defaults to the WHOLE month the range starts in — a half-closed
 *  month would leave the tabel half-movable, which is nobody's intention. */
function ClosePeriodModal({
  branchId,
  from,
  to,
  onClose,
}: {
  branchId: number
  from: string
  to: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { lock } = useAttendanceLockMutations()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const base = dayjs(from || to || undefined)
    setStart(base.startOf('month').format('YYYY-MM-DD'))
    setEnd(base.endOf('month').format('YYYY-MM-DD'))
  }, [from, to])

  const submit = async () => {
    setError(null)
    if (!start || !end || end < start) {
      setError(t('attLock.badRange'))
      return
    }
    try {
      await lock.mutateAsync({
        organization_branch_id: branchId,
        period_start: start,
        period_end: end,
        note: note.trim() || null,
      })
      toast.ok(t('attLock.closedToast'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal open title={t('attLock.closeTitle')} onClose={onClose} size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">{t('attLock.closeHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('attLock.periodStart')}>
            <DateInput value={start} onChange={setStart} />
          </Field>
          <Field label={t('attLock.periodEnd')}>
            <DateInput value={end} onChange={setEnd} min={start || undefined} />
          </Field>
        </div>
        <Field label={t('attLock.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('attLock.notePlaceholder')} />
        </Field>
        {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={lock.isPending} onClick={submit}>
            {t('attLock.close')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ReopenDialog({ lock, onClose }: { lock: AttendanceLock | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { unlock } = useAttendanceLockMutations()

  return (
    <ConfirmDialog
      open={!!lock}
      title={t('attLock.reopenTitle')}
      description={
        lock
          ? t('attLock.reopenConfirm', {
              from: dayjs(lock.period_start).format('DD.MM.YYYY'),
              to: dayjs(lock.period_end).format('DD.MM.YYYY'),
            })
          : ''
      }
      confirmLabel={t('attLock.reopen')}
      loading={unlock.isPending}
      onClose={onClose}
      onConfirm={async () => {
        if (!lock) return
        try {
          await unlock.mutateAsync(lock.id)
          toast.ok(t('attLock.reopenedToast'))
          onClose()
        } catch (e) {
          toast.error(errorMessage(e, t('common.actionFailed')))
        }
      }}
    />
  )
}
