import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookMarked,
  Download,
  FileText,
  FileType2,
  Info,
  Link2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Button, Card, Input, Select, useToast } from '@/components/ui'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { XLSX_MIME, downloadFile, exportTable, type TableFormat } from '@/lib/download'
import { DICTIONARY_EXPORT } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useAuthStore } from '@/store/authStore'
import { DictionaryEntryModal } from '@/features/dictionaries/DictionaryEntryModal'
import { DictionaryImportModal } from '@/features/dictionaries/DictionaryImportModal'
import { ActionMenu } from '@/components/ui/ActionMenu'
import {
  canManageDictionaries,
  fetchEntryUsage,
  useDictionaryEntries,
  useDictionaryMutations,
  useDictionaryOptions,
  useDictionaryTypes,
  type DictionaryEntry,
  type DictionaryType,
  type DictionaryUsage,
} from '@/features/dictionaries/useDictionaries'

/**
 * MA'LUMOTNOMALAR — TZ 4.2.5 (scenarios D1/D2).
 *
 * A catalogue of catalogues, read the way one is read: the LIST of dictionaries
 * down the left (D2 — "система отображает список доступных справочников"), the
 * contents of the selected one filling the rest. Which dictionary you are in
 * lives in the URL, so a colleague can be sent straight to "Tumanlar".
 *
 * Three states a row can be in are shown rather than explained: a dictionary
 * OWNED by another module (branches) carries a link mark and never offers an
 * edit button; a system dictionary carries a lock; everything else is editable
 * by the roles the backend's `require_structure_manager` accepts.
 */
const DICT_KEYS = ['type', 'parent', 'status'] as const
const DICT_FILTERS = ['parent', 'status'] as const

export function DictionariesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const manage = canManageDictionaries(user)

  const { types, loading: typesLoading } = useDictionaryTypes()
  const lp = useListParams(DICT_KEYS)
  const { search, page, size, filters, setSearch, setPage, setSize, setFilter, setFilters } = lp
  // `type` picks the dictionary (a tab, in effect) — a reset keeps it.
  const { count: activeFilterCount, reset } = useFilterReset(lp, DICT_FILTERS)

  const activeCode = filters.type || types[0]?.code || ''
  const type = useMemo<DictionaryType | null>(
    () => types.find((x) => x.code === activeCode) ?? null,
    [types, activeCode],
  )

  const [typeQuery, setTypeQuery] = useState('')

  const { entries, total, pages, loading, error, refetch } = useDictionaryEntries(type?.code ?? null, {
    page,
    size,
    search,
    parentId: filters.parent,
    status: filters.status,
  })

  // Hierarchical dictionaries filter by their PARENT dictionary's rows.
  const { options: parentEntries } = useDictionaryOptions(type?.parent_type_code)
  const parentOptions = useMemo(
    () => parentEntries.map((p) => ({ value: String(p.id), label: p.name })),
    [parentEntries],
  )

  const { sync, remove } = useDictionaryMutations()
  const [editing, setEditing] = useState<DictionaryEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DictionaryEntry | null>(null)
  const [usage, setUsage] = useState<DictionaryUsage | null>(null)
  const [exporting, setExporting] = useState(false)

  // Switching dictionary clears filters that only make sense inside the old one.
  useEffect(() => {
    setUsage(null)
  }, [activeCode])

  const filteredTypes = useMemo(() => {
    const s = typeQuery.trim().toLowerCase()
    if (!s) return types
    return types.filter(
      (x) =>
        x.name.toLowerCase().includes(s) ||
        (x.name_ru ?? '').toLowerCase().includes(s) ||
        x.code.toLowerCase().includes(s),
    )
  }, [types, typeQuery])

  const readOnly = !manage || !!type?.external_source || !type?.is_editable

  const openDelete = async (row: DictionaryEntry) => {
    setDeleteTarget(row)
    setUsage(null)
    try {
      setUsage(await fetchEntryUsage(row.id))
    } catch {
      /* usage is advisory — the delete call is still authoritative */
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      toast.ok(t('dictionaries.deleted'))
      setDeleteTarget(null)
    } catch (e) {
      toast.error(errorMessage(e, t('dictionaries.deleteFailed')))
    }
  }

  const doSync = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('dictionaries.sync') }))) return
    try {
      const res = await sync.mutateAsync()
      toast.ok(
        res.types_created || res.entries_created
          ? t('dictionaries.syncAdded', {
              types: res.types_created,
              entries: res.entries_created,
            })
          : t('dictionaries.syncComplete'),
      )
    } catch (e) {
      toast.error(errorMessage(e, t('dictionaries.syncFailed')))
    }
  }

  /**
   * Eksport — TZ 4.2.5: «…скачивать данные в формате word или excel, а также
   * преобразовывать скаченные данные в PDF».
   *
   * ⚠️ EXCEL SERVERDAN, WORD va PDF ekrandagi jadvaldan. Sabab: Excel
   * endpointi BUTUN ma'lumotnomani beradi (qidiruv bo'yicha filtrlangan
   * holda ham u to'liq ro'yxat), Word va PDF esa ko'zga ko'rinadigan hujjat —
   * ular foydalanuvchi ko'rib turgan sahifani, uning filtri va tartibi bilan
   * saqlashi kerak.
   */
  const doExport = async (format: TableFormat) => {
    if (!type) return
    setExporting(true)
    try {
      if (format === 'xlsx') {
        await downloadFile({
          url: DICTIONARY_EXPORT(type.code),
          filename: `malumotnoma-${type.code}.xlsx`,
          params: search ? { search } : undefined,
          mime: XLSX_MIME,
        })
      } else {
        const headers = [
          t('dictionaries.colName'),
          t('dictionaries.colNameRu'),
          ...(type.is_hierarchical ? [t('dictionaries.colParent')] : []),
          t('dictionaries.colCode'),
          t('dictionaries.colStatus'),
        ]
        await exportTable({
          title: type.name || type.code,
          // ⚠️ `common.search` — bu MAYDON O'RIN EGALLOVCHISI («Qidirish…»),
          // sarlavha emas: hujjatda «Qidirish… ZZSINOV · 1» bo'lib chiqardi.
          // ⚠️ `entries.length`, NOT `total`. Word/PDF deliberately save the
          // page being looked at (see the note above), but the caption used
          // the dictionary's TOTAL — so a 25-row file was headed "Jami 500 ta
          // yozuv". The document now counts itself.
          subtitle: search
            ? t('dictionaries.exportFiltered', { q: search, count: entries.length })
            : t('dictionaries.exportPage', { count: entries.length, total: total || entries.length }),
          headers,
          rows: entries.map((r) => [
            r.name,
            r.name_ru || '',
            ...(type.is_hierarchical ? [r.parent_name || ''] : []),
            r.code,
            r.is_active ? t('dictionaries.active') : t('dictionaries.inactive'),
          ]),
          format,
          filename: `malumotnoma-${type.code}`,
        })
      }
      toast.ok(t('dictionaries.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('dictionaries.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const columns: Column<DictionaryEntry>[] = [
    {
      key: 'no',
      header: t('dashboard.colNo'),
      className: 'w-14 text-fg-subtle tabnum',
      cell: (_r, i) => `${(page - 1) * size + i + 1}.`,
    },
    {
      key: 'name',
      header: t('dictionaries.colName'),
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-fg">{r.name}</div>
          {r.description && (
            <div className="truncate text-xs text-fg-subtle">{r.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'name_ru',
      header: t('dictionaries.colNameRu'),
      className: 'w-[220px] text-fg-muted',
      cell: (r) => r.name_ru || '—',
    },
    ...(type?.is_hierarchical
      ? [
          {
            key: 'parent',
            header: t('dictionaries.colParent'),
            className: 'w-[200px] text-fg-muted',
            cell: (r: DictionaryEntry) => r.parent_name || '—',
          },
        ]
      : []),
    {
      key: 'code',
      header: t('dictionaries.colCode'),
      className: 'w-[180px]',
      cell: (r) => <code className="text-xs text-fg-subtle">{r.code}</code>,
    },
    {
      key: 'status',
      header: t('dictionaries.colStatus'),
      className: 'w-[110px]',
      cell: (r) => (
        <span
          className={cn(
            'inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold',
            r.is_active ? 'bg-success/[0.12] text-success' : 'bg-fg/[0.06] text-fg-muted',
          )}
        >
          {r.is_active ? t('dictionaries.active') : t('dictionaries.inactive')}
        </span>
      ),
    },
    ...(readOnly
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'w-[92px]',
            cell: (r: DictionaryEntry) => (
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(r)
                    setModalOpen(true)
                  }}
                  aria-label={t('common.edit')}
                  title={t('common.edit')}
                  className="grid h-icon-xs w-icon-xs place-items-center rounded-tag bg-fg/[0.06] text-fg-muted transition-colors hover:bg-fg/[0.12] hover:text-fg"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => openDelete(r)}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  className="grid h-icon-xs w-icon-xs place-items-center rounded-tag bg-danger/[0.12] text-danger transition-colors hover:bg-danger/25"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ),
          },
        ]),
  ]

  return (
    <PageContainer className="flex min-h-full flex-col">
      <PageHeader
        title={t('nav.dictionaries')}
        subtitle={t('dictionaries.subtitle', { count: types.length })}
        actions={
          manage && (
            <Button
              variant="outline"
              size="sm"
              onClick={doSync}
              loading={sync.isPending}
              leftIcon={<RefreshCw size={14} />}
              title={t('dictionaries.syncHint')}
            >
              {t('dictionaries.sync')}
            </Button>
          )
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── The list of dictionaries ─────────────────────────────────── */}
        <Card className="flex max-h-[70vh] min-h-[320px] flex-col lg:max-h-none">
          <div className="shrink-0 border-b border-line p-3">
            <Input
              value={typeQuery}
              onChange={(e) => setTypeQuery(e.target.value)}
              placeholder={t('dictionaries.searchType')}
              leftIcon={<Search size={14} />}
              aria-label={t('dictionaries.searchType')}
            />
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
            {typesLoading ? (
              <p className="p-4 text-sm text-fg-subtle">{t('common.loading')}</p>
            ) : filteredTypes.length === 0 ? (
              <p className="p-4 text-sm text-fg-subtle">{t('list.nothingFound')}</p>
            ) : (
              filteredTypes.map((x) => {
                const active = x.code === activeCode
                return (
                  <button
                    key={x.code}
                    type="button"
                    onClick={() => setFilters({ type: x.code, parent: null, status: null, q: null })}
                    aria-current={active}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-inner px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-brand-soft' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-[13px] font-medium',
                          active ? 'text-brand-strong' : 'text-fg',
                        )}
                      >
                        {x.name}
                      </span>
                      {x.name_ru && (
                        <span className="block truncate text-[11px] text-fg-subtle">
                          {x.name_ru}
                        </span>
                      )}
                    </span>
                    {x.external_source ? (
                      <span className="shrink-0 text-fg-subtle" title={t('dictionaries.external')}>
                        <Link2 size={12} />
                      </span>
                    ) : !x.is_editable ? (
                      <span className="shrink-0 text-fg-subtle" title={t('dictionaries.locked')}>
                        <Lock size={12} />
                      </span>
                    ) : null}
                    <span className="tabnum shrink-0 text-[11px] text-fg-subtle">
                      {x.entry_count}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </Card>

        {/* ── The selected dictionary ──────────────────────────────────── */}
        <Card className="flex min-h-[420px] flex-col">
          {!type ? (
            <div className="grid flex-1 place-items-center text-sm text-fg-subtle">
              {t('dictionaries.pickOne')}
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <BookMarked size={15} className="text-brand-strong" />
                  <h2 className="text-[15px] font-bold text-fg">{type.name}</h2>
                  {type.name_ru && (
                    <span className="text-[13px] text-fg-subtle">/ {type.name_ru}</span>
                  )}
                  <code className="rounded-tag bg-fg/[0.06] px-1.5 py-0.5 text-[11px] text-brand-strong">
                    {type.code}
                  </code>
                  {type.is_system && (
                    <span className="rounded-tag border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                      {t('dictionaries.system')}
                    </span>
                  )}
                </div>
                {type.description && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-muted">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    {type.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} className="w-full max-w-[240px]" />
                {type.is_hierarchical && parentOptions.length > 0 && (
                  <Select
                    value={filters.parent}
                    onChange={(e) => setFilter('parent', e.target.value)}
                    options={parentOptions}
                    placeholder={t('dictionaries.allParents')}
                    aria-label={t('dictionaries.colParent')}
                    wrapperClassName="w-[220px]"
                  />
                )}
                {!type.external_source && (
                  <Select
                    value={filters.status}
                    onChange={(e) => setFilter('status', e.target.value)}
                    options={[
                      { value: 'active', label: t('dictionaries.active') },
                      { value: 'inactive', label: t('dictionaries.inactive') },
                    ]}
                    placeholder={t('dictionaries.allStatuses')}
                    aria-label={t('dictionaries.colStatus')}
                    wrapperClassName="w-[170px]"
                  />
                )}
                <FilterReset count={activeFilterCount} onReset={reset} />

                <div className="ml-auto flex items-center gap-2">
                  {/* Three export formats + import = one menu (redesign 2026-09-24). */}
                  <ActionMenu
                    label={t('staff.download')}
                    icon={<Download size={14} />}
                    items={[
                      { key: 'xlsx', label: 'Excel', icon: <Download size={14} />, loading: exporting, onClick: () => doExport('xlsx') },
                      { key: 'docx', label: 'Word', icon: <FileText size={14} />, loading: exporting, onClick: () => doExport('docx') },
                      { key: 'pdf', label: 'PDF', icon: <FileType2 size={14} />, loading: exporting, onClick: () => doExport('pdf') },
                      ...(!readOnly ? [{ key: 'import', label: t('dictionaries.import'), icon: <Upload size={14} />, divider: true, onClick: () => setImportOpen(true) }] : []),
                    ]}
                  />
                  {!readOnly && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(null)
                          setModalOpen(true)
                        }}
                        leftIcon={<Plus size={15} />}
                      >
                        {t('dictionaries.add')}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <DataTable
        tableId="dictionaries"
                rows={entries}
                columns={columns}
                onRowClick={readOnly ? undefined : (r) => { setEditing(r); setModalOpen(true) }}
                loading={loading}
          error={error}
          onRetry={refetch}
                filtered={activeFilterCount > 0}
                emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
                emptyTitle={t('dictionaries.empty')}
                emptyDescription={
                  search ? t('dictionaries.emptySearch') : t('dictionaries.emptyHint')
                }
                minWidth={860}
                density="compact"
              />

              <Pagination
                page={page}
                size={size}
                total={total}
                pages={pages}
                onPage={setPage}
                onSize={setSize}
                loading={loading}
              />
            </>
          )}
        </Card>
      </div>

      {type && (
        <>
          <DictionaryEntryModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            type={type}
            entry={editing}
            parentOptions={parentOptions}
          />
          <DictionaryImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            type={type}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title={t('dictionaries.deleteTitle')}
        danger
        loading={remove.isPending}
        confirmLabel={t('common.delete')}
        description={
          <>
            <p>{t('dictionaries.deleteConfirm', { name: deleteTarget?.name ?? '' })}</p>
            {usage?.used && (
              <div className="mt-3 rounded-inner bg-warning-soft px-3 py-2.5 text-left text-xs text-warning">
                <p className="font-bold">{t('dictionaries.inUse')}</p>
                <ul className="mt-1 list-disc pl-4">
                  {usage.refs.map((r, i) => (
                    <li key={i}>
                      {r.label} — {r.count}
                      {r.sample.length ? ` (${r.sample.slice(0, 3).join(', ')}…)` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 opacity-80">{t('dictionaries.inUseHint')}</p>
              </div>
            )}
          </>
        }
      />
    </PageContainer>
  )
}
