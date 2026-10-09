import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import { useDebounce } from '@/hooks/useDebounce'

const NEWS = 'news-posts'

export interface NewsPost {
  id: number
  title?: string | null
  description?: string | null
  organization_branch_id?: number | null
  created_at?: string | null
  updated_at?: string | null
}

/**
 * `GET /news-posts` returns a plain array — there is no pagination envelope.
 *
 * `search` goes to the SERVER over title + description. The feed only grows,
 * so matching a substring over the fetched array meant every keystroke scanned
 * a list that gets longer every week — and matched less than the server does
 * (no Cyrillic/Latin or apostrophe folding, no word-by-word matching).
 */
export function useNews(search = '') {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce(search.trim(), 300)
  const q = useQuery({
    queryKey: ['news', branchId, term],
    queryFn: () => apiGet<NewsPost[]>(NEWS, { search: term || undefined }),
    placeholderData: (prev) => prev,
  })
  return { rows: q.data ?? [], loading: q.isLoading, fetching: q.isFetching }
}

export function useNewsMutations() {
  const qc = useQueryClient()
  const branchId = useBranchStore.getState().selectedBranchId
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['news'] }),
    // The branch rides in the BODY: the server checks it against the author's
    // own branch, and an axios query param alone never reaches that check.
    /** Forma FILIALNI o'zi beradi (bo'sh = barcha filiallar); tanlangan
     *  filial faqat zaxira qiymat. */
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost<NewsPost>(NEWS, {
          organization_branch_id: branchId || null,
          ...body,
        }),
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<NewsPost>(`${NEWS}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${NEWS}/${id}`) }),
  }
}
