import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  Hash,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DetailRow } from '@/components/data/DetailRow'
import { formatAppDate } from '@/lib/format'
import { useTripMovements } from '@/features/letters/useLetters'

/**
 * SAFAR HARAKATI — what a per-leg QR on the printed guvohnoma opens.
 *
 * `LetterService` draws a QR next to every arrival/departure line pointing at
 * `/letters/{id}/movements/{movementId}`, and v2 had no such route: scanning
 * the stamp at the destination branch landed the reader on the dashboard.
 *
 * NO NEW ENDPOINT. The leg is picked out of the letter's own
 * `trip-movements` list, so the authorisation is exactly the one that already
 * guards the letter — a QR is not a key to anything the holder could not
 * otherwise open.
 */
export function TripMovementPage() {
  const { t } = useTranslation()
  const { id, movementId } = useParams()
  const letterId = Number(id)
  const { movements, loading } = useTripMovements(
    Number.isFinite(letterId) ? letterId : null,
    Number.isFinite(letterId),
  )

  const movement = movements.find((m) => String(m.id) === String(movementId))
  const departed = movement?.event_type === 'departed'

  return (
    <PageContainer>
      <PageHeader title={t('tripMovement.title')} subtitle={t('tripMovement.subtitle')} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !movement ? (
        <Card className="p-6">
          <EmptyState
            icon={<ShieldAlert size={22} />}
            title={t('tripMovement.notFound')}
            description={t('tripMovement.notFoundHint')}
          />
        </Card>
      ) : (
        <Card className="p-card">
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-4">
            <span
              className={
                departed
                  ? 'grid h-10 w-10 place-items-center rounded-lg bg-warning-soft text-warning'
                  : 'grid h-10 w-10 place-items-center rounded-lg bg-success-soft text-success'
              }
            >
              {departed ? <PlaneTakeoff size={20} /> : <PlaneLanding size={20} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-fg">
                {departed ? t('tripMovement.departed') : t('tripMovement.arrived')}
              </span>
              <span className="block text-[12px] text-fg-subtle">
                {t('tripMovement.certificate')} №{id}
              </span>
            </span>
            {movement.is_confirmed ? (
              <Badge tone="success" className="ml-auto">
                <CheckCircle2 size={12} /> {t('tripMovement.confirmed')}
              </Badge>
            ) : null}
          </div>

          <dl className="divide-y divide-line/60">
            <DetailRow icon={<MapPin size={14} />} label={t('tripMovement.branch')} value={movement.branch?.name} />
            <DetailRow
              icon={<CalendarDays size={14} />}
              label={t('tripMovement.date')}
              value={movement.event_date ? formatAppDate(movement.event_date) : null}
            />
            <DetailRow icon={<Hash size={14} />} label={t('tripMovement.order')} value={movement.sequence_order} />
            {/* A leg written by the turnstile carries more weight than one typed
                in by hand, so say which it was. */}
            <DetailRow
              icon={<ShieldCheck size={14} />}
              label={t('tripMovement.source')}
              value={movement.turnstile_event_id ? t('tripMovement.fromTurnstile') : t('tripMovement.byHand')}
            />
            {movement.note ? (
              <DetailRow icon={<StickyNote size={14} />} label={t('tripMovement.note')} value={movement.note} />
            ) : null}
          </dl>
        </Card>
      )}
    </PageContainer>
  )
}
