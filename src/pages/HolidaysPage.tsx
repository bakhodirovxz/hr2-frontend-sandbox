import { lt } from '@/i18n/display'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { canWriteGlobal, canWriteOrg, ownBranchIds } from '@/auth/permissions'
import { useBranches } from '@/hooks/useBranches'
import { useListParams } from '@/hooks/useListParams'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import { paginateClient } from '@/lib/paginate'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { dmy } from '@/features/attendance/period'
import { useHolidayList, useHolidayMutations, type Holiday } from '@/features/holidays/useHolidays'

/** Ko'lam tanlovidagi «butun tashkilot» qiymati (`organization_branch_id: null`). */
const ALL = 'all'

/**
 * BAYRAMLAR (TZ I2; v1 `HolidaysPage`). Bayram kunida tabelda kelmadi va
 * kechikish sanalmaydi, soat qo'shilmaydi. Ko'lam — bitta tashkilot yoki
 * butun tizim; umumiy bayramni faqat butun tizim darajasidagi kadr yozadi
 * (TZ 417/746). Tahrirda bayramning ko'lami saqlanadi.
 */
export function HolidaysPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const canEdit = canWriteOrg(user, 'attendance')
  const { search, setSearch, page, setPage, size, setSize, activeFilterCount, reset } = useListParams([])
  const { rows: all, loading, error, refetch } = useHolidayList()
  const { branches } = useBranches()
  const branchName = (id?: number | null) =>
    id == null ? t('davomat.wholeOrg') : lt(branches.find((b) => b.id === Number(id))?.name) || `#${id}`

  const filtered = useMemo(() => {
    const q = searchFold(search.trim())
    return q ? all.filter((h) => foldIncludes(h.name ?? '', q)) : all
  }, [all, search])
  const view = paginateClient(filtered, page, size)
  const { remove } = useHolidayMutations()
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null)

  const doDelete = async (h: Holiday) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('davomat.hDeleteTitle'),
      description: t('davomat.hDeleteConfirm', { name: h.name }),
    })
    if (!ok) return
    try {
      await remove.mutateAsync(h.id)
      toast.ok(t('davomat.hDeleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<Holiday & { n: number }>[] = [
    { key: 'n', header: '№', headerClassName: 'w-12', className: 'tabular-nums text-fg-subtle', cell: (r) => `${r.n}.` },
    { key: 'name', header: t('davomat.hName'), skeleton: 'w-48', cell: (r) => <span className="font-semibold text-fg">{r.name || '—'}</span> },
    { key: 'from', header: t('davomat.hFrom'), className: 'tabular-nums text-fg-muted', cell: (r) => dmy(r.date_from) },
    { key: 'to', header: t('davomat.hTo'), className: 'tabular-nums text-fg-muted', cell: (r) => dmy(r.date_to) },
    {
      key: 'rep',
      header: t('davomat.hRepeatable'),
      cell: (r) => (r.is_repeatable ? <Badge tone="success">{t('davomat.yes')}</Badge> : <span className="text-fg-subtle">{t('davomat.no')}</span>),
    },
    {
      key: 'scope',
      header: t('davomat.hScope'),
      className: 'text-fg-muted',
      cell: (r) => <span className="block max-w-[18rem] truncate">{branchName(r.organization_branch_id)}</span>,
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            headerClassName: 'w-24',
            className: 'pr-4 text-right',
            cell: (r: Holiday) => (
              <span className="inline-flex gap-1">
                <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton size="sm" label={t('common.delete')} onClick={() => doDelete(r)}>
                  <Trash2 size={15} />
                </IconButton>
              </span>
            ),
          } as Column<Holiday & { n: number }>,
        ]
      : []),
  ]

  const offset = (view.page - 1) * size
  const tableRows = view.slice.map((h, i) => ({ ...h, n: offset + i + 1 }))

  return (
    <PageContainer>
      <PageHeader
        title={t('davomat.hTitle')}
        subtitle={t('davomat.hSubtitle')}
        actions={
          canEdit ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              {t('davomat.hAdd')}
            </Button>
          ) : undefined
        }
      />

      <Card className="flex h-[calc(100dvh-11rem)] min-h-[24rem] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('davomat.hSearch')} className="flex-1 sm:max-w-sm" />
          <FilterReset count={activeFilterCount} onReset={reset} />
          <span className="text-xs tabular-nums text-fg-muted sm:ml-auto">{t('davomat.hTotal', { count: filtered.length })}</span>
        </div>
        <DataTable
          tableId="tz-holidays"
          rows={tableRows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={search ? t('davomat.hNotFound') : t('davomat.hEmpty')}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={760}
        />
        <Pagination page={view.page} size={size} total={view.total} pages={view.pages} onPage={setPage} onSize={setSize} />
      </Card>

      {canEdit && <HolidayModal value={editing} onClose={() => setEditing(null)} branchName={branchName} />}
    </PageContainer>
  )
}

function HolidayModal({
  value,
  onClose,
  branchName,
}: {
  value: Holiday | 'new' | null
  onClose: () => void
  branchName: (id?: number | null) => string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const selectedBranch = useBranchStore((s) => s.selectedBranchId)
  const { branches } = useBranches()
  const { create, update } = useHolidayMutations()
  const open = value != null
  const editing = value && value !== 'new' ? value : null

  // Ko'lam: o'z tashkiloti(lari); «butun tashkilot» — faqat butun tizim darajasida.
  const global = canWriteGlobal(user, 'attendance')
  const own = ownBranchIds(user)
  const scopeOptions = useMemo(() => {
    const list = branches
      .filter((b) => own == null || own.includes(Number(b.id)))
      .map((b) => ({ value: String(b.id), label: lt(b.name) }))
    return global ? [{ value: ALL, label: t('davomat.wholeOrg') }, ...list] : list
  }, [branches, own, global, t])

  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [repeatable, setRepeatable] = useState(false)
  const [scope, setScope] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setFrom(editing?.date_from ?? '')
    setTo(editing?.date_to ?? '')
    setRepeatable(editing?.is_repeatable ?? false)
    const fallback = selectedBranch ? String(selectedBranch) : own?.length === 1 ? String(own[0]) : global ? ALL : ''
    setScope(fallback)
    setErrors({})
    setFormError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const pending = create.isPending || update.isPending
  const submit = async () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = t('davomat.hNameRequired')
    if (!from) next.from = t('davomat.hDateRequired')
    if (!to) next.to = t('davomat.hDateRequired')
    else if (from && to < from) next.to = t('davomat.hDateOrder')
    if (!editing && !scope) next.scope = t('davomat.hScopeRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setFormError('')
    const body = {
      name: name.trim(),
      date_from: from,
      date_to: to,
      is_repeatable: repeatable,
      // Tahrirda bayramning O'Z ko'lami saqlanadi (filialniki umumiyga aylanmaydi).
      organization_branch_id: editing ? editing.organization_branch_id ?? null : scope === ALL ? null : Number(scope),
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body })
      else await create.mutateAsync(body)
      toast.ok(editing ? t('davomat.hUpdated') : t('davomat.hCreated'))
      onClose()
    } catch (e) {
      setFormError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('davomat.hEditTitle') : t('davomat.hCreateTitle')}
      description={editing ? t('davomat.hEditHint') : t('davomat.hCreateHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={pending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('davomat.hName')} required error={errors.name} wide>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('davomat.hNamePlaceholder')} />
        </Field>
        <Field label={t('davomat.hFrom')} required error={errors.from}>
          <DateInput value={from} onChange={setFrom} invalid={!!errors.from} />
        </Field>
        <Field label={t('davomat.hTo')} required error={errors.to}>
          <DateInput value={to} onChange={setTo} min={from || undefined} invalid={!!errors.to} />
        </Field>
        <Field label={t('davomat.hScope')} required={!editing} error={errors.scope} wide>
          {editing ? (
            <Input value={branchName(editing.organization_branch_id)} readOnly disabled />
          ) : (
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              options={scopeOptions}
              placeholder={t('davomat.hScopePlaceholder')}
              invalid={!!errors.scope}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Checkbox checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} label={t('davomat.hRepeatEveryYear')} />
        </div>
      </div>
      <FormError className="mt-3 text-xs">{formError}</FormError>
    </Modal>
  )
}
