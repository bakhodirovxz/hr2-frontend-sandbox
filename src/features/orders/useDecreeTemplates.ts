import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORDER_ACT_CATEGORY_TEMPLATE, ORDER_ACT_CATEGORY_TEMPLATES } from '@/api/endpoints'


/**
 * DECREE .docx TEMPLATES — the documents a decree category is rendered from.
 *
 * ⚠️ MULTIPART, NOT JSON. The routes declare every field as `Form(...)` and the
 * file as `File(...)`, so a JSON body is rejected with a 422 that names no
 * field — the same trap the learning module's lesson upload hit.
 *
 * ⚠️ `template_variables` GOES OVER THE WIRE AS A STRING. The read model types
 * it as a dict, but the write side takes `Optional[str]` from the form and
 * parses it server-side, so the JSON must be stringified here.
 */
export interface DecreeTemplate {
  id: number
  name?: string | null
  organization_branch_id?: number | null
  template_variables?: Record<string, unknown> | null
  type?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export function useDecreeTemplates(search: string, page: number, size: number, enabled = true) {
  const q = useQuery({
    queryKey: ['decree-templates', search, page, size],
    queryFn: () =>
      apiGet<{ items?: DecreeTemplate[]; total?: number; pages?: number }>(
        ORDER_ACT_CATEGORY_TEMPLATES,
        { search: search || undefined, page, size },
      ),
    enabled,
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useDecreeTemplateMutations() {
  const qc = useQueryClient()
  const done = () => void qc.invalidateQueries({ queryKey: ['decree-templates'] })
  const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

  return {
    create: useMutation({
      mutationFn: (fd: FormData) =>
        apiPost<DecreeTemplate>(ORDER_ACT_CATEGORY_TEMPLATES, fd, multipart),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, fd }: { id: number; fd: FormData }) =>
        apiPatch<DecreeTemplate>(ORDER_ACT_CATEGORY_TEMPLATE(id), fd, multipart),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(ORDER_ACT_CATEGORY_TEMPLATE(id)),
      onSuccess: done,
    }),
  }
}
