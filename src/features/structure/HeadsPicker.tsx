import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { employeeSubLabel } from '@/features/employees/subLabel'
import type { Page } from '@/features/employees/useEmployees'
import type { Employee } from '@/types'
import { control } from '@/components/ui/control'
import { errorMessage } from '@/api/errorMessage'

/** Compact searchable multi-select of employees — the department "heads" field. */
export function HeadsPicker({
  branchId,
  value,
  onChange,
  preselected,
  enabled = true,
}: {
  branchId: number | null
  value: number[]
  /** `names` — every name seen so far (selected chips keep it across searches). */
  onChange: (ids: number[], names?: Map<number, string>) => void
  /** Names for already-selected ids that may not be on the fetched page. */
  preselected?: { id: number; legal_name?: string | null }[]
  /**
   * Hold the candidate query until the caller has settled its branch.
   *
   * Measured 2026-09-11: the department modal mounts with its branch state
   * still `''`, fills it in an effect a tick later — and this picker had
   * already asked for 40 ORG-WIDE employees (plus 34 of their photos) that it
   * threw away when the branch arrived. Two fetches per open, one of them
   * unscoped, for a picker nobody had typed into yet.
   */
  enabled?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')

  const { data, isError, error } = useQuery({
    queryKey: ['heads-candidates', branchId, q],
    queryFn: () =>
      apiGet<Page<Employee>>(EMPLOYEES_LIST, {
        organization_branch_id: branchId || undefined,
        search: q || undefined,
        size: 40,
      }),
    enabled,
  })
  const candidates = data?.items ?? []

  /* Every name ever shown, not just the current page: after a second search
     the chips of people picked under the first one turned into «#81077». */
  const seen = useRef(new Map<number, string>())
  const nameById = useMemo(() => {
    for (const e of preselected ?? []) seen.current.set(e.id, e.legal_name ?? `#${e.id}`)
    for (const e of candidates) seen.current.set(e.id, e.legal_name ?? `#${e.id}`)
    return new Map(seen.current)
  }, [candidates, preselected])

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id], nameById)

  return (
    <div>
      {/* selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong"
            >
              {nameById.get(id) ?? `#${id}`}
              <button type="button" onClick={() => toggle(id)} aria-label={t('common.delete')}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={cn(control({ size: 'sm', focusWithin: true }), 'flex items-center gap-2 px-2.5')}>
        <Search size={15} className="text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('employees.searchPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>

      <ul className="scroll-thin mt-2 max-h-44 overflow-y-auto rounded-lg border border-line">
        {isError ? (
          /* "No such employee" and "the search failed" looked identical here,
           * and the person picking a head acts on the first reading. */
          <li className="px-3 py-4 text-center text-xs text-danger">{errorMessage(error, t('list.loadFailed'))}</li>
        ) : candidates.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-fg-subtle">{t('employees.empty')}</li>
        ) : (
          candidates.map((e) => {
            const active = value.includes(e.id)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                    active ? 'bg-brand-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <Avatar src={e.photo_thumb_path} name={e.legal_name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{e.legal_name}</span>
                    {employeeSubLabel(e) && (
                      <span className="block truncate text-[11px] text-fg-subtle">{employeeSubLabel(e)}</span>
                    )}
                  </span>
                  {active && <Check size={15} className="shrink-0 text-brand" />}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
