import { Avatar } from '@/components/ui/Avatar'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, List as ListIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useListParams } from '@/hooks/useListParams'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { formatAppDate } from '@/lib/format'
import { fetchAllPages } from '@/api/fetchAll'
import { HOLIDAYS_LIST } from '@/api/endpoints'
import { useHolidays, useHolidayMutations, type Holiday } from '@/features/holidays/useHolidays'
import { useDutyDays, useDutyDayMutations, type DutyDay } from '@/features/holidays/useDutyDays'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { RowList } from '@/components/ui/RowList'
import { Segmented } from '@/components/ui/Segmented'
import { HolidayYearCalendar } from '@/features/holidays/HolidayYearCalendar'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { LABEL_CLS } from '@/components/ui/control'
import { useBranchStore } from '@/store/branchStore'
import { canManageHolidays, canManageStructure } from '@/auth/canManage'
import { useAuthStore } from '@/store/authStore'
import { Checkbox } from '@/components/ui/Checkbox'

const FILTER_KEYS = ['type', 'kind', 'view'] as const

interface TabProps {
  canWrite: boolean
  creating: boolean
  setCreating: (v: boolean) => void
}

/**
 * BAYRAMLAR — two registers that only make sense together.
 *
 * A HOLIDAY closes the organisation; a DUTY DAY names the people who are at
 * work through it anyway. Attendance reads both, so they belong on one screen
 * — v2 shipped only the first half and the duty register was unreachable.
 */
export function HolidaysPage() {
  const { t } = useTranslation()
  // ⚠️ Yozuv huquqi — `auth/canManage.ts` dagi YAGONA manbadan
  // (backend darvozasining ko'zgusi). Ilgari tugmalar hammaga
  // ko'rinardi va faqat saqlashda 403 chiqardi.
  const user = useAuthStore((st) => st.user)
  const [params, setParams] = useSearchParams()
  const tab: 'holidays' | 'duty' = params.get('tab') === 'duty' ? 'duty' : 'holidays'
  // Bayram — butun tashkilot kalendari, faqat bosh filial kadri yozadi;
  // navbatchilik kunlari esa filial xodimlariniki — filial kadri ham yozadi.
  const canWrite = tab === 'duty' ? canManageStructure(user) : canManageHolidays(user)
  const [creating, setCreating] = useState(false)

  return (
    <PageContainer>
      <PageHeader
        title={t('holidays.title')}
        subtitle={tab === 'duty' ? t('holidays.dutySubtitle') : t('holidays.subtitle')}
        actions={
          canWrite ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
              {tab === 'duty' ? t('holidays.dutyCreate') : t('holidays.create')}
            </Button>
          ) : undefined
        }
      />

      <Segmented
        className="mb-4 w-fit"
        value={tab}
        onChange={(v) => {
          const next = new URLSearchParams(params)
          // Page and filters belong to the tab that set them; carrying them
          // across produces an empty list on the other register.
          next.delete('page')
          next.delete('type')
          if (v === 'duty') next.set('tab', 'duty')
          else next.delete('tab')
          setParams(next, { replace: true })
          setCreating(false)
        }}
        options={[
          { value: 'holidays', label: t('holidays.tabHolidays') },
          { value: 'duty', label: t('holidays.tabDuty') },
        ]}
      />

      {tab === 'duty' ? (
        <DutyDaysTab canWrite={canWrite} creating={creating} setCreating={setCreating} />
      ) : (
        <HolidaysTab canWrite={canWrite} creating={creating} setCreating={setCreating} />
      )}
    </PageContainer>
  )
}

function HolidaysTab({ canWrite, creating, setCreating }: TabProps) {
  const selectedBranchId = useBranchStore((st) => st.selectedBranchId)
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)

  // Name search goes to the server (`/holidays?search=`) — the old client
  // filter only looked at the current page.
  const { rows, total, pages, loading, fetching, error, refetch } = useHolidays(page, size, filters.type, search, filters.kind)
  const { create, update, remove, invalidate } = useHolidayMutations()
  const bulk = useBulkAction()

  // Selection survives paging; «select all N» walks the same filtered list.
  // ⚠️ size 100: a fastapi-pagination `Page` — the endpoint rejects more.
  const selection = useRowSelection(rows, {
    total,
    loadAllIds: () =>
      fetchAllPages<Holiday>(
        HOLIDAYS_LIST,
        {
          organization_branch_id: selectedBranchId || undefined,
          is_repeatable: filters.type === '' || filters.type == null ? undefined : filters.type === 'yes',
          search: search.trim() || undefined,
          kind: filters.kind || undefined,
        },
        100,
        60,
      ).then((r) => r.map((x) => x.id)),
    resetKey: JSON.stringify([selectedBranchId, filters.type, search, filters.kind]),
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const typeOptions = [
    { value: 'yes', label: t('holidays.repeatable') },
    { value: 'no', label: t('holidays.oneTime') },
  ]
  const kindOptions = [
    { value: 'holiday', label: t('holidays.kindHoliday') },
    { value: 'workday', label: t('holidays.kindWorkday') },
  ]

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => remove.mutateAsync(id))
    invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('holidays.deleted', { count: ids.length }) })
      selection.clear()
    }
  }

  const columns: Column<Holiday>[] = [
    {
      key: 'name',
      header: t('holidays.colName'),
      skeleton: 'w-56',
      cell: (row) => <span className="font-semibold text-fg">{row.name || '—'}</span>,
    },
    {
      key: 'from',
      header: t('holidays.colDateFrom'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-24',
      cell: (row) => (row.date_from ? formatAppDate(row.date_from) : '—'),
    },
    {
      key: 'to',
      header: t('holidays.colDateTo'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-24',
      cell: (row) => (row.date_to ? formatAppDate(row.date_to) : '—'),
    },
    {
      key: 'kind',
      header: t('holidays.colKind'),
      skeleton: 'w-24',
      cell: (row) => (
        <Badge tone={row.kind === 'workday' ? 'success' : 'danger'} dot>
          {row.kind === 'workday' ? t('holidays.kindWorkdayShort') : t('holidays.kindHolidayShort')}
        </Badge>
      ),
    },
    {
      key: 'type',
      header: t('holidays.colType'),
      skeleton: 'w-20',
      cell: (row) => (
        <Badge tone={row.is_repeatable ? 'brand' : 'neutral'}>
          {row.is_repeatable ? t('holidays.repeatable') : t('holidays.oneTime')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-12',
      className: 'pr-4 text-right',
      skeleton: 'w-8',
      cell: (row) =>
        canWrite ? (
          <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(row)}>
            <Pencil size={15} />
          </IconButton>
        ) : null,
    },
  ]

  return (
    <>
      {notice && (
        <div
          role="status"
          className={
            notice.kind === 'ok'
              ? 'mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success'
              : 'mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning'
          }
        >
          {notice.text}
        </div>
      )}

      <p className="mb-3 text-sm text-fg-muted">
        {canWrite ? t('holidays.orgWideHint') : t('holidays.orgWideReadOnly')}
      </p>

      {/* Calendar first — «which days are off this year» is the question;
          the table stays for search, bulk delete and exact edits. */}
      <Segmented
        className="mb-3"
        variant="brand"
        value={filters.view || 'cal'}
        onChange={(v) => setFilter('view', v === 'cal' ? '' : v)}
        options={[
          { value: 'cal', icon: <CalendarDays size={14} />, label: t('holidays.viewCalendar') },
          { value: 'list', icon: <ListIcon size={14} />, label: t('holidays.viewList') },
        ]}
      />

      {(filters.view || 'cal') === 'cal' ? (
        <HolidayYearCalendar onPick={(h) => { if (canWrite) setEditing(h) }} />
      ) : (
      <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('holidays.searchPlaceholder')}
            className="flex-1 lg:max-w-md"
          />
          <Combobox
            value={filters.type}
            onChange={(v) => setFilter('type', v)}
            options={typeOptions}
            placeholder={t('holidays.allTypes')}
            className="w-full lg:w-52"
          />
          <Combobox
            value={filters.kind}
            onChange={(v) => setFilter('kind', v)}
            options={kindOptions}
            placeholder={t('holidays.allKinds')}
            className="w-full lg:w-56"
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        <DataTable
        tableId="holidays-1"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={canWrite ? selection : undefined}
          emptyTitle={t('holidays.empty')}
          emptyDescription={t('holidays.emptyHint')}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={700}
        />

        <Pagination
          page={page}
          size={size}
          total={total}
          pages={pages}
          onPage={setPage}
          onSize={setSize}
          loading={fetching}
        />
      </Card>
      )}

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        {canWrite && (
          <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        )}
      </BulkBar>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        danger
        title={t('holidays.deleteTitle')}
        description={t('holidays.deleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <HolidayModal
        open={creating || !!editing}
        value={editing}
        loading={create.isPending || update.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={async (body) => {
          try {
            // Filial YUBORILMAYDI: har bir bayram butun tashkilotniki
            // (server `organization_branch_id` ni e'tiborsiz qoldiradi va
            // eski filialli yozuvni tahrirda umumiyga o'tkazadi).
            if (editing) await update.mutateAsync({ id: editing.id, body })
            else await create.mutateAsync(body)
            invalidate()
            setNotice({ kind: 'ok', text: editing ? t('holidays.updated') : t('holidays.created') })
            setCreating(false)
            setEditing(null)
          } catch {
            // The global mutation toast already shows the server's reason;
            // the dialog stays open so nothing typed is lost.
          }
        }}
      />
    </>
  )
}

interface ModalProps {
  open: boolean
  value: Holiday | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}

function HolidayModal({ open, value, loading, onClose, onSubmit }: ModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [repeatable, setRepeatable] = useState(false)
  const [kind, setKind] = useState<'holiday' | 'workday'>('holiday')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(value?.name ?? '')
    setFrom(value?.date_from ?? '')
    setTo(value?.date_to ?? '')
    setRepeatable(value?.is_repeatable ?? false)
    setKind(value?.kind ?? 'holiday')
    setError('')
  }, [open, value])

  const submit = () => {
    if (!name.trim()) return setError(t('holidays.nameRequired'))
    if (!from || !to) return setError(t('holidays.dateRequired'))
    if (to < from) return setError(t('holidays.dateOrder'))
    onSubmit({ name: name.trim(), date_from: from, date_to: to, is_repeatable: repeatable, kind })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={value ? t('holidays.editTitle') : t('holidays.createTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={loading}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('holidays.fieldName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('holidays.fieldName')} />
        </Field>

        <Field label={t('holidays.fieldKind')} hint={t('holidays.kindHint')}>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'holiday', label: t('holidays.kindHoliday') },
              { value: 'workday', label: t('holidays.kindWorkday') },
            ]}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLS}>
              {t('holidays.fieldDateFrom')}
            </span>
            <DateInput value={from} onChange={(v) => setFrom(v)} aria-label={t('holidays.fieldDateFrom')} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>
              {t('holidays.fieldDateTo')}
            </span>
            <DateInput value={to} onChange={(v) => setTo(v)} min={from || undefined} aria-label={t('holidays.fieldDateTo')} />
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox inLabel checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} />
          <span className="inline-flex items-center gap-1.5 text-sm text-fg">
            <CalendarDays size={15} className="text-fg-muted" />
            {t('holidays.fieldRepeatable')}
          </span>
        </label>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

/**
 * NAVBATCHILIK KUNLARI — a period plus the people who work through it.
 *
 * There is no name and no repeat flag: the record IS "these employees, these
 * dates". Deleting one is the whole point of the register being editable — a
 * period entered by mistake otherwise stays in the attendance calculation
 * forever.
 */
function DutyDaysTab({ canWrite, creating, setCreating }: TabProps) {
  const { t } = useTranslation()
  const { page, setPage, size, setSize } = useListParams([])
  const { rows, total, pages, loading, fetching, error, refetch } = useDutyDays(page, size)
  const { create, update, remove, invalidate } = useDutyDayMutations()
  const bulk = useBulkAction()
  const branchId = useBranchStore((st) => st.selectedBranchId)
  // Selection survives paging; «select all N» walks the list (size 100 = `Page` cap).
  const selection = useRowSelection(rows, {
    total,
    loadAllIds: () =>
      fetchAllPages<DutyDay>('duty-days', { organization_branch_id: branchId || undefined }, 100, 60).then((r) =>
        r.map((x) => x.id),
      ),
    resetKey: String(branchId ?? ''),
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState<DutyDay | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => remove.mutateAsync(id))
    invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('holidays.dutyDeleted', { count: ids.length }) })
      selection.clear()
    }
  }

  const columns: Column<DutyDay>[] = [
    {
      key: 'from',
      header: t('holidays.colDateFrom'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-24',
      cell: (row) => (row.date_from ? formatAppDate(row.date_from) : '—'),
    },
    {
      key: 'to',
      header: t('holidays.colDateTo'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-24',
      cell: (row) => (row.date_to ? formatAppDate(row.date_to) : '—'),
    },
    {
      key: 'employees',
      header: t('holidays.colEmployees'),
      skeleton: 'w-64',
      cell: (row) => {
        const emps = (row.employees ?? []).filter((e) => e.legal_name)
        const names = emps.map((e) => e.legal_name)
        if (names.length === 0) return <span className="text-fg-subtle">—</span>
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="flex -space-x-1.5">
              {emps.slice(0, 3).map((e) => (
                <Avatar key={e.id} src={e.photo_thumb_path} fallbackSrc={e.photo_path} name={e.legal_name ?? '?'} size={24} className="ring-2 ring-surface" />
              ))}
            </span>
            <span className="truncate text-fg">{names.slice(0, 3).join(', ')}</span>
            {names.length > 3 && <Badge tone="neutral">+{names.length - 3}</Badge>}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-12',
      className: 'pr-4 text-right',
      skeleton: 'w-8',
      cell: (row) =>
        canWrite ? (
          <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(row)}>
            <Pencil size={15} />
          </IconButton>
        ) : null,
    },
  ]

  return (
    <>
      {notice && (
        <div
          role="status"
          className={
            notice.kind === 'ok'
              ? 'mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success'
              : 'mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning'
          }
        >
          {notice.text}
        </div>
      )}

      <Card className="flex h-[calc(100dvh-16rem)] flex-col overflow-hidden">
        <DataTable
        tableId="holidays-2"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={canWrite ? selection : undefined}
          emptyTitle={t('holidays.dutyEmpty')}
          emptyDescription={t('holidays.dutyEmptyHint')}
          minWidth={700}
        />
        <Pagination
          page={page}
          size={size}
          total={total}
          pages={pages}
          onPage={setPage}
          onSize={setSize}
          loading={fetching}
        />
      </Card>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        {canWrite && (
          <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        )}
      </BulkBar>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        danger
        title={t('holidays.dutyDeleteTitle')}
        description={t('holidays.dutyDeleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <DutyDayModal
        open={creating || !!editing}
        value={editing}
        loading={create.isPending || update.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={async (body) => {
          try {
            if (editing) await update.mutateAsync({ id: editing.id, body })
            else await create.mutateAsync(body)
            invalidate()
            setNotice({ kind: 'ok', text: editing ? t('holidays.dutyUpdated') : t('holidays.dutyCreated') })
            setCreating(false)
            setEditing(null)
          } catch {
            // The global mutation toast already shows the server's reason;
            // the dialog stays open so nothing typed is lost.
          }
        }}
      />
    </>
  )
}

function DutyDayModal({
  open,
  value,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  value: DutyDay | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const { options } = useEmployeeOptions(branchId, open)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setFrom(value?.date_from ?? '')
    setTo(value?.date_to ?? '')
    setIds((value?.employees ?? []).map((e) => String(e.id)))
    setError('')
  }, [open, value])

  const submit = () => {
    if (!from || !to) return setError(t('holidays.dateRequired'))
    if (to < from) return setError(t('holidays.dateOrder'))
    const picked = Array.from(new Set(ids.filter(Boolean))).map(Number)
    if (picked.length === 0) return setError(t('holidays.dutyEmployeeRequired'))
    onSubmit({ date_from: from, date_to: to, employee_ids: picked })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={value ? t('holidays.dutyEditTitle') : t('holidays.dutyCreateTitle')}
      description={t('holidays.dutyModalHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={loading}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLS}>{t('holidays.fieldDateFrom')}</span>
            <DateInput value={from} onChange={setFrom} aria-label={t('holidays.fieldDateFrom')} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>{t('holidays.fieldDateTo')}</span>
            <DateInput value={to} onChange={setTo} min={from || undefined} aria-label={t('holidays.fieldDateTo')} />
          </label>
        </div>

        <Field label={t('holidays.colEmployees')} hint={t('holidays.dutyEmployeesHint')}>
          <RowList
            count={ids.length}
            addLabel={t('holidays.dutyAddEmployee')}
            emptyHint={t('holidays.dutyEmployeesEmpty')}
            onAdd={() => setIds((p) => [...p, ''])}
            onRemove={(i) => setIds((p) => p.filter((_, x) => x !== i))}
            renderRow={(i) => (
              <Combobox
                value={ids[i] ?? ''}
                onChange={(v) => setIds((p) => p.map((x, idx) => (idx === i ? v : x)))}
                options={options}
                placeholder={t('holidays.dutyAddEmployee')}
              />
            )}
          />
        </Field>

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}
