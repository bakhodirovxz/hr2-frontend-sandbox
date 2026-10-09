import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, LogOut, Plus, QrCode, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { formatDateTime } from '@/lib/format'
import { useInvitationMutations, useInvitations, type Invitation } from './useGuests'

/** Two hours from now, as the default end of a visit window. */
function defaults() {
  const from = new Date()
  const until = new Date(from.getTime() + 2 * 60 * 60 * 1000)
  // datetime-local wants LOCAL wall time; toISOString() is UTC, which seeded
  // the field five hours behind the clock on the wall.
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { from: iso(from), until: iso(until) }
}

/**
 * THE VISITS THIS GUEST HAS BEEN INVITED TO.
 *
 * An invitation is a time window plus a QR pass. The host opens one, the guard
 * (or the turnstile) reads it, and the host marks the visitor received and then
 * gone — the three steps the reception desk actually performs.
 */
export function InvitationsPanel({ visitorId }: { visitorId: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { invitations, loading, denied } = useInvitations(visitorId)
  const mut = useInvitationMutations()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(defaults())
  const [note, setNote] = useState('')
  const [qr, setQr] = useState<Invitation | null>(null)

  /** Ask first, then run — the row buttons act on the visit immediately. */
  const ask = async (inv: Invitation, kind: 'action' | 'approve' | 'status' | 'delete', label: string, act: () => Promise<unknown>, msg: string) => {
    const subject = inv.valid_from ? formatDateTime(inv.valid_from) : undefined
    if (!(await confirm({ kind, subject, confirmLabel: label }))) return
    await run(act(), msg)
  }

  const run = async (p: Promise<unknown>, msg: string, close?: () => void) => {
    try {
      await p
      close?.()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-[13px] font-semibold text-fg">{t('guests.invitations')}</h4>
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          leftIcon={<Plus size={14} />}
          onClick={() => {
            setForm(defaults())
            setNote('')
            setAdding(true)
          }}
        >
          {t('guests.inviteAdd')}
        </Button>
      </div>

      {loading ? (
        <CenteredSpinner />
      ) : denied || invitations.length === 0 ? (
        <EmptyState title={t('guests.invitationsEmpty')} description={t('guests.invitationsHint')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-inner bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] tabular-nums text-fg">
                  {inv.valid_from ? formatDateTime(inv.valid_from) : '—'}
                  {inv.valid_until ? ` — ${formatDateTime(inv.valid_until)}` : ''}
                </p>
                <p className="text-[11px] text-fg-subtle">
                  {inv.description || inv.invited_by_employee_name || ''}
                </p>
              </div>
              {inv.finished_at ? (
                <Badge tone="neutral">{t('guests.inviteFinished')}</Badge>
              ) : inv.accepted_at ? (
                <Badge tone="success">{t('guests.inviteAccepted')}</Badge>
              ) : inv.is_invalid ? (
                <Badge tone="danger">{t('guests.inviteExpired')}</Badge>
              ) : (
                <Badge tone="info">{t('guests.inviteOpen')}</Badge>
              )}

              {inv.qr_path ? (
                <IconButton size="sm" label={t('guests.inviteQr')} onClick={() => setQr(inv)}>
                  <QrCode size={14} />
                </IconButton>
              ) : (
                <IconButton
                  size="sm"
                  label={t('guests.inviteMakeQr')}
                  onClick={() => ask(inv, 'action', t('guests.inviteMakeQr'), () => mut.generateQr.mutateAsync(inv.id), t('guests.inviteQrMade'))}
                >
                  <QrCode size={14} />
                </IconButton>
              )}
              {!inv.accepted_at && !inv.finished_at && (
                <IconButton
                  size="sm"
                  label={t('guests.inviteAccept')}
                  onClick={() => ask(inv, 'approve', t('guests.inviteAccept'), () => mut.accept.mutateAsync(inv.id), t('guests.inviteAccepted'))}
                >
                  <Check size={14} />
                </IconButton>
              )}
              {inv.accepted_at && !inv.finished_at && (
                <IconButton
                  size="sm"
                  label={t('guests.inviteFinish')}
                  onClick={() => ask(inv, 'status', t('guests.inviteFinish'), () => mut.finish.mutateAsync(inv.id), t('guests.inviteFinished'))}
                >
                  <LogOut size={14} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                label={t('common.delete')}
                onClick={() => ask(inv, 'delete', t('common.delete'), () => mut.remove.mutateAsync(inv.id), t('common.deleted'))}
              >
                <Trash2 size={14} className="text-danger" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title={t('guests.inviteAdd')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            <Button
              loading={mut.create.isPending}
              disabled={!form.from || !form.until}
              onClick={() =>
                void run(
                  mut.create.mutateAsync({
                    visitor_id: visitorId,
                    valid_from: form.from,
                    valid_until: form.until,
                    description: note.trim() || null,
                  }),
                  t('guests.inviteCreated'),
                  () => setAdding(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('guests.inviteFrom')} required>
            <DateTimeInput value={form.from} onChange={(v) => setForm((p) => ({ ...p, from: v }))} />
          </Field>
          <Field label={t('guests.inviteUntil')} required>
            <DateTimeInput value={form.until} onChange={(v) => setForm((p) => ({ ...p, until: v }))} />
          </Field>
          <Field label={t('guests.inviteNote')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={!!qr} onClose={() => setQr(null)} size="sm" title={t('guests.inviteQr')}>
        {qr?.qr_path && (
          <div className="flex flex-col items-center gap-3 py-2">
            <img loading="lazy" decoding="async" src={qr.qr_path} alt={t('guests.inviteQr')} className="h-56 w-56 rounded-card" />
            <p className="text-center text-[12px] text-fg-muted">{t('guests.inviteQrHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
