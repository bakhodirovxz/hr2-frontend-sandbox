import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORDER_ACT_CATEGORIES } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'

export type CreatorRole = 'employee' | 'hr'

export interface OrderType {
  id: number
  name?: string | null
  creator_role?: CreatorRole | null
}

/** `GET /order-act-categories` returns a plain list — paginated on the client. */
export function useOrderTypes(search: string, creatorRole: string) {
  const query = useQuery({
    queryKey: ['order-act-categories', { search, creatorRole }],
    queryFn: () =>
      apiGet<ListResponse<OrderType>>(ORDER_ACT_CATEGORIES, {
        search: search || undefined,
        creator_role: creatorRole || undefined,
      }),
    placeholderData: (prev) => prev,
  })

  return {
    all: toItems(query.data),
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useOrderTypeMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['order-act-categories'] }),
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(ORDER_ACT_CATEGORIES, body),
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${ORDER_ACT_CATEGORIES}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${ORDER_ACT_CATEGORIES}/${id}`) }),
  }
}
