import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'

const URL = 'custom-fields'

/**
 * EXTRA FIELDS (TZ 4.2.6) — fields an administrator adds to an entity without
 * a developer or a migration.
 *
 * Two levels: a GROUP is a section on the card ("Harbiy hisob"), and the FIELDS
 * inside it are what is asked. The group carries the entity type, so the same
 * field name can mean different things on an employee and on a department.
 */
export interface CustomField {
  id: number
  group_id: number
  key?: string | null
  label?: string | null
  field_type?: string | null
  is_required?: boolean
  placeholder?: string | null
  help_text?: string | null
  options?: { value?: string; label?: string }[] | null
  dictionary_type_code?: string | null
  /** Son maydoni chegaralari — sxemada bor, v2 tipida e'lon qilinmagandi. */
  min_value?: number | null
  max_value?: number | null
  position?: number
  is_active?: boolean
  show_in_list?: boolean
}

export interface CustomFieldGroup {
  id: number
  title?: string | null
  entity_type?: string | null
  description?: string | null
  position?: number
  is_active?: boolean
  branch_ids?: number[] | null
  fields?: CustomField[]
}

interface CustomFieldMeta {
  entity_types: { value: string; label: string }[]
  field_types: { value: string; label: string }[]
}

export function useCustomFieldMeta() {
  const q = useQuery({
    queryKey: [URL, 'meta'],
    queryFn: () => apiGet<CustomFieldMeta>(`${URL}/meta`),
    staleTime: 30 * 60_000,
  })
  return { meta: q.data ?? null }
}

export function useCustomFieldGroups(entityType: string) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: [URL, 'groups', entityType],
    // `only_active=false` on purpose: this is the ADMIN screen, and a switched
    // off group has to stay visible here or it could never be switched back on.
    queryFn: () => apiGet<CustomFieldGroup[]>(`${URL}/groups`, { entity_type: entityType, only_active: false }),
  })
  // Employee cards read the `schema` query (staleTime 10 min); a field just
  // added, renamed or switched off must reach them too.
  const done = () => {
    void qc.invalidateQueries({ queryKey: [URL, 'groups'] })
    return qc.invalidateQueries({ queryKey: [URL, 'schema'] })
  }
  return {
    groups: Array.isArray(q.data) ? q.data : [],
    loading: q.isLoading,
    createGroup: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(`${URL}/groups`, body), onSuccess: done }),
    updateGroup: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${URL}/groups/${id}`, body),
      onSuccess: done,
    }),
    removeGroup: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/groups/${id}`), onSuccess: done }),
    createField: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(`${URL}/fields`, body), onSuccess: done }),
    updateField: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${URL}/fields/${id}`, body),
      onSuccess: done,
    }),
    removeField: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/fields/${id}`), onSuccess: done }),
  }
}


/** One filled-in custom field, as `GET /custom-fields/values/{type}/{id}` sends it. */
export interface CustomFieldValue {
  key: string
  label: string
  field_type: string
  value: unknown
  /** Human-readable rendering the server already resolved (dictionary, employee…). */
  text?: string | null
  group_id: number
}

/**
 * The VALUES attached to one record.
 *
 * v2 could define custom fields but never fill them in: the definition screen
 * was the whole feature, so every field an administrator created sat unused.
 */
export function useCustomFieldValues(entityType: string, entityId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    queryFn: () => apiGet<CustomFieldValue[]>(`${URL}/values/${entityType}/${entityId}`),
    enabled: enabled && !!entityId,
    retry: false,
  })
  return { values: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

/**
 * The RAW `{key: value}` map behind a record's custom fields.
 *
 * The display endpoint renders values for reading — a dictionary id comes back
 * as its name — and SKIPS every field that was never filled in. Seeding an edit
 * form from it therefore both hid the empty fields and risked writing the
 * rendered text back over the stored id, so the form reads this instead.
 */
export function useCustomFieldRawValues(entityType: string, entityId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['custom-field-values', 'raw', entityType, entityId],
    queryFn: () => apiGet<Record<string, unknown>>(`${URL}/values/${entityType}/${entityId}/raw`),
    enabled: enabled && !!entityId,
    retry: false,
  })
  /**
   * ⚠️ A STABLE REFERENCE, not `q.data ?? {}`.
   *
   * That fallback builds a NEW object on every render, and the consumer seeds
   * its edit draft from it in an effect keyed on that value — so the effect
   * fired on every render, set state, and re-rendered: "Maximum update depth
   * exceeded", caught with Playwright on the employee profile.
   */
  return { raw: q.data ?? EMPTY_VALUES, loading: q.isLoading }
}

/** Shared empty results — see the reference warning in the hooks above. */
const EMPTY_VALUES: Record<string, unknown> = {}
const EMPTY_GROUPS: CustomFieldGroup[] = []

/**
 * The field DEFINITIONS for an entity — every active group with its fields,
 * whether or not this record has a value for them. Any logged-in user may read
 * these; only the definition CRUD is behind the structure-manager gate.
 */
export function useCustomFieldSchema(entityType: string, enabled = true) {
  const q = useQuery({
    queryKey: [URL, 'schema', entityType],
    queryFn: () => apiGet<CustomFieldGroup[]>(`${URL}/groups`, { entity_type: entityType }),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return { groups: Array.isArray(q.data) ? q.data : EMPTY_GROUPS, loading: q.isLoading }
}

export function useCustomFieldValueMutations(entityType: string, entityId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    // `partial` keeps the fields this form did not show untouched.
    mutationFn: (values: Record<string, unknown>) =>
      apiPut(`${URL}/values/${entityType}/${entityId}`, { values }, { params: { partial: true } }),
    onSuccess: () => {
      // Both shapes of the same data — the rendered list and the raw form map.
      void qc.invalidateQueries({ queryKey: ['custom-field-values'] })
    },
  })
}
