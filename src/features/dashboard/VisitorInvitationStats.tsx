import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { Donut, DonutLegend, type DonutSlice } from './nocturne/Donut'
import { PanelEmpty } from './nocturne/Panel'

/**
 * XODIMLAR QABUL REYTINGI — bitta mehmonni KIM taklif qilgan.
 *
 * Web v1 shows this on the guest's own profile
 * (`src/pages/guests/profile/GuestReceptionRating.jsx`): a ring of the
 * employees who have invited this particular visitor, sized by how many times
 * each did. It is the reception desk's answer to "whose guest is this,
 * really" — a visitor who has been signed in eleven times by one department
 * is a different kind of visitor from one with eleven different hosts, and
 * the invitation list alone does not say which you are looking at.
 *
 * ⚠️ MOUNTING. This component is deliberately self-contained (no page shell,
 * no panel chrome) so it drops straight into the guest profile modal,
 * `src/features/guests/GuestProfileModal.tsx`, as
 * `<VisitorInvitationStats visitorId={guestId} />`. That file belongs to
 * another session today (2026-09-08) and could not be edited here, so the
 * block ships ready but UNMOUNTED — see the change log.
 *
 * ⚠️ ENDPOINT INLINED. `src/api/endpoints.ts` has no constant for this route
 * and is owned by another session today; v1 calls it
 * `VISITOR_INVITATION_STATS(pk)` and it belongs there eventually.
 */
const visitorInvitationStats = (pk: number) => `dashboard/visitors/${pk}/invitation-stats`

interface InvitationStat {
  employee_id: number
  employee_name: string
  invitation_count: number
}

/**
 * Categorical hues in FIXED ORDER, never cycled: the ring carries at most six
 * named hosts and folds the rest into one "Boshqalar" slice. A seventh
 * generated colour would put two indistinguishable hosts side by side, and a
 * reader cannot audit a ring whose colours repeat.
 */
const RING = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6']
const MAX_NAMED = 5

export function VisitorInvitationStats({
  visitorId,
  className,
}: {
  visitorId: number | null
  className?: string
}) {
  const { t } = useTranslation()

  const q = useQuery({
    queryKey: ['visitor', 'invitation-stats', visitorId],
    queryFn: () => apiGet<InvitationStat[]>(visitorInvitationStats(visitorId as number)),
    enabled: visitorId != null,
    // Bu blok mehmon kartasi ichida yashaydi — ruxsati yo'q rolda u JIM
    // qolishi kerak, butun kartani yiqitmasligi.
    retry: false,
  })

  const { slices, hosts, totalInvites } = useMemo(() => {
    const rows = [...(q.data ?? [])]
      .filter((r) => (r.invitation_count ?? 0) > 0)
      .sort((a, b) => b.invitation_count - a.invitation_count)
    const named = rows.slice(0, MAX_NAMED)
    const rest = rows.slice(MAX_NAMED)
    const out: DonutSlice[] = named.map((r, i) => ({
      key: String(r.employee_id ?? i),
      label: r.employee_name || t('common.unknown'),
      value: r.invitation_count,
      token: RING[i],
    }))
    if (rest.length) {
      out.push({
        key: 'other',
        label: t('dashboard.board.receptionOther'),
        value: rest.reduce((a, r) => a + r.invitation_count, 0),
        token: RING[MAX_NAMED],
      })
    }
    return {
      slices: out,
      hosts: rows.length,
      totalInvites: rows.reduce((a, r) => a + r.invitation_count, 0),
    }
  }, [q.data, t])

  if (q.isLoading) return null
  /* The comment on the query says a role without permission must stay SILENT
   * here. It did not: a 403 fell through to "nobody has invited anyone",
   * which is a claim about the data rather than about access. Silence is the
   * intended behaviour, so failure renders nothing at all. */
  if (q.isError) return null
  if (slices.length === 0) return <PanelEmpty text={t('dashboard.board.receptionEmpty')} />

  return (
    <div className={className}>
      <h3 className="m-0 mb-3 text-[13px] font-semibold text-fg">
        {t('dashboard.board.receptionTitle')}
      </h3>
      <div className="flex items-center gap-5">
        {/* Markazda XODIMLAR soni turadi (v1 dagidek): halqa ulushlarni
            ko'rsatadi, markaz esa nechta odam bu mehmonni chaqirganini. */}
        <Donut slices={slices} total={hosts} caption={t('dashboard.board.statTotal')} size={132} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <DonutLegend slices={slices} />
          <span className="text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
            {t('dashboard.board.receptionInvites', { count: totalInvites })}
          </span>
        </div>
      </div>
    </div>
  )
}
