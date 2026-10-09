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
import { Button, Card, Input, Modal, Select, Spinner, useToast } from '@/components/ui'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { PDF_MIME, XLSX_MIME, downloadFile, type TableFormat } from '@/lib/download'
import { DICTIONARY_EXPORT } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useAuthStore } from '@/store/authStore'
import { DictionaryEntryCard } from '@/features/dictionaries/DictionaryEntryCard'
import { DictionaryEntryModal, useExtraKindLabel } from '@/features/dictionaries/DictionaryEntryModal'
import { DictionaryImportModal } from '@/features/dictionaries/DictionaryImportModal'
import { useServerText } from '@/features/statistics/serverText'
import { ActionMenu } from '@/components/ui/ActionMenu'
import {
  canManageDictionaries,
  isExternalType,
  localizedName,
  useDictionaryEntries,
  useDictionaryMutations,
  useDictionaryOptions,
  useDictionaryTypes,
  useEntryUsage,
  type DictionaryEntry,
  type DictionaryType,
} from '@/features/dictionaries/useDictionaries'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** «Organizations» mirror: code + name cell of one `extra` attribute, in the current language. */
function orgCell(extra: Record<string, unknown> | null | undefined, key: 'ownership_form' | 'region' | 'district', lang: string) {
  if (!extra) return '—'
  const code = (key === 'ownership_form' ? extra.ownership_form : extra[`${key}_code`]) as string | undefined
  const name = ((lang === 'ru' && extra[`${key}_name_ru`]) || extra[`${key}_name`]) as string | undefined
  if (name) return code ? `${name} (${code})` : name
  return code || '—'
}

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
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const st = useServerText()
  const kindLabel = useExtraKindLabel()
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
    () => parentEntries.map((p) => ({ value: String(p.id), label: localizedName(p, lang) })),
    [parentEntries, lang],
  )
  const parentType = useMemo(
    () => (type?.parent_type_code ? types.find((x) => x.code === type.parent_type_code) ?? null : null),
    [types, type],
  )

  const { sync, remove } = useDictionaryMutations()
  const [editing, setEditing] = useState<DictionaryEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DictionaryEntry | null>(null)
  // TZ D2 1572–1573: a click on a row opens the read-only card.
  const [cardEntry, setCardEntry] = useState<DictionaryEntry | null>(null)
  const usage = useEntryUsage(deleteTarget?.id ?? null)
  const [exporting, setExporting] = useState<TableFormat | null>(null)

  useEffect(() => {
    setCardEntry(null)
  }, [activeCode])

  const filteredTypes = useMemo(() => {
    const s = typeQuery.trim().toLowerCase()
    if (!s) return types
    return types.filter(
      (x) =>
        x.name.toLowerCase().includes(s) ||
        localizedName(x, lang).toLowerCase().includes(s) ||
        (x.name_ru ?? '').toLowerCase().includes(s) ||
        x.code.toLowerCase().includes(s),
    )
  }, [types, typeQuery, lang])

  const external = isExternalType(type)
  const readOnly = !manage || external || !type?.is_editable
  // TZ 4.2.5 «Организации…»: ownership form, region and district.
  const orgMirror = type?.external_source === 'organization_branches'

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
   * TZ 4.2.5 (1940): «скачивать данные в формате word или excel, а также
   * преобразовывать скаченные данные в PDF». All three come from the server
   * with the filters on screen (B-D15: search, «Tegishli», status).
   */
  const doExport = async (format: TableFormat) => {
    if (!type) return
    setExporting(format)
    try {
      await downloadFile({
        url: DICTIONARY_EXPORT(type.code),
        filename: `malumotnoma-${type.code}.${format}`,
        params: {
          format,
          search: search || undefined,
          parent_id: filters.parent || undefined,
          is_active: filters.status ? filters.status === 'active' : undefined,
        },
        mime: format === 'xlsx' ? XLSX_MIME : format === 'pdf' ? PDF_MIME : DOCX_MIME,
      })
      toast.ok(t('dictionaries.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('dictionaries.exportFailed')))
    } finally {
      setExporting(null)
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
          <div className="truncate font-medium text-fg">{localizedName(r, lang)}</div>
          {r.description && <div className="truncate text-xs text-fg-subtle">{st(r.description)}</div>}
          {!!r.extra?.target && <div className="truncate text-xs text-brand-strong">{kindLabel(r.extra)}</div>}
        </div>
      ),
    },
    ...(lang === 'ru'
      ? []
      : [
          {
            key: 'name_ru',
            header: t('dictionaries.colNameRu'),
            className: 'w-[220px] text-fg-muted',
            cell: (r: DictionaryEntry) => r.name_ru || '—',
          },
        ]),
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
    ...(orgMirror
      ? (['ownership_form', 'region', 'district'] as const).map((k) => ({
          key: k,
          header: t(`orgRef.org_${k}`),
          className: 'w-[180px] text-fg-muted',
          cell: (r: DictionaryEntry) => orgCell(r.extra, k, lang),
        }))
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
                  onClick={(e) => {
                    e.stopPropagation()
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
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(r)
                  }}
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
                        {localizedName(x, lang)}
                      </span>
                      {lang !== 'ru' && x.name_ru && (
                        <span className="block truncate text-[11px] text-fg-subtle">
                          {x.name_ru}
                        </span>
                      )}
                    </span>
                    {isExternalType(x) ? (
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
                  {/* B-D24: the technical code is a tooltip, not a heading. */}
                  <h2 className="text-[15px] font-bold text-fg" title={type.code}>
                    {localizedName(type, lang)}
                  </h2>
                  {lang !== 'ru' && type.name_ru && (
                    <span className="text-[13px] text-fg-subtle">/ {type.name_ru}</span>
                  )}
                  {external && (
                    <span className="inline-flex items-center gap-1 rounded-tag border border-warning/35 bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                      <Link2 size={10} /> {t('orgRef.externalReadOnly')}
                    </span>
                  )}
                  {type.is_system && (
                    <span className="rounded-tag border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                      {t('dictionaries.system')}
                    </span>
                  )}
                </div>
                {type.description && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-muted">
                    <Info size={12} className="mt-0.5 shrink-0" />
                    {st(type.description)}
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
                {!external && (
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
                      { key: 'xlsx', label: 'Excel', icon: <Download size={14} />, loading: exporting === 'xlsx', onClick: () => doExport('xlsx') },
                      { key: 'docx', label: 'Word', icon: <FileText size={14} />, loading: exporting === 'docx', onClick: () => doExport('docx') },
                      { key: 'pdf', label: 'PDF', icon: <FileType2 size={14} />, loading: exporting === 'pdf', onClick: () => doExport('pdf') },
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
                onRowClick={(r) => setCardEntry(r)}
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
            parentType={parentType}
          />
          <DictionaryImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            type={type}
          />
        </>
      )}

      <DictionaryEntryCard entry={cardEntry} type={type} onClose={() => setCardEntry(null)} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title={t('dictionaries.deleteTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>
              {t('common.cancel')}
            </Button>
            {/* B-D28: an entry still in use cannot be deleted — the button waits for the check. */}
            <Button variant="danger" onClick={doDelete} loading={remove.isPending} disabled={!usage.data || usage.data.used}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          {t('dictionaries.deleteConfirm', { name: deleteTarget ? localizedName(deleteTarget, lang) : '' })}
        </p>
        {usage.isLoading && (
          <div className="mt-3">
            <Spinner />
          </div>
        )}
        {usage.data?.used && (
          <div className="mt-3 rounded-inner bg-warning-soft px-3 py-2.5 text-left text-xs text-warning">
            <p className="font-bold">{t('dictionaries.inUse')}</p>
            <ul className="mt-1 list-disc pl-4">
              {usage.data.refs.map((r, i) => (
                <li key={i}>
                  {lang === 'ru' && r.label_ru ? r.label_ru : st(r.label)} — {t('orgRef.countItems', { count: r.count })}
                  {r.sample.length ? ` (${r.sample.slice(0, 3).join(', ')}…)` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 opacity-80">{t('dictionaries.inUseHint')}</p>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
