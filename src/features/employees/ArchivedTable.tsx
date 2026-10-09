import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import { useArchivedEmployees, type ArchivedEmployee } from './useEmployees'
import { useTransferMutations } from './useEmployeeAssignments'

/**
 * People who have LEFT — contract ended, transferred, or temporarily released.
 *
 * They are gone from the main list by design, which used to mean they were
 * gone from v2 altogether: there was no way to look up who used to hold a post
 * or when somebody was let go. The rows carry no personal data on purpose.
 */
export function ArchivedTable({
  search,
  page,
  size,
  setPage,
  setSize,
  departmentId,
}: {
  search: string
  page: number
  size: number
  setPage: (n: number) => void
  setSize: (n: number) => void
  /** The page's department filter — previously never reached the query. */
  departmentId?: string | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { rows, total, loading, denied, error, refetch } = useArchivedEmployees(search, page, size, true, departmentId)
  /**
   * BOSHQA FILIALGA O'TKAZILGAN xodim shu ro'yxatga tushadi va qaror AYNAN
   * shu yerda qabul qilinadi — o'tkazish darhol kuchga kirgan, eski filial
   * esa uni qabul qilishi yoki rad etishi kerak (rad etilsa xodim qaytariladi).
   */
  const { accept, reject } = useTransferMutations()
  const [busyId, setBusyId] = useState<number | null>(null)

  const decide = async (id: number, approve: boolean) => {
    if (!approve) {
      const note = window.prompt(t('assignments.rejectReasonPrompt')) ?? undefined
      if (note === undefined) return
      setBusyId(id)
      try {
        await reject.mutateAsync({ id, note })
        toast.ok(t('assignments.transferRejected'))
      } catch (e) {
        toast.error(errorMessage(e, t('assignments.decisionFailed')))
      } finally {
        setBusyId(null)
      }
      return
    }
    setBusyId(id)
    try {
      await accept.mutateAsync(id)
      toast.ok(t('assignments.transferAccepted'))
    } catch (e) {
      toast.error(errorMessage(e, t('assignments.decisionFailed')))
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<ArchivedEmployee & { id: number }>[] = [
    {
      key: 'legal_name',
      header: t('employees.colEmployee'),
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} name={r.legal_name ?? ''} size={28} />
          <span className="truncate font-medium text-fg">{r.legal_name ?? '—'}</span>
        </span>
      ),
    },
    { key: 'department_name', header: t('employees.colDepartment'), cell: (r) => r.department_name ?? '—' },
    { key: 'job_position_name', header: t('employees.colPosition'), cell: (r) => r.job_position_name ?? '—' },
    { key: 'branch_name', header: t('employees.colBranch'), cell: (r) => r.branch_name ?? '—' },
    {
      key: 'archive_reason_label',
      header: t('employees.archiveReason'),
      cell: (r) => r.archive_reason_label ?? r.archive_reason ?? '—',
    },
    {
      /* The free-text reason typed when the person was archived. v1 showed it;
         the API has always returned `archive_note`, v2 simply never drew it. */
      key: 'archive_note',
      header: t('employees.archiveNote'),
      cell: (r) => r.archive_note ?? '—',
      className: 'max-w-[16rem] truncate',
    },
    {
      key: 'archive_date',
      header: t('employees.archiveDate'),
      className: 'tabular-nums text-fg-muted',
      cell: (r) => (r.archive_date ? formatAppDate(r.archive_date) : '—'),
    },
    {
      key: 'decision',
      header: '',
      headerClassName: 'w-44',
      // Faqat o'tkazilgan va qaror kutayotgan qatorda — oddiy arxiv qatori
      // (ishdan bo'shatilgan) tegilmaydi.
      cell: (r) =>
        r.transfer && r.transfer.can_decide ? (
          <span className="flex gap-1.5">
            <Button
              size="sm"
              leftIcon={<Check size={14} />}
              loading={busyId === r.transfer.id}
              onClick={async () => {
                if (!(await confirm({ kind: 'approve', subject: r.legal_name, confirmLabel: t('assignments.acceptAction') }))) return
                decide(r.transfer!.id, true)
              }}
            >
              {t('assignments.acceptAction')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={14} />}
              disabled={busyId === r.transfer.id}
              onClick={() => decide(r.transfer!.id, false)}
            >
              {t('assignments.rejectAction')}
            </Button>
          </span>
        ) : null,
    },
  ]

  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)))

  return (
    <>
      <DataTable
        tableId="archived"
        rows={rows as (ArchivedEmployee & { id: number })[]}
        columns={columns}
        loading={loading}
          error={error}
          onRetry={refetch}
        emptyTitle={denied ? t('common.noAccess') : t('employees.archiveEmpty')}
        emptyDescription={t('employees.archiveEmptyHint')}
        minWidth={900}
      />
      <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} />
    </>
  )
}
