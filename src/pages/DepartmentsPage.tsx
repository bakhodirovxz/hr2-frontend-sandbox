import { inTashkent } from '@/lib/format'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Download, FileSpreadsheet, FileText, History, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { DEPARTMENTS_LIST } from '@/api/endpoints'
import { canWriteOrg } from '@/auth/permissions'
import { downloadFile } from '@/lib/download'
import { paginateClient } from '@/lib/paginate'
import { searchFold } from '@/lib/searchFold'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { DepartmentCardModal, type CardTab } from '@/features/structure/DepartmentCardModal'
import { DepartmentCloseModal } from '@/features/structure/DepartmentCloseModal'
import { DepartmentFormModal } from '@/features/structure/DepartmentFormModal'
import { RestructureWizard } from '@/features/structure/RestructureWizard'
import { TransferEmployeesModal, type TransferContext } from '@/features/structure/TransferEmployeesModal'
import {
  useDepartmentAdminMutations,
  useDepartmentsAll,
  type DepartmentRow,
} from '@/features/structure/useDepartmentAdmin'

const FILTER_KEYS = ['closed', 'sort', 'dir'] as const
type ExportFormat = 'xlsx' | 'pdf' | 'docx'

/**
 * «Bo'limlar» — tuzilmani boshqarish (TZ S1, S2, 4.2.6).
 *
 * Yaratish, tahrirlash (asos buyrug'i bilan), qisqartirish / qayta tiklash,
 * o'chirish, o'zgarishlar tarixi, «Qayta tuzish» ustasi va eksport. Sahifa
 * faqat `canWriteOrg(user,'structure','edit')` ga ochiq (marshrut darvozasi);
 * hamma uchun o'qish ko'rinishi — `/structure`.
 *
 * `?open={id}` — global qidiruv natijasi bo'lim kartochkasini ochadi.
 */
export function DepartmentsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const canWrite = canWriteOrg(user, 'structure', 'edit')
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters, reset } =
    useListParams(FILTER_KEYS)
  const includeClosed = filters.closed === '1'
  const list = useDepartmentsAll(includeClosed)
  const all = useMemo(() => list.data ?? [], [list.data])
  const mut = useDepartmentAdminMutations()

  const [card, setCard] = useState<{ id: number; tab: CardTab } | null>(null)
  const [form, setForm] = useState<{ value: DepartmentRow | null } | null>(null)
  const [closing, setClosing] = useState<{ dept: DepartmentRow; mode: 'close' | 'reopen' } | null>(null)
  const [wizard, setWizard] = useState(false)
  const [transfer, setTransfer] = useState<TransferContext | null>(null)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  // `?open=3` — kartochkani ochamiz va parametrni olib tashlaymiz.
  const [params, setParams] = useSearchParams()
  const openParam = params.get('open')
  useEffect(() => {
    if (!openParam) return
    const id = Number(openParam)
    if (Number.isFinite(id) && id > 0) setCard({ id, tab: 'info' })
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        sp.delete('open')
        return sp
      },
      { replace: true },
    )
  }, [openParam, setParams])

  const nameById = useMemo(() => new Map(all.map((d) => [d.id, d.name ?? `#${d.id}`])), [all])
  const parentName = (d: DepartmentRow) => (d.parent_id != null ? nameById.get(d.parent_id) ?? `#${d.parent_id}` : '')
  const headNames = (d: DepartmentRow) => (d.heads ?? []).map((h) => h.legal_name).filter(Boolean).join(', ')

  const sort: SortState | null = filters.sort ? { key: filters.sort, dir: filters.dir === 'desc' ? 'desc' : 'asc' } : null
  const columns: Column<DepartmentRow>[] = [
    {
      key: 'n',
      header: '#',
      label: '#',
      headerClassName: 'w-12',
      className: 'tabular-nums text-fg-subtle',
      skeleton: 'w-6',
      cell: (_d, i) => (paged.page - 1) * size + i + 1,
    },
    {
      key: 'name',
      header: t('orgAdmin.colName'),
      lockVisible: true,
      skeleton: 'w-56',
      sortValue: (d) => d.name ?? '',
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCard({ id: d.id, tab: 'info' })
            }}
            className="truncate text-left font-semibold text-fg hover:text-brand-strong hover:underline"
          >
            {d.name || '—'}
          </button>
          {d.closed_at && <Badge tone="warning">{t('orgAdmin.closedBadge')}</Badge>}
        </span>
      ),
    },
    {
      key: 'code',
      header: t('orgAdmin.colCode'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-14',
      sortValue: (d) => d.code ?? null,
      cell: (d) => d.code || '—',
    },
    {
      key: 'parent',
      header: t('orgAdmin.colParent'),
      className: 'text-fg-muted',
      sortValue: (d) => parentName(d) || null,
      cell: (d) => parentName(d) || '—',
    },
    {
      key: 'heads',
      header: t('orgAdmin.colHeads'),
      className: 'text-fg-muted',
      sortValue: (d) => headNames(d) || null,
      cell: (d) => {
        const heads = d.heads ?? []
        if (!heads.length) return '—'
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 -space-x-1.5">
              {heads.slice(0, 3).map((h) => (
                <Avatar key={h.id} src={h.photo_thumb_path} fallbackSrc={h.photo_path} name={h.legal_name ?? '?'} size={24} className="ring-2 ring-surface" />
              ))}
            </span>
            <span className="truncate">{headNames(d)}</span>
          </span>
        )
      },
    },
    {
      key: 'staff',
      header: t('orgAdmin.colStaff'),
      className: 'text-right tabular-nums text-fg-muted',
      headerClassName: 'text-right',
      skeleton: 'w-8',
      sortValue: (d) => d.staff_count ?? null,
      cell: (d) => d.staff_count ?? '—',
    },
    {
      key: 'created',
      header: t('orgAdmin.colCreated'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-20',
      sortValue: (d) => d.created_at ?? null,
      cell: (d) => (d.created_at ? inTashkent(d.created_at).format('DD.MM.YYYY') : '—'),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-44',
      className: 'pr-4 text-right',
      skeleton: 'w-24',
      cell: (d) => (
        <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton size="sm" label={t('orgAdmin.history')} onClick={() => setCard({ id: d.id, tab: 'history' })}>
            <History size={15} />
          </IconButton>
          {canWrite && (
            <>
              <IconButton size="sm" label={t('common.edit')} onClick={() => setForm({ value: d })}>
                <Pencil size={15} />
              </IconButton>
              {d.closed_at ? (
                <IconButton size="sm" label={t('orgAdmin.reopenTitle')} onClick={() => setClosing({ dept: d, mode: 'reopen' })}>
                  <ArchiveRestore size={15} />
                </IconButton>
              ) : (
                <IconButton size="sm" label={t('orgAdmin.closeTitle')} onClick={() => setClosing({ dept: d, mode: 'close' })}>
                  <Archive size={15} />
                </IconButton>
              )}
              <IconButton size="sm" label={t('common.delete')} onClick={() => void remove(d)}>
                <Trash2 size={15} />
              </IconButton>
            </>
          )}
        </span>
      ),
    },
  ]

  const filtered = useMemo(() => {
    const q = searchFold(search.trim())
    let rows = q ? all.filter((d) => searchFold(`${d.name ?? ''} ${d.code ?? ''}`).includes(q)) : all
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined
    if (sort && col?.sortValue) {
      const dir = sort.dir === 'asc' ? 1 : -1
      const key = col.sortValue
      rows = [...rows].sort((a, b) => {
        const x = key(a)
        const y = key(b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
        return String(x).localeCompare(String(y), 'uz') * dir
      })
    }
    return rows
    // `columns` is rebuilt every render; only the sort key matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, sort?.key, sort?.dir, nameById])
  const paged = paginateClient(filtered, page, size)

  const remove = async (d: DepartmentRow) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('orgAdmin.deleteTitle'),
      subject: d.name,
      description: t('orgAdmin.deleteConfirm', { name: d.name ?? '' }),
    })
    if (!ok) return
    await doRemove(d)
  }

  /**
   * TZ S1 1116: a department with employees is not deleted — the refusal
   * (409 `department_in_use`, `params.employee_count` /
   * `archived_employee_count`) offers «Xodimlarni o‘tkazish», and the delete
   * is repeated after the transfer.
   */
  const doRemove = async (d: DepartmentRow) => {
    try {
      await mut.remove.mutateAsync(d.id)
      toast.ok(t('orgAdmin.deptDeleted'))
    } catch (e) {
      const p = errorParams(e)
      const employees = Number(p.employee_count ?? 0)
      const archived = Number(p.archived_employee_count ?? 0)
      if (errorCode(e) === 'department_in_use' && employees + archived > 0) {
        setTransfer({ dept: d, action: 'delete', employeeCount: employees, archivedCount: archived })
      } else {
        toast.error(errorMessage(e, t('common.actionFailed')))
      }
    }
  }

  const exportAs = async (format: ExportFormat) => {
    setExporting(format)
    try {
      await downloadFile({
        url: `${DEPARTMENTS_LIST}/export`,
        params: { format, organization_branch_id: branchId || undefined, include_closed: includeClosed || undefined },
        filename: `${t('orgAdmin.exportFile')}.${format}`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('orgAdmin.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  const editFromCard = (d: DepartmentRow) => {
    setCard(null)
    setForm({ value: all.find((x) => x.id === d.id) ?? d })
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('orgAdmin.deptTitle')}
        subtitle={t('orgAdmin.deptSubtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActionMenu
              label={t('orgAdmin.export')}
              icon={<Download size={15} />}
              items={[
                { key: 'xlsx', label: 'Excel (.xlsx)', icon: <FileSpreadsheet size={15} />, loading: exporting === 'xlsx', onClick: () => void exportAs('xlsx') },
                { key: 'pdf', label: 'PDF', icon: <FileText size={15} />, loading: exporting === 'pdf', onClick: () => void exportAs('pdf') },
                { key: 'docx', label: 'Word (.docx)', icon: <FileText size={15} />, loading: exporting === 'docx', onClick: () => void exportAs('docx') },
              ]}
            />
            {canWrite && (
              <>
                {/* TZ 4.2.6 «Массовая корректировка данных при изменении структуры». */}
                <Button size="sm" variant="outline" leftIcon={<Shuffle size={15} />} disabled={!branchId} title={!branchId ? t('orgAdmin.pickBranch') : undefined} onClick={() => setWizard(true)}>
                  {t('orgAdmin.restructure')}
                </Button>
                <Button size="sm" leftIcon={<Plus size={15} />} disabled={!branchId} title={!branchId ? t('orgAdmin.pickBranch') : undefined} onClick={() => setForm({ value: null })}>
                  {t('orgRef.addDepartment')}
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('orgAdmin.searchDept')} className="flex-1 sm:max-w-md" />
          {/* TZ 4.2.6 «Сокращение подразделений» — qisqartirilgan bo'lim
              tarixda qoladi, ro'yxatda esa faqat shu belgi bilan ko'rinadi. */}
          <Checkbox label={t('orgAdmin.showClosed')} checked={includeClosed} onChange={(e) => setFilter('closed', e.target.checked ? '1' : '')} />
          <FilterReset count={(search ? 1 : 0) + (includeClosed ? 1 : 0)} onReset={reset} />
          {!branchId && <span className="text-[12px] text-fg-subtle sm:ml-auto">{t('orgAdmin.pickBranch')}</span>}
        </div>
        <DataTable
          tableId="departments-admin"
          rows={paged.slice}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={(d) => setCard({ id: d.id, tab: 'info' })}
          sort={sort}
          onSort={(s) => setFilters({ sort: s.key, dir: s.dir === 'desc' ? 'desc' : null })}
          emptyTitle={t('orgAdmin.emptyDept')}
          emptyDescription={t('orgAdmin.emptyDeptHint')}
          filtered={!!search}
          emptyAction={<FilterReset count={search ? 1 : 0} onReset={reset} />}
          minWidth={960}
        />
        <Pagination page={paged.page} size={size} total={paged.total} pages={paged.pages} onPage={setPage} onSize={setSize} />
      </Card>

      <DepartmentCardModal
        id={card?.id ?? null}
        tab={card?.tab ?? 'info'}
        onTab={(tab) => setCard((c) => (c ? { ...c, tab } : c))}
        all={all}
        onOpen={(id) => setCard({ id, tab: 'info' })}
        onClose={() => setCard(null)}
        onEdit={canWrite ? editFromCard : undefined}
      />
      <DepartmentFormModal open={!!form} value={form?.value ?? null} all={all} onClose={() => setForm(null)} />
      <DepartmentCloseModal dept={closing?.dept ?? null} mode={closing?.mode ?? 'close'} onClose={() => setClosing(null)} />
      <RestructureWizard open={wizard} all={all} onClose={() => setWizard(false)} />
      <TransferEmployeesModal
        ctx={transfer}
        onClose={() => setTransfer(null)}
        onDone={() => {
          const d = transfer?.dept
          if (d) void doRemove(d)
        }}
      />
    </PageContainer>
  )
}
