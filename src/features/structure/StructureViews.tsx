import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/data/SearchInput'
import { TD, TH } from '@/components/data/tableStyles'
import { cn } from '@/lib/cn'
import { searchFold } from '@/lib/searchFold'
import { flattenTree, type TreeNode, type TreeSource } from './structureTree'

/**
 * TZ S3 «дерево / список» views of the department structure. Both take a tree
 * built by `buildTree` from any department-shaped rows — the live list or the
 * as-of snapshot (TZ 2029/2061) — so the two modes render identically.
 */
export interface StructureSource extends TreeSource {
  closed_at?: string | null
  staff_count?: number | null
  heads?: { legal_name?: string | null }[] | null
  head?: { name?: string | null } | null
}

export type StructureNode = TreeNode<StructureSource>

export const headNames = (n: StructureNode): string[] =>
  n.raw.heads?.length
    ? n.raw.heads.map((h) => h.legal_name).filter((x): x is string => !!x)
    : n.raw.head?.name
      ? [n.raw.head.name]
      : []

function ancestors(byId: Map<number, StructureNode>, id: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  let cur = byId.get(id)?.parent_id ?? null
  while (cur != null && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    cur = byId.get(cur)?.parent_id ?? null
  }
  return out
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = searchFold(query)
  const idx = q ? searchFold(text).indexOf(q) : -1
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[2px] bg-warning/30 px-px text-fg">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

/** S3 «иерархическое дерево»: expand / collapse; the search opens the path to every hit. */
export function DepartmentTreeView({
  roots,
  byId,
  onOpen,
}: {
  roots: StructureNode[]
  byId: Map<number, StructureNode>
  onOpen: (n: StructureNode) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(roots.map((r) => r.id)))
  const [query, setQuery] = useState('')

  const parentIds = useMemo(
    () => flattenTree(roots).filter(({ node }) => node.children.length).map(({ node }) => node.id),
    [roots],
  )
  const search = useMemo(() => {
    const q = searchFold(query)
    if (!q) return null
    const matches = new Set<number>()
    const visible = new Set<number>()
    const open = new Set<number>()
    for (const { node } of flattenTree(roots)) {
      if (searchFold(node.name).includes(q) || searchFold(node.code).includes(q)) {
        matches.add(node.id)
        visible.add(node.id)
        for (const a of ancestors(byId, node.id)) {
          visible.add(a)
          open.add(a)
        }
      }
    }
    return { matches, visible, open }
  }, [query, roots, byId])
  const isOpen = (id: number) => expanded.has(id) || !!search?.open.has(id)
  const shown = (n: StructureNode) => !search || search.visible.has(n.id)
  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderNode = (n: StructureNode, depth: number) => {
    const kids = n.children.filter(shown)
    const open = isOpen(n.id)
    const heads = headNames(n)
    const staff = n.raw.staff_count
    return (
      <li key={n.id}>
        <div
          className={cn(
            'group flex h-10 items-center gap-1.5 rounded-lg pr-2.5 transition-colors hover:bg-surface-2',
            search?.matches.has(n.id) && 'bg-warning-soft/60',
          )}
          style={{ paddingLeft: 6 + depth * 22 }}
        >
          {kids.length ? (
            <button
              type="button"
              onClick={() => toggle(n.id)}
              aria-expanded={open}
              aria-label={open ? t('orgRef.collapse') : t('orgRef.expand')}
              title={open ? t('orgRef.collapse') : t('orgRef.expand')}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-fg-muted hover:bg-fg/[0.08] hover:text-fg"
            >
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <span className="flex w-6 shrink-0 justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-fg/20" />
            </span>
          )}
          <button type="button" onClick={() => onOpen(n)} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
            <Building2 size={15} className={cn('shrink-0', depth === 0 ? 'text-brand-strong' : 'text-fg-subtle')} />
            <span className={cn('truncate text-[14px] group-hover:text-brand-strong', depth === 0 ? 'font-semibold text-fg' : 'text-fg')}>
              <Highlight text={n.name} query={query} />
            </span>
            {n.code && (
              <span className="shrink-0 rounded-tag border border-line bg-surface-2 px-1.5 text-[11px] text-fg-muted">
                <Highlight text={n.code} query={query} />
              </span>
            )}
            {n.raw.closed_at && <Badge tone="warning">{t('orgAdmin.closedBadge')}</Badge>}
            <span className="flex-1" />
            {heads.length > 0 && <span className="hidden max-w-[260px] truncate text-[12px] text-fg-muted md:block">{heads.join(', ')}</span>}
            {staff != null && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-tag bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success"
                title={t('orgAdmin.staffCount')}
              >
                <Users size={12} /> {staff}
              </span>
            )}
          </button>
        </div>
        {kids.length > 0 && open && <ul>{kids.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  const rootsShown = roots.filter(shown)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('orgRef.searchDept')} className="w-full max-w-[300px]" />
        {search && <span className="text-[12px] text-fg-muted">{t('orgRef.found', { count: search.matches.size })}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" leftIcon={<ChevronsUpDown size={14} />} onClick={() => setExpanded(new Set(parentIds))}>
          {t('orgRef.expandAll')}
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<ChevronsDownUp size={14} />} onClick={() => setExpanded(new Set())}>
          {t('orgRef.collapseAll')}
        </Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {rootsShown.length === 0 ? (
          <p className="py-16 text-center text-sm text-fg-subtle">{search ? t('orgRef.noDeptFound') : t('orgAdmin.emptyDept')}</p>
        ) : (
          <ul aria-label={t('structure.title')}>{rootsShown.map((r) => renderNode(r, 0))}</ul>
        )}
      </div>
    </div>
  )
}

type ListKey = 'name' | 'code' | 'parent' | 'head' | 'staff'

/** S3 «список» + 4.2.6 «отбор подразделений по показателям»: flat, every column sortable. */
export function DepartmentListView({
  roots,
  byId,
  onOpen,
}: {
  roots: StructureNode[]
  byId: Map<number, StructureNode>
  onOpen: (n: StructureNode) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: ListKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })

  const rows = useMemo(
    () =>
      flattenTree(roots).map(({ node }) => ({
        node,
        name: node.name,
        code: node.code,
        parent: node.parent_id != null ? byId.get(node.parent_id)?.name ?? '' : '',
        head: headNames(node).join(', '),
        staff: node.raw.staff_count ?? null,
      })),
    [roots, byId],
  )
  const shown = useMemo(() => {
    const q = searchFold(query)
    const list = q ? rows.filter((r) => [r.name, r.code, r.parent, r.head].some((v) => searchFold(v).includes(q))) : rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (sort.key === 'staff') {
        if (a.staff == null && b.staff == null) return 0
        if (a.staff == null) return 1
        if (b.staff == null) return -1
        return (a.staff - b.staff) * dir
      }
      const av = a[sort.key]
      const bv = b[sort.key]
      if (!av && bv) return 1
      if (av && !bv) return -1
      return String(av).localeCompare(String(bv), 'uz', { numeric: true }) * dir
    })
  }, [rows, query, sort])

  const cols: { key: ListKey; label: string; className?: string }[] = [
    { key: 'name', label: t('orgAdmin.colName') },
    { key: 'code', label: t('orgAdmin.colCode'), className: 'w-[120px]' },
    { key: 'parent', label: t('orgAdmin.colParent') },
    { key: 'head', label: t('orgRef.head') },
    { key: 'staff', label: t('orgAdmin.colStaff'), className: 'w-[110px] text-right' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('orgRef.searchDept')} className="w-full max-w-[300px]" />
        <span className="text-[12px] text-fg-muted">{t('orgRef.total', { count: shown.length })}</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-fg-subtle">{t('orgRef.noDeptFound')}</p>
        ) : (
          <table className="w-full min-w-[720px] text-left">
            <thead className="sticky top-0 z-[1] border-b border-line bg-surface-2">
              <tr>
                <th className={cn(TH, 'w-12')}>#</th>
                {cols.map((c) => {
                  const active = sort.key === c.key
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                  return (
                    <th key={c.key} className={cn(TH, c.className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button
                        type="button"
                        onClick={() =>
                          setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))
                        }
                        className={cn('inline-flex items-center gap-1 hover:text-fg', active && 'text-brand-strong')}
                      >
                        {c.label} <Icon size={12} className={active ? '' : 'opacity-40'} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.node.id} onClick={() => onOpen(r.node)} className="cursor-pointer border-b border-line/60 hover:bg-surface-2/50">
                  <td className={cn(TD, 'tabnum text-fg-subtle')}>{i + 1}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-2 font-medium text-fg">
                      {r.name}
                      {r.node.raw.closed_at && <Badge tone="warning">{t('orgAdmin.closedBadge')}</Badge>}
                    </span>
                  </td>
                  <td className={cn(TD, 'text-fg-muted')}>{r.code || '—'}</td>
                  <td className={cn(TD, 'text-fg-muted')}>{r.parent || '—'}</td>
                  <td className={cn(TD, 'text-[13px] text-fg-muted')}>{r.head || '—'}</td>
                  <td className={cn(TD, 'tabnum text-right text-fg')}>{r.staff ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
