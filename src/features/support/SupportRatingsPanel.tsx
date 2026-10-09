import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Star, Trophy } from 'lucide-react'
import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { useTicketRatings, type TicketRatingRow } from './useSupport'

/** Uzbek month names — `dayjs` here is English-only, and the label is user-facing. */
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

/** The table wants an `id`; the API keys a row by the specialist it describes. */
interface RatingRow extends TicketRatingRow {
  id: number
}

function monthLabel(value: string): string {
  const [y, m] = value.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return value
  return `${UZ_MONTHS[m - 1]} ${y}`
}

/** Five stars, filled up to `value` — the same shape as the rating dialog. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          strokeWidth={1.5}
          className={value >= n ? 'text-warning' : 'text-fg-subtle/40'}
          fill={value >= n ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

/**
 * AKT MONTHLY LEADERBOARD — how many tickets each specialist closed and how the
 * reporters scored the work.
 *
 * The month is stepped, never typed: v1 learned that a free-text "YYYY-MM" only
 * ever produced malformed requests, and a future month has nothing to show, so
 * it is simply unreachable.
 *
 * Who may read this is the SERVER's decision (it narrows to the branches the
 * caller is AKT or HR for, and refuses outright when there are none), so the
 * panel renders what comes back instead of re-deriving the rule from roles.
 */
export function SupportRatingsPanel() {
  const { t } = useTranslation()
  /*
   * ⚠️ `sortValue` ALONE DOES NOTHING. `DataTable` makes a header clickable only
   * when BOTH `sortValue` and `onSort` are present, so columns that declared a
   * `sortValue` without this pair had dead headers — the same defect already
   * fixed once on the medical register.
   */
  const [sort, setSort] = useState<SortState | null>(null)
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'))
  const { rows, loading, denied, error, refetch } = useTicketRatings(month)

  const thisMonth = dayjs().format('YYYY-MM')
  const nextBlocked = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM') > thisMonth

  const tableRows: RatingRow[] = useMemo(
    () => rows.map((r) => ({ ...r, id: r.assignee_id })),
    [rows],
  )

  const columns: Column<RatingRow>[] = [
    {
      key: 'rank',
      header: '#',
      className: 'w-12',
      cell: (_row, index) => (
        <span
          className={
            index === 0
              ? 'grid h-6 w-6 place-items-center rounded-full bg-warning-soft text-[11px] font-semibold text-warning'
              : 'grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg-muted'
          }
        >
          {index + 1}
        </span>
      ),
    },
    {
      key: 'assignee',
      header: t('support.ratingsAssignee'),
      sortValue: (row) => row.assignee?.legal_name ?? '',
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={row.assignee?.photo_thumb_path} name={row.assignee?.legal_name} size={28} />
          <span className="text-[13px] text-fg">
            {row.assignee?.legal_name ?? `${t('support.ratingsEmployeeNo')}${row.assignee_id}`}
          </span>
        </div>
      ),
    },
    {
      key: 'completed',
      header: t('support.ratingsCompleted'),
      className: 'text-center tabular-nums',
      headerClassName: 'text-center',
      sortValue: (row) => row.completed_count,
      cell: (row) => row.completed_count,
    },
    {
      key: 'rated',
      header: t('support.ratingsRated'),
      className: 'text-center tabular-nums',
      headerClassName: 'text-center',
      sortValue: (row) => row.rated_count,
      cell: (row) => row.rated_count,
    },
    {
      key: 'avg',
      header: t('support.ratingsAverage'),
      sortValue: (row) => row.avg_rating ?? 0,
      cell: (row) =>
        row.avg_rating == null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Stars value={Math.round(row.avg_rating)} />
            <span className="text-[12px] tabular-nums text-fg-muted">{row.avg_rating.toFixed(1)}</span>
          </span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Trophy size={16} className="text-warning" />
        <span className="text-[13px] text-fg-muted">{t('support.ratingsTitle')}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            size="sm"
            label={t('support.ratingsPrevMonth')}
            onClick={() => setMonth((m) => dayjs(`${m}-01`).subtract(1, 'month').format('YYYY-MM'))}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <span className="min-w-[118px] select-none text-center text-[13px] font-medium text-fg">
            {monthLabel(month)}
          </span>
          <IconButton
            size="sm"
            label={t('support.ratingsNextMonth')}
            disabled={nextBlocked}
            onClick={() => setMonth((m) => dayjs(`${m}-01`).add(1, 'month').format('YYYY-MM'))}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>
      </div>

      <DataTable
        tableId="support-ratings"
        sort={sort}
        onSort={setSort}
        rows={tableRows}
        columns={columns}
        loading={loading}
          error={error}
          onRetry={refetch}
        minWidth={620}
        skeletonRows={5}
        emptyTitle={denied ? t('support.ratingsDenied') : t('support.ratingsEmpty')}
        emptyDescription={denied ? t('support.ratingsDeniedHint') : t('support.ratingsEmptyHint')}
      />
    </div>
  )
}
