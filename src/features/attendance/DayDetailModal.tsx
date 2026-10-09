import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeftFromLine, ArrowRightToLine, FileText, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { inTashkent } from '@/lib/format'
import { dmy } from './period'
import { CAL_COLOR, CAL_LABEL, type CalStatus } from './attendanceStatus'
import type { DayDocument } from './useDayDocuments'
import {
  dayBreaks,
  eventDirection,
  eventLocation,
  formatMinutes,
  insideMinutes,
  turnstileName,
  type DayEvents,
  type TurnstileEvent,
} from './useDayEvents'

/**
 * What actually happened on one day.
 *
 * The calendar cell can only afford a colour and two timestamps; this answers
 * the follow-up questions: how long was I actually inside, which gates did I
 * pass and where are they, what does the reader's snapshot show, and — when the
 * day was a trip or a leave — which document put it there.
 */
export function DayDetailModal({
  date,
  status,
  day,
  lateMinutes,
  workingStart,
  workingEnd,
  lunchStart,
  lunchEnd,
  isWorkingDay,
  documents = [],
  onClose,
}: {
  /** ISO date, or null while closed. */
  date: string | null
  status: CalStatus
  day?: DayEvents | null
  lateMinutes?: number
  workingStart?: string
  workingEnd?: string
  /** From the employee card; without it the deduction hits the wrong hour. */
  lunchStart?: string | null
  lunchEnd?: string | null
  isWorkingDay: boolean
  /** Kunning asosi bo'lgan buyruqlar (bo'lmasa bo'lim ko'rinmaydi). */
  documents?: DayDocument[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const events = useMemo(() => day?.all ?? [], [day])
  /* The reader snapshot, full size. It is the proof of who actually walked
     through, and at 40px it proves nothing. */
  const [zoom, setZoom] = useState<string | null>(null)

  // The employee's OWN lunch window — 1200 people here lunch at 12:00, not 13:00.
  const inside = insideMinutes(events, workingEnd, { start: lunchStart, end: lunchEnd })
  const breaks = dayBreaks(events, workingEnd)
  const firstIn = day?.entry?.happen_time ? inTashkent(day.entry.happen_time).format('HH:mm') : '—'
  const lastOut = day?.exit?.happen_time ? inTashkent(day.exit.happen_time).format('HH:mm') : '—'

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      size="lg"
      title={date ? dmy(date) : ''}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Status line */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-[var(--r-pill)] px-2.5 py-1 text-[12px] font-semibold"
            style={{
              backgroundColor: `rgb(var(${CAL_COLOR[status]}) / 0.14)`,
              color: `rgb(var(${CAL_COLOR[status]}))`,
            }}
          >
            {t(`attendance.${CAL_LABEL[status]}`)}
          </span>
          <Badge tone={isWorkingDay ? 'neutral' : 'warning'}>
            {isWorkingDay ? t('myAttendance.workingDay') : t('myAttendance.restDay')}
          </Badge>
          {!!lateMinutes && (
            <Badge tone="warning">{t('myAttendance.lateBy', { count: lateMinutes })}</Badge>
          )}
        </div>

        {/* Plan vs fact */}
        <div className="overflow-hidden rounded-[var(--r-md)] border border-line">
          <div className="grid grid-cols-4 bg-surface-2 px-3 py-2 text-[11.5px] font-semibold text-fg-muted">
            <span />
            <span className="text-center">{t('myAttendance.colIn')}</span>
            <span className="text-center">{t('myAttendance.colOut')}</span>
            <span className="text-center">{t('myAttendance.colBreak')}</span>
          </div>
          <div className="grid grid-cols-4 items-center border-t border-line px-3 py-2 text-[13px]">
            <span className="text-fg-muted">{t('myAttendance.rowPlan')}</span>
            <span className="text-center tabular-nums text-fg">{workingStart ?? '09:00'}</span>
            <span className="text-center tabular-nums text-fg">{workingEnd ?? '18:00'}</span>
            {/* Tushlik XODIM KARTASIDAN — xodimlarning bir qismi 12:00 da tushlik qiladi. */}
            <span className="text-center tabular-nums text-fg">{lunchLabel(lunchStart, lunchEnd)}</span>
          </div>
          <div className="grid grid-cols-4 items-center border-t border-line px-3 py-2 text-[13px]">
            <span className="text-fg-muted">{t('myAttendance.rowFact')}</span>
            <span className={cn('text-center font-semibold tabular-nums', lateMinutes ? 'text-warning' : 'text-fg')}>
              {firstIn}
            </span>
            <span className="text-center font-semibold tabular-nums text-fg">{lastOut}</span>
            <span className={cn('text-center text-[12px] tabular-nums', breaks.length ? 'text-warning' : 'text-fg-subtle')}>
              {breaks.length ? breaks.map((b) => `${b.start}–${b.end}`).join(', ') : '—'}
            </span>
          </div>
        </div>

        {/* Day totals */}
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label={t('myAttendance.insideTime')}
            value={
              // Bitta qayd bilan juftlik yo'q — fakt hisoblanmaydi (v1 ham shunday).
              events.length >= 2
                ? formatMinutes(inside, t('attendance.hoursUnit'), t('myAttendance.minuteUnit'))
                : events.length === 1
                  ? t('davomat.oneRecord')
                  : '—'
            }
            tone="--success"
          />
          <Metric label={t('myAttendance.recordCount')} value={String(events.length)} tone="--brand" />
        </div>

        {/* Documents behind the day */}
        {documents.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-fg-subtle">
              {t('myAttendance.documents')}
            </p>
            {documents.map((d) => (
              <Link
                key={`${d.kind}-${d.id}`}
                to={d.href}
                onClick={onClose}
                className="flex items-center gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-brand/50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-brand-soft text-brand">
                  <FileText size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {d.title || t(d.kind === 'order' ? 'myAttendance.docOrder' : 'myAttendance.docLeave')}
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-muted">
                    {[d.number && `№ ${d.number}`, d.from && d.to && `${d.from} — ${d.to}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Turniket o'tishlari */}
        {events.length === 0 ? (
          <EmptyState title={t('myAttendance.noEvents')} description={t('myAttendance.noEventsHint')} />
        ) : (
          <ul className="scroll-thin max-h-[320px] divide-y divide-line overflow-y-auto rounded-[var(--r-md)] border border-line">
            {events.map((e) => (
              <PassRow key={e.id} event={e} onZoom={setZoom} />
            ))}
          </ul>
        )}
      </div>
      {zoom && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('common.close')}
          onClick={() => setZoom(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') setZoom(null)
          }}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <img loading="lazy" decoding="async"
            src={zoom}
            alt=""
            crossOrigin="anonymous"
            className="max-h-full max-w-full rounded-[var(--r-md)] object-contain shadow-lg"
          />
        </div>
      )}
    </Modal>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-line bg-surface-2/60 px-3 py-2.5">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color: `rgb(var(${tone}))` }}>
        {value}
      </p>
    </div>
  )
}

function PassRow({
  event,
  onZoom,
}: {
  event: TurnstileEvent
  /** Open the reader's snapshot full size. */
  onZoom: (src: string) => void
}) {
  const { t } = useTranslation()
  const isEntry = eventDirection(event) === 'entry'
  const loc = eventLocation(event)
  // `pic_uri` is HikCentral's internal `Vsm://…` locator (every one of the
  // 206k events on TEST) — the browser cannot fetch it, so it rendered a
  // broken image with a zoom button and a CORS error in the console. Only a
  // real URL counts as a photo.
  const isUrl = (v?: string | null) => !!v && /^(https?:)?\//.test(v)
  const photo = [event.photo_thumb_path, event.photo_path, event.pic_uri].find(isUrl) ?? null
  // The zoom opens the FULL snapshot. The 160px copy (since 2026-09-14) is
  // for the 40px square in the row only — zoomed, it opened as a tiny picture
  // while older passes, which have no copy, opened full size.
  const fullPhoto = [event.photo_path, event.pic_uri].find(isUrl) ?? photo

  return (
    <li className="flex w-full items-center gap-3 bg-surface px-3 py-2.5">
        {/* The reader's snapshot — proof of who actually passed. */}
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--r-sm)] bg-surface-2 ring-1 ring-line',
            photo && 'cursor-zoom-in',
          )}
          role={photo ? 'button' : undefined}
          tabIndex={photo ? 0 : undefined}
          aria-label={photo ? t('myAttendance.openSnapshot') : undefined}
          onClick={
            photo
              ? (e) => {
                  e.stopPropagation()
                  onZoom(fullPhoto!)
                }
              : undefined
          }
          onKeyDown={
            photo
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onZoom(fullPhoto!)
                  }
                }
              : undefined
          }
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              // MinIO is cross-origin; without CORS the response is opaque and
              // Firefox's ORB refuses to render it (same fix as <Avatar>).
              crossOrigin="anonymous"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={15} className="text-fg-subtle" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tabular-nums text-fg">
              {inTashkent(event.happen_time).format('HH:mm:ss')}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{
                backgroundColor: `rgb(var(${isEntry ? '--success' : '--danger'}) / 0.12)`,
                color: `rgb(var(${isEntry ? '--success' : '--danger'}))`,
              }}
            >
              {isEntry ? <ArrowRightToLine size={11} /> : <ArrowLeftFromLine size={11} />}
              {isEntry ? t('myAttendance.dirIn') : t('myAttendance.dirOut')}
            </span>
          </span>
          <span className="block truncate text-[11.5px] text-fg-muted">
            {[turnstileName(event) || t('myAttendance.turnstile'), loc?.name].filter(Boolean).join(' · ')}
          </span>
        </span>
    </li>
  )
}

/** «12:00–13:00»; kartada tushlik bo'lmasa standart 13:00–14:00, teskari/nol oyna — «—». */
function lunchLabel(start?: string | null, end?: string | null): string {
  const a = (start ?? '').slice(0, 5) || '13:00'
  const b = (end ?? '').slice(0, 5) || '14:00'
  return b > a ? `${a}–${b}` : '—'
}
