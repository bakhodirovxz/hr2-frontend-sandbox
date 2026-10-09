import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Clock,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Globe2,
  LayoutGrid,
  Link2,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Presentation,
  Search,
  X,
  Share2,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER, filterChip } from '@/components/ui/control'
import { Avatar } from '@/components/ui/Avatar'
import { useFileDrop } from '@/hooks/useFileDrop'
import { useToast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Checkbox } from '@/components/ui/Checkbox'
import { BulkBar } from '@/components/data/BulkBar'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { EMPTY_SHARE, ShareControls, type ShareScope, type ShareState } from '@/features/documents/ShareControls'
import type { SharedPerson } from '@/features/documents/useDocuments'
import { useListParams } from '@/hooks/useListParams'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/cn'
import {
  useFiles,
  useFolders,
  useDocumentMutations,
  type DocFile,
  type Folder,
} from '@/features/documents/useDocuments'
import { Field } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'

const EXT_META: Record<string, { color: string; Icon: typeof FileIcon }> = {
  docx: { color: '--brand', Icon: FileText },
  doc: { color: '--brand', Icon: FileText },
  xlsx: { color: '--success', Icon: FileSpreadsheet },
  xls: { color: '--success', Icon: FileSpreadsheet },
  pptx: { color: '--warning', Icon: Presentation },
  pdf: { color: '--danger', Icon: FileIcon },
}
/** File-type chips: the four office kinds and «other». */
const KINDS = [
  { key: 'word', exts: ['docx', 'doc'], label: 'Word' },
  { key: 'excel', exts: ['xlsx', 'xls'], label: 'Excel' },
  { key: 'ppt', exts: ['pptx', 'ppt'], label: 'PowerPoint' },
  { key: 'pdf', exts: ['pdf'], label: 'PDF' },
] as const
const kindOf = (f: DocFile) => KINDS.find((k) => (k.exts as readonly string[]).includes(extOf(f)))?.key ?? 'other'

const fileName = (f: DocFile) => f.original_filename || f.file_filename || 'Nomsiz'
const extOf = (f: DocFile) => (fileName(f).split('.').pop() || '').toLowerCase()
const extMeta = (f: DocFile) => EXT_META[extOf(f)] ?? { color: '--fg-muted', Icon: FileIcon }

export function DocumentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { search, setSearch, filters, setFilter } = useListParams(['folder', 'view', 'kind', 'sort'])
  const toast = useToast()
  const view = filters.view === 'grid' ? 'grid' : 'list'
  const sortBy = filters.sort === 'name' ? 'name' : 'recent'
  const debouncedSearch = useDebounce(search, 250)
  const folderId = filters.folder ? Number(filters.folder) : null

  // Search runs on the SERVER. The unfiltered lists stay for the breadcrumb
  // (the open folder) and the kind-chip counts; with an empty search both
  // pairs share one query key, so nothing is fetched twice.
  const term = debouncedSearch.trim()
  const { folders, loading: foldersLoading } = useFolders()
  const { folders: foundFolders } = useFolders(folderId ? '' : term)
  const { files, loading: filesLoading } = useFiles(folderId)
  const { files: foundFiles } = useFiles(folderId, term)
  const mut = useDocumentMutations()
  const confirm = useConfirm()
  const uploadRef = useRef<HTMLInputElement>(null)

  const [folderModal, setFolderModal] = useState(false)
  const [renaming, setRenaming] = useState<{ kind: 'folder' | 'file'; id: number; name: string } | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'folder' | 'file'; id: number; name: string } | null>(null)
  const [newFolderShare, setNewFolderShare] = useState<ShareState>(EMPTY_SHARE)
  const [sharing, setSharing] = useState<
    { kind: 'folder' | 'file'; id: number; name: string; state: ShareState } | null
  >(null)

  /** Read an item's stored sharing back into the dialog. */
  const shareOf = (row: { scope?: string | null; group_can_edit?: boolean | null; editors?: SharedPerson[] | null; viewers?: SharedPerson[] | null }): ShareState => ({
    scope: (row.scope as ShareScope) || 'private',
    groupCanEdit: !!row.group_can_edit,
    // The read schemas embed the people; the write schemas take their ids.
    editorIds: (row.editors ?? []).map((e) => e.id),
    viewerIds: (row.viewers ?? []).map((e) => e.id),
    people: Object.fromEntries([...(row.editors ?? []), ...(row.viewers ?? [])].map((p) => [p.id, { id: p.id, legal_name: p.legal_name ?? '', photo_path: p.photo_path ?? null }])),
  })

  const saveShare = async () => {
    if (!sharing) return
    const body = {
      scope: sharing.state.scope,
      group_can_edit: sharing.state.groupCanEdit,
      editor_ids: sharing.state.editorIds,
      viewer_ids: sharing.state.viewerIds,
    }
    if (sharing.kind === 'folder') await mut.updateFolder.mutateAsync({ id: sharing.id, body })
    else await mut.updateFile.mutateAsync({ id: sharing.id, body })
    setSharing(null)
    done(t('documents.shared'))
  }
  // Results go to toasts (the old green banner stayed on screen and doubled them).
  const setNotice = (msg: string) => toast.ok(msg)

  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  // The server's own gate, mirrored — not re-derived from scope/editors here.
  const canUploadHere = !folderId || currentFolder?.can_add_file !== false
  const loading = folderId ? filesLoading : foldersLoading

  const shownFolders = useMemo(() => {
    if (folderId) return []
    return foundFolders
  }, [foundFolders, folderId])

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of files) c[kindOf(f)] = (c[kindOf(f)] ?? 0) + 1
    return c
  }, [files])

  const shownFiles = useMemo(() => {
    const out = foundFiles.filter((f) => !filters.kind || kindOf(f) === filters.kind)
    return [...out].sort((a, b) =>
      sortBy === 'name'
        ? fileName(a).localeCompare(fileName(b))
        : String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? '')),
    )
  }, [foundFiles, filters.kind, sortBy])

  // Bulk select covers FILES, not folders: deleting a folder takes its contents
  // with it, so it stays a deliberate one-at-a-time action (as in v1).
  /* Bulk delete runs `_can_modify_file` per file; only those rows are
     selectable so "select all" never queues a 403. */
  const editableFiles = useMemo(() => shownFiles.filter((f) => f.can_edit !== false), [shownFiles])
  // The folder's files all arrive in one response, so «select all N» just
  // ticks every editable file shown, with no extra request.
  const allEditableIds = useCallback(async () => editableFiles.map((f) => f.id), [editableFiles])
  const selection = useRowSelection(editableFiles, {
    total: editableFiles.length,
    loadAllIds: allEditableIds,
    resetKey: JSON.stringify([folderId, debouncedSearch]),
  })
  const bulk = useBulkAction()
  const [confirmBulk, setConfirmBulk] = useState(false)

  const runBulkDelete = async () => {
    setConfirmBulk(false)
    const failed = await bulk.run(selection.selectedIds as number[], (id) =>
      mut.deleteFile.mutateAsync(id),
    )
    selection.clear()
    mut.invalidate()
    setNotice(
      failed.length
        ? t('documents.bulkDeletePartial', { failed: failed.length })
        : t('documents.bulkDeleteDone'),
    )
  }

  const isEmpty = !loading && shownFolders.length === 0 && shownFiles.length === 0

  const done = (msg: string) => {
    mut.invalidate()
    setNotice(msg)
  }

  const createBlank = async (kind: 'docx' | 'xlsx' | 'pptx') => {
    await mut.createBlank.mutateAsync({
      // ⚠️ The server field is `file_type` (`FileCreate`, default "docx"). We
      // used to send `kind`, which FastAPI drops in silence — so "Yangi Excel"
      // and "Yangi PowerPoint" both produced a .docx wearing an .xlsx name.
      original_filename: `${t('documents.blankName')}.${kind}`,
      file_type: kind,
      folder_id: folderId || undefined,
    })
    done(t('documents.created'))
  }

  const onUpload = async (file?: File) => {
    if (!file) return
    /* INHERIT THE FOLDER. The hook has always accepted these; the screen never
       sent them, so every upload landed `private` even into a branch folder —
       the uploader saw their file and nobody else did. At the root there is
       nothing to inherit, so it stays private and the Share action can widen
       it afterwards. */
    await mut.uploadFile.mutateAsync({
      file,
      folderId,
      scope: currentFolder?.scope ?? undefined,
      groupCanEdit: currentFolder?.group_can_edit ?? undefined,
    })
    done(t('documents.uploaded'))
  }

  /** Drop anywhere on the page (or paste): every file is uploaded here. */
  const uploadMany = useCallback(
    async (list: File[]) => {
      let failed = 0
      for (const f of list) {
        try {
          await mut.uploadFile.mutateAsync({ file: f, folderId, scope: currentFolder?.scope ?? undefined, groupCanEdit: currentFolder?.group_can_edit ?? undefined })
        } catch {
          failed++
        }
      }
      mut.invalidate()
      if (failed) toast.error(t('list.bulkPartialFail', { count: failed }))
      else toast.ok(t('documents.uploadedCount', { count: list.length }))
    },
    [mut, folderId, currentFolder, toast, t],
  )
  const { dragging, dropProps } = useFileDrop({ enabled: canUploadHere, onFiles: uploadMany, accept: () => true })

  // Minting a share link makes the file readable by anyone holding it, so it
  // is asked first.
  const copyLink = async (file: DocFile) => {
    if (!(await confirm({ kind: 'action', subject: fileName(file), confirmLabel: t('documents.copyLink') }))) return
    const res = await mut.shareLink.mutateAsync(file.id)
    // The server's `path` is v1's `/document/<slug>`; v2 serves the shared
    // document at `/hujjat/<slug>`. The copied link fell through to the home
    // page (measured 2026-09-22, Z42), so build it from the slug instead.
    const url = `${window.location.origin}/hujjat/${res.share_slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
    setNotice(t('documents.linkCopied'))
  }

  const doDelete = async () => {
    if (!deleting) return
    const d = deleting
    setDeleting(null)
    if (d.kind === 'folder') await mut.deleteFolder.mutateAsync(d.id)
    else await mut.deleteFile.mutateAsync(d.id)
    done(t('documents.deleted'))
  }

  const scopeIcon = (sc?: string | null) => (sc === 'public' ? <Globe2 size={13} /> : sc === 'branch' ? <Users size={13} /> : <Lock size={13} />)
  const scopeLabel = (sc?: string | null) => t(sc === 'public' ? 'documents.scopePublic' : sc === 'branch' ? 'documents.scopeBranch' : 'documents.scopePrivate')
  const fileActions = (file: DocFile) => ({
    onOpen: () => navigate(`/hujjatlar/edit/${file.id}`),
    onRename: () => setRenaming({ kind: 'file', id: file.id, name: fileName(file) }),
    onShare: () => setSharing({ kind: 'file', id: file.id, name: fileName(file), state: shareOf(file) }),
    onCopyLink: () => copyLink(file),
    onDelete: () => setDeleting({ kind: 'file', id: file.id, name: fileName(file) }),
  })

  return (
    <PageContainer>
      {/* The whole page is the drop target: a file dragged from the desktop
          lands in the folder being viewed (redesign 2026-09-24). */}
      <div {...(canUploadHere ? dropProps : {})} className="relative">
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-card border-2 border-dashed border-brand bg-brand-soft/70 backdrop-blur-[1px]">
            <span className="flex items-center gap-2 text-[15px] font-bold text-brand-strong"><Upload size={20} /> {t('documents.dropHere')}</span>
          </div>
        )}
      <PageHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Inside a read-only folder uploading is refused with a 404 — so
                the button is not offered there. */}
            {canUploadHere && (
              <Button variant="secondary" size="sm" leftIcon={<Upload size={15} />} onClick={() => uploadRef.current?.click()}>
                {t('documents.upload')}
              </Button>
            )}
            <input
              ref={uploadRef}
              type="file"
              hidden
              multiple
              aria-label={t('documents.upload')}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? [])
                // ⚠️ Reset FIRST: a second pick of the same file would fire no `change`.
                e.target.value = ''
                if (list.length === 1) void onUpload(list[0])
                else if (list.length) void uploadMany(list)
              }}
            />
            <CreateMenu
              onFolder={() => setFolderModal(true)}
              onBlank={createBlank}
              canFiles={canUploadHere}
            />
          </div>
        }
      />

      {/* breadcrumb · search · type chips · sort · view */}
      <div className="mb-3 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <nav className="flex min-w-0 items-center gap-1 text-[14px]" aria-label="breadcrumb">
          <button type="button" onClick={() => setFilter('folder', '')} aria-current={folderId ? undefined : 'page'} className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold transition-colors hover:bg-surface-2', folderId ? 'text-fg-muted' : 'text-fg')}>
            <FolderIcon size={15} /> {t('documents.root')}
          </button>
          {currentFolder && (
            <>
              <ChevronRight size={15} className="shrink-0 text-fg-subtle" />
              <span className="truncate font-bold text-fg">{currentFolder.name}</span>
              <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-[11.5px] text-fg-muted">{scopeIcon(currentFolder.scope)}{scopeLabel(currentFolder.scope)}</span>
            </>
          )}
        </nav>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            type="search"
            name="doc-search"
            aria-label={t('documents.searchPlaceholder')}
            spellCheck={false}
            leftIcon={<Search size={16} />}
            wrapperClassName="w-full sm:w-64"
            rightSlot={
              search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('common.clear')}
                  className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <X size={14} />
                </button>
              ) : undefined
            }
          />
          <button type="button" onClick={() => setFilter('sort', sortBy === 'name' ? '' : 'name')} className={chipCls(false)} aria-label={t('documents.sort')}>
            {sortBy === 'name' ? <ArrowDownAZ size={14} /> : <Clock size={14} />}
            {sortBy === 'name' ? t('documents.sortName') : t('documents.sortRecent')}
          </button>
          <Segmented
            variant="brand"
            size="sm"
            value={view}
            onChange={(v) => setFilter('view', v === 'list' ? '' : v)}
            options={[
              { value: 'list', icon: <ListIcon size={15} />, label: t('documents.viewList'), iconOnly: true },
              { value: 'grid', icon: <LayoutGrid size={15} />, label: t('documents.viewGrid'), iconOnly: true },
            ]}
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="scroll-thin -mx-page mb-4 flex gap-2 overflow-x-auto px-page pb-1">
          <button type="button" aria-pressed={!filters.kind} onClick={() => setFilter('kind', '')} className={chipCls(!filters.kind)}>
            {t('documents.kindAll')} <span className="tabular-nums text-fg-subtle">{files.length}</span>
          </button>
          {[...KINDS, { key: 'other' as const, exts: [] as string[], label: t('documents.kindOther') }].map((k) =>
            kindCounts[k.key] ? (
              <button key={k.key} type="button" aria-pressed={filters.kind === k.key} onClick={() => setFilter('kind', filters.kind === k.key ? '' : k.key)} className={chipCls(filters.kind === k.key)}>
                {k.label} <span className="tabular-nums text-fg-subtle">{kindCounts[k.key]}</span>
              </button>
            ) : null,
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : isEmpty ? (
        <Card className="p-8">
          <EmptyState
            icon={<FolderIcon size={22} />}
            title={folderId ? t('documents.emptyFolder') : t('documents.empty')}
            description={canUploadHere ? t('documents.emptyDropHint') : t('documents.emptyHint')}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {shownFolders.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12.5px] font-semibold text-fg-subtle">{t('documents.folders')} · {shownFolders.length}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
                {shownFolders.map((folder) => (
                  <FolderCard
                    key={`folder-${folder.id}`}
                    folder={folder}
                    scope={<span className="inline-flex items-center gap-1">{scopeIcon(folder.scope)}{scopeLabel(folder.scope)}</span>}
                    onOpen={() => setFilter('folder', String(folder.id))}
                    onRename={() => setRenaming({ kind: 'folder', id: folder.id, name: folder.name ?? '' })}
                    onShare={() => setSharing({ kind: 'folder', id: folder.id, name: folder.name ?? '', state: shareOf(folder) })}
                    onDelete={() => setDeleting({ kind: 'folder', id: folder.id, name: folder.name ?? '' })}
                  />
                ))}
              </div>
            </section>
          )}

          {shownFiles.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12.5px] font-semibold text-fg-subtle">{t('documents.files')} · {shownFiles.length}</h2>
              {view === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {shownFiles.map((file) => (
                    <DocFileCard key={`file-${file.id}`} file={file} selected={selection.isSelected(file.id)} onToggleSelect={() => selection.toggle(file.id)} {...fileActions(file)} />
                  ))}
                </div>
              ) : (
                <Card className="overflow-hidden p-0">
                  <div className="hidden grid-cols-[28px_minmax(0,1fr)_110px_200px_120px_150px_132px] items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-2 text-[11.5px] font-semibold text-fg-subtle md:grid">
                    <span>
                      {editableFiles.length > 0 && (
                        <Checkbox checked={selection.allOnPageSelected} indeterminate={selection.someOnPageSelected} onChange={selection.toggleAllOnPage} srLabel={t('list.selectAllOnPage')} />
                      )}
                    </span>
                    <span>{t('documents.colName')}</span>
                    <span>{t('documents.colType')}</span>
                    <span>{t('documents.colOwner')}</span>
                    <span>{t('documents.colAccess')}</span>
                    <span>{t('documents.colModified')}</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-line/60">
                    {shownFiles.map((file) => {
                      const { color, Icon } = extMeta(file)
                      const a = fileActions(file)
                      const editable = file.can_edit !== false
                      // The owner is stored as their own editor — «shared» means OTHER people.
                      const shared = [...(file.editors ?? []), ...(file.viewers ?? [])].filter((p) => p.id !== file.created_by?.id).length
                      return (
                        <li key={file.id} className={cn('group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2/50 md:grid-cols-[28px_minmax(0,1fr)_110px_200px_120px_150px_132px]', selection.isSelected(file.id) && 'bg-brand-soft/40')}>
                          <span>{editable && <Checkbox checked={selection.isSelected(file.id)} onChange={() => selection.toggle(file.id)} srLabel={fileName(file)} />}</span>
                          <button type="button" onClick={a.onOpen} className="flex min-w-0 items-center gap-3 text-left">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `rgb(var(${color}) / 0.14)`, color: `rgb(var(${color}))` }}>
                              <Icon size={18} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-semibold text-fg group-hover:text-brand-strong">{fileName(file)}</span>
                              <span className="block truncate text-[11.5px] text-fg-subtle md:hidden">{file.updated_at ? formatDateTime(file.updated_at) : ''}</span>
                            </span>
                          </button>
                          <span className="hidden text-[12px] font-semibold uppercase text-fg-muted md:block">{extOf(file)}</span>
                          <span className="hidden min-w-0 items-center gap-2 md:flex">
                            {file.created_by?.legal_name ? (
                              <>
                                <Avatar src={file.created_by.photo_path ?? undefined} name={file.created_by.legal_name} size={22} />
                                <span className="truncate text-[12.5px] text-fg-muted">{file.created_by.legal_name}</span>
                              </>
                            ) : <span className="text-fg-subtle">—</span>}
                          </span>
                          <span className="hidden items-center gap-1.5 text-[12px] text-fg-muted md:inline-flex">
                            {scopeIcon(file.scope)} {scopeLabel(file.scope)}
                            {shared > 0 && <span className="rounded-pill bg-surface-2 px-1.5 text-[11px] tabular-nums">+{shared}</span>}
                          </span>
                          <span className="hidden text-[12px] tabular-nums text-fg-muted md:block">{file.updated_at ? formatDateTime(file.updated_at) : '—'}</span>
                          <span className="flex justify-end gap-0.5">
                            {editable && (
                              <>
                                <span className="hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:flex">
                                  <IconButton size="sm" label={t('documents.rename')} onClick={a.onRename}><Pencil size={14} /></IconButton>
                                  <IconButton size="sm" label={t('documents.shareTitle')} onClick={a.onShare}><Share2 size={14} /></IconButton>
                                  <IconButton size="sm" label={t('documents.copyLink')} onClick={a.onCopyLink}><Link2 size={14} /></IconButton>
                                  <IconButton size="sm" label={t('common.delete')} onClick={a.onDelete}><Trash2 size={14} /></IconButton>
                                </span>
                                {/* Phone: four icons squeezed the name to «Yangi …» — one menu instead. */}
                                <span className="md:hidden">
                                  <MoreMenu items={[
                                    { icon: <Pencil size={14} />, label: t('documents.rename'), onClick: a.onRename },
                                    { icon: <Share2 size={14} />, label: t('documents.shareTitle'), onClick: a.onShare },
                                    { icon: <Link2 size={14} />, label: t('documents.copyLink'), onClick: a.onCopyLink },
                                    { icon: <Trash2 size={14} />, label: t('common.delete'), onClick: a.onDelete, danger: true },
                                  ]} />
                                </span>
                              </>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )}
            </section>
          )}
          {shownFiles.length === 0 && files.length > 0 && (
            <Card className="p-6"><EmptyState title={t('list.noResultsFiltered')} description={t('list.noResultsFilteredHint')} /></Card>
          )}
        </div>
      )}
      </div>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmBulk(true)}>
          {t('common.delete')}
        </Button>
      </BulkBar>

      <ConfirmDialog
        open={confirmBulk}
        title={t('documents.bulkDeleteTitle')}
        description={t('documents.bulkDeleteBody', { count: selection.count })}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setConfirmBulk(false)}
        onConfirm={runBulkDelete}
      />

      {/* New folder */}
      <NameModal
        open={folderModal}
        title={t('documents.createFolderTitle')}
        label={t('documents.folderName')}
        loading={mut.createFolder.isPending}
        extra={<ShareControls value={newFolderShare} onChange={setNewFolderShare} />}
        onClose={() => setFolderModal(false)}
        onSubmit={async (name) => {
          await mut.createFolder.mutateAsync({
            name,
            scope: newFolderShare.scope,
            group_can_edit: newFolderShare.groupCanEdit,
            editor_ids: newFolderShare.editorIds,
            viewer_ids: newFolderShare.viewerIds,
          })
          setFolderModal(false)
          setNewFolderShare(EMPTY_SHARE)
          done(t('documents.created'))
        }}
      />

      {/* Rename */}
      <NameModal
        open={!!renaming}
        title={t('documents.renameTitle')}
        label={t('documents.newName')}
        initial={renaming?.name}
        loading={mut.updateFolder.isPending || mut.updateFile.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (!renaming) return
          if (renaming.kind === 'folder') await mut.updateFolder.mutateAsync({ id: renaming.id, body: { name } })
          else await mut.updateFile.mutateAsync({ id: renaming.id, body: { original_filename: name } })
          setRenaming(null)
          done(t('documents.renamed'))
        }}
      />

      {/* Ulashish — papka va fayl uchun bir xil oyna. */}
      <Modal
        open={!!sharing}
        onClose={() => setSharing(null)}
        title={`${t('documents.shareTitle')} — ${sharing?.name ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSharing(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={saveShare}
              loading={mut.updateFolder.isPending || mut.updateFile.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {sharing && (
          <ShareControls
            value={sharing.state}
            onChange={(state) => setSharing({ ...sharing, state })}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        danger
        title={t('documents.deleteTitle')}
        description={
          deleting?.kind === 'folder'
            ? t('documents.deleteFolderConfirm', { name: deleting?.name })
            : t('documents.deleteFileConfirm', { name: deleting?.name })
        }
        confirmLabel={t('common.delete')}
      />
    </PageContainer>
  )
}

function CardMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg bg-surface/90 reveal-on-hover opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {children}
    </div>
  )
}

function FolderCard({ folder, scope, onOpen, onRename, onShare, onDelete }: { folder: Folder; scope: ReactNode; onOpen: () => void; onRename: () => void; onShare: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const count = folder.files?.length ?? 0
  return (
    <Card className="group relative p-0">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-card p-3 text-left transition-colors hover:bg-surface-2/50">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand-strong">
          <FolderIcon size={20} fill="currentColor" fillOpacity={0.18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-fg">{folder.name}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fg-subtle">
            <span>{t('documents.filesCount', { count })}</span>·{scope}
          </span>
        </span>
      </button>
      {/* Only what the server would accept (a viewer used to get a 403 behind each). */}
      {folder.can_edit !== false && (
        <>
          <span className="[@media(hover:none)]:hidden">
            <CardMenu>
              <IconButton size="sm" label={t('documents.rename')} onClick={onRename}><Pencil size={14} /></IconButton>
              <IconButton size="sm" label={t('documents.shareTitle')} onClick={onShare}><Share2 size={14} /></IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={onDelete}><Trash2 size={14} /></IconButton>
            </CardMenu>
          </span>
          {/* Touch: the hover row sat on top of the folder name — one «…» instead. */}
          <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 [@media(hover:none)]:block">
            <MoreMenu items={[
              { icon: <Pencil size={14} />, label: t('documents.rename'), onClick: onRename },
              { icon: <Share2 size={14} />, label: t('documents.shareTitle'), onClick: onShare },
              { icon: <Trash2 size={14} />, label: t('common.delete'), onClick: onDelete, danger: true },
            ]} />
          </span>
        </>
      )}
    </Card>
  )
}

function MoreMenu({ items }: { items: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton ref={ref} size="sm" label={t('documents.actions')} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} />
      </IconButton>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} label={t('documents.actions')} align="end">
        <div className="p-1" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick() }} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-2', it.danger ? 'text-danger' : 'text-fg')}>
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      </AnchoredPanel>
    </>
  )
}

function DocFileCard({ file, onOpen, onRename, onShare, onCopyLink, onDelete, selected, onToggleSelect }: { file: DocFile; onOpen: () => void; onRename: () => void; onShare: () => void; onCopyLink: () => void; onDelete: () => void; selected: boolean; onToggleSelect: () => void }) {
  const { t } = useTranslation()
  const { color, Icon } = extMeta(file)
  /* Rename, share, share-link and delete all sit behind `_can_modify_file`;
     the checkbox feeds bulk delete, so it follows the same flag. */
  const editable = file.can_edit !== false
  return (
    <Card className={cn('group relative flex flex-col p-0', selected && 'ring-2 ring-brand')}>
      {/* The checkbox sits OUTSIDE the open button — nesting it would make every
          tick open the document instead of selecting it. */}
      {/* On a finger the action row is always visible (`reveal-on-hover`),
          and in a 177 px phone card it was drawn straight over this checkbox
          (measured 2026-09-19). Kept clear of the menu's width instead of
          sharing the same corner. */}
      {editable && (
        <span className="absolute left-2 top-2 z-10 [@media(hover:none)]:top-[46px]">
          <Checkbox checked={selected} onChange={onToggleSelect} srLabel={fileName(file)} />
        </span>
      )}
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col items-start gap-2 rounded-xl p-4 pt-8 text-left transition-colors hover:bg-surface-2/50 [@media(hover:none)]:pl-11">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-lg" style={{ backgroundColor: `rgb(var(${color}) / 0.14)`, color: `rgb(var(${color}))` }}>
          <Icon size={18} />
        </span>
        <span className="line-clamp-2 break-all text-[13px] font-semibold text-fg">{fileName(file)}</span>
        <span className="text-[11px] uppercase text-fg-subtle">{extOf(file)}</span>
      </button>
      {editable && (
        <CardMenu>
          <IconButton size="sm" label={t('documents.rename')} onClick={onRename}><Pencil size={14} /></IconButton>
          <IconButton size="sm" label={t('documents.shareTitle')} onClick={onShare}><Share2 size={14} /></IconButton>
          <IconButton size="sm" label={t('documents.copyLink')} onClick={onCopyLink}><Link2 size={14} /></IconButton>
          <IconButton size="sm" label={t('common.delete')} onClick={onDelete}><Trash2 size={14} /></IconButton>
        </CardMenu>
      )}
    </Card>
  )
}

/** Name + (on create) who may see it. Renaming keeps sharing where it is —
 *  that is what the separate share dialog is for. */
function NameModal({ open, title, label, initial, loading, extra, onClose, onSubmit }: { open: boolean; title: string; label: string; initial?: string; loading: boolean; extra?: ReactNode; onClose: () => void; onSubmit: (name: string) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  useEffect(() => {
    if (open) setName(initial ?? '')
  }, [open, initial])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim()} loading={loading}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={label}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={label} autoFocus />
        </Field>
        {extra}
      </div>
    </Modal>
  )
}

const chipCls = (on: boolean) => filterChip(on)

/** One «Yaratish» menu instead of five buttons in the header. */
function CreateMenu({ onFolder, onBlank, canFiles }: { onFolder: () => void; onBlank: (k: 'docx' | 'xlsx' | 'pptx') => void; canFiles: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const item = (icon: ReactNode, tone: string, label: string, hint: string, fn: () => void) => (
    <button type="button" role="menuitem" onClick={() => { setOpen(false); fn() }} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: `rgb(var(${tone}) / 0.14)`, color: `rgb(var(${tone}))` }}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-fg">{label}</span>
        <span className="block text-[11.5px] text-fg-subtle">{hint}</span>
      </span>
    </button>
  )
  return (
    <>
      <Button ref={ref} size="sm" leftIcon={<Plus size={15} />} rightIcon={<ChevronDown size={14} />} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {t('documents.create')}
      </Button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={Math.max(POPOVER.menuW, 260)} label={t('documents.create')} align="end">
        <div className="p-1" role="menu">
          {canFiles && item(<FileText size={16} />, '--brand', t('documents.newWord'), t('documents.newWordHint'), () => onBlank('docx'))}
          {canFiles && item(<FileSpreadsheet size={16} />, '--success', t('documents.newExcel'), t('documents.newExcelHint'), () => onBlank('xlsx'))}
          {canFiles && item(<Presentation size={16} />, '--warning', t('documents.newPpt'), t('documents.newPptHint'), () => onBlank('pptx'))}
          <div className="my-1 border-t border-line" />
          {item(<FolderPlus size={16} />, '--fg-muted', t('documents.newFolder'), t('documents.newFolderHint'), onFolder)}
        </div>
      </AnchoredPanel>
    </>
  )
}
