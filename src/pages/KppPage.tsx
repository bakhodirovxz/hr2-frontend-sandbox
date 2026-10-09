import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ArrowDownLeft, ArrowUpRight, DoorOpen, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { PageContainer } from '@/components/layout/Page'
import { SearchInput } from '@/components/data/SearchInput'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/cn'
import { formatAppDate, inTashkent } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { WS_STATUS, liveEventBranchIds, useAttendanceSocket, type LiveEvent } from '@/features/monitoring/useAttendanceSocket'
import { useCurrentDay, useKppVisitors, useVisitorEvents, type VisitorEvent } from '@/features/kpp/useKpp'

/**
 * KPP POSTI — nazoratchi ekrani.
 *
 * v2 da bu ekran umuman yo'q edi: KPP roli oddiy xodim doskasiga tushardi va
 * u yerda hech narsa ko'rmasdi (doska xodim yozuvidan quriladi, KPP esa
 * mehmonlar bilan ishlaydi).
 *
 * Ikki ustun: chapda postga biriktirilgan mehmonlar, o'ngda BUGUNGI
 * o'tishlar. Hech qanday CRUD yo'q — bu kiosk, ish joyi emas.
 */
export function KppPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const [selected, setSelected] = useState<{ id: number; legal_name?: string | null } | null>(null)
  // v1 parity (2026-09-26): the post's list by DAY and by BRANCH.
  const [visit, setVisit] = useState<'' | 'today' | 'yesterday' | 'never'>('')
  const [branchId, setBranchId] = useState('')

  const today = useCurrentDay()
  const { visitors, loading, refetch } = useKppVisitors(debounced, visit, branchId ? Number(branchId) : null)
  const { events, loading: eventsLoading } = useVisitorEvents(today, selected?.id ?? null)

  /** Bu postga biriktirilgan filiallar — begona o'tish lentaga tushmasin. */
  const linkedBranches = useMemo(() => user?.employee?.organization_branches ?? [], [user])
  const linkedBranchIds = useMemo(() => linkedBranches.map((b) => Number(b.id)), [linkedBranches])

  /** v1: the list grouped by the day of the last visit (else the day the
   *  guest was added), newest day first; never-visited guests last. */
  const grouped = useMemo(() => {
    const NONE = 'none'
    const map = new Map<string, typeof visitors>()
    for (const g of visitors) {
      const d = g.last_visit_time || g.created_at
      const key = d ? inTashkent(d).format('YYYY-MM-DD') : NONE
      map.set(key, [...(map.get(key) ?? []), g])
    }
    return [...map.entries()].sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : b.localeCompare(a)))
  }, [visitors])
  const dayLabel = (key: string) => {
    if (key === 'none') return t('kpp.noVisit')
    const d = dayjs(key)
    if (d.isSame(dayjs(today), 'day')) return t('kpp.today')
    if (d.isSame(dayjs(today).subtract(1, 'day'), 'day')) return t('kpp.yesterday')
    return formatAppDate(d)
  }

  const { status, lastMessage } = useAttendanceSocket(true)
  const [live, setLive] = useState<VisitorEvent[]>([])

  // Yangi kun boshlanganda jonli lenta tozalanadi — aks holda kechagi
  // o'tishlar bugungi hisobga qo'shilib turardi.
  useEffect(() => setLive([]), [today])

  useEffect(() => {
    const m = lastMessage as LiveEvent | null
    if (!m?.visitor_id) return
    if (selected && String(m.visitor_id) !== String(selected.id)) return
    // The post's branches (or the one picked in the filter) only.
    const own = liveEventBranchIds(m)
    if (branchId && !own.includes(Number(branchId))) return
    if (linkedBranchIds.length > 0 && !own.some((id) => linkedBranchIds.includes(id))) return
    setLive((prev) => {
      const key = m.event_id ?? m.id
      if (key != null && prev.some((e) => (e.event_id ?? e.id) === key)) return prev
      return [{ ...(m as VisitorEvent), is_live: true }, ...prev].slice(0, 100)
    })
    // Mehmon ro'yxati ham o'zgargan bo'lishi mumkin (yangi tashrif).
    void refetch()
  }, [lastMessage, linkedBranchIds, branchId, selected, refetch])

  /** Jonli va serverdagi yozuvlar — dublikatsiz. */
  const allEvents = useMemo(() => {
    if (live.length === 0) return events
    const seen = new Set(live.map((e) => e.event_id ?? e.id).filter((x) => x != null))
    return [...live, ...events.filter((e) => { const k = e.event_id ?? e.id; return k == null || !seen.has(k) })]
  }, [events, live])

  const entered = allEvents.filter((e) => e.direction_type === 'entrance').length
  const exited = allEvents.filter((e) => e.direction_type === 'exit').length

  return (
    <PageContainer className="flex min-h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-fg">{t('kpp.title')}</h1>
        <LiveBadge status={status} />
        <span className="ml-auto flex items-center gap-3">
          <Counter icon={<ArrowDownLeft size={14} />} tone="success" label={t('kpp.entered')} value={entered} />
          <Counter icon={<ArrowUpRight size={14} />} tone="warning" label={t('kpp.exited')} value={exited} />
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22rem_1fr]">
        {/* Mehmonlar */}
        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="flex flex-col gap-2 border-b border-line p-2.5">
            <SearchInput value={search} onChange={setSearch} placeholder={t('kpp.searchGuest')} />
            <Segmented
              size="sm"
              value={visit || 'all'}
              onChange={(v) => setVisit(v === 'all' ? '' : (v as typeof visit))}
              options={[
                { value: 'all', label: t('kpp.all') },
                { value: 'today', label: t('kpp.today') },
                { value: 'yesterday', label: t('kpp.yesterday') },
                { value: 'never', label: t('kpp.noVisitShort') },
              ]}
            />
            {/* Only when the post serves more than one branch. */}
            {linkedBranches.length > 1 && (
              <Select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                aria-label={t('kpp.allBranches')}
                options={[
                  { value: '', label: t('kpp.allBranches') },
                  ...linkedBranches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
                ]}
              />
            )}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-2.5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : visitors.length === 0 ? (
              <EmptyState icon={<Search size={20} />} title={t('kpp.noGuests')} />
            ) : (
              grouped.map(([day, list]) => (
                <section key={day}>
                  <div className="sticky top-0 z-[1] flex items-center gap-2 bg-surface px-3 pb-1 pt-2.5">
                    <span className={cn('text-[11px] font-bold', day === 'none' ? 'text-fg-subtle' : 'text-brand-strong')}>
                      {dayLabel(day)}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[10.5px] tabular-nums text-fg-subtle">{list.length}</span>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {list.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(selected?.id === g.id ? null : { id: g.id, legal_name: g.legal_name })}
                          className={cn(
                            'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                            selected?.id === g.id ? 'bg-brand-soft' : 'hover:bg-surface-2',
                          )}
                        >
                          <Avatar src={g.photo_thumb_path} fallbackSrc={g.photo_path} name={g.legal_name} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-fg">{g.legal_name ?? '—'}</span>
                            <span className="block truncate text-[11.5px] text-fg-muted">{g.organization_name || t('kpp.noOrganization')}</span>
                            {g.host_employee_name && (
                              <span className="block truncate text-[11px] text-brand-strong/80">
                                {t('kpp.host')}: {g.host_employee_name}
                                {g.host_employee_internal_phone && <span className="text-fg-subtle"> · {g.host_employee_internal_phone}</span>}
                              </span>
                            )}
                            {g.organization_branch?.name && (
                              <span className="block truncate text-[10.5px] text-fg-subtle">{g.organization_branch.name}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            {g.last_visit_time && (
                              <>
                                <span className="text-[12px] font-bold tabular-nums text-warning">{inTashkent(g.last_visit_time).format('HH:mm')}</span>
                                <span className="text-[10px] tabular-nums text-fg-subtle">{inTashkent(g.last_visit_time).format('DD.MM')}</span>
                              </>
                            )}
                            {(g.visit_count ?? 0) > 0 && (
                              <span className="text-[10px] text-fg-subtle">{t('kpp.visits', { count: g.visit_count ?? 0 })}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </Card>

        {/* O'tishlar */}
        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <h2 className="text-[14px] font-semibold text-fg">{t('kpp.todayPasses')}</h2>
            {selected && (
              <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 py-1 pl-2.5 pr-1 text-[12px] text-fg">
                {selected.legal_name}
                <IconButton size="sm" label={t('common.clearValue')} onClick={() => setSelected(null)}>
                  <X size={13} />
                </IconButton>
              </span>
            )}
            <span className="ml-auto text-[11.5px] tabular-nums text-fg-subtle">{dayjs(today).format('DD.MM.YYYY')}</span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {eventsLoading && allEvents.length === 0 ? (
              <div className="space-y-2 p-2.5">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
              </div>
            ) : allEvents.length === 0 ? (
              <EmptyState icon={<DoorOpen size={20} />} title={t('kpp.noPasses')} description={t('kpp.noPassesHint')} />
            ) : (
              <ul className="divide-y divide-line/60">
                {allEvents.map((e, i) => {
                  const entrance = e.direction_type === 'entrance'
                  return (
                    <li
                      key={`${e.event_id ?? e.id ?? i}`}
                      className={cn('flex items-center gap-2.5 px-3 py-2.5', e.is_live && 'bg-brand-soft/40')}
                    >
                      <span
                        className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                          entrance ? 'bg-success/[0.14] text-success' : 'bg-warning/[0.14] text-warning',
                        )}
                      >
                        {entrance ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                      </span>
                      <Avatar src={e.visitor?.photo_thumb_path} fallbackSrc={e.visitor?.photo_path} name={e.visitor?.legal_name ?? '?'} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">{e.visitor?.legal_name ?? '—'}</span>
                        <span className="block truncate text-[11.5px] text-fg-subtle">
                          {e.turnstile?.display_name || e.turnstile?.acs_dev_name || '—'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">
                        {e.happen_time ? inTashkent(e.happen_time).format('HH:mm:ss') : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}

function Counter({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'success' | 'warning' }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('grid h-7 w-7 place-items-center rounded-full', tone === 'success' ? 'bg-success/[0.14] text-success' : 'bg-warning/[0.14] text-warning')}>
        {icon}
      </span>
      <span className="text-[12px] text-fg-subtle">{label}</span>
      <span className="tabnum text-[15px] font-bold text-fg">{value}</span>
    </span>
  )
}

/** Ulanish holati — kiosk soatlab qaraladi, "jonli"mi degan savol doim bor. */
function LiveBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  if (status === WS_STATUS.CONNECTED) {
    return <Badge tone="success" dot>{t('kpp.live')}</Badge>
  }
  if (status === WS_STATUS.CONNECTING || status === WS_STATUS.RECONNECTING) {
    return <Badge tone="warning" dot>{t('kpp.connecting')}</Badge>
  }
  return <Badge tone="danger" dot>{t('kpp.offline')}</Badge>
}
