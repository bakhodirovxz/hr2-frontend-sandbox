import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CheckCircle2,
  FileText,
  History,
  Info,
  Pencil,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import type { SelectOption } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { LABEL_CLS } from '@/components/ui/control'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useDebounce } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { readsOrg } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { fmtDate } from '@/features/orders/format'
import { paginateClient } from '@/lib/paginate'
import { todayIso } from '@/lib/today'
import { cn } from '@/lib/cn'
import { useOrderTypes } from '@/features/orderTypes/useOrderTypes'
import { EmployeeSelect } from '@/features/orders/EmployeeSelect'
import { OrderDetailDrawer, submitLabel } from '@/features/orders/OrderDetailDrawer'
import { OrderDocumentViewer } from '@/features/orders/OrderDocumentViewer'
import { OrderFormDrawer } from '@/features/orders/OrderFormDrawer'
import { OrderStats } from '@/features/orders/OrderStats'
import { OrderStatusBadge, decreeStatusLabel } from '@/features/orders/OrderStatusBadge'
import { RejectReasonModal } from '@/features/orders/RejectReasonModal'
import {
  STATUS_FILTER,
  canManageOrders,
  isDecreeOrder,
  isOrdersHr,
  isOrdersManagement,
  orderPowers,
} from '@/features/orders/orderFlow'
import { ORDER_TYPE_CODES, orderTypeLabel } from '@/features/orders/orderTypes'
import {
  useOrderList,
  useOrderMutations,
  useOrdersAsOf,
  type OrderAct,
  type OrderListParams,
} from '@/features/orders/useOrders'

const FILTER_KEYS = ['tab', 'status', 'cat', 'emp', 'from', 'to', 'type', 'dept', 'num', 'name', 'author', 'asof', 'more'] as const
type HrTab = 'all' | 'my' | 'sign'

/** Text filter held in the URL, written there 350 ms after typing stops. */
function DebouncedInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void; placeholder?: string; 'aria-label'?: string; id?: string }) {
  const [local, setLocal] = useState(value)
  const debounced = useDebounce(local, 350)
  useEffect(() => setLocal(value), [value])
  useEffect(() => {
    if (debounced !== value) onChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  return <Input value={local} onChange={(e) => setLocal(e.target.value)} {...rest} />
}

/**
 * BUYRUQLAR — TZ 4.2.9 (2164–2207), O1–O3. Port of v1 `BuyruqlarPage`:
 * register analytics, the filtered list (rows waiting for YOU are yellow,
 * their count red), «Sana bo'yicha holat» (the list as it stood on a past
 * date, read-only), the create/edit drawer, the detail with the decree
 * workflow and history, the PDF / .docx viewer. `?open=<id>` opens an order
 * (notifications, global search, the employee card's «Buyruqlar» tab).
 */
export function OrdersPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useOrderMutations()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)
  const [params, setParams] = useSearchParams()

  const isHr = isOrdersHr(user)
  const management = isOrdersManagement(user)
  const canManage = canManageOrders(user)
  const showAnalytics = readsOrg(user, 'orders')
  const wide = useMediaQuery('(min-width: 1024px)')
  const [analyticsOpen, setAnalyticsOpen] = useState(wide)
  const me = user?.employee?.id

  const tab: HrTab = isHr && (filters.tab === 'my' || filters.tab === 'sign') ? filters.tab : 'all'
  const status = (STATUS_FILTER as string[]).includes(filters.status) ? filters.status : ''
  const type = (ORDER_TYPE_CODES as readonly string[]).includes(filters.type) ? filters.type : ''
  const asOfActive = !!filters.asof
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  // v1 `buildOrdersListParams`: the slice each role works with.
  const listParams = useMemo<OrderListParams>(() => {
    const p: OrderListParams = {
      search: search.trim() || undefined,
      date_from: filters.from || undefined,
      date_to: filters.to || undefined,
      number: filters.num.trim() || undefined,
      author: filters.author.trim() || undefined,
      name: filters.name.trim() || undefined,
      type: type || undefined,
      department_id: filters.dept ? Number(filters.dept) : undefined,
      status: status || undefined,
      category_id: filters.cat ? Number(filters.cat) : undefined,
      light: true,
      organization_branch_id: selectedBranchId ?? undefined,
    }
    const emp = filters.emp ? Number(filters.emp) : undefined
    if (isHr) {
      if (tab === 'my') p.created_by_id = me
      else if (tab === 'sign') {
        p.signer = true
        p.employee_id = emp
      } else p.employee_id = emp
    } else if (management) {
      // Leadership sees what it is assigned to sign, across every branch.
      p.assigned_signer = true
      p.organization_branch_id = null
      p.employee_id = emp
    } else p.employee_id = emp
    return p
  }, [search, filters, type, status, selectedBranchId, isHr, management, tab, me])

  const asOfParams = useMemo<OrderListParams>(
    () => ({
      date_from: listParams.date_from,
      date_to: listParams.date_to,
      number: listParams.number,
      author: listParams.author,
      name: listParams.name,
      type: listParams.type,
      status: listParams.status,
      search: listParams.search,
      category_id: listParams.category_id,
      organization_branch_id: listParams.organization_branch_id,
    }),
    [listParams],
  )

  const live = useOrderList(listParams, !rangeInvalid)
  const asOf = useOrdersAsOf(filters.asof, asOfParams, asOfActive && !rangeInvalid)
  const rows: OrderAct[] = useMemo(
    () =>
      asOfActive
        ? asOf.rows.map((r) => ({
            id: r.id,
            act_number: r.act_number,
            act_date: r.act_date,
            summary: r.summary,
            description: r.description,
            status: r.status,
            category_id: r.category_id,
            category_rel: r.category ?? null,
            created_by: r.created_by ? { id: r.created_by.id, legal_name: r.created_by.full_name } : null,
          }))
        : live.rows,
    [asOfActive, asOf.rows, live.rows],
  )
  const { slice, total, pages, page: safePage } = paginateClient(rows, page, size)

  // The red counter does not follow the HR tab: it is always the «all» view's
  // count of orders waiting for this user (v1, 2026-07-22).
  const [waiting, setWaiting] = useState(0)
  const liveWaiting = live.rows.filter((o) => o.action_required).length
  useEffect(() => {
    if (tab === 'all' && !live.loading) setWaiting(liveWaiting)
  }, [tab, liveWaiting, live.loading])

  const [detailId, setDetailId] = useState<number | null>(null)
  const [docOrder, setDocOrder] = useState<OrderAct | null>(null)
  const [form, setForm] = useState<{ open: boolean; editId: number | null }>({ open: false, editId: null })
  const [rejectTarget, setRejectTarget] = useState<OrderAct | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  // Deep link: `?open=<id>` (search, employee card), `?doc=` (notifications), `?view=` (QR).
  const openParam = params.get('open') || params.get('doc') || params.get('view')
  useEffect(() => {
    if (!openParam) return
    const id = Number(openParam)
    if (Number.isFinite(id) && id > 0) setDetailId(id)
    const next = new URLSearchParams(params)
    next.delete('open')
    next.delete('doc')
    next.delete('view')
    setParams(next, { replace: true })
  }, [openParam, params, setParams])

  const { all: categories } = useOrderTypes('', '')
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: String(c.id), label: c.name ?? `#${c.id}` })), [categories])
  const departmentOptions = useDepartmentOptions(selectedBranchId)
  const [empKnown, setEmpKnown] = useState<SelectOption[]>([])
  const statusOptions = STATUS_FILTER.map((s) => ({ value: s, label: decreeStatusLabel(t, s) }))
  const typeOptions = ORDER_TYPE_CODES.map((c) => ({ value: c, label: orderTypeLabel(t, c) }))

  const extraCount = [filters.type, filters.dept, filters.num, filters.name, filters.author, filters.asof].filter(Boolean).length
  const moreOpen = filters.more === '1' || extraCount > 0
  const filterCount = activeFilterCount - (filters.tab ? 1 : 0) - (filters.more ? 1 : 0)

  const act = async (row: OrderAct, p: () => Promise<unknown>, done: string) => {
    setBusyId(row.id)
    try {
      await p()
      mut.invalidate()
      toast.ok(done)
    } catch {
      /* the mutation cache toasts the server's reason */
    } finally {
      setBusyId(null)
    }
  }
  const approve = async (row: OrderAct) => {
    if (isDecreeOrder(row)) {
      const ok = await confirm({
        kind: 'approve',
        title: t('orders.agreeTitle'),
        description: t('orders.agreeConfirmNamed', { name: row.category_rel?.name || t('orders.order') }),
        confirmLabel: t('orders.agreeYes'),
      })
      if (ok) await act(row, () => mut.approve.mutateAsync(row.id), t('orders.agreed'))
    } else await act(row, () => mut.sign.mutateAsync(row.id), t('orders.signedDone'))
  }
  const remove = async (row: OrderAct) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('orders.deleteTitle'),
      description: t('orders.deleteConfirm', { n: row.act_number || row.id }),
      confirmLabel: t('orders.deleteYes'),
    })
    if (ok) await act(row, () => mut.remove.mutateAsync(row.id), t('orders.deleted'))
  }

  const rowActions = (row: OrderAct): ReactNode => {
    const loadingRow = busyId === row.id
    const info = (
      <IconButton size="sm" label={t('orders.details')} onClick={() => setDetailId(row.id)}>
        <Info size={15} />
      </IconButton>
    )
    if (asOfActive) return info
    const p = orderPowers(row, user)
    const decree = isDecreeOrder(row)
    return (
      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
        {info}
        {decree && (
          <IconButton size="sm" label={t('orders.openDocument')} onClick={() => setDocOrder(row)}>
            <FileText size={15} />
          </IconButton>
        )}
        {(p.approveReject || p.signLegacy) && (
          <>
            <Button size="sm" variant="outline" className="text-danger" leftIcon={<XCircle size={14} />} disabled={loadingRow} onClick={() => setRejectTarget(row)}>
              {t('orders.reject')}
            </Button>
            <Button size="sm" leftIcon={<CheckCircle2 size={14} />} loading={loadingRow} onClick={() => approve(row)}>
              {decree ? t('orders.agree') : t('orders.sign')}
            </Button>
          </>
        )}
        {p.resubmit && (
          <Button size="sm" variant="secondary" leftIcon={<Send size={14} />} loading={loadingRow} onClick={() => act(row, () => mut.resubmit.mutateAsync(row.id), t('orders.resubmitted'))}>
            {t('orders.resubmit')}
          </Button>
        )}
        {p.sendToLeadership && (
          <Button size="sm" variant="secondary" leftIcon={<Send size={14} />} loading={loadingRow} onClick={() => act(row, () => mut.sendToLeadership.mutateAsync(row.id), t('orders.sentToLeadership'))}>
            {t('orders.sendToLeadership')}
          </Button>
        )}
        {p.submit && (
          <IconButton size="sm" label={submitLabel(t, row)} disabled={loadingRow} onClick={() => act(row, () => mut.submit.mutateAsync(row.id), t('orders.submitted'))}>
            <Send size={15} className="text-brand" />
          </IconButton>
        )}
        {p.confirmSubmission && (
          <IconButton size="sm" label={t('orders.confirmAsSubmitter')} disabled={loadingRow} onClick={() => act(row, () => mut.confirmSubmission.mutateAsync(row.id), t('orders.confirmedDone'))}>
            <CheckCircle2 size={15} className="text-success" />
          </IconButton>
        )}
        {p.edit && (
          <IconButton size="sm" label={t('common.edit')} onClick={() => setForm({ open: true, editId: row.id })}>
            <Pencil size={15} />
          </IconButton>
        )}
        {p.delete && (
          <IconButton size="sm" label={t('common.delete')} disabled={loadingRow} onClick={() => remove(row)}>
            <Trash2 size={15} className="text-danger" />
          </IconButton>
        )}
      </div>
    )
  }

  const waitingRow = (o: OrderAct) => !asOfActive && !!o.action_required
  const columns: Column<OrderAct>[] = [
    {
      key: 'idx',
      header: '№',
      headerClassName: 'w-12',
      className: 'tabular-nums text-fg-subtle',
      skeleton: 'w-6',
      cell: (_r, i) => `${(safePage - 1) * size + i + 1}.`,
    },
    {
      key: 'number',
      header: t('orders.colNumber'),
      skeleton: 'w-14',
      sortValue: (r) => r.act_number ?? '',
      cell: (r) => <span className={cn('font-semibold', waitingRow(r) ? 'text-warning' : 'text-fg')}>{r.act_number || '—'}</span>,
    },
    {
      key: 'summary',
      header: t('orders.colSummary'),
      skeleton: 'w-64',
      label: t('orders.colSummary'),
      cell: (r) => (
        <span className="block min-w-0 max-w-[34rem]">
          <span className={cn('block truncate text-[13px] font-semibold', waitingRow(r) ? 'text-warning' : 'text-fg')} title={r.summary || r.description || ''}>
            {r.summary || r.description || '—'}
          </span>
          <span className="block truncate text-[11.5px] text-fg-subtle">{r.category_rel?.name || '—'}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: t('orders.colDate'),
      skeleton: 'w-20',
      className: 'tabular-nums text-fg-muted',
      sortValue: (r) => r.act_date ?? '',
      cell: (r) => fmtDate(r.act_date),
    },
    {
      key: 'type',
      header: t('orders.colType'),
      skeleton: 'w-24',
      className: 'whitespace-nowrap text-fg-muted',
      sortValue: (r) => r.category_rel?.name ?? '',
      cell: (r) => r.category_rel?.name || '—',
    },
    {
      key: 'status',
      header: t('orders.colStatus'),
      skeleton: 'w-24',
      sortValue: (r) => r.status ?? '',
      cell: (r) => <OrderStatusBadge order={r} />,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-px',
      className: 'pr-4 text-right',
      skeleton: 'w-16',
      cell: rowActions,
    },
  ]

  const tabCount = waiting > 0 ? waiting : undefined

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
        actions={
          <>
            {showAnalytics && (
              <Button variant="ghost" leftIcon={<BarChart3 size={16} />} onClick={() => setAnalyticsOpen((o) => !o)} aria-expanded={analyticsOpen}>
                {analyticsOpen ? t('orders.analyticsHide') : t('orders.analyticsShow')}
              </Button>
            )}
            {canManage && !asOfActive && (
              <Button leftIcon={<Plus size={16} />} onClick={() => setForm({ open: true, editId: null })}>
                {t('orders.add')}
              </Button>
            )}
          </>
        }
      />

      {showAnalytics && analyticsOpen && <OrderStats />}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {isHr ? (
          <div className="scroll-thin max-w-full overflow-x-auto">
          <Segmented<HrTab>
            value={tab}
            onChange={(v) => setFilters({ tab: v === 'all' ? null : v, emp: v === 'my' ? null : filters.emp || null })}
            options={[
              { value: 'all', label: t('orders.tabAll'), count: tabCount },
              { value: 'my', label: t('orders.tabMy') },
              { value: 'sign', label: t('orders.tabSign') },
            ]}
          />
          </div>
        ) : (
          <h2 className="text-[15px] font-semibold text-fg">{t('orders.listTitle')}</h2>
        )}
        {waiting > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-soft px-2.5 py-1 text-[12px] font-semibold text-danger">
            <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-danger px-1 text-[11px] text-white">{waiting > 99 ? '99+' : waiting}</span>
            {t('orders.waitingYou')}
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[14rem] flex-1 lg:max-w-xs">
              <span className={LABEL_CLS}>{t('orders.fSearch')}</span>
              <SearchInput value={search} onChange={setSearch} placeholder={t('orders.searchPlaceholder')} delay={350} />
            </div>
            <div className="w-full sm:w-44">
              <span className={LABEL_CLS}>{t('orders.fStatus')}</span>
              <Combobox className="w-full" value={status} onChange={(v) => setFilter('status', v)} options={statusOptions} placeholder={t('orders.allStatuses')} />
            </div>
            <div className="w-full sm:w-52">
              <span className={LABEL_CLS}>{t('orders.fCategoryFilter')}</span>
              <Combobox className="w-full" value={filters.cat} onChange={(v) => setFilter('cat', v)} options={categoryOptions} placeholder={t('orders.allTypes')} />
            </div>
            {!(isHr && tab === 'my') && (
              <div className="w-full sm:w-56">
                <span className={LABEL_CLS}>{t('orders.fEmployee')}</span>
                <EmployeeSelect
                  value={filters.emp}
                  onChange={(v, o) => {
                    if (o) setEmpKnown((k) => [...k.filter((x) => x.value !== o.value), o])
                    setFilter('emp', v)
                  }}
                  branchId={selectedBranchId}
                  known={empKnown}
                  placeholder={t('orders.allEmployees')}
                />
              </div>
            )}
            <div className="w-[calc(50%-5px)] sm:w-40">
              <span className={LABEL_CLS}>{t('orders.dateFrom')}</span>
              <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} />
            </div>
            <div className="w-[calc(50%-5px)] sm:w-40">
              <span className={LABEL_CLS}>{t('orders.dateTo')}</span>
              <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} />
            </div>
            <FilterToggle open={moreOpen} onToggle={() => setFilter('more', moreOpen && !extraCount ? '' : '1')} count={extraCount} />
            <FilterReset count={filterCount} onReset={reset} />
          </div>
          {rangeInvalid && <p role="alert" className="text-xs text-danger">{t('list.invalidRange')}</p>}

          {moreOpen && (
            <div className="flex flex-wrap items-end gap-2.5 border-t border-line pt-3">
              <div className="w-full sm:w-44">
                <span className={LABEL_CLS}>{t('orders.fOrderType')}</span>
                <Combobox className="w-full" value={type} onChange={(v) => setFilter('type', v)} options={typeOptions} placeholder={t('orders.allTypes')} />
              </div>
              <div className="w-full sm:w-52">
                <span className={LABEL_CLS}>{t('orders.fDepartmentFilter')}</span>
                <Combobox className="w-full" value={filters.dept} onChange={(v) => setFilter('dept', v)} options={departmentOptions} placeholder={t('orders.allDepartments')} />
              </div>
              <div className="w-[calc(50%-5px)] sm:w-32">
                <label className={LABEL_CLS} htmlFor="orders-f-num">{t('orders.colNumber')}</label>
                <DebouncedInput id="orders-f-num" value={filters.num} onChange={(v) => setFilter('num', v)} placeholder="125" />
              </div>
              <div className="w-[calc(50%-5px)] sm:w-44">
                <label className={LABEL_CLS} htmlFor="orders-f-name">{t('orders.fName')}</label>
                <DebouncedInput id="orders-f-name" value={filters.name} onChange={(v) => setFilter('name', v)} placeholder={t('orders.namePlaceholder')} />
              </div>
              <div className="w-full sm:w-44">
                <label className={LABEL_CLS} htmlFor="orders-f-author">{t('orders.fAuthorFilter')}</label>
                <DebouncedInput id="orders-f-author" value={filters.author} onChange={(v) => setFilter('author', v)} placeholder={t('orders.authorPlaceholder')} />
              </div>
              <div>
                <span className={LABEL_CLS}>{t('orders.asOf')}</span>
                <div className="flex h-control items-center gap-2.5">
                  <Checkbox
                    label={t('orders.asOfOn')}
                    checked={asOfActive}
                    onChange={(e) => setFilter('asof', e.target.checked ? todayIso() : '')}
                  />
                  {asOfActive && (
                    <div className="w-40">
                      <DateInput value={filters.asof} onChange={(v) => setFilter('asof', v)} aria-label={t('orders.asOf')} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {asOfActive && (
          <p className="flex flex-wrap items-center gap-2 border-b border-line bg-warning-soft px-4 py-2 text-[12.5px]">
            <History size={14} className="shrink-0 text-warning" />
            <span className="font-semibold text-warning">{t('orders.asOfBanner', { date: fmtDate(filters.asof) })}</span>
            <span className="text-fg-muted">{t('orders.asOfReadOnly')}</span>
          </p>
        )}

        <DataTable
          tableId="orders"
          rows={slice}
          columns={columns}
          loading={asOfActive ? asOf.loading : live.loading}
          error={asOfActive ? asOf.error : live.error}
          onRetry={() => void (asOfActive ? asOf.refetch() : live.refetch())}
          onRowClick={(r) => setDetailId(r.id)}
          rowClassName={(r) => (waitingRow(r) ? 'bg-warning-soft/60 shadow-[inset_3px_0_0_rgb(var(--warning))] hover:bg-warning-soft' : undefined)}
          emptyTitle={filterCount > 0 ? t('orders.notFoundList') : t('orders.empty')}
          emptyAction={<FilterReset count={filterCount} onReset={reset} />}
          minWidth={960}
        />

        <Pagination page={safePage} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={asOfActive ? asOf.fetching : live.fetching} />
      </Card>

      <OrderDetailDrawer
        id={detailId}
        readOnly={asOfActive}
        onClose={() => setDetailId(null)}
        onOpenDocument={(o) => setDocOrder(o)}
      />

      <OrderDocumentViewer
        id={docOrder?.id ?? null}
        title={docOrder ? `№${docOrder.act_number || docOrder.id} ${docOrder.category_rel?.name || ''}`.trim() : ''}
        onClose={() => setDocOrder(null)}
      />

      <OrderFormDrawer
        open={form.open}
        editId={form.editId}
        onClose={() => setForm({ open: false, editId: null })}
        onSaved={(createdId) => {
          setForm({ open: false, editId: null })
          // A new order opens straight away — «Yuborish» is the next step.
          if (createdId) setDetailId(createdId)
        }}
      />

      <RejectReasonModal
        open={!!rejectTarget}
        loading={mut.decreeReject.isPending || mut.reject.isPending}
        onClose={() => setRejectTarget(null)}
        onSubmit={async (reason) => {
          const row = rejectTarget
          if (!row) return
          setRejectTarget(null)
          await act(
            row,
            () => (isDecreeOrder(row) ? mut.decreeReject.mutateAsync({ id: row.id, comment: reason }) : mut.reject.mutateAsync(row.id)),
            t('orders.rejectedDone'),
          )
        }}
      />
    </PageContainer>
  )
}
