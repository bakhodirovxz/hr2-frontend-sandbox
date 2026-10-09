import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '@/lib/cn'
import { control } from '@/components/ui/control'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { TURNSTILE_NORMALIZED_EXPORT } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { latenessMinutes } from '@/features/monitoring/useMonitoring'
import { formatTime, getDisplayStatus } from '@/features/dashboard/attendance'
import type { AttendanceRow, TurnstileEvent } from '@/types/dashboard'
import type { TFunction } from 'i18next'
import { formatDistance, type EventMobileCheckin } from '@/features/mobileCheckins/useMobileCheckins'
import { Eyebrow, Panel, PanelEmpty } from './Panel'
import { ListRow, PersonCell, RowList, ToneText, type RowTone } from './rows'
import { PassDetailModal } from './PassDetailModal'

/** Rows drawn per step while the feed is scrolled. */
const FEED_PAGE = 80

type FeedTab = 'passes' | 'late' | 'absent' | 'other'

const TABS: FeedTab[] = ['passes', 'late', 'absent', 'other']

interface FeedItem {
  key: string
  name: string
  sub: string
  time: string
  note: string
  tone: RowTone
  photo?: string | null
  photoFull?: string | null
  live?: boolean
  /** The pass behind the row — opens «Batafsil» (gate, time, map), as in v1. */
  pass?: AttendanceRow | null
}

/** «Telefon · Uzoq: 56 km · GES-28» — the second line of a phone pass. The
 *  distance goes before the place: the line is truncated, and the distance is
 *  what tells HR whether to look closer. */
function mobileSub(m: EventMobileCheckin, t: TFunction): string {
  const dist = formatDistance(m.distance_m)
  return [
    t('mobileCheckins.viaPhone'),
    dist ? (m.is_far ? t('mobileCheckins.far', { distance: dist }) : dist) : null,
    m.nearest_location?.name ?? m.destination_branch?.name,
  ].filter(Boolean).join(' · ')
}

function deptName(row: { employee?: { department?: unknown } | null }): string {
  const d = row.employee?.department
  return typeof d === 'object' && d ? ((d as { name?: string }).name ?? '') : ''
}

/**
 * JONLI TASHRIF — the register beside the turnstile.
 *
 * This is the left margin of the HR board and the only block on it that is
 * about the minute rather than the day: who just walked through, and — through
 * the four tabs — the questions that follow from it (who was late, who never
 * came, who is accounted for by a document) — v1 sandbox «Keldi-Ketdi / Kech
 * qolganlar / Kelmaganlar / Boshqa». The two counters above it are the raw pass tallies; they are the
 * only numbers here that are not per-person.
 *
 * Anything that passed the gate in the last ten minutes carries a green pulse,
 * because at 09:05 the difference between "arrived" and "arriving" is the
 * whole point of watching this column.
 *
 * ── 2026-08-28, the light design's rework of this header ──────────────────
 * The five tabs became a DROPDOWN, and the room they freed went to two things
 * the column could not do before: pick a DAY, and take the day away as a
 * workbook.
 *
 * ⚠️ A PAST DAY ONLY ANSWERS ONE OF THE FOUR QUESTIONS. Passes are events and
 * carry their own timestamp, so they can be asked of any date. Late
 * / absent / accounted-for are derived from `employees-by-category`, which has
 * no date parameter — it answers for TODAY and nothing else. Rather than show
 * today's late list under yesterday's date, those three are dropped from the
 * picker while a past day is selected.
 */
export function LiveFeed({
  rows,
  events,
  entries,
  exits,
  loading,
  className,
  dayOffset = 0,
  onDayOffset,
}: {
  rows: AttendanceRow[]
  events: TurnstileEvent[]
  entries: number
  exits: number
  loading?: boolean
  className?: string
  /** 0 = bugun, 1 = kecha … Kun tanlagichi shuni suradi. */
  dayOffset?: number
  onDayOffset?: (next: number) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [tab, setTab] = useState<FeedTab>('passes')
  const [q, setQ] = useState('')
  const [pass, setPass] = useState<AttendanceRow | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen)

  const past = dayOffset > 0
  const day = dayjs().subtract(dayOffset, 'day')
  const dayIso = day.format('YYYY-MM-DD')
  // O'tgan kunda faqat HODISAGA tayanadigan tablar javob bera oladi.
  const available = past ? (['passes'] as FeedTab[]) : TABS
  // ⚠️ Kun orqaga surilganda javobsiz tab tanlangan bo'lishi mumkin. Uni
  // RENDER paytida `setTab` bilan tuzatib bo'lmaydi (React buni taqiqlaydi va
  // cheksiz qayta chizishga olib kelardi) — shuning uchun ko'rinadigan tab
  // hisoblab olinadi, holat esa kun qaytganda o'z holicha tiklanadi.
  const activeTab: FeedTab = past && !available.includes(tab) ? 'passes' : tab

  const exportDay = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: TURNSTILE_NORMALIZED_EXPORT,
        filename: `davomat-${dayIso}.xlsx`,
        params: {
          date_from: dayIso,
          date_to: dayIso,
          organization_branch_id: branchId || undefined,
        },
        mime: XLSX_MIME,
      })
      toast.ok(t('dashboard.board.feedExported'))
    } catch (e) {
      toast.error(errorMessage(e, t('dashboard.board.feedExportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const items = useMemo<FeedItem[]>(() => {
    const fresh = (iso?: string | null) => !!iso && dayjs().diff(dayjs(iso), 'minute') <= 10

    if (activeTab === 'passes') {
      return events.map((e, i) => {
        const entry = e.direction_type === 'entrance' || e.check_in_out_type === 1
        return {
          key: String(e.id ?? `${e.employee_id}-${e.happen_time}-${i}`),
          name: e.employee?.legal_name || t('common.unknown'),
          // Telefon belgisi: qayerdan qo'yilgani o'sha qatorda ko'rinsin —
          // manzildan uzoq bo'lsa qizil (kadr bosib tafsilotda bekor qiladi).
          sub: e.mobile_checkin
            ? mobileSub(e.mobile_checkin, t)
            : deptName(e) || e.turnstile?.acs_dev_name || e.turnstile_name || '',
          time: formatTime(e.happen_time),
          note: entry ? t('dashboard.passIn') : t('dashboard.passOut'),
          tone: e.mobile_checkin?.is_far ? 'danger' : entry ? 'success' : 'neutral',
          // The face the reader saw at THIS pass (its 160px copy, else the
          // full snapshot); the profile photo when the camera sent nothing or
          // the snapshot will not load (Avatar falls through on error).
          photo: e.photo_thumb_path || e.photo_path || e.employee?.photo_thumb_path,
          photoFull: e.employee?.photo_thumb_path || e.employee?.photo_path,
          live: fresh(e.happen_time),
          pass: e.employee
            ? ({
                id: Number(e.id ?? i),
                employee: e.employee,
                turnstile: e.turnstile_name ?? null,
                entry: entry ? e : null,
                exit: entry ? null : e,
                hasExited: !entry,
                category: 'present',
              } as unknown as AttendanceRow)
            : null,
        }
      })
    }


    const pick = (r: AttendanceRow) =>
      activeTab === 'late'
        ? r.category === 'late'
        : activeTab === 'absent'
          ? r.category === 'absent'
          : r.category !== 'late' && r.category !== 'absent' && r.category !== 'present'

    return rows.filter(pick).map((r) => {
      const status = getDisplayStatus(r)
      const mins = activeTab === 'late' ? latenessMinutes({ ...r.entry, is_first_entrance: true }) : null
      return {
        key: String(r.id),
        name: r.employee.legal_name || t('common.unknown'),
        sub: deptName(r),
        time: activeTab === 'late' ? formatTime(r.entry?.happen_time) : '—:—',
        note:
          mins != null
            ? t('dashboard.board.lateBy', { count: mins })
            : t(`status.${status.key}` as never),
        tone: activeTab === 'late' ? 'warning' : activeTab === 'absent' ? 'danger' : 'brand',
        photo: r.entry?.photo_thumb_path || r.entry?.photo_path || r.employee.photo_thumb_path,
        photoFull: r.employee.photo_thumb_path || r.employee.photo_path,
        // An absent person has no pass to show.
        pass: r.entry || r.exit ? r : null,
      }
    })
  }, [activeTab, events, rows, t])

  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items

  /* The whole day is in memory (search covers every pass), but a morning of
     a large branch is a thousand rows with a photo each — they are drawn in
     pages as the list is scrolled, not all at once. */
  const [limit, setLimit] = useState(FEED_PAGE)
  useEffect(() => setLimit(FEED_PAGE), [activeTab, needle, dayOffset])
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = limit < shown.length
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLimit((n) => n + FEED_PAGE)
      },
      { rootMargin: '240px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, limit])

  return (
    <Panel className={className} label={t('dashboard.board.feedTitle')} data-tour="feed">
      <div className="flex shrink-0 flex-col gap-2.5 px-3.5 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <Eyebrow>{t('dashboard.board.feedTitle')}</Eyebrow>
          {/* Halol belgi: lenta so'rov bilan yangilanadi (WebSocket TZ'da yo'q). */}
          <span className="text-[11px] text-fg-subtle">{t('dashboard.board.autoRefresh')}</span>
        </div>

        <div className="flex gap-2" data-tour="feed-tabs">
          <Counter
            icon={<ArrowDownLeft size={15} />}
            label={t('dashboard.entriesToday')}
            value={entries}
            tone="success"
          />
          <Counter
            icon={<ArrowUpRight size={15} />}
            label={t('dashboard.exitsToday')}
            value={exits}
            tone="brand"
          />
        </div>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('dashboard.searchEmployee')}
            aria-label={t('dashboard.searchEmployee')}
            className={cn(control({ size: 'sm' }), 'w-full pl-8 pr-3')}
          />
        </div>

        <div className="flex items-stretch gap-1.5">
          <div ref={pickerRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              className="flex h-8 w-full items-center justify-between gap-2 truncate rounded-tag bg-brand/[0.10] px-3 text-[11.5px] font-semibold text-brand-strong transition-colors hover:bg-brand/[0.16]"
            >
              {t(`dashboard.board.tab_${activeTab}` as never)}
              <ChevronDown size={12} className="shrink-0" />
            </button>
            {pickerOpen && (
              <div
                role="listbox"
                data-lv-surface
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 flex flex-col gap-0.5 rounded-control border border-line bg-elevated p-1 shadow-pop"
              >
                {available.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="option"
                    aria-selected={activeTab === v}
                    onClick={() => {
                      setTab(v)
                      setPickerOpen(false)
                    }}
                    className={cn(
                      'rounded-tag px-2.5 py-2 text-left text-[12px] font-medium transition-colors',
                      activeTab === v
                        ? 'bg-brand text-fg-on-brand'
                        : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {t(`dashboard.board.tab_${v}` as never)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Kun tanlagichi. Oldinga BUGUNDAN nariga o'tib bo'lmaydi — kelajak
              kunda turniket yozuvi bo'lishi mumkin emas. */}
          <div className="flex shrink-0 items-center gap-px rounded-tag bg-fg/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => onDayOffset?.(dayOffset + 1)}
              disabled={!onDayOffset}
              title={t('dashboard.board.prevDay')}
              aria-label={t('dashboard.board.prevDay')}
              className="grid h-7 w-[26px] place-items-center rounded-tag text-fg transition-colors hover:bg-fg/[0.08] disabled:opacity-40"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="min-w-[52px] text-center text-[11px] font-semibold text-fg [font-variant-numeric:tabular-nums]">
              {dayOffset === 0 ? t('dashboard.board.today') : day.format('DD.MM')}
            </span>
            <button
              type="button"
              onClick={() => onDayOffset?.(Math.max(0, dayOffset - 1))}
              disabled={!onDayOffset || dayOffset === 0}
              title={t('dashboard.board.nextDay')}
              aria-label={t('dashboard.board.nextDay')}
              className="grid h-7 w-[26px] place-items-center rounded-tag text-fg transition-colors hover:bg-fg/[0.08] disabled:opacity-40"
            >
              <ChevronRight size={12} />
            </button>
          </div>

          <button
            type="button"
            onClick={exportDay}
            disabled={exporting}
            title={t('dashboard.board.feedExport')}
            aria-label={t('dashboard.board.feedExport')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-tag bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.10] disabled:opacity-50"
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      <div className="h-px shrink-0 bg-line" />

      {shown.length === 0 ? (
        <PanelEmpty text={loading ? t('common.loading') : t('dashboard.board.feedEmpty')} />
      ) : (
        <RowList className="gap-1 pt-2">
          {shown.slice(0, limit).map((i) => (
            <ListRow key={i.key} onClick={i.pass ? () => setPass(i.pass ?? null) : undefined}>
              <PersonCell
                name={i.name}
                sub={i.sub}
                photo={i.photo}
                photoFull={i.photoFull}
                live={i.live}
              />
              <span className="flex shrink-0 flex-col items-end leading-tight">
                <span className="text-[12px] text-fg-muted [font-variant-numeric:tabular-nums]">
                  {i.time}
                </span>
                <ToneText tone={i.tone} className="text-[10px] font-semibold">
                  {i.note}
                </ToneText>
              </span>
            </ListRow>
          ))}
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-6 shrink-0" />}
        </RowList>
      )}
      <PassDetailModal row={pass} onClose={() => setPass(null)} />
    </Panel>
  )
}

function Counter({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'success' | 'brand'
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center gap-2.5 rounded-control px-2.5 py-2',
        tone === 'success' ? 'bg-success/[0.09]' : 'bg-brand/[0.09]',
      )}
    >
      <span
        className={cn(
          'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-tag',
          tone === 'success' ? 'bg-success/[0.16] text-success' : 'bg-brand/[0.16] text-brand-strong',
        )}
      >
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11.5px] font-semibold text-fg-muted">{label}</span>
        <span
          className={cn(
            'text-[19px] font-bold [font-variant-numeric:tabular-nums]',
            tone === 'success' ? 'text-success' : 'text-fg',
          )}
        >
          {value}
        </span>
      </span>
    </div>
  )
}
