import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { employeeSubLabel } from './subLabel'
import type { Page } from './useEmployees'
import type { Employee } from '@/types'
import { POPOVER_CLS } from '@/components/ui/control'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'

/** A `/employees` row as the picker sees it — `user_id` is the login behind
 *  the person (the audit journal is keyed by it, not by the employee id). */
type PickerEmployee = Employee & { user_id?: number | null }

/**
 * The picker's own search: `/employees`, pages of 20. Exported so a screen
 * that needs a person as a FILTER (the audit journal's user picker) searches
 * exactly the way the form picker does, instead of growing a second search.
 *
 * `browse`: also load the first page with an EMPTY query (a filter dropdown
 * that opens onto a list). Paged since 2026-09-25 — `hasMore`/`loadMore`
 * fetch the next 20 when the list is scrolled to its end.
 */
export function useEmployeePickerSearch(q: string, branchId?: number | null, browse = false) {
  const query = useInfiniteQuery({
    queryKey: ['employee-picker', branchId, q],
    initialPageParam: 1,
    // `signal`: re-keyed on every keystroke, so a superseded request must be
    // aborted rather than merely ignored (see GlobalSearch).
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<PickerEmployee>>(
        EMPLOYEES_LIST,
        {
          organization_branch_id: branchId || undefined,
          search: q || undefined,
          size: 20,
          page: pageParam,
        },
        { signal },
      ),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: browse || q.trim().length > 0,
    placeholderData: (prev) => prev,
  })
  return {
    candidates: query.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    loading: query.isFetching,
    error: query.error,
    hasMore: !!query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
  }
}

/**
 * Single-employee searchable select. Every document form needs one (submitter,
 * leadership, author…), so it lives here rather than being re-inlined per page.
 */
export function EmployeePicker({
  value,
  onChange,
  branchId,
  allBranches = false,
  placeholder,
  disabled,
}: {
  value: Employee | null
  onChange: (emp: Employee | null) => void
  /** Restrict candidates to this branch. Omitted = the branch picked in the
   *  header (none picked = every branch the viewer may see). */
  branchId?: number | null
  /** Search the whole organisation regardless of the header's branch — for
   *  forms that deliberately reach across branches (sanatorium doctors,
   *  vacancy notice recipients). */
  allBranches?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  /* The header's branch by default (2026-09-28): with «Gidro» picked, a
     temporary order offered every branch's employees to an admin — the list
     beside it showed Gidro only. */
  const headerBranchId = useBranchStore((s) => s.selectedBranchId)
  const scopeBranchId = branchId !== undefined ? branchId : allBranches ? null : headerBranchId

  const { candidates, error, hasMore, loadMore, loading } = useEmployeePickerSearch(q, scopeBranchId)

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
        <Avatar src={value.photo_thumb_path} name={value.legal_name} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{value.legal_name}</span>
          {employeeSubLabel(value) && (
            <span className="block truncate text-xs text-fg-subtle">{employeeSubLabel(value)}</span>
          )}
        </span>
        {!disabled && (
          <button
            type="button"
            aria-label={t('common.clearValue')}
            onClick={() => onChange(null)}
            className="rounded p-1 text-fg-subtle hover:text-fg"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? t('common.search')}
        disabled={disabled}
      />
      {/* A failed search used to render NOTHING: the dropdown is gated on
        * `candidates.length > 0`, and a 403 or a timeout leaves that list
        * empty. The person typing a name saw the same silence as for a name
        * that truly is not in the system, and concluded the second. */}
      {q.trim() && candidates.length === 0 && error != null && (
        <div className={cn(POPOVER_CLS, 'absolute z-20 mt-1 w-full px-3 py-4 text-center text-xs text-danger')}>
          {errorMessage(error, t('list.loadFailed'))}
        </div>
      )}
      {q.trim() && candidates.length > 0 && (
        <div
          className={cn(POPOVER_CLS, 'absolute z-20 mt-1 max-h-56 w-full overflow-auto')}
          onScroll={(e) => {
            const el = e.currentTarget
            if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMore()
          }}
        >
          {candidates.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                onChange(emp)
                setQ('')
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              <Avatar src={emp.photo_thumb_path} name={emp.legal_name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg">{emp.legal_name}</span>
                {employeeSubLabel(emp) && (
                  <span className="block truncate text-xs text-fg-subtle">{employeeSubLabel(emp)}</span>
                )}
              </span>
            </button>
          ))}
          {hasMore && (
            <button type="button" disabled={loading} onClick={loadMore} className="w-full py-2 text-center text-[12px] font-medium text-brand-strong hover:bg-brand-soft disabled:text-fg-subtle">
              {loading ? t('common.loading') : t('common.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
