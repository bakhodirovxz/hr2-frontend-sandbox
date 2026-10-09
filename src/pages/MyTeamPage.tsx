import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useListParams } from '@/hooks/useListParams'
import { todayIso } from '@/lib/today'
import { CAL_COLOR, CAL_LABEL, mapCalStatus } from '@/features/attendance/attendanceStatus'
import { useMyTeam, type TeamMemberRow, type TeamVia } from '@/features/team/useMyTeam'

const FILTER_KEYS = ['via', 'status', 'day'] as const
/** Case- and apostrophe-insensitive (o‘/o'/oʻ are typed every which way). */
const foldForSearch = (v: string) => v.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'")

const VIA_KEY: Record<TeamVia, 'viaDirect' | 'viaIndirect' | 'viaDepartment'> = {
  direct: 'viaDirect',
  indirect: 'viaIndirect',
  department: 'viaDepartment',
}

/**
 * «Mening jamoam» — a line manager's people and their day.
 *
 * Verifix gave its «Руководитель» role the subordinate list, their cards and
 * their schedule; HR had team requests and team KPI but no list of the
 * people themselves, and a colleague's card was closed to a plain employee.
 * The list is small (one manager's team), so search and filters run on the
 * loaded rows; they still live in the URL like every other list.
 */
export function MyTeamPage() {
  const { t } = useTranslation()
  const { search, setSearch, filters, setFilter, activeFilterCount, reset } = useListParams(FILTER_KEYS)
  const day = filters.day || todayIso()
  const { data, loading, fetching, error, refetch } = useMyTeam(day)
  const rows = data?.items ?? []

  const shown = useMemo(() => {
    const q = foldForSearch(search.trim())
    return rows.filter((r) =>
      (!filters.via || r.via === filters.via) &&
      (!filters.status || mapCalStatus(r.status) === filters.status) &&
      (!q || foldForSearch(`${r.legal_name} ${r.job_position_name ?? ''} ${r.department_name ?? ''}`).includes(q)),
    )
  }, [rows, search, filters.via, filters.status])

  // Status chips come from the rows themselves, so only statuses that occur
  // today are offered.
  const statusCounts = useMemo(() => {
    const out = new Map<string, number>()
    for (const r of rows) {
      const s = mapCalStatus(r.status)
      out.set(s, (out.get(s) ?? 0) + 1)
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const columns: Column<TeamMemberRow>[] = [
    {
      key: 'name',
      rowLink: true,
      header: t('myTeam.colName'),
      lockVisible: true,
      skeleton: 'w-56',
      sortValue: (r) => r.legal_name,
      cell: (r) => (
        <span className="flex items-center gap-3">
          <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name} size={32} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fg">{r.legal_name}</span>
            <span className="block truncate text-xs text-fg-subtle">{r.job_position_name ?? ''}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'department',
      header: t('myTeam.colDepartment'),
      className: 'text-fg-muted',
      skeleton: 'w-40',
      sortValue: (r) => r.department_name ?? '',
      cell: (r) => r.department_name ?? '—',
    },
    {
      key: 'via',
      header: t('myTeam.colVia'),
      skeleton: 'w-20',
      cell: (r) => <Badge tone={r.via === 'direct' ? 'brand' : 'neutral'}>{t(`myTeam.${VIA_KEY[r.via]}`)}</Badge>,
    },
    {
      key: 'status',
      header: t('myTeam.colStatus'),
      skeleton: 'w-24',
      sortValue: (r) => mapCalStatus(r.status),
      cell: (r) => {
        const s = mapCalStatus(r.status)
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
            <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${CAL_COLOR[s]}))` }} />
            {t(`attendance.${CAL_LABEL[s]}`)}
          </span>
        )
      },
    },
    {
      key: 'in',
      header: t('myTeam.colIn'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-12',
      cell: (r) => r.first_in ?? '—',
    },
    {
      key: 'out',
      header: t('myTeam.colOut'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-12',
      cell: (r) => r.last_out ?? '—',
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('myTeam.title')} subtitle={t('myTeam.subtitle')} />

      {statusCounts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {statusCounts.map(([s, n]) => {
            const active = filters.status === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter('status', active ? '' : s)}
                className={
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors ' +
                  (active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-fg-muted hover:text-fg')
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${CAL_COLOR[s as keyof typeof CAL_COLOR]}))` }} />
                {t(`attendance.${CAL_LABEL[s as keyof typeof CAL_LABEL]}`)}
                <span className="font-semibold tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('myTeam.searchPlaceholder')} className="flex-1 lg:max-w-md" />
          <Combobox
            value={filters.via}
            onChange={(v) => setFilter('via', v)}
            options={(['direct', 'indirect', 'department'] as TeamVia[]).map((v) => ({ value: v, label: t(`myTeam.${VIA_KEY[v]}`) }))}
            placeholder={t('myTeam.allVia')}
            className="w-full lg:w-52"
          />
          <DateInput value={day} onChange={(v) => setFilter('day', v)} aria-label={t('myTeam.day')} />
          <FilterReset count={activeFilterCount} onReset={reset} />
          <span className="text-[12px] text-fg-subtle lg:ml-auto">{t('myTeam.total', { count: shown.length })}</span>
        </div>
        <DataTable
          tableId="my-team-1"
          rows={shown}
          columns={columns}
          loading={loading || (fetching && !data)}
          error={error}
          onRetry={refetch}
          rowHref={(r) => `/mening-jamoam/${r.id}`}
          emptyTitle={t('myTeam.empty')}
          emptyDescription={t('myTeam.emptyHint')}
          filtered={activeFilterCount > 0 || !!search}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={760}
        />
      </Card>
    </PageContainer>
  )
}
