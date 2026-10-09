import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InvitationsPanel } from './InvitationsPanel'
import { VisitorInvitationStats } from '@/features/dashboard/VisitorInvitationStats'
import { Download, Pencil } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatAppDate } from '@/lib/format'
import { downloadFromUrl } from '@/lib/download'
import { useGuest } from './useGuests'

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-fg">{value?.trim() ? value : '—'}</dd>
    </div>
  )
}

/** Visitor profile — identity, access window and visit history at a glance. */
export function GuestProfileModal({
  guestId,
  onClose,
  onEdit,
}: {
  guestId: number | null
  onClose: () => void
  onEdit: () => void
}) {
  const [qrOpen, setQrOpen] = useState(false)
  const { t } = useTranslation()
  const { guest, loading } = useGuest(guestId)

  return (
    <Modal
      open={guestId != null}
      onClose={onClose}
      title={t('guests.profileTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button leftIcon={<Pencil size={15} />} onClick={onEdit} disabled={!guest}>
            {t('common.edit')}
          </Button>
        </>
      }
    >
      {loading || !guest ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-inner" />
          <Skeleton className="h-32 w-full rounded-inner" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar src={guest.photo_path} name={guest.legal_name} size={64} />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-fg">
                {guest.legal_name || '—'}
              </p>
              <p className="truncate text-[13px] text-fg-muted">
                {[guest.job_position, guest.organization_name].filter(Boolean).join(' · ') || '—'}
              </p>
              <div className="mt-1.5">
                <Badge tone={guest.is_active ? 'success' : 'neutral'}>
                  {guest.is_active ? t('guests.statusActive') : t('guests.statusInactive')}
                </Badge>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Row label={t('guests.fieldPhone')} value={guest.phone_number} />
            <Row label={t('guests.fieldTelegram')} value={guest.telegram_username} />
            <Row label={t('guests.colHost')} value={guest.host_employee_name} />
            <Row label={t('guests.fieldCard')} value={guest.card_no} />
            <Row label={t('guests.fieldBranch')} value={guest.organization_branch?.name} />
            <Row label={t('guests.fieldPinfl')} value={guest.personal_identification_number} />
            <Row
              label={t('guests.fieldValidFrom')}
              value={guest.valid_from ? formatAppDate(guest.valid_from) : null}
            />
            <Row
              label={t('guests.fieldValidUntil')}
              value={guest.valid_until ? formatAppDate(guest.valid_until) : null}
            />
            <Row
              label={t('guests.colLastVisit')}
              value={guest.last_visit_time ? formatAppDate(guest.last_visit_time) : null}
            />
            <Row label={t('guests.colVisits')} value={String(guest.visit_count ?? 0)} />
          </dl>

          {guest.qr_path && (
            <div className="flex items-center gap-4 rounded-inner border border-line bg-surface-2/60 p-3">
              {/* v1 opens the badge full size and lets you save it; v2 showed a
                  static 96px image with no way to do either — a QR nobody can
                  enlarge or print is not a badge. `qr_path` is already a
                  presigned absolute URL, so it is used as-is. */}
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label={t('guests.qrOpen')}
                className="rounded-tag transition-transform hover:scale-105"
              >
                <img loading="lazy" decoding="async" src={guest.qr_path} alt={t('guests.qrAlt')} className="h-24 w-24 rounded-tag" />
              </button>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-fg-muted">{t('guests.qrHint')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Download size={14} />}
                  onClick={() =>
                    downloadFromUrl(
                      guest.qr_path as string,
                      `QR_${(guest.legal_name ?? guest.id).toString().replace(/\s+/g, '_')}.png`,
                    )
                  }
                >
                  {t('common.download')}
                </Button>
              </div>
            </div>
          )}

          <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={t('guests.qrAlt')}>
            <div className="flex justify-center p-2">
              <img loading="lazy" decoding="async" src={guest.qr_path ?? ''} alt={t('guests.qrAlt')} className="h-72 w-72" />
            </div>
          </Modal>

          {/* The visits themselves — a guest record is only half the story. */}
          {/* Taklifnoma statistikasi taklifnomalar ro'yxatining USTIDA:
              "kim chaqirgan va necha marta" savoliga ro'yxatni sanab
              chiqmasdan javob beradi (v1 GuestReceptionRating). */}
          <VisitorInvitationStats visitorId={guest.id} />
          <InvitationsPanel visitorId={guest.id} />
        </div>
      )}
    </Modal>
  )
}
