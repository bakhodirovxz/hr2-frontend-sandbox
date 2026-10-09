import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Circle,
  Copy,
  Disc,
  FileVideo,
  KeyRound,
  PlayCircle,
  Plus,
  Radio,
  Repeat,
  Square,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '@/lib/cn'
import type { TFunction } from 'i18next'
import { inTashkent } from '@/lib/format'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm, type ConfirmOptions } from '@/components/data/useConfirm'
import { Segmented } from '@/components/ui/Segmented'
import { Textarea } from '@/components/ui/Textarea'
import { DateInput } from '@/components/ui/DateInput'
import { TimeInput } from '@/components/ui/TimeInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { useToast } from '@/components/ui/Toast'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { buildInvitation, formatMeetingId } from '@/features/zoom/invitation'
import {
  useZoomAvailability,
  useZoomConfig,
  useZoomLive,
  useZoomMeetings,
  useZoomMutations,
  type ZoomCreateBody,
  type ZoomLiveSummary,
  type ZoomMeeting,
  type ZoomRecurrence,
} from '@/features/zoom/useZoom'

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  ended: 'neutral',
}

/**
 * The red "live" mark next to a meeting's name. `is_live` is what ZOOM says
 * (webhook + per-minute poll), not the schedule — a meeting opened early or
 * straight from the Zoom client shows here too, which is exactly the case
 * that used to hit the "2 at once" licence limit invisibly.
 */
function LiveMark({ m }: { m: ZoomMeeting }) {
  const { t } = useTranslation()
  if (!m.is_live) return null
  const since = m.live_since ? inTashkent(m.live_since).format('HH:mm') : null
  const people = m.participant_count ?? 0
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger ring-1 ring-danger/30"
      title={since ? t('zoom.liveSince', { time: since }) : t('zoom.live')}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
      </span>
      {t('zoom.live')}
      {since && <span className="font-normal tabular-nums opacity-80">· {since}</span>}
      {people > 0 && (
        <span className="inline-flex items-center gap-0.5 font-normal tabular-nums opacity-80">
          · <Users size={11} /> {people}
        </span>
      )}
    </span>
  )
}

/** "Live now 1/2" — the licence seats in use, red when none is left. */
function LiveChip({ live }: { live: ZoomLiveSummary | null }) {
  const { t } = useTranslation()
  if (!live || !live.max_concurrent) return null
  const names = live.meetings.map((x) => x.topic || '—').join(', ')
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold ring-1 ' +
        (live.is_full
          ? 'bg-danger/10 text-danger ring-danger/30'
          : live.live_count > 0
            ? 'bg-success/10 text-success ring-success/30'
            : 'bg-fg/[0.05] text-fg-muted ring-line')
      }
      title={names || undefined}
    >
      <Radio size={13} />
      {t('zoom.liveNow', { count: live.live_count, limit: live.max_concurrent })}
      {live.is_full && <span className="font-normal">· {t('zoom.liveFull')}</span>}
    </span>
  )
}

/**
 * ZOOM MEETINGS — the shared calendar for the company's single licence.
 *
 * The list is deliberately COMPANY-WIDE, not "my meetings": you cannot pick a
 * free slot without seeing what is already booked. Who may act on a row comes
 * from the server (`can_manage` / `can_approve` on each item), so the buttons
 * match what the request would actually be allowed to do.
 */
const ZOOM_KEYS = ['scope', 'status'] as const
const ZOOM_FILTERS = ['status'] as const

export function ZoomPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { config, loading: configLoading } = useZoomConfig()
  const lp = useListParams(ZOOM_KEYS)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilters } = lp
  // `scope` (active/archive) is a tab, not a filter — it survives a reset.
  const { count: activeFilterCount, reset } = useFilterReset(lp, ZOOM_FILTERS)
  const scope = filters.scope || 'active'
  const { rows, total, loading, fetching } = useZoomMeetings(
    scope,
    filters.status,
    search,
    page,
    size,
  )
  const mut = useZoomMutations()
  const { live } = useZoomLive(!!config?.can_request)
  // Purging is the site master-admin's alone, exactly as v1 gates it — the
  // server answers 403 to everyone else, so the buttons must not be offered.
  const isMaster = roles.isSiteMasterAdmin(useAuthStore((s) => s.user))
  const [creating, setCreating] = useState(false)
  // The meeting just opened — shown with its invitation text to copy, the
  // way Zoom itself does after "Schedule". Only when auto-approve returned
  // a join link; a pending request has nothing to hand out yet.
  const [created, setCreated] = useState<ZoomMeeting | null>(null)
  const [rejecting, setRejecting] = useState<ZoomMeeting | null>(null)
  const [cancellingSeries, setCancellingSeries] = useState<ZoomMeeting | null>(null)
  const [purging, setPurging] = useState<ZoomMeeting | null>(null)
  const [clearingArchive, setClearingArchive] = useState(false)

  const act = async (p: Promise<unknown>, okText: string) => {
    try {
      await p
      mut.invalidate()
      toast.ok(okText)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }
  /** `act`, but asked first — the mutation is only CREATED after a yes. */
  const confirmAct = async (o: ConfirmOptions, run: () => Promise<unknown>, okText: string) => {
    if (await confirm(o)) await act(run(), okText)
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.ok(t('zoom.copied')),
      () => toast.error(t('common.actionFailed')),
    )
  }

  /**
   * «Boshlash»: one click = licence check + recording switched on (if it was
   * asked for) + host link opened. The link is single-use and expires, so it
   * is opened straight away rather than shown. The toast tells what happened
   * to the recording, because "armed" and "failed" look identical otherwise.
   */
  const startMeeting = async (m: ZoomMeeting) => {
    try {
      const r = await mut.start.mutateAsync(m.id)
      if (r?.start_url) window.open(r.start_url, '_blank', 'noopener')
      mut.invalidate()
      if (r?.recording === 'failed') {
        toast.error(t('zoom.recordingFailed', { reason: r.warning || '' }))
      } else if (r?.recording === 'armed') {
        toast.ok(t('zoom.recordingArmed'))
      } else if (r?.recording === 'started') {
        toast.ok(t('zoom.recordingStarted'))
      } else {
        toast.ok(t('zoom.startOpened'))
      }
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  if (configLoading) return <CenteredSpinner />

  if (config && !config.enabled) {
    return (
      <PageContainer>
        <PageHeader title={t('zoom.title')} subtitle={t('zoom.subtitle')} />
        <Card>
          <EmptyState icon={<Video size={20} />} title={t('zoom.disabled')} description={t('zoom.disabledHint')} />
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('zoom.title')}
        subtitle={t('zoom.subtitle')}
        actions={
          config?.can_request ? (
            <div className="flex flex-wrap items-center gap-2">
              <LiveChip live={live} />
              <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
                {config.auto_approve ? t('zoom.openMeeting') : t('zoom.request')}
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-3">
          <Segmented
            value={scope}
            // ⚠️ setFilter + setPage AYRIM chaqirilsa poyga bo'ladi: ikkinchisi
            // hali topshirilmagan params'ni o'qib, birinchisini o'chiradi — shu
            // sababli «Arxiv» tabi UMUMAN ishlamasdi. `setFilters` bittada yozadi.
            onChange={(v) => setFilters({ scope: v, page: '1' })}
            options={[
              { value: 'active', label: t('zoom.scopeActive') },
              { value: 'archive', label: t('zoom.scopeArchive') },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder={t('zoom.searchPlaceholder')} className="w-full sm:w-64" />
          <FilterReset count={activeFilterCount} onReset={reset} />
          {config && config.max_concurrent > 0 && (
            <span className="ml-auto text-xs text-fg-subtle">
              {t('zoom.concurrentHint', { count: config.max_concurrent })}
            </span>
          )}
          {/* Only on the archive tab: the endpoint erases finished, cancelled
              and rejected rows, so offering it beside the live schedule would
              read as "cancel everything". */}
          {isMaster && scope === 'archive' && rows.length > 0 && (
            <Button
              size="sm"
              variant="danger-ghost"
              className={config && config.max_concurrent > 0 ? undefined : 'ml-auto'}
              leftIcon={<Trash2 size={14} />}
              onClick={() => setClearingArchive(true)}
            >
              {t('zoom.clearArchive')}
            </Button>
          )}
        </div>

        {loading ? (
          <CenteredSpinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Video size={20} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('zoom.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('zoom.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        ) : (
          /* Bookings layout (Cal.com on Refero, 2026-09-24): meetings grouped
             under their DAY, and each row reads time → topic → actions, so the
             question «what is next and when» is answered down the left edge. */
          <ul>
            {rows.map((m, idx) => {
              const day = m.start_at ? inTashkent(m.start_at).format('YYYY-MM-DD') : ''
              const prevDay = idx > 0 && rows[idx - 1].start_at ? inTashkent(rows[idx - 1].start_at!).format('YYYY-MM-DD') : null
              const start = m.start_at ? inTashkent(m.start_at) : null
              const dayLabel = !start ? '—' : start.isSame(dayjs(), 'day') ? t('zoom.today') : start.isSame(dayjs().add(1, 'day'), 'day') ? t('zoom.tomorrow') : start.isSame(dayjs().subtract(1, 'day'), 'day') ? t('zoom.yesterday') : start.format('DD.MM.YYYY')
              return (
              <li key={m.id}>
                {day !== prevDay && (
                  <p className="border-y border-line bg-surface-2/60 px-4 py-1.5 text-[12px] font-semibold text-fg-muted first:border-t-0">
                    {dayLabel}
                    {start && <span className="ml-1.5 font-normal capitalize text-fg-subtle">{(t('date.weekdays', { returnObjects: true }) as string[])[start.day()]}</span>}
                  </p>
                )}
              <div className={cn('flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4', m.is_live && 'bg-danger-soft/40')}>
                <div className="flex shrink-0 flex-row items-baseline gap-2 sm:w-[132px] sm:flex-col sm:gap-0.5">
                  <span className="text-[16px] font-bold tabular-nums text-fg">{start ? start.format('HH:mm') : '—'}</span>
                  <span className="text-[12px] tabular-nums text-fg-subtle">
                    {m.end_at ? `— ${inTashkent(m.end_at).format('HH:mm')}` : ''}
                    {m.duration_minutes ? ` · ${m.duration_minutes} ${t('zoom.min')}` : ''}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-fg">{m.topic || '—'}</span>
                    <LiveMark m={m} />
                    {!m.is_live && (
                      <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>
                        {t(`zoom.status_${m.status}` as never)}
                      </Badge>
                    )}
                    {m.source === 'zoom' && (
                      <Badge tone="info">{t('zoom.sourceZoom')}</Badge>
                    )}
                    {m.series_id && (
                      <Badge tone="brand">
                        <Repeat size={11} className="mr-1 inline" />
                        {t('zoom.seriesBadge', { index: m.series_index ?? '?', total: m.series_total ?? '?' })}
                        {m.recurrence && ` · ${recurrenceLabel(m.recurrence, t)}`}
                      </Badge>
                    )}
                    {m.recording_mode === 'cloud' && m.status === 'approved' && (
                      <span
                        className={
                          'inline-flex items-center gap-1 text-[11px] ' +
                          (m.recording_started_at ? 'text-danger' : 'text-fg-subtle')
                        }
                        title={m.recording_started_at ? t('zoom.recordingOn') : t('zoom.recordingAfterStart')}
                      >
                        <Disc size={12} />
                        {m.recording_started_at ? t('zoom.recordingOn') : t('zoom.recordingPlanned')}
                      </span>
                    )}
                  </div>
                  {m.requested_by?.legal_name && (
                    <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                      <Avatar src={m.requested_by.photo_thumb_path} fallbackSrc={m.requested_by.photo_path} name={m.requested_by.legal_name} size={18} />
                      {t('zoom.requestedBy')}: {m.requested_by.legal_name}
                    </p>
                  )}
                  {m.started_at && m.started_by?.legal_name && (
                    <p className="text-[11px] text-fg-subtle">
                      {t('zoom.startedBy')}: {m.started_by.legal_name} · {inTashkent(m.started_at).format('DD.MM HH:mm')}
                    </p>
                  )}
                  {m.reject_reason && (
                    <p className="mt-1 text-[12px] text-danger">{m.reject_reason}</p>
                  )}
                  {m.agenda && <p className="mt-1 text-[12px] text-fg-muted">{m.agenda}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:max-w-[62%] sm:justify-end">
                  {/* Join/invite only while the meeting can still happen — the
                      archive offered «Qo'shilish» on cancelled and ended rows. */}
                  {m.join_url && !['cancelled', 'ended', 'rejected'].includes(m.status) && (
                    <>
                      <a
                        href={m.join_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-control-sm items-center gap-1.5 rounded-control bg-brand px-3 text-[12px] font-semibold text-fg-on-brand hover:bg-brand-strong"
                      >
                        <Video size={13} /> {t('zoom.join')}
                      </a>
                      {/* Copies the whole invitation (topic, time, link, id,
                          passcode), not the bare URL — that is what gets
                          forwarded to participants. */}
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Copy size={13} />}
                        title={t('zoom.copyInvitationHint')}
                        onClick={() => copy(buildInvitation(m, t))}
                      >
                        {t('zoom.copyInvitation')}
                      </Button>
                    </>
                  )}
                  {m.passcode && !['cancelled', 'ended', 'rejected'].includes(m.status) && (
                    <span className="rounded-control bg-fg/[0.06] px-2 py-1 text-[12px] tabular-nums text-fg-muted">
                      {t('zoom.passcode')}: {m.passcode}
                    </span>
                  )}
                  {m.can_approve && m.status === 'pending' && (
                    <>
                      <Button size="sm" leftIcon={<Check size={13} />} onClick={() => confirmAct({ kind: 'approve', subject: m.topic, confirmLabel: t('zoom.approve') }, () => mut.approve.mutateAsync(m.id), t('zoom.approved'))}>
                        {t('zoom.approve')}
                      </Button>
                      <Button size="sm" variant="danger" leftIcon={<X size={13} />} onClick={() => setRejecting(m)}>
                        {t('zoom.reject')}
                      </Button>
                    </>
                  )}
                  {/* The recording, once Zoom has processed it. Only
                      `can_manage` callers receive the link from the server. */}
                  {m.recording_url && (
                    <a
                      href={m.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-control-sm items-center gap-1.5 rounded-control bg-fg/[0.06] px-3 text-[12px] font-semibold text-fg hover:bg-fg/[0.1]"
                      title={m.recording_passcode ? `${t('zoom.passcode')}: ${m.recording_passcode}` : undefined}
                    >
                      <FileVideo size={13} /> {t('zoom.recordingLink')}
                      {m.recording_passcode && (
                        <span className="font-normal tabular-nums text-fg-muted">· {m.recording_passcode}</span>
                      )}
                    </a>
                  )}
                  {/* «Boshlash» — the HOST action, and only for `can_manage`
                      rows: the server mints a password-less host URL, so
                      anyone holding it can take the meeting over. It is also
                      the ONLY moment a requested recording is switched on;
                      a meeting merely opened via the join link is not
                      recorded. We read the server's flag instead of guessing
                      from `requested_by`, which would also miss the AKT
                      approver who legitimately hosts. */}
                  {m.can_manage && m.status === 'approved' && (
                    <Button
                      size="sm"
                      leftIcon={<PlayCircle size={13} />}
                      loading={mut.start.isPending && mut.start.variables === m.id}
                      onClick={() => startMeeting(m)}
                      title={m.recording_mode === 'cloud' ? t('zoom.startHintRecord') : t('zoom.startHint')}
                    >
                      {m.is_live ? t('zoom.joinAsHost') : t('zoom.start')}
                    </Button>
                  )}
                  {/* Recording controls for a LIVE meeting (in-meeting
                      controls at Zoom). Hidden until live: Zoom refuses them
                      otherwise, and the pre-start case is «Boshlash». */}
                  {m.can_manage && m.status === 'approved' && m.is_live && (
                    m.recording_started_at ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Square size={12} />}
                        onClick={() =>
                          confirmAct(
                            { kind: 'action', subject: m.topic, confirmLabel: t('zoom.stopRecording') },
                            () => mut.recording.mutateAsync({ id: m.id, action: 'stop' }),
                            t('zoom.recordingStopped'),
                          )
                        }
                      >
                        {t('zoom.stopRecording')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Circle size={12} className="text-danger" />}
                        onClick={() =>
                          confirmAct(
                            { kind: 'action', subject: m.topic, confirmLabel: t('zoom.startRecording') },
                            () => mut.recording.mutateAsync({ id: m.id, action: 'start' }),
                            t('zoom.recordingStarted'),
                          )
                        }
                      >
                        {t('zoom.startRecording')}
                      </Button>
                    )
                  )}
                  {m.can_manage && m.status === 'approved' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<KeyRound size={13} />}
                      onClick={() =>
                        confirmAct(
                          { kind: 'action', subject: m.topic, confirmLabel: t('zoom.hostKey') },
                          () =>
                            mut.hostKey.mutateAsync(m.id).then((r) => {
                              if (r?.host_key) copy(r.host_key)
                            }),
                          t('zoom.hostKeyIssued'),
                        )
                      }
                    >
                      {t('zoom.hostKey')}
                    </Button>
                  )}
                  {m.can_manage && m.status !== 'cancelled' && m.status !== 'rejected' && m.status !== 'ended' && (
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      title={m.series_id ? t('zoom.cancelThisDayHint') : undefined}
                      onClick={() =>
                        confirmAct(
                          {
                            kind: 'status',
                            subject: m.topic,
                            confirmLabel: m.is_live || m.is_started ? t('zoom.finish') : m.series_id ? t('zoom.cancelThisDay') : t('common.cancel'),
                          },
                          () => mut.cancel.mutateAsync(m.id),
                          t('zoom.cancelled'),
                        )
                      }
                    >
                      {m.is_live || m.is_started ? t('zoom.finish') : m.series_id ? t('zoom.cancelThisDay') : t('common.cancel')}
                    </Button>
                  )}
                  {/* A series: the Zoom meeting (and link) survives a single
                      day's cancel; this is the one that deletes it. */}
                  {m.can_manage && m.series_id && m.status === 'approved' && (
                    <Button size="sm" variant="danger-ghost" leftIcon={<Repeat size={12} />} onClick={() => setCancellingSeries(m)}>
                      {t('zoom.cancelSeries')}
                    </Button>
                  )}
                  {/* Cancelling KEEPS the row for the audit trail; this removes
                      it from the database, which is why it lives on the archive
                      tab only and behind the master-admin flag. */}
                  {isMaster && scope === 'archive' && (
                    <IconButton size="sm" label={t('zoom.purge')} onClick={() => setPurging(m)}>
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </div>
              </div>
              </li>
              )
            })}
          </ul>
        )}

        <Pagination page={page} size={size} total={total} pages={Math.max(1, Math.ceil(total / size))} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <CreateMeetingModal
        open={creating}
        autoApprove={!!config?.auto_approve}
        onClose={() => setCreating(false)}
        onSubmit={async (body) => {
          try {
            const m = await mut.create.mutateAsync(body)
            mut.invalidate()
            toast.ok(config?.auto_approve ? t('zoom.opened') : t('zoom.requested'))
            setCreating(false)
            if (m?.join_url) {
              setCreated(m)
              // Straight into the clipboard as well — most people paste it
              // into a chat right away; the dialog is there for the rest.
              copy(buildInvitation(m, t))
            }
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        saving={mut.create.isPending}
      />

      <InvitationModal meeting={created} onClose={() => setCreated(null)} onCopy={copy} />

      <ConfirmDialog
        open={!!purging}
        danger
        title={t('zoom.purgeTitle')}
        description={t('zoom.purgeConfirm', { topic: purging?.topic ?? '' })}
        confirmLabel={t('common.delete')}
        loading={mut.purge.isPending}
        onClose={() => setPurging(null)}
        onConfirm={async () => {
          if (!purging) return
          await act(mut.purge.mutateAsync(purging.id), t('zoom.purged'))
          setPurging(null)
        }}
      />

      <ConfirmDialog
        open={!!cancellingSeries}
        danger
        title={t('zoom.cancelSeriesTitle')}
        description={t('zoom.cancelSeriesConfirm', {
          topic: cancellingSeries?.topic ?? '',
          total: cancellingSeries?.series_total ?? '',
        })}
        confirmLabel={t('zoom.cancelSeries')}
        loading={mut.cancelSeries.isPending}
        onClose={() => setCancellingSeries(null)}
        onConfirm={async () => {
          if (!cancellingSeries) return
          await act(mut.cancelSeries.mutateAsync(cancellingSeries.id), t('zoom.seriesCancelled'))
          setCancellingSeries(null)
        }}
      />

      <ConfirmDialog
        open={clearingArchive}
        danger
        title={t('zoom.clearArchiveTitle')}
        description={t('zoom.clearArchiveConfirm')}
        confirmLabel={t('zoom.clearArchive')}
        loading={mut.purgeArchive.isPending}
        onClose={() => setClearingArchive(false)}
        onConfirm={async () => {
          try {
            const res = await mut.purgeArchive.mutateAsync()
            mut.invalidate()
            toast.ok(t('zoom.archiveCleared', { count: res?.deleted ?? 0 }))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
          setClearingArchive(false)
        }}
      />

      <RejectModal
        meeting={rejecting}
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          if (!rejecting) return
          await act(mut.reject.mutateAsync({ id: rejecting.id, reason }), t('zoom.rejected'))
          setRejecting(null)
        }}
      />
    </PageContainer>
  )
}


/**
 * "Opened — here is what to send": the invitation text with a copy button,
 * shown once right after the meeting is created (the same block the list's
 * copy button produces later).
 */
function InvitationModal({
  meeting,
  onClose,
  onCopy,
}: {
  meeting: ZoomMeeting | null
  onClose: () => void
  onCopy: (text: string) => void
}) {
  const { t } = useTranslation()
  const text = meeting ? buildInvitation(meeting, t) : ''
  return (
    <Modal
      open={!!meeting}
      onClose={onClose}
      title={t('zoom.createdTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button leftIcon={<Copy size={14} />} onClick={() => onCopy(text)}>
            {t('zoom.copyInvitation')}
          </Button>
        </>
      }
    >
      {meeting && (
        <div className="flex flex-col gap-3">
          <div className="rounded-control bg-success/10 px-3 py-2 text-[12px] text-fg ring-1 ring-success/30">
            <div className="font-semibold">{meeting.topic}</div>
            <div className="mt-0.5 tabular-nums text-fg-muted">
              {t('zoom.invId')}: {formatMeetingId(meeting.zoom_meeting_id)}
              {meeting.passcode ? ` · ${t('zoom.invPasscode')}: ${meeting.passcode}` : ''}
            </div>
          </div>
          <Field label={t('zoom.invitationText')} wide>
            <Textarea rows={9} readOnly value={text} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12px]" />
          </Field>
          <p className="text-[11px] text-fg-subtle">{t('zoom.copyInvitationHint')}</p>
        </div>
      )}
    </Modal>
  )
}

/** "har kuni" / "har 2 haftada (Du, Chor)" for the row badge. */
function recurrenceLabel(rec: NonNullable<ZoomMeeting['recurrence']>, t: TFunction): string {
  const r = rec as Partial<ZoomRecurrence>
  const n = r.interval && r.interval > 1 ? r.interval : null
  if (r.type === 'daily') return n ? t('zoom.everyNDays', { n }) : t('zoom.repeatDaily')
  if (r.type === 'weekly') {
    const days = (r.weekdays || []).map((d) => t(`zoom.wd${d}` as never)).join(', ')
    const base = n ? t('zoom.everyNWeeks', { n }) : t('zoom.repeatWeekly')
    return days ? `${base} (${days})` : base
  }
  return n ? t('zoom.everyNMonths', { n }) : t('zoom.repeatMonthly')
}

/**
 * Preview of the days a rule produces — the SAME rule the server applies
 * (`ZoomMeetingService.expand_recurrence`): daily/monthly step from the
 * start; weekly walks the chosen weekdays (start day always included) one
 * week block at a time. Preview only; the server is the authority.
 */
function expandRecurrence(startLocal: string, rec: ZoomRecurrence): string[] {
  const start = dayjs(startLocal)
  if (!start.isValid() || rec.count < 2) return []
  const count = Math.min(rec.count, 50)
  const step = Math.max(rec.interval || 1, 1)
  const out: dayjs.Dayjs[] = [start]
  if (rec.type === 'daily') {
    while (out.length < count) out.push(out[out.length - 1].add(step, 'day'))
  } else if (rec.type === 'weekly') {
    const days = new Set(rec.weekdays)
    days.add(((start.day() + 6) % 7) + 1)
    const monday = start.subtract(((start.day() + 6) % 7), 'day')
    let week = 0
    while (out.length < count && week < 400) {
      const base = monday.add(week * step, 'week')
      for (const d of [...days].sort()) {
        const cand = base.add(d - 1, 'day')
        if (cand.isAfter(start) && out.length < count) out.push(cand)
      }
      week += 1
    }
  } else {
    let i = 0
    while (out.length < count && i < 720) {
      i += step
      const cand = start.add(i, 'month')
      if (cand.date() === start.date()) out.push(cand)
    }
  }
  return out.map((d) => d.format('YYYY-MM-DDTHH:mm:ss'))
}

/** Hour options 0-24 and the minute steps a meeting is actually booked at. */
const DUR_HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: String(h) }))
const DUR_MINUTES = [0, 10, 15, 30, 45].map((m) => ({ value: String(m), label: String(m) }))

/**
 * Meeting length as "H soat M daqiqa".
 *
 * The server still receives `duration_minutes`; this only changes how the
 * number is CHOSEN. Zero-length is meaningless — the meeting closes itself when
 * the time is up — so the total is clamped to 10 minutes at the bottom and
 * 24 hours at the top, exactly the range the form validated before.
 */
function DurationPicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const { t } = useTranslation()
  const total = Number.isFinite(value) && value > 0 ? value : 60
  const h = Math.floor(total / 60)
  const m = total % 60

  const setHM = (nh: number, nm: number) => onChange(Math.min(Math.max(nh * 60 + nm, 10), 24 * 60))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={String(h)}
        onChange={(e) => setHM(Number(e.target.value), m)}
        options={DUR_HOURS}
        aria-label={t('zoom.durationHours')}
        wrapperClassName="w-[86px]"
      />
      <span className="text-[13px] text-fg-muted">{t('zoom.durationHours')}</span>
      <Select
        value={String(m)}
        onChange={(e) => setHM(h, Number(e.target.value))}
        options={DUR_MINUTES}
        aria-label={t('zoom.durationMinutes')}
        wrapperClassName="w-[86px]"
      />
      <span className="text-[13px] text-fg-muted">{t('zoom.durationMinutes')}</span>
    </div>
  )
}


function CreateMeetingModal({
  open,
  autoApprove,
  onClose,
  onSubmit,
  saving,
}: {
  open: boolean
  autoApprove: boolean
  onClose: () => void
  onSubmit: (body: ZoomCreateBody) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const [topic, setTopic] = useState('')
  // Recurrence: 'none' or the rule. Weekly always includes the start day
  // (the server adds it too), so the preview and Zoom agree.
  const [repeat, setRepeat] = useState<'none' | ZoomRecurrence['type']>('none')
  const [interval, setInterval] = useState('1')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [count, setCount] = useState('10')
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('60')
  const [agenda, setAgenda] = useState('')
  const [record, setRecord] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')

  // The server reads a naive datetime as Tashkent time — the same string the
  // user typed goes to the probe and, later, to the create call, so the two can
  // never disagree about which slot was checked.
  const mins = Number(duration)
  const startAt = date && time ? `${date}T${time}:00` : null
  // Debounced because the number and time inputs change on every keystroke;
  // without it a typed "60" fires three availability requests.
  const probeStart = useDebounce(startAt, 350)
  const probeMins = useDebounce(mins, 350)
  const { availability } = useZoomAvailability(probeStart, probeMins, open)
  // Only trust the verdict that belongs to the slot currently in the form:
  // while the debounce settles, the answer on screen is about the OLD slot and
  // must not grey out the button for the new one.
  const verdict = probeStart === startAt && probeMins === mins ? availability : null

  const recurrence: ZoomRecurrence | null =
    repeat === 'none'
      ? null
      : { type: repeat, interval: Math.min(Math.max(Number(interval) || 1, 1), 12), weekdays, count: Number(count) || 0 }
  const startWeekday = date ? ((dayjs(date).day() + 6) % 7) + 1 : null // ISO 1..7
  const previewDates = recurrence && startAt ? expandRecurrence(startAt, recurrence) : []

  const submit = () => {
    if (topic.trim().length < 2) return setError(t('zoom.topicRequired'))
    if (!mins || mins < 5 || mins > 1440) return setError(t('zoom.durationRange'))
    if (recurrence && (recurrence.count < 2 || recurrence.count > 50)) return setError(t('zoom.repeatCountRange'))
    onSubmit({
      topic: topic.trim(),
      start_at: startAt,
      duration_minutes: mins,
      agenda: agenda.trim() || null,
      record,
      waiting_room: waiting,
      join_before_host: true,
      recurrence,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={autoApprove ? t('zoom.openMeeting') : t('zoom.request')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          {/* Blocked rather than left to fail: the licence limit is the
              server's to enforce and it answers 409, which the user could only
              read as a broken form. */}
          <Button onClick={submit} loading={saving} disabled={verdict?.is_free === false}>
            {autoApprove ? t('zoom.openMeeting') : t('zoom.send')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('zoom.fieldTopic')} required wide>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
        </Field>
        <Field label={t('zoom.fieldDate')} required>
          <DateInput value={date} onChange={setDate} aria-label={t('zoom.fieldDate')} />
        </Field>
        <Field label={t('zoom.fieldTime')} required>
          <TimeInput value={time} onChange={setTime} aria-label={t('zoom.fieldTime')} />
        </Field>
        <Field label={t('zoom.fieldDuration')} required hint={t('zoom.durationHint')}>
          {/* Hours + minutes, the way Zoom itself asks and the way v1 asked —
              a bare minutes box made "two hours" a mental arithmetic problem
              and let a typo send 600 minutes. The pair still resolves to
              `duration_minutes`, so nothing downstream changes. */}
          <DurationPicker value={mins} onChange={(v) => setDuration(String(v))} />
        </Field>
        {/* Recurrence — the same choices Zoom's own "Recurring meeting" offers.
            One meeting (one link) at Zoom; one row per day in the calendar,
            each checked against the licence, so a busy day is named up front. */}
        <Field label={t('zoom.repeat')} wide>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as typeof repeat)}
              options={[
                { value: 'none', label: t('zoom.repeatNone') },
                { value: 'daily', label: t('zoom.repeatDaily') },
                { value: 'weekly', label: t('zoom.repeatWeekly') },
                { value: 'monthly', label: t('zoom.repeatMonthly') },
              ]}
              wrapperClassName="w-[160px]"
              aria-label={t('zoom.repeat')}
            />
            {repeat !== 'none' && (
              <>
                <span className="text-[13px] text-fg-muted">{t('zoom.repeatEvery')}</span>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-[72px]"
                  aria-label={t('zoom.repeatInterval')}
                />
                <span className="text-[13px] text-fg-muted">
                  {repeat === 'daily' ? t('zoom.unitDay') : repeat === 'weekly' ? t('zoom.unitWeek') : t('zoom.unitMonth')}
                  {' · '}
                  {t('zoom.repeatTimes')}
                </span>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="w-[72px]"
                  aria-label={t('zoom.repeatCount')}
                />
              </>
            )}
          </div>
          {repeat === 'weekly' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const fixed = d === startWeekday
                const on = fixed || weekdays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={fixed}
                    title={fixed ? t('zoom.weekdayStartFixed') : undefined}
                    onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                    className={
                      'h-8 rounded-pill px-3 text-[12px] font-semibold ring-1 transition-colors ' +
                      (on ? 'bg-brand text-fg-on-brand ring-brand' : 'bg-transparent text-fg-muted ring-line hover:bg-surface-2')
                    }
                  >
                    {t(`zoom.wd${d}` as never)}
                  </button>
                )
              })}
            </div>
          )}
          {previewDates.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-fg-subtle">
              {t('zoom.repeatPreview', { count: previewDates.length })}:{' '}
              {previewDates.slice(0, 6).map((d) => dayjs(d).format('DD.MM')).join(', ')}
              {previewDates.length > 6 ? ` … ${dayjs(previewDates[previewDates.length - 1]).format('DD.MM.YYYY')}` : ''}
            </p>
          )}
        </Field>
        <Field label={t('zoom.fieldAgenda')} wide>
          <Textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2.5">
          <Checkbox checked={record} onChange={(e) => setRecord(e.target.checked)} srLabel={t('zoom.record')} />
          <span className="flex flex-col">
            <span className="text-[13px] text-fg">{t('zoom.record')}</span>
            {/* The rule the server enforces: a ticked box does NOT record on
                its own; the recording begins only when «Boshlash» is pressed. */}
            <span className="text-[11px] leading-snug text-fg-subtle">{t('zoom.recordingAfterStart')}</span>
          </span>
        </label>
        <label className="flex items-center gap-2.5">
          <Checkbox checked={waiting} onChange={(e) => setWaiting(e.target.checked)} srLabel={t('zoom.waitingRoom')} />
          <span className="text-[13px] text-fg">{t('zoom.waitingRoom')}</span>
        </label>
      </div>
      {/* Busy/free is decided by the server (the limit lives in its
          environment); the form only renders the verdict. */}
      {verdict && (
        <div
          className={
            verdict.is_free
              ? 'mt-3 flex flex-col gap-1.5 rounded-card border border-success/30 bg-success-soft p-3'
              : 'mt-3 flex flex-col gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-3'
          }
        >
          <span
            className={
              verdict.is_free
                ? 'inline-flex items-center gap-1.5 text-[12px] font-medium text-success'
                : 'inline-flex items-center gap-1.5 text-[12px] font-medium text-danger'
            }
          >
            {verdict.is_free ? <Check size={13} /> : <AlertTriangle size={13} />}
            {verdict.is_free
              ? t('zoom.slotFree', {
                  busy: verdict.overlapping_count,
                  limit: verdict.max_concurrent,
                })
              : t('zoom.slotBusy', {
                  busy: verdict.overlapping_count,
                  limit: verdict.max_concurrent,
                })}
          </span>

          {!verdict.is_free && verdict.next_free_at && (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-fg">
              <CalendarClock size={13} className="text-warning" />
              {t('zoom.nextFree')}:{' '}
              <button
                type="button"
                className="rounded-control text-brand-strong underline underline-offset-2 hover:text-brand"
                onClick={() => {
                  // One click moves the form to the first bookable moment —
                  // otherwise the user hunts for it by trial and error.
                  const slot = inTashkent(verdict.next_free_at!)
                  setDate(slot.format('YYYY-MM-DD'))
                  setTime(slot.format('HH:mm'))
                }}
              >
                {inTashkent(verdict.next_free_at).format('DD.MM.YYYY HH:mm')}
              </button>
            </span>
          )}

          {verdict.meetings.length > 0 && (
            <div className="flex flex-col gap-0.5 border-t border-line pt-1.5">
              <span className="text-[11px] text-fg-subtle">{t('zoom.daySchedule')}</span>
              {verdict.meetings.map((slot) => (
                <span key={slot.id} className="text-[11px] tabular-nums text-fg-muted">
                  {slot.start_at ? inTashkent(slot.start_at).format('HH:mm') : '—'}
                  {slot.end_at ? `–${inTashkent(slot.end_at).format('HH:mm')}` : ''} · {slot.topic || '—'}
                  {slot.requested_by ? ` (${slot.requested_by})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}

function RejectModal({
  meeting,
  onClose,
  onSubmit,
}: {
  meeting: ZoomMeeting | null
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={!!meeting}
      onClose={onClose}
      title={t('zoom.reject')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => onSubmit(reason.trim())} disabled={!reason.trim()}>
            {t('zoom.reject')}
          </Button>
        </>
      }
    >
      <Field label={t('zoom.rejectReason')} required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Modal>
  )
}
