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
import { canWriteGlobal } from '@/auth/permissions'

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
  label_ru?: string | null
  count: number
  sample: string[]
  /** Source table and column (JSONB path) — `services/dictionary_usage.py`;
   *  absent for child entries of a hierarchical dictionary. */
  table?: string | null
  column?: string | null
}

/** One row of `GET /dictionaries/usage-registry` (TZ D1 1558 / D2 1583). */
export interface UsageRegistryRef {
  type_code: string
  table: string
  column: string
  kind: string
  path: string[]
  key?: string | null
  label: string
}

export interface UsageRegistry {
  refs: UsageRegistryRef[]
  coverage: { scanned?: string[]; uncovered?: string[]; ignored?: Record<string, string> }
}

/** Where the codes of every dictionary are stored (same for everybody). */
export function useUsageRegistry(enabled: boolean) {
  return useQuery({
    queryKey: ['dictionary-usage-registry'],
    queryFn: () => apiGet<UsageRegistry>('dictionaries/usage-registry'),
    enabled,
    staleTime: 30 * 60_000,
  })
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
  is_active?: boolean
}

export interface DictionaryImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * TZ D1 «Управление справочниками» — system-wide reference data, written only
 * at the whole-system level (`require_global_writer`); everyone else reads (D2).
 */
export function canManageDictionaries(user: User | null | undefined): boolean {
  return canWriteGlobal(user, 'dictionaries')
}

/** A name in the current language: `name_ru` for Russian, transliterated for Cyrillic. */
/** Generalised in `@/i18n/localized` (also reads `extra.name_ru`). */
export { localizedName } from '@/i18n/localized'

/** Rows owned by another module (branches, KPI bases) — read-only here. */
export function isExternalType(type: DictionaryType | null | undefined): boolean {
  return !!(type?.external_source || (type as { is_external?: boolean } | null)?.is_external)
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
      meta: { silent: true },
      mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) =>
        apiPost<DictionaryEntry>(DICTIONARY_ENTRIES(code), body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPut<DictionaryEntry>(DICTIONARY_ENTRY(id), body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(DICTIONARY_ENTRY(id)),
      onSuccess: invalidate,
    }),
    /** TZ D1 «Импорт»: pasted rows (JSON) or an .xlsx file (multipart). */
    importRows: useMutation({
      meta: { silent: true },
      mutationFn: ({
        code,
        rows,
        file,
        updateExisting,
      }: {
        code: string
        rows?: DictionaryImportRow[]
        file?: File
        updateExisting: boolean
      }) => {
        if (file) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('update_existing', updateExisting ? 'true' : 'false')
          return apiPost<DictionaryImportResult>(DICTIONARY_IMPORT(code), fd, { timeout: 120_000 })
        }
        return apiPost<DictionaryImportResult>(DICTIONARY_IMPORT(code), {
          rows: rows ?? [],
          update_existing: updateExisting,
        })
      },
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

/** TZ D2 1583 «Просмотр связанных объектов» — what still points at this entry. */
export function useEntryUsage(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['dictionary-usage', id],
    queryFn: () => apiGet<DictionaryUsage>(DICTIONARY_ENTRY_USAGE(id as number)),
    enabled: enabled && id != null,
    meta: { silent: true },
  })
}
