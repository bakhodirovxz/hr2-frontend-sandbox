import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Combobox } from '@/components/ui/Combobox'
import type { SelectOption } from '@/components/ui/Select'
import { useDebounce } from '@/hooks/useDebounce'
import { employeeOption } from '@/features/employees/subLabel'
import type { Page } from '@/features/employees/useEmployees'
import type { Employee } from '@/types'

/**
 * One employee from the branch, searched on the server and listed by RANK
 * (`sort_by_razryad`) — v1 sorts the agreer list this way so the senior staff
 * are on top. Pages of 20; the next page loads when the list is scrolled to
 * its end.
 *
 * `known` carries options the form already has a name for (the saved signers,
 * the author …): a selected person stays named even when they are not on the
 * page of results that is loaded.
 */
export function EmployeeSelect({
  value,
  onChange,
  branchId,
  known = [],
  placeholder,
  invalid,
  id,
  clearable = true,
}: {
  value: string
  onChange: (value: string, option: SelectOption | null) => void
  branchId: number | null
  known?: SelectOption[]
  placeholder?: string
  invalid?: boolean
  id?: string
  clearable?: boolean
}) {
  const [q, setQ] = useState('')
  const query = useDebounce(q, 300)
  const res = useInfiniteQuery({
    queryKey: ['orders', 'employee-select', branchId, query],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<Employee>>(
        EMPLOYEES_LIST,
        {
          organization_branch_id: branchId || undefined,
          search: query.trim() || undefined,
          sort_by_razryad: true,
          size: 20,
          page: pageParam,
        },
        { signal },
      ),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  })

  const options = useMemo(() => {
    const found = (res.data?.pages ?? []).flatMap((p) => p.items ?? []).map(employeeOption)
    const out: SelectOption[] = []
    const seen = new Set<string>()
    const add = (o: SelectOption) => {
      if (seen.has(o.value)) return
      seen.add(o.value)
      out.push(o)
    }
    const current = known.find((o) => o.value === value)
    if (current) add(current)
    found.forEach(add)
    return out
  }, [res.data, known, value])

  return (
    <Combobox
      id={id}
      className="w-full"
      value={value}
      onChange={(v) => onChange(v, options.find((o) => o.value === v) ?? null)}
      options={options}
      onSearchChange={setQ}
      loading={res.isFetching}
      error={res.error}
      hasMore={!!res.hasNextPage}
      onLoadMore={() => {
        if (res.hasNextPage && !res.isFetchingNextPage) void res.fetchNextPage()
      }}
      placeholder={placeholder}
      invalid={invalid}
      clearable={clearable}
    />
  )
}
