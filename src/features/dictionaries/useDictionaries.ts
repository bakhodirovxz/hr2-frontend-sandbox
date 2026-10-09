import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http'
import {
  DICTIONARIES,
  DICTIONARIES_SYNC,
  DICTIONARY_ENTRIES,
  DICTIONARY_ENTRY,
  DICTIONARY_ENTRY_USAGE,
  DICTIONARY_IMPORT,
  DICTIONARY_OPTIONS,
} from '@/api/endpoints'
import type { Page } from '@/features/employees/useEmployees'
import type { User } from '@/types'
import * as roles from '@/auth/roles'

/**
 * MA'LUMOTNOMALAR — TZ 4.2.5.
 *
 * One catalogue of catalogues: every classified list the rest of the product
 * picks from (nationalities, regions, military ranks, award kinds, education
 * levels…) lives behind ONE pair of endpoints keyed by the type's `code`, so a
 * new dictionary needs no new screen and no new code path.
 */

export interface DictionaryType {
  id: number
  code: string
  name: string
  name_ru?: string | null
  description?: string | null
  /** Set when this dictionary hangs off another one (districts → regions). */
  parent_type_code?: string | null
  is_system: boolean
  is_editable: boolean
  /** Filled when the rows are OWNED by another module (branches) and read-only. */
  external_source?: string | null
  sort_order: number
  is_active: boolean
  entry_count: number
  is_hierarchical: boolean
}

export interface DictionaryEntry {
  id: number
  type_id?: number | null
  type_code?: string | null
  code: string
  name: string
  name_ru?: string | null
  description?: string | null
  parent_id?: number | null
  parent_name?: string | null
  sort_order: number
  is_active: boolean
  extra?: Record<string, unknown> | null
  is_external: boolean
}

export interface DictionaryUsageRef {
  label: string
  count: number
  sample: string[]
}

export interface DictionaryUsage {
  entry_id: number
  used: boolean
  refs: DictionaryUsageRef[]
}

export interface DictionaryImportRow {
  code?: string
  name: string
  name_ru?: string
  parent_code?: string
  description?: string
  sort_order?: number
}

export interface DictionaryImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Who may write here — the same set the backend's `require_structure_manager`
 * accepts. A button that always answers 403 is worse than no button.
 */
export function canManageDictionaries(user: User | null | undefined): boolean {
  // Server `require_structure_manager` DENIES a ministr (measured 403).
  return roles.isSiteMasterAdmin(user) || roles.isHR(user)
}

export function useDictionaryTypes() {
  const q = useQuery({
    queryKey: ['dictionaries', 'types'],
    queryFn: () => apiGet<DictionaryType[]>(DICTIONARIES),
  })
  return { types: q.data ?? [], loading: q.isLoading, error: q.isError }
}

interface EntryQuery {
  page: number
  size: number
  search?: string
  parentId?: string
  /** '' = both, 'active' | 'inactive' */
  status?: string
}

export function useDictionaryEntries(code: string | null, query: EntryQuery) {
  const q = useQuery({
    queryKey: ['dictionaries', 'entries', code, query],
    queryFn: () =>
      apiGet<Page<DictionaryEntry>>(DICTIONARY_ENTRIES(code as string), {
        page: query.page,
        size: query.size,
        search: query.search || undefined,
        parent_id: query.parentId || undefined,
        is_active: query.status ? query.status === 'active' : undefined,
      }),
    enabled: !!code,
    placeholderData: (prev) => prev,
  })
  return {
    entries: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

/** Active rows of one dictionary, unpaginated — for pickers and parent filters. */
export function useDictionaryOptions(code: string | null | undefined) {
  const q = useQuery({
    queryKey: ['dictionaries', 'options', code],
    queryFn: () => apiGet<DictionaryEntry[]>(DICTIONARY_OPTIONS(code as string)),
    enabled: !!code,
    staleTime: 5 * 60_000,
  })
  return { options: q.data ?? [], loading: q.isLoading }
}

export function useDictionaryMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['dictionaries'] })

  return {
    invalidate,
    create: useMutation({
      mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) =>
        apiPost<DictionaryEntry>(DICTIONARY_ENTRIES(code), body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPut<DictionaryEntry>(DICTIONARY_ENTRY(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(DICTIONARY_ENTRY(id)),
      onSuccess: invalidate,
    }),
    importRows: useMutation({
      mutationFn: ({
        code,
        rows,
        updateExisting,
      }: {
        code: string
        rows: DictionaryImportRow[]
        updateExisting: boolean
      }) =>
        apiPost<DictionaryImportResult>(DICTIONARY_IMPORT(code), {
          rows,
          update_existing: updateExisting,
        }),
      onSuccess: invalidate,
    }),
    /** Re-creates any of the TZ's mandatory dictionaries that are missing. */
    sync: useMutation({
      mutationFn: () =>
        apiPost<{ types_created: number; entries_created: number }>(DICTIONARIES_SYNC, {}),
      onSuccess: invalidate,
    }),
  }
}

/** What still points at this entry — asked before offering to delete it. */
export async function fetchEntryUsage(id: number): Promise<DictionaryUsage> {
  return apiGet<DictionaryUsage>(DICTIONARY_ENTRY_USAGE(id))
}
