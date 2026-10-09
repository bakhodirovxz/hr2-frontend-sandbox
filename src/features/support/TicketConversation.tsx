import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Send, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Textarea } from '@/components/ui/Textarea'
import { Avatar } from '@/components/ui/Avatar'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import { inTashkent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useSupportMutations, useTicketDetail, useTicketMessages, type Ticket, type TicketParticipant } from './useSupport'

/**
 * THE TICKET'S CONVERSATION, inline in the ticket pane (2026-09-24 helpdesk
 * redesign; it used to be a modal over the list).
 *
 * A helpdesk ticket is a dialogue — «which room?», «is it still down?». In the
 * inbox layout the thread sits right under the ticket it belongs to, the way
 * Intercom and Front draw it, so answering never hides the ticket. Opening the
 * thread also clears its unread counter (the menu badge counts those).
 *
 * The composer sends on Enter and breaks the line on Shift+Enter.
 */
export function TicketConversation({ ticket, onNotice }: { ticket: Ticket; onNotice: (msg: string, error?: boolean) => void }) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user?.employee?.id)
  const mut = useSupportMutations()
  const { messages, loading, denied } = useTicketMessages(ticket.id, true)
  // The list row carries participants too, but only as of the last list fetch;
  // invite/remove write back into the detail query, so the chips read that.
  const { ticket: detail } = useTicketDetail(ticket.id, true)
  const participants: TicketParticipant[] = detail?.participants ?? ticket.participants ?? []
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteId, setInviteId] = useState('')
  const [removing, setRemoving] = useState<TicketParticipant | null>(null)
  const { options: employeeOptions, loading: employeesLoading } = useEmployeeOptions(branchId, inviteOpen)
  const [body, setBody] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // A fresh ticket starts with the invite row closed and nothing half-typed.
  useEffect(() => {
    setInviteOpen(false)
    setInviteId('')
    setRemoving(null)
    setBody('')
  }, [ticket.id])

  // Opening the thread IS reading it.
  useEffect(() => {
    mut.markRead.mutate(ticket.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  // Keep the newest message in view — inside the thread box, never by
  // scrolling the whole page.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, ticket.id])

  const invite = async () => {
    const employeeId = Number(inviteId)
    if (!employeeId) return
    try {
      await mut.addParticipant.mutateAsync({ id: ticket.id, employeeId })
      setInviteId('')
      setInviteOpen(false)
      onNotice(t('support.participantAdded'))
    } catch (e) {
      onNotice(errorMessage(e, t('common.actionFailed')), true)
    }
  }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    try {
      await mut.sendMessage.mutateAsync({ id: ticket.id, body: text })
      setBody('')
      mut.invalidate()
    } catch (e) {
      onNotice(errorMessage(e, t('common.actionFailed')), true)
    }
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h3 className="mr-auto flex items-center gap-2 text-[13.5px] font-semibold text-fg">
          <MessageSquare size={15} className="text-fg-subtle" /> {t('support.chatTitle')}
        </h3>
        {participants.map((p) => (
          <span key={p.id ?? p.employee_id} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-2 py-0.5 pl-1 pr-1 text-[11.5px] text-fg-muted">
            <Avatar src={p.employee?.photo_thumb_path ?? undefined} name={p.employee?.legal_name ?? ''} size={18} />
            {p.employee?.legal_name ?? t('support.participantFallback')}
            <button
              type="button"
              aria-label={t('support.participantRemove')}
              title={t('support.participantRemove')}
              onClick={() => setRemoving(p)}
              className="grid h-4 w-4 place-items-center rounded-full text-fg-subtle transition-colors hover:text-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <Button size="sm" variant="ghost" leftIcon={<UserPlus size={13} />} onClick={() => setInviteOpen((v) => !v)}>
          {t('support.participantInvite')}
        </Button>
        {inviteOpen && (
          <div className="flex w-full items-center gap-2 pt-1">
            <Combobox value={inviteId} onChange={setInviteId} options={employeeOptions} loading={employeesLoading} placeholder={t('support.participantPick')} className="flex-1" />
            <Button size="sm" disabled={!inviteId} loading={mut.addParticipant.isPending} onClick={() => invite()}>
              {t('support.participantAdd')}
            </Button>
          </div>
        )}
      </div>

      <div ref={listRef} className="scroll-thin min-h-[160px] flex-1 overflow-y-auto rounded-inner border border-line bg-surface-2/40 p-3">
        {loading ? (
          <CenteredSpinner />
        ) : denied || messages.length === 0 ? (
          <div className="grid h-full min-h-[140px] place-items-center text-center">
            <div>
              <p className="text-[13px] font-semibold text-fg">{t('support.chatEmpty')}</p>
              <p className="mt-0.5 text-[12px] text-fg-subtle">{t('support.chatEmptyHint')}</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((m) => {
              if (m.is_system) {
                return (
                  <li key={m.id} className="flex items-center gap-2 py-0.5 text-[11.5px] text-fg-subtle">
                    <span className="h-px flex-1 bg-line" />
                    {m.body}
                    <span className="h-px flex-1 bg-line" />
                  </li>
                )
              }
              const mine = !!me && m.author_id === me
              return (
                <li key={m.id} className={cn('flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
                  {!mine && <Avatar src={m.author?.photo_thumb_path ?? undefined} name={m.author?.legal_name ?? ''} size={26} />}
                  <div className={cn('max-w-[78%] rounded-2xl px-3 py-2', mine ? 'rounded-br-md bg-brand text-fg-on-brand' : 'rounded-bl-md border border-line bg-surface text-fg')}>
                    {!mine && <p className="mb-0.5 text-[11px] font-semibold text-brand-strong">{m.author?.legal_name ?? '—'}</p>}
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                    {m.created_at && (
                      <p className={cn('mt-0.5 text-right text-[10.5px] tabular-nums', mine ? 'text-fg-on-brand/75' : 'text-fg-subtle')}>
                        {inTashkent(m.created_at).format('DD.MM HH:mm')}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('support.chatPlaceholder')}
          aria-label={t('support.chatPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button leftIcon={<Send size={15} />} disabled={!body.trim()} loading={mut.sendMessage.isPending} onClick={() => send()}>
          {t('support.chatSend')}
        </Button>
      </div>

      <ConfirmDialog
        open={!!removing}
        danger
        title={t('support.participantRemoveTitle')}
        description={t('support.participantRemoveConfirm', { name: removing?.employee?.legal_name ?? t('support.participantFallback') })}
        confirmLabel={t('support.participantRemove')}
        loading={mut.removeParticipant.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing?.employee_id) return
          try {
            await mut.removeParticipant.mutateAsync({ id: ticket.id, employeeId: removing.employee_id })
            onNotice(t('support.participantRemoved'))
          } catch (e) {
            onNotice(errorMessage(e, t('common.actionFailed')), true)
          }
          setRemoving(null)
        }}
      />
    </section>
  )
}
