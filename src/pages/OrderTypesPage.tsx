import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { paginateClient } from '@/lib/paginate'
import {
  useOrderTypes,
  useOrderTypeMutations,
  type CreatorRole,
  type OrderType,
} from '@/features/orderTypes/useOrderTypes'
import { LABEL_CLS } from '@/components/ui/control'
import { canManageOrderTypes } from '@/auth/canManage'
import { useAuthStore } from '@/store/authStore'

const FILTER_KEYS = ['flow'] as const

export function OrderTypesPage() {
  // ⚠️ Yozuv huquqi — `auth/canManage.ts` dagi YAGONA manbadan
  // (backend darvozasining ko'zgusi). Ilgari tugmalar hammaga
  // ko'rinardi va faqat saqlashda 403 chiqardi.
  const currentUser = useAuthStore((st) => st.user)
  const canWrite = canManageOrderTypes(currentUser)
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)

  const { all, loading, fetching, error, refetch } = useOrderTypes(search, filters.flow)
  const { create, update, remove, invalidate } = useOrderTypeMutations()
  const bulk = useBulkAction()

  const { slice: rows, total, pages } = paginateClient(all, page, size)
  // Client-paginated: every matching row is already loaded, so «select all
  // N» just ticks the whole filtered list, not only the visible page.
  const allIds = useCallback(async () => all.map((r) => r.id), [all])
  const selection = useRowSelection(rows, {
    total,
    loadAllIds: allIds,
    resetKey: JSON.stringify([search, filters.flow]),
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toDelete, setToDelete] = useState<OrderType | null>(null)
  const [editing, setEditing] = useState<OrderType | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const flowOptions = useMemo(
    () => [
      { value: 'employee', label: t('orderTypes.flowEmployee') },
      { value: 'hr', label: t('orderTypes.flowHr') },
    ],
    [t],
  )

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => remove.mutateAsync(id))
    invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('orderTypes.deleted', { count: ids.length }) })
      selection.clear()
    }
  }

  const columns: Column<OrderType>[] = [
    {
      key: 'name',
      header: t('orderTypes.colName'),
      skeleton: 'w-56',
      cell: (row) => <span className="font-semibold text-fg">{row.name || '—'}</span>,
    },
    {
      key: 'flow',
      header: t('orderTypes.colFlow'),
      skeleton: 'w-24',
      cell: (row) => (
        <Badge tone={row.creator_role === 'hr' ? 'brand' : 'neutral'}>
          {row.creator_role === 'hr' ? t('orderTypes.flowHr') : t('orderTypes.flowEmployee')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      className: 'pr-4 text-right',
      skeleton: 'w-8',
      cell: (row) =>
        canWrite ? (
          <span className="inline-flex gap-1">
            <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(row)}>
              <Pencil size={15} />
            </IconButton>
            <IconButton size="sm" label={t('common.delete')} onClick={() => setToDelete(row)}>
              <Trash2 size={15} className="text-danger" />
            </IconButton>
          </span>
        ) : null,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('orderTypes.title')}
        subtitle={t('orderTypes.subtitle')}
        actions={
          canWrite ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
              {t('orderTypes.create')}
            </Button>
          ) : undefined
        }
      />

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

      <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('orderTypes.searchPlaceholder')} className="flex-1 lg:max-w-md" />
          <Combobox
            value={filters.flow}
            onChange={(v) => setFilter('flow', v)}
            options={flowOptions}
            placeholder={t('orderTypes.allFlows')}
            className="w-full lg:w-56"
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        <DataTable
        tableId="order-types"
          rows={rows}
          columns={columns}
          onRowClick={canWrite ? (r) => setEditing(r) : undefined}
          loading={loading}
          error={error}
          onRetry={refetch}
          selection={canWrite ? selection : undefined}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          emptyTitle={t('orderTypes.empty')}
          emptyDescription={t('orderTypes.emptyHint')}
          minWidth={600}
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
        title={t('orderTypes.deleteTitle')}
        description={t('orderTypes.deleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const row = toDelete
          setToDelete(null)
          if (!row) return
          try {
            await remove.mutateAsync(row.id)
          } catch {
            return
          }
          invalidate()
          setNotice({ kind: 'ok', text: t('orderTypes.deletedOne') })
        }}
        danger
        title={t('orderTypes.deleteOneTitle')}
        description={t('orderTypes.deleteOneConfirm', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />

      <OrderTypeModal
        open={creating || !!editing}
        value={editing}
        flowOptions={flowOptions}
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
            setNotice({
              kind: 'ok',
              text: editing ? t('orderTypes.updated') : t('orderTypes.created'),
            })
            setCreating(false)
            setEditing(null)
          } catch {
            // The global mutation toast already shows the server's reason;
            // the dialog stays open so nothing typed is lost.
          }
        }}
      />
    </PageContainer>
  )
}

interface ModalProps {
  open: boolean
  value: OrderType | null
  flowOptions: { value: string; label: string }[]
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}

function OrderTypeModal({ open, value, flowOptions, loading, onClose, onSubmit }: ModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [flow, setFlow] = useState<CreatorRole | ''>('')
  const [errors, setErrors] = useState<{ name?: string; flow?: string }>({})

  useEffect(() => {
    if (!open) return
    setName(value?.name ?? '')
    setFlow(value?.creator_role ?? '')
    setErrors({})
  }, [open, value])

  const submit = () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('orderTypes.nameRequired')
    if (!flow) next.flow = t('orderTypes.flowRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    onSubmit({ name: name.trim(), creator_role: flow })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={value ? t('orderTypes.editTitle') : t('orderTypes.createTitle')}
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
        <label className="block">
          <span className={LABEL_CLS}>
            {t('orderTypes.fieldName')}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t('orderTypes.fieldName')}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
        </label>

        <div>
          <span className={LABEL_CLS}>
            {t('orderTypes.fieldFlow')}
            <span className="ml-0.5 text-danger">*</span>
          </span>
          {/* The placeholder used to read «Barcha oqimlar» — the LIST FILTER's
              wording, borrowed into a create form where "all flows" is not a
              choice at all. The field is required, so it now says «Tanlang» and
              carries the asterisk the validation implies. */}
          <Combobox
            value={flow}
            onChange={(v) => setFlow(v as CreatorRole)}
            options={flowOptions}
            placeholder={t('t2.pick')}
            invalid={!!errors.flow}
          />
          {errors.flow && <p className="mt-1 text-xs text-danger">{errors.flow}</p>}
        </div>
      </div>
    </Modal>
  )
}
