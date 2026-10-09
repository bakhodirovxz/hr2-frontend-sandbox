import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { fmtDate } from './format'
import { useArchivedEmployees } from './useEmployees'
import type { ArchivedEmployee } from './types'

/**
 * «Arxiv» tab (TZ C4, 4.2.7 · 2077): archived employees with the dismissal
 * reason, its date and note (`GET /employees/archived`). No PII on purpose.
 * The row opens the read-only card, where «Qayta ishga qabul qilish» lives.
 */
export function ArchivedTable({
  search,
  departmentId,
  page,
  size,
  setPage,
  setSize,
  filtered,
  emptyAction,
}: {
  search: string
  departmentId?: string
  page: number
  size: number
  setPage: (n: number) => void
  setSize: (n: number) => void
  filtered: boolean
  emptyAction?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const q = useArchivedEmployees({ page, size, search, departmentId }, true)

  const columns: Column<ArchivedEmployee>[] = [
    {
      key: 'legal_name',
      header: t('personnel.list.colName'),
      skeleton: 'w-48',
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name ?? ''} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-fg">{r.legal_name ?? '—'}</span>
            <span className="block truncate text-[11px] text-fg-muted">{r.job_position_name || '—'}</span>
          </span>
        </span>
      ),
    },
    { key: 'department_name', header: t('personnel.f.department'), className: 'text-fg-muted', cell: (r) => r.department_name ?? '—' },
    { key: 'branch_name', header: t('personnel.list.colBranch'), className: 'text-fg-muted', cell: (r) => r.branch_name ?? '—' },
    {
      key: 'reason',
      header: t('personnel.list.colReason'),
      cell: (r) => <Badge tone="danger">{r.archive_reason_label || r.archive_reason || t('personnel.state.archivedShort')}</Badge>,
    },
    {
      key: 'archive_date',
      header: t('personnel.list.colDate'),
      className: 'tabular-nums text-fg-muted whitespace-nowrap',
      cell: (r) => fmtDate(r.archive_date || r.archived_at),
    },
    {
      key: 'archive_note',
      header: t('personnel.list.colNote'),
      className: 'max-w-[16rem] truncate text-fg-muted',
      cell: (r) => <span title={r.archive_note ?? undefined}>{r.archive_note || '—'}</span>,
    },
  ]

  return (
    <>
      <DataTable
        tableId="employees-archived"
        rows={q.data?.items ?? []}
        columns={columns}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={(r) => navigate(`/employees/${r.id}`)}
        emptyTitle={t('personnel.list.archiveEmpty')}
        filtered={filtered}
        emptyAction={emptyAction}
        minWidth={980}
      />
      <Pagination
        page={page}
        size={size}
        total={q.data?.total ?? 0}
        pages={q.data?.pages ?? 0}
        onPage={setPage}
        onSize={setSize}
        loading={q.isFetching}
      />
    </>
  )
}
