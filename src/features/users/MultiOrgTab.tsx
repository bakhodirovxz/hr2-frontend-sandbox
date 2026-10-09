import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Archive, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useListParams } from '@/hooks/useListParams'
import { useBranchStore } from '@/store/branchStore'
import { fetchEmployeesByIds } from '@/features/employees/useEmployees'
import { EmployeeFormDrawer } from '@/features/employees/EmployeeFormDrawer'
import { ArchiveEmployeeModal } from '@/features/employees/ArchiveEmployeeModal'
import { toItems, type Employee, type ListResponse } from '@/types'
import { inTashkent } from '@/lib/format'

/**
 * ROL VAKILLARI — the people who hold a role across branches.
 *
 * ⚠️ v2 had no such screen. The role and the branch list could be set on an
 * employee's card, but nobody could ANSWER "who is HR in this branch", "which
 * branches does this deputy cover" or "who did we make a KPP controller last
 * month" without opening cards one by one. v1 has this list
 * (`/branches/multi-modal`) and it is where these accounts are actually
 * administered.
 *
 * The branch filter deliberately follows the M2M attachment
 * (`include_multi_org=true`), not the home branch: a deputy whose card sits in
 * the executive apparatus but who covers four stations must appear under all
 * four.
 */
export function MultiOrgTab() {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const { search, setSearch, page, setPage, size, setSize, activeFilterCount, reset } =
    useListParams()

  const [editing, setEditing] = useState<Employee | null>(null)
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState<Employee | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)

  const list = useQuery({
    queryKey: ['multi-org-users', { search, page, size, branchId }],
    queryFn: () =>
      apiGet<ListResponse<Employee>>(EMPLOYEES_LIST, {
        is_multi_org_user: true,
        include_multi_org: true,
        organization_branch_id: branchId || undefined,
        search: search || undefined,
        page,
        size,
      }),
    retry: false,
  })

  const rows = toItems(list.data)
  const meta = list.data as { total?: number; pages?: number } | undefined
  const total = meta?.total ?? rows.length
  const pages = meta?.pages ?? Math.max(1, Math.ceil(total / size))

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]))
    return (id: number) => map.get(id) ?? `#${id}`
  }, [branches])

  // The row carries the branches it is attached to; older payloads only carry
  // the ids, so both shapes are read rather than showing an empty cell.
  const branchNames = (e: Employee): string[] => {
    const nested = e.organization_branches ?? []
    if (nested.length) return nested.map((b) => b.name ?? branchName(b.id)).filter(Boolean)
    const ids = (e as { organization_branch_ids?: number[] }).organization_branch_ids ?? []
    return ids.map(branchName)
  }

  const openEdit = async (id: number) => {
    setLoadingId(id)
    const [full] = await fetchEmployeesByIds([id])
    setLoadingId(null)
    if (full) setEditing(full)
  }

  const columns: Column<Employee>[] = [
    {
      key: 'user',
      skeleton: 'w-56',
      header: t('users.colEmployee'),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} name={r.legal_name ?? ''} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{r.legal_name || '—'}</p>
            <p className="truncate text-xs text-fg-muted">
              {(r as { email?: string | null }).email || '—'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      skeleton: 'w-28',
      header: t('users.colMultiRole'),
      cell: (r) => {
        const role = Array.isArray(r.multi_org_employee_role)
          ? r.multi_org_employee_role[0]
          : r.multi_org_employee_role
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {role ? (
              <Badge tone="brand">
                <ShieldCheck size={11} className="mr-1" />
                {t(`roles.${role}` as never, { defaultValue: String(role) })}
              </Badge>
            ) : (
              <span className="text-fg-subtle">—</span>
            )}
            {r.is_kpi_admin && <Badge tone="neutral">{t('employees.kpiAdmin')}</Badge>}
          </div>
        )
      },
    },
    {
      key: 'branches',
      skeleton: 'w-[420px]',
      header: t('users.colAssignedBranches'),
      cell: (r) => {
        const names = branchNames(r)
        if (!names.length) return <span className="text-fg-subtle">—</span>
        return (
          <div className="flex max-w-[22rem] flex-wrap gap-1">
            {names.slice(0, 2).map((n) => (
              <span
                key={n}
                className="max-w-[11rem] truncate rounded-inner bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-muted"
              >
                {n}
              </span>
            ))}
            {names.length > 2 && (
              <span className="rounded-inner bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-subtle">
                +{names.length - 2}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'created',
      skeleton: 'w-20',
      header: t('users.colCreated'),
      cell: (r) => {
        const at = (r as { created_at?: string | null }).created_at
        return (
          <span className="text-xs text-fg-muted">
            {at ? inTashkent(at).format('DD.MM.YYYY') : '—'}
          </span>
        )
      },
    },
    {
      key: 'actions',
      skeleton: 'w-8',
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <IconButton
            label={t('common.edit')}
            disabled={loadingId === r.id}
            onClick={() => openEdit(r.id)}
          >
            <Pencil size={15} />
          </IconButton>
          <IconButton label={t('employees.archiveAction')} onClick={() => setArchiving(r)}>
            <Archive size={15} />
          </IconButton>
        </div>
      ),
    },
  ]

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('users.searchMultiOrg')} />
        <FilterReset count={activeFilterCount} onReset={reset} />
        <Button className="ml-auto" leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>
          {t('users.addMultiOrg')}
        </Button>
      </div>

      <DataTable
        tableId="multi-org"
        columns={columns}
        rows={rows}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyTitle={t('users.emptyMultiOrg')}
        filtered={activeFilterCount > 0}
        emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
      />

      <Pagination
        page={page}
        size={size}
        total={total}
        pages={pages}
        onPage={setPage}
        onSize={setSize}
        loading={list.isFetching}
      />

      <EmployeeFormDrawer
        open={creating || !!editing}
        employee={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => void list.refetch()}
      />
      <ArchiveEmployeeModal
        open={!!archiving}
        employeeId={archiving?.id ?? null}
        employeeName={archiving?.legal_name}
        onClose={() => setArchiving(null)}
        onDone={() => {
          setArchiving(null)
          void list.refetch()
        }}
      />
    </Card>
  )
}
