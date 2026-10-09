import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { VIDEO_GUIDES } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'

export interface VideoGuide {
  id: number
  title: string
  description?: string | null
  page_key: string
  roles?: string[] | null
  organization_branch_id?: number | null
  sort_order?: number
  is_active?: boolean
  duration_seconds?: number | null
  view_count: number
  original_filename: string
  content_type: string
  video_url?: string | null
}

/** Selector reference data for the admin form. */
interface VideoGuideCatalog {
  pages: { key: string; label: string; group: string }[]
  roles: { key: string; label: string }[]
}

/** Videos visible to the current user (role + branch filtered, active only). */
export function useVideoGuides() {
  const query = useQuery({
    queryKey: ['video-guides'],
    queryFn: () => apiGet<ListResponse<VideoGuide>>(VIDEO_GUIDES),
    staleTime: 5 * 60_000,
  })
  return { all: toItems(query.data), loading: query.isLoading }
}

/** Fire-and-forget view counter when a video is opened. */
export function useTrackVideoView() {
  return useMutation({ mutationFn: (id: number) => apiPost(`${VIDEO_GUIDES}/${id}/view`, {}) })
}


/** Every video regardless of role/branch/active — admin list. */
export function useAllVideoGuides(enabled: boolean) {
  const query = useQuery({
    queryKey: ['video-guides', 'all'],
    queryFn: () => apiGet<ListResponse<VideoGuide>>(`${VIDEO_GUIDES}/all`),
    enabled,
  })
  return { all: toItems(query.data), loading: query.isLoading }
}

export function useVideoGuideCatalog(enabled: boolean) {
  const query = useQuery({
    queryKey: ['video-guides', 'catalog'],
    queryFn: () => apiGet<VideoGuideCatalog>(`${VIDEO_GUIDES}/catalog`),
    enabled,
    staleTime: 30 * 60_000,
  })
  return { catalog: query.data ?? { pages: [], roles: [] } }
}

export function useVideoGuideMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['video-guides'] })
  return {
    invalidate,
    // Create and update are multipart: the video file rides along with the
    // metadata. On update the file is optional (metadata-only edits are common).
    create: useMutation({ mutationFn: (fd: FormData) => apiPost<VideoGuide>(VIDEO_GUIDES, fd) }),
    update: useMutation({
      mutationFn: ({ id, fd }: { id: number; fd: FormData }) =>
        apiPatch<VideoGuide>(`${VIDEO_GUIDES}/${id}`, fd),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${VIDEO_GUIDES}/${id}`) }),
  }
}
