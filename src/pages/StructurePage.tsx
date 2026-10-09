import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { FormError } from '@/components/ui/FormError'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { NamingRuleModal } from '@/features/structure/NamingRuleModal'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useListParams } from '@/hooks/useListParams'
import { Select } from '@/components/ui/Select'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useBranchStore } from '@/store/branchStore'
import { HeadsPicker } from '@/features/structure/HeadsPicker'
import { useDepartmentClosure, useStructure, useStructureMutations, type Department, type JobPosition } from '@/features/structure/useStructure'
import { Field } from '@/components/ui/Field'
import { LABEL_CLS } from '@/components/ui/control'
import { canManageStructure } from '@/auth/canManage'
import { OrgChart } from '@/features/structure/OrgChart'
import { useAuthStore } from '@/store/authStore'
import { Checkbox } from '@/components/ui/Checkbox'

type Tab = 'departments' | 'positions' | 'chart'
type Row = (Department | JobPosition) & { id: number }

export function StructurePage() {
  // ⚠️ Yozuv huquqi — `auth/canManage.ts` dagi YAGONA manbadan
  // (backend darvozasining ko'zgusi). Ilgari tugmalar hammaga
  // ko'rinardi va faqat saqlashda 403 chiqardi.
  const currentUser = useAuthStore((st) => st.user)
  const canWrite = canManageStructure(currentUser)
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, reset } = useListParams(['tab', 'cat'])
  const tab: Tab =
    filters.tab === 'positions' ? 'positions' : filters.tab === 'chart' ? 'chart' : 'departments'
  const kind = tab === 'positions' ? 'position' : 'department'

  // Search goes to the SERVER (see `useStructure`). Departments are paged by
  // the server; both tabs now page on the server too (see `useStructure`).
  // Retired departments are hidden by default so they are never offered for a
  // new assignment; the toggle brings them back so one can be reopened.
  const [includeClosed, setIncludeClosed] = useState(false)
  const [closeTarget, setCloseTarget] = useState<Department | null>(null)
  const [closeReason, setCloseReason] = useState('')
  const [namingOpen, setNamingOpen] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const closure = useDepartmentClosure()

  const doClose = async () => {
    if (!closeTarget?.id) return
    try {
      await closure.close.mutateAsync({ id: closeTarget.id, reason: closeReason.trim() || undefined })
      toast.ok(t('structure.closed'))
      setCloseTarget(null)
    } catch (e) {
      toast.error(errorMessage(e, t('structure.closeFailed')))
    }
  }

  const doReopen = async (d: Department) => {
    if (!d.id) return
    if (!(await confirm({ kind: 'status', subject: d.name, confirmLabel: t('structure.reopen') }))) return
    try {
      await closure.reopen.mutateAsync(d.id)
      toast.ok(t('structure.reopened'))
    } catch (e) {
      toast.error(errorMessage(e, t('structure.closeFailed')))
    }
  }

  const {
    departments, departmentsTotal, departmentsPages, departmentsLoading, departmentsError,
    refetchDepartments, positionsPage, positionsPageTotal, positionsPagePages,
    positionsLoading, positionsError, refetchPositions, loadAllDepartmentIds, loadAllPositionIds,
  } = useStructure(search, page, size, includeClosed, false, filters.cat ?? '')
  const mut = useStructureMutations(kind)
  const bulk = useBulkAction()

  const loading = tab === 'departments' ? departmentsLoading : positionsLoading
  const error = tab === 'departments' ? departmentsError : positionsError
  const retry = tab === 'departments' ? refetchDepartments : refetchPositions
  const rows: Row[] = tab === 'departments' ? (departments as Row[]) : (positionsPage as Row[])
  const total = tab === 'departments' ? departmentsTotal : positionsPageTotal
  const pages = tab === 'departments' ? departmentsPages : positionsPagePages
  // Selection survives paging; «select all N» loads every id of the filter.
  const selection = useRowSelection(rows, {
    total,
    loadAllIds: tab === 'departments' ? loadAllDepartmentIds : loadAllPositionIds,
    resetKey: JSON.stringify([tab, search, includeClosed, filters.cat ?? '', branchId]),
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const setTab = (v: string) => {
    setFilter('tab', v === 'departments' ? '' : v)
    selection.clear()
  }

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => mut.remove.mutateAsync(id))
    mut.invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('structure.deleted', { count: ids.length }) })
      selection.clear()
    }
  }

  const deptColumns: Column<Row>[] = [
    { key: 'name', header: t('structure.colName'), skeleton: 'w-56', cell: (r) => <span className="font-semibold text-fg">{r.name || '—'}</span> },
    { key: 'index', header: t('structure.colIndex'), className: 'tabular-nums text-fg-muted', skeleton: 'w-10', cell: (r) => (r as Department).index ?? '—' },
    // Both were already on the wire (`DepartmentRead.code`, `created_at` from
    // `ORMBase`) and both are columns in v1; v2 simply never drew them.
    { key: 'code', header: t('structure.colCode'), className: 'tabular-nums text-fg-muted', skeleton: 'w-14', cell: (r) => (r as Department).code || '—' },
    { key: 'created', header: t('structure.colCreated'), className: 'tabular-nums text-fg-muted', skeleton: 'w-20', cell: (r) => {
      const v = (r as Department).created_at
      return v ? dayjs(v).format('DD.MM.YYYY') : '—'
    } },
    {
      key: 'heads',
      header: t('structure.colHeads'),
      className: 'text-fg-muted',
      cell: (r) => {
        const heads = (r as Department).heads ?? []
        if (!heads.length) return '—'
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 -space-x-1.5">
              {heads.slice(0, 3).map((h) => (
                <Avatar key={h.id} src={h.photo_thumb_path} fallbackSrc={h.photo_path} name={h.legal_name ?? '?'} size={24} className="ring-2 ring-surface" />
              ))}
            </span>
            <span className="truncate">{heads.map((h) => h.legal_name).filter(Boolean).join(', ')}</span>
          </span>
        )
      },
    },
    {
      key: 'flags',
      header: t('structure.colFlags'),
      cell: (r) => {
        const d = r as Department
        const has = d.is_secretariat || d.is_ijro_manager
        return (
          <div className="flex flex-wrap gap-1.5">
            {d.is_secretariat && <Badge tone="brand">{t('structure.flagSecretariat')}</Badge>}
            {d.is_ijro_manager && <Badge tone="success">{t('structure.flagIjro')}</Badge>}
            {!!(d as Department).closed_at && <Badge tone="warning">{t('structure.closed')}</Badge>}
            {!has && !(d as Department).closed_at && <span className="text-fg-subtle">—</span>}
          </div>
        )
      },
    },
    // Row actions only for structure managers: the page is open read-only to
    // every employee (Verifix gave all staff the org-structure report).
    { key: 'actions', header: '', headerClassName: 'w-20', className: 'pr-4 text-right', skeleton: 'w-8', cell: (r) => {
      const d = r as Department
      if (!canWrite) return null
      return (
        <div className="inline-flex items-center gap-1">
          {/* Qisqartirish O'CHIRISH EMAS: bo'lim tarixda qoladi (unga xodim,
              buyruq va xatlar bog'langan), faqat yangi tayinlashlarda
              taklif qilinmaydi. Shu bois o'chirish tugmasidan alohida. */}
          {d.closed_at ? (
            <button
              type="button"
              aria-label={t('structure.reopen')}
              title={t('structure.reopen')}
              onClick={() => doReopen(d)}
              className="inline-grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ArchiveRestore size={15} />
            </button>
          ) : (
            <button
              type="button"
              aria-label={t('structure.close')}
              title={t('structure.close')}
              onClick={() => { setCloseReason(''); setCloseTarget(d) }}
              className="inline-grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Archive size={15} />
            </button>
          )}
          <button type="button" aria-label={t('common.edit')} onClick={() => setEditing(r)} className="inline-grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><Pencil size={15} /></button>
        </div>
      )
    } },
  ]

  const posColumns: Column<Row>[] = [
    { key: 'name', header: t('structure.colName'), skeleton: 'w-56', cell: (r) => <span className="font-semibold text-fg">{r.name || '—'}</span> },
    // `short_name` was typed but had NO form field and NO column — the only
    // field in the module that was completely unreachable from v2.
    { key: 'short_name', header: t('structure.colShortName'), className: 'text-fg-muted', skeleton: 'w-24', cell: (r) => (r as JobPosition).short_name || '—' },
    { key: 'razryad', header: t('structure.colRazryad'), className: 'tabular-nums text-fg-muted', skeleton: 'w-10', cell: (r) => (r as JobPosition).razryad ?? '—' },
    { key: 'category', header: t('staff.category'), className: 'text-fg-muted', skeleton: 'w-20', cell: (r) => {
      const c = (r as JobPosition).category
      return c ? t(`staff.cat_${c}` as never) : '—'
    } },
    { key: 'actions', header: '', headerClassName: 'w-12', className: 'pr-4 text-right', skeleton: 'w-8', cell: (r) => canWrite ? (
      <button type="button" aria-label={t('common.edit')} onClick={() => setEditing(r)} className="inline-grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"><Pencil size={15} /></button>
    ) : null },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('structure.title')}
        subtitle={t('structure.subtitle')}
        actions={
          canWrite && tab !== 'chart' ? (
            <>
              {/* Nomlash qoidasi FAQAT lavozimlarga tegishli — bo'lim jadvalida
                  ko'rsatish chalkashtirardi. */}
              {tab === 'positions' && (
                <Button variant="outline" leftIcon={<Wand2 size={16} />} onClick={() => setNamingOpen(true)}>
                  {t('structure.naming')}
                </Button>
              )}
              <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
                {tab === 'departments' ? t('structure.createDept') : t('structure.createPos')}
              </Button>
            </>
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
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'departments', label: t('structure.tabDepartments'), count: departmentsTotal },
              { value: 'positions', label: t('structure.tabPositions'), count: positionsPageTotal },
              { value: 'chart', label: t('structure.tabChart') },
            ]}
          />
          {tab !== 'chart' && (
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={tab === 'departments' ? t('structure.searchDepartment') : t('structure.searchPosition')}
                className="flex-1 lg:max-w-md"
              />
              {/* Qisqartirilgan bo'lim ro'yxatdan chiqadi (yangi tayinlashda
                  taklif qilinmasin), lekin uni QAYTA OCHISH uchun ko'rish kerak. */}
              {tab === 'departments' && (
                <Checkbox label={t('structure.showClosed')} checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
              )}
              {/* Lavozim KATEGORIYASI — v1 da bor edi, v2 da yo'qolgan.
                  `/job-positions` `category` ni allaqachon qabul qiladi. */}
              {tab === 'positions' && (
                <Select
                  value={filters.cat ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter('cat', e.target.value)}
                  placeholder={t('staff.allCategories')}
                  options={[
                    { value: 'rahbar', label: t('staff.cat_rahbar') },
                    { value: 'mutaxassis', label: t('staff.cat_mutaxassis') },
                    { value: 'xizmatchi', label: t('staff.cat_xizmatchi') },
                    { value: 'ishchi', label: t('staff.cat_ishchi') },
                  ]}
                  wrapperClassName="w-44"
                />
              )}
              <FilterReset count={(search ? 1 : 0) + (filters.cat ? 1 : 0)} onReset={reset} />
            </>
          )}
        </div>

        {tab === 'chart' ? (
          /* TZ 4.2.6 — bo'linmalarning bo'ysunish sxemasi. Jadval bilan bir
             sahifada, chunki ikkalasi ham AYNAN shu tuzilmani ko'rsatadi:
             biri ro'yxat sifatida, ikkinchisi bog'lanishlari bilan. */
          <OrgChart branchId={branchId} canEdit={canWrite} />
        ) : (
          <>
            <DataTable
        tableId="structure"
              rows={rows}
              columns={tab === 'departments' ? deptColumns : posColumns}
              onRowClick={canWrite ? (r) => setEditing(r) : undefined}
              loading={loading}
              error={error}
              onRetry={retry}
              selection={canWrite ? selection : undefined}
              emptyTitle={tab === 'departments' ? t('structure.emptyDept') : t('structure.emptyPos')}
              emptyDescription={t('structure.emptyHint')}
              filtered={!!search}
              emptyAction={<FilterReset count={search ? 1 : 0} onReset={reset} />}
              minWidth={600}
            />

            <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} />
          </>
        )}
      </Card>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        {canWrite && (
          <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        )}
      </BulkBar>

      <NamingRuleModal open={namingOpen} onClose={() => setNamingOpen(false)} />

      <ConfirmDialog
        open={!!closeTarget}
        title={t('structure.closeTitle')}
        description={
          <div className="flex flex-col gap-2">
            <p className="text-sm text-fg-muted">{t('structure.closeHint')}</p>
            <input
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
              placeholder={t('structure.closeReason')}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </div>
        }
        confirmLabel={t('structure.close')}
        loading={closure.close.isPending}
        onConfirm={doClose}
        onClose={() => setCloseTarget(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        danger
        title={tab === 'departments' ? t('structure.deleteDeptTitle') : t('structure.deletePosTitle')}
        description={t('structure.deleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <StructureModal
        open={creating || !!editing}
        tab={tab}
        value={editing}
        loading={mut.create.isPending || mut.update.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSubmit={async (body) => {
          // A failed save is reported INSIDE the modal (the modal catches and
          // shows the server sentence, e.g. «Bu filialda «01» kodli bo'lim
          // allaqachon bor»). The page used to swallow it and print the bulk
          // wording «1 ta yozuvda amal bajarilmadi — ular tanlangan holda
          // qoldi» behind the dialog, although nothing was selected.
          if (editing) await mut.update.mutateAsync({ id: editing.id, body })
          else await mut.create.mutateAsync(body)
          mut.invalidate()
          setNotice({ kind: 'ok', text: editing ? t('structure.updated') : t('structure.created') })
          setCreating(false)
          setEditing(null)
        }}
      />
    </PageContainer>
  )
}

interface ModalProps {
  open: boolean
  tab: Tab
  value: Row | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}

function StructureModal({ open, tab, value, loading, onClose, onSubmit }: ModalProps) {
  const { t } = useTranslation()
  const branches = useBranchStore((s) => s.branches)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const [name, setName] = useState('')
  const [num, setNum] = useState('')
  const [branchId, setBranchId] = useState('')
  const [headIds, setHeadIds] = useState<number[]>([])
  const [secretariat, setSecretariat] = useState(false)
  const [ijro, setIjro] = useState(false)
  /** TZ S1 «код подразделения» — filial ichida NOYOB. v2 yubormasdi. */
  const [code, setCode] = useState('')
  /** TZ S2 «основание для изменения» — o'zgartirish uchun ASOS (buyruq).
   *  Faqat tahrirda: yaratishda o'zgartiriladigan narsa yo'q. */
  const [changeReason, setChangeReason] = useState('')
  /** Lavozim TOIFASI — shtat ekrani u bo'yicha filtrlaydi, forma esa uni
   *  hech qachon qo'ymasdi. */
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')

  const isDept = tab === 'departments'
  const dept = isDept ? (value as Department | null) : null

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
    [branches],
  )

  useEffect(() => {
    if (!open) return
    setName(value?.name ?? '')
    setNum(
      value
        ? String((isDept ? (value as Department).index : (value as JobPosition).razryad) ?? '')
        : '',
    )
    setBranchId(String(value?.organization_branch_id ?? selectedBranchId ?? branches[0]?.id ?? ''))
    setHeadIds(dept?.heads?.map((h) => h.id) ?? [])
    setSecretariat(dept?.is_secretariat ?? false)
    setIjro(dept?.is_ijro_manager ?? false)
    setCode(dept?.code ?? '')
    setChangeReason('')
    setCategory(!isDept ? ((value as JobPosition | null)?.category ?? '') : '')
    setError('')
  }, [open, value, isDept, dept, selectedBranchId, branches])

  const submit = () => {
    if (!name.trim()) return setError(t('structure.nameRequired'))
    if (!branchId) return setError(t('structure.branchRequired'))
    const body: Record<string, unknown> = { name: name.trim(), organization_branch_id: Number(branchId) }
    if (isDept) {
      body.index = num === '' ? null : Number(num)
      body.head_ids = headIds
      body.is_secretariat = secretariat
      // «Yangiliklar mas'uli» is gone (2026-09-24): news now come from uzgidro.uz.
      // The field is not sent, so an existing flag is left as it is.
      body.is_ijro_manager = ijro
      body.code = code.trim() || null
      // Faqat tahrirda — `DepartmentCreate` da bunday maydon yo'q.
      if (value) body.change_reason = changeReason.trim() || null
    } else {
      body.razryad = num === '' ? null : Number(num)
      body.category = category || null
    }
    onSubmit(body).catch((e: unknown) => setError(errorMessage(e, t('common.actionFailed'))))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        value
          ? tab === 'departments'
            ? t('structure.editDept')
            : t('structure.editPos')
          : tab === 'departments'
            ? t('structure.createDept')
            : t('structure.createPos')
      }
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
        <Field label={t('structure.fieldName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('structure.fieldName')} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLS}>
              {tab === 'departments' ? t('structure.fieldIndex') : t('structure.fieldRazryad')}
            </span>
            <Input
              type="number"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              aria-label={tab === 'departments' ? t('structure.fieldIndex') : t('structure.fieldRazryad')}
            />
          </label>
          <div>
            <span className={LABEL_CLS}>{t('structure.fieldBranch')}</span>
            <Combobox value={branchId} onChange={setBranchId} options={branchOptions} placeholder={t('structure.fieldBranch')} />
          </div>
          {isDept ? (
            <Field label={t('structure.fieldCode')} hint={t('structure.fieldCodeHint')}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          ) : (
            <Field label={t('staff.category')}>
              <Combobox
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'rahbar', label: t('staff.cat_rahbar') },
                  { value: 'mutaxassis', label: t('staff.cat_mutaxassis') },
                  { value: 'xizmatchi', label: t('staff.cat_xizmatchi') },
                  { value: 'ishchi', label: t('staff.cat_ishchi') },
                ]}
                placeholder={t('staff.allCategories')}
              />
            </Field>
          )}
          {isDept && value && (
            <Field label={t('structure.fieldChangeReason')} hint={t('structure.fieldChangeReasonHint')} wide>
              <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
            </Field>
          )}
        </div>

        {isDept && (
          <>
            <div>
              <span className={LABEL_CLS}>{t('structure.fieldHeads')}</span>
              <HeadsPicker
                branchId={branchId ? Number(branchId) : null}
                // A department always belongs to a branch; do not fetch an
                // org-wide candidate list for the tick before it is known.
                enabled={!!branchId}
                value={headIds}
                onChange={setHeadIds}
                preselected={dept?.heads ?? undefined}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-line p-3">
              <FlagToggle checked={secretariat} onChange={setSecretariat} label={t('structure.fieldSecretariat')} />
              <FlagToggle checked={ijro} onChange={setIjro} label={t('structure.fieldIjro')} />
            </div>
          </>
        )}

        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

function FlagToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <Checkbox label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
  )
}
