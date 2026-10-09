import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { control } from '@/components/ui/control'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import type { ReportOption } from './types'

interface Props {
  value: number[]
  onChange: (next: number[]) => void
  options: ReportOption[]
  loading?: boolean
  placeholder?: string
  id?: string
}

/**
 * Two-level tree (branch → departments) with "check parent = check all
 * children", search and collapse — the division picker of the source system.
 * Only department ids are stored; a branch node is a convenience.
 */
export function DivisionTreeSelect({ value, onChange, options, loading, placeholder, id }: Props) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [open_, setOpen_] = useState<Record<string, boolean>>({})
  const tree = useMemo(() => {
    const branches = options.filter((o) => o.is_branch)
    const byParent: Record<string, ReportOption[]> = {}
    for (const o of options) {
      if (o.is_branch) continue
      const p = String(o.parent ?? '')
      ;(byParent[p] ??= []).push(o)
    }
    const term = q.trim().toLowerCase()
    return branches
      .map((b) => ({
        branch: b,
        depts: (byParent[String(b.value)] ?? []).filter((d) => !term || d.label.toLowerCase().includes(term)),
      }))
      .filter((n) => !term || n.depts.length > 0 || n.branch.label.toLowerCase().includes(term))
  }, [options, q])
  const selected = new Set(value)
  const single = tree.length === 1

  const toggleBranch = (depts: ReportOption[], on: boolean) => {
    const ids = depts.map((d) => Number(d.value))
    if (on) onChange(Array.from(new Set([...value, ...ids])))
    else onChange(value.filter((v) => !ids.includes(v)))
  }

  const nameOf = useMemo(() => {
    const m: Record<number, string> = {}
    for (const o of options) if (!o.is_branch) m[Number(o.value)] = o.label
    return m
  }, [options])
  const width = Math.max(340, Math.min(560, anchorRef.current?.getBoundingClientRect().width ?? 400))
  const CHIP_LIMIT = 8

  return (
    <div className="space-y-2">
      <button
        ref={anchorRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(control({}), 'flex w-full items-center justify-between gap-2 text-left')}
      >
        <span className={cn('min-w-0 flex-1 truncate', value.length ? 'text-fg' : 'text-fg-subtle')}>
          {value.length ? t('reports.selectedCount', { count: value.length }) : (placeholder ?? t('reports.pickPlaceholder'))}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>

      <AnchoredPanel anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={width} height={400} align="start" role="dialog" label={placeholder}>
        <div
          className="flex h-full max-h-[400px] flex-col"
          // Escape closes the panel only, never a Modal hosting the picker.
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              anchorRef.current?.focus()
            }
          }}
        >
          <div className="border-b border-line p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} autoFocus />
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1.5 text-[13px]">
            {loading ? (
              <p className="p-2 text-fg-subtle">{t('common.loading')}</p>
            ) : tree.length === 0 ? (
              <p className="p-2 text-fg-subtle">{t('reports.noData')}</p>
            ) : (
              tree.map(({ branch, depts }) => {
                const ids = depts.map((d) => Number(d.value))
                const picked = ids.filter((i) => selected.has(i)).length
                const isOpen = open_[String(branch.value)] ?? (single || !!q)
                return (
                  <div key={String(branch.value)} className="mb-1">
                    <div className="flex items-center gap-1 rounded-[8px] px-1 py-1 hover:bg-surface-2">
                      <button type="button" className="p-0.5 text-fg-subtle" onClick={() => setOpen_((o) => ({ ...o, [String(branch.value)]: !isOpen }))} aria-label={isOpen ? t('reports.collapse') : t('reports.expand')}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Checkbox
                        checked={ids.length > 0 && picked === ids.length}
                        indeterminate={picked > 0 && picked < ids.length}
                        onChange={(e) => toggleBranch(depts, e.target.checked)}
                        label={`${branch.label}${ids.length ? ` (${picked}/${ids.length})` : ''}`}
                      />
                    </div>
                    {isOpen && (
                      <ul className="ml-7 space-y-0.5">
                        {depts.map((d) => {
                          const did = Number(d.value)
                          return (
                            <li key={did} className="rounded-[8px] px-1 py-0.5 hover:bg-surface-2">
                              <Checkbox
                                checked={selected.has(did)}
                                onChange={(e) => onChange(e.target.checked ? [...value, did] : value.filter((v) => v !== did))}
                                label={d.label}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-fg-muted">
            <span>{t('reports.selectedCount', { count: value.length })}</span>
            <span className="flex gap-3">
              {value.length > 0 && <button type="button" className="hover:text-fg" onClick={() => onChange([])}>{t('common.clear')}</button>}
              <button type="button" className="font-semibold text-brand-strong" onClick={() => setOpen(false)}>{t('reports.done')}</button>
            </span>
          </div>
        </div>
      </AnchoredPanel>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.slice(0, CHIP_LIMIT).map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-pill bg-brand-soft py-1 pl-2.5 pr-1.5 text-[12px] text-brand-strong ring-1 ring-inset ring-brand/20">
              <span className="max-w-[220px] truncate">{nameOf[v] ?? String(v)}</span>
              <button type="button" className="rounded-full p-0.5 hover:bg-brand/15" aria-label={t('common.delete')} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X size={12} />
              </button>
            </li>
          ))}
          {value.length > CHIP_LIMIT && (
            <li className="inline-flex items-center rounded-pill bg-surface-2 px-2.5 py-1 text-[12px] text-fg-muted">+{value.length - CHIP_LIMIT}</li>
          )}
        </ul>
      )}
    </div>
  )
}
