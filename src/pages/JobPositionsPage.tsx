import { useEffect, useMemo, useState } from 'react'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { History, Pencil, Plus, Trash2, UserRoundSearch, Wand2 } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { errorMessage } from '@/api/errorMessage'
import { canWriteOrg } from '@/auth/permissions'
import { paginateClient } from '@/lib/paginate'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { NamingRuleModal } from '@/features/structure/NamingRuleModal'
import { PositionFormModal } from '@/features/structure/PositionFormModal'
import { OccupancyHistoryModal, PositionHistoryModal } from '@/features/structure/PositionHistoryModals'
import {
  usePositionAdminMutations,
  usePositionCategories,
  usePositionDepartments,
  usePositionDetail,
  usePositionsList,
  type PositionRow,
  type PositionSort,
} from '@/features/structure/usePositionAdmin'

const FILTER_KEYS = ['cat', 'dept', 'sort', 'dir'] as const
const SORTS: PositionSort[] = ['name', 'category', 'grade', 'department']
const CATEGORY_TONE: Record<string, BadgeTone> = {
  rahbar: 'warning',
  mutaxassis: 'brand',
  xizmatchi: 'info',
  ishchi: 'success',
}
/** Tartib SERVERDA (`sort`/`order`); jadval sahifa ichida qayta saralamasin —
 *  barcha qiymat teng bo'lgani uchun barqaror saralash server tartibini saqlaydi. */
const serverOrder = () => 0

/**
 * «Lavozimlar» (TZ 4.2.6 · 2043–2058): qidiruv, toifa va bo'lim filtrlari,
 * ustun sarlavhasi bilan saralash (serverda), to'liq va qisqa nom, toifa,
 * razryad; yaratish / tahrirlash / o'chirish; «O'zgarishlar tarixi»,
 * «Egallash tarixi» va nom shakllantirish qoidalari (ommaviy qayta nomlash —
 * avval ko'rib chiqish). `?open={id}` — global qidiruvdan lavozim ochiladi.
 */
export function JobPositionsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const canWrite = canWriteOrg(user, 'structure', 'edit')
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)

  const sortKey: PositionSort = SORTS.includes(filters.sort as PositionSort) ? (filters.sort as PositionSort) : 'grade'
  const order: 'asc' | 'desc' = filters.dir === 'asc' || filters.dir === 'desc' ? filters.dir : sortKey === 'grade' ? 'desc' : 'asc'
  const list = usePositionsList({ search, category: filters.cat, departmentId: filters.dept, sort: sortKey, order })
  const rows = useMemo(() => list.data ?? [], [list.data])
  const paged = paginateClient(rows, page, size)
  const categories = usePositionCategories()
  const departmentOptions = useDepartmentOptions()
  const staffMap = usePositionDepartments()
  const mut = usePositionAdminMutations()

  const [form, setForm] = useState<{ value: PositionRow | null } | null>(null)
  const [historyOf, setHistoryOf] = useState<PositionRow | null>(null)
  const [occupancyOf, setOccupancyOf] = useState<PositionRow | null>(null)
  const [namingOpen, setNamingOpen] = useState(false)

  // `?open=5` — lavozimni ochamiz (ro'yxatda bo'lmasa ham batafsil so'rovdan).
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState<number | null>(null)
  const openParam = params.get('open')
  useEffect(() => {
    if (!openParam) return
    const id = Number(openParam)
    if (Number.isFinite(id) && id > 0) setOpenId(id)
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        sp.delete('open')
        return sp
      },
      { replace: true },
    )
  }, [openParam, setParams])
  const opened = usePositionDetail(openId)
  useEffect(() => {
    if (openId == null) return
    if (opened.data) {
      setForm({ value: opened.data })
      setOpenId(null)
    } else if (opened.error) {
      toast.error(errorMessage(opened.error, t('list.docNotFound')))
      setOpenId(null)
    }
  }, [openId, opened.data, opened.error, toast, t])

  const departmentsOf = (p: PositionRow) => {
    const m = staffMap.get(p.id)
    return m ? [...m.values()].join(', ') : ''
  }

  const columns: Column<PositionRow>[] = [
    {
      key: 'n',
      header: '#',
      label: '#',
      headerClassName: 'w-12',
      className: 'tabular-nums text-fg-subtle',
      skeleton: 'w-6',
      cell: (_r, i) => (paged.page - 1) * size + i + 1,
    },
    {
      key: 'name',
      header: t('orgAdmin.posName'),
      lockVisible: true,
      skeleton: 'w-56',
      sortValue: serverOrder,
      cell: (p) => <span className="font-semibold text-fg">{ln(p) || '—'}</span>,
    },
    {
      key: 'short',
      header: t('orgAdmin.posShortName'),
      className: 'text-fg-muted',
      skeleton: 'w-28',
      cell: (p) => p.short_name || '—',
    },
    {
      key: 'department',
      header: t('orgAdmin.colDepartment'),
      className: 'text-fg-muted',
      sortValue: serverOrder,
      cell: (p) => departmentsOf(p) || '—',
    },
    {
      key: 'category',
      header: t('orgAdmin.colCategory'),
      skeleton: 'w-20',
      sortValue: serverOrder,
      cell: (p) =>
        p.category ? <Badge tone={CATEGORY_TONE[p.category] ?? 'neutral'}>{categories.labelOf(p.category)}</Badge> : <span className="text-fg-subtle">—</span>,
    },
    {
      key: 'grade',
      header: t('orgAdmin.colRazryad'),
      className: 'tabular-nums',
      skeleton: 'w-8',
      sortValue: serverOrder,
      cell: (p) => (p.razryad != null ? <Badge tone="brand">{p.razryad}</Badge> : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-44',
      className: 'pr-4 text-right',
      skeleton: 'w-24',
      cell: (p) => (
        <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton size="sm" label={t('orgAdmin.occupancy')} onClick={() => setOccupancyOf(p)}>
            <UserRoundSearch size={15} />
          </IconButton>
          <IconButton size="sm" label={t('orgAdmin.history')} onClick={() => setHistoryOf(p)}>
            <History size={15} />
          </IconButton>
          {canWrite && (
            <>
              <IconButton size="sm" label={t('common.edit')} onClick={() => setForm({ value: p })}>
                <Pencil size={15} />
              </IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={() => void remove(p)}>
                <Trash2 size={15} />
              </IconButton>
            </>
          )}
        </span>
      ),
    },
  ]

  const remove = async (p: PositionRow) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('orgAdmin.posDeleteTitle'),
      subject: p.name,
      description: t('orgAdmin.posDeleteConfirm', { name: p.name ?? '' }),
    })
    if (!ok) return
    try {
      await mut.remove.mutateAsync(p.id)
      toast.ok(t('orgAdmin.posDeleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const sort: SortState = { key: sortKey, dir: order }

  return (
    <PageContainer>
      <PageHeader
        title={t('orgAdmin.posTitle')}
        subtitle={t('orgAdmin.posSubtitle')}
        actions={
          canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* TZ 4.2.6 · 2046–2048 — nom qoidalari va ommaviy qayta nomlash. */}
              <Button size="sm" variant="outline" leftIcon={<Wand2 size={15} />} disabled={!branchId} title={!branchId ? t('orgAdmin.pickBranch') : undefined} onClick={() => setNamingOpen(true)}>
                {t('orgAdmin.namingRules')}
              </Button>
              <Button size="sm" leftIcon={<Plus size={15} />} disabled={!branchId} title={!branchId ? t('orgAdmin.pickBranch') : undefined} onClick={() => setForm({ value: null })}>
                {t('orgAdmin.create')}
              </Button>
            </div>
          ) : undefined
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('orgAdmin.searchPos')} className="flex-1 sm:max-w-sm" />
          <Combobox
            value={filters.cat}
            onChange={(v) => setFilter('cat', v)}
            options={[...categories.options, { value: 'none', label: t('orgAdmin.categoryMissing') }]}
            placeholder={t('orgAdmin.allCategories')}
            className="w-full sm:w-52"
          />
          <Combobox
            value={filters.dept}
            onChange={(v) => setFilter('dept', v)}
            options={departmentOptions}
            placeholder={t('orgAdmin.allDepartments')}
            searchPlaceholder={t('orgAdmin.searchDept')}
            className="w-full sm:w-64"
          />
          <FilterReset count={activeFilterCount - (filters.sort ? 1 : 0) - (filters.dir ? 1 : 0)} onReset={reset} />
          {!branchId && <span className="text-[12px] text-fg-subtle sm:ml-auto">{t('orgAdmin.pickBranch')}</span>}
        </div>
        <DataTable
          tableId="job-positions-admin"
          rows={paged.slice}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          onRowClick={canWrite ? (p) => setForm({ value: p }) : undefined}
          sort={sort}
          onSort={(s) => setFilters({ sort: s.key, dir: s.dir })}
          emptyTitle={t('orgAdmin.emptyPos')}
          emptyDescription={t('orgAdmin.emptyPosHint')}
          filtered={!!(search || filters.cat || filters.dept)}
          emptyAction={<FilterReset count={(search ? 1 : 0) + (filters.cat ? 1 : 0) + (filters.dept ? 1 : 0)} onReset={reset} />}
          minWidth={900}
        />
        <Pagination page={paged.page} size={size} total={paged.total} pages={paged.pages} onPage={setPage} onSize={setSize} />
      </Card>

      <PositionFormModal open={!!form} value={form?.value ?? null} onClose={() => setForm(null)} />
      <PositionHistoryModal position={historyOf} onClose={() => setHistoryOf(null)} />
      <OccupancyHistoryModal position={occupancyOf} onClose={() => setOccupancyOf(null)} />
      <NamingRuleModal open={namingOpen} onClose={() => setNamingOpen(false)} />
    </PageContainer>
  )
}
