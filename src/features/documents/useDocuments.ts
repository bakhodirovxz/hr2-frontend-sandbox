import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { FILES_LIST, FILE_BLANK, FILE_UPLOAD, FOLDERS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

/** `EmployeeSafeRead` as embedded in a shared file/folder. */
export interface SharedPerson {
  id: number
  legal_name?: string | null
  photo_path?: string | null
}
export interface DocFile {
  id: number
  original_filename?: string | null
  file_filename?: string | null
  content_type?: string | null
  folder_id?: number | null
  scope?: string | null
  /* Sharing, as `FileRead`/`FolderRead` actually send it: the PEOPLE, not
     their ids (`editor_ids`/`viewer_ids` exist only on the write schemas).
     The share dialog used to read the id arrays, found nothing, and saving it
     untouched wiped every per-person share (measured 2026-09-17). */
  group_can_edit?: boolean | null
  editors?: SharedPerson[] | null
  viewers?: SharedPerson[] | null
  share_slug?: string | null
  /** May the viewer rename / move / re-share / delete it (`_can_modify_file`)?
   *  Absent on an older API — treated as "yes" so nothing disappears. */
  can_edit?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  created_by?: SharedPerson | null
}
export interface Folder {
  id: number
  name?: string | null
  scope?: string | null
  group_can_edit?: boolean | null
  editors?: SharedPerson[] | null
  viewers?: SharedPerson[] | null
  files?: DocFile[] | null
  /**
   * May the viewer ADD files here? Seeing a folder and writing to it are
   * different rights, and the server answers a refused add with 404 rather
   * than 403 (a 403 would confirm the folder exists to someone probing ids).
   * The screen therefore cannot infer this — it must be told.
   */
  can_add_file?: boolean
  /** Rename / re-share / delete the folder itself (`_can_modify_folder`). */
  can_edit?: boolean | null
}

/** `search` narrows by folder name on the SERVER (2026-09-25). */
export function useFolders(search = '') {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['folders', branchId, search],
    queryFn: () => apiGet<Folder[]>(FOLDERS_LIST, { search: search || undefined }),
    placeholderData: (prev) => prev,
  })
  return { folders: q.data ?? [], loading: q.isLoading }
}

/** Files inside a folder (or root when folderId is null). */
export function useFiles(folderId: number | null, search = '') {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['files', folderId, branchId, search],
    queryFn: () => apiGet<DocFile[]>(FILES_LIST, { folder_id: folderId || undefined, search: search || undefined }),
    placeholderData: (prev) => prev,
  })
  return { files: q.data ?? [], loading: q.isLoading }
}

export function useDocumentMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['folders'] })
    qc.invalidateQueries({ queryKey: ['files'] })
  }
  return {
    invalidate,
    /**
     * The branch travels in the BODY. `get_org_branch_id` derives it from the
     * CALLER and is deliberately `None` for a master-admin, so without this the
     * create died on `organization_branch_id_required`. The server still checks
     * the value with `can_access_branch` — this is a hint, not a grant.
     */
    createFolder: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost(FOLDERS_LIST, { organization_branch_id: useBranchStore.getState().selectedBranchId || null, ...body }),
    }),
    /** Rename AND re-share — `FolderUpdate` takes both, and sending only the
     *  name is why a folder's visibility was fixed at creation for good. */
    updateFolder: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${FOLDERS_LIST}/${id}`, body),
    }),
    deleteFolder: useMutation({ mutationFn: (id: number) => apiDelete(`${FOLDERS_LIST}/${id}`) }),
    createBlank: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(FILE_BLANK, body),
    }),
    /**
     * ⚠️ EVERYTHING BUT THE FILE ITSELF GOES IN THE QUERY STRING.
     *
     * `POST /files/upload` declares only `file` as the body; `folder_id`,
     * `scope`, `editor_ids`, `viewer_ids` and `group_can_edit` are plain
     * QUERY parameters. `folder_id` used to be appended to the FormData, where
     * FastAPI never looks for it — so it arrived as `None` and every file
     * uploaded from an open folder silently landed in the root instead
     * (verified against TEST: body form → `folder_id: null`, query → 3464).
     */
    uploadFile: useMutation({
      mutationFn: ({
        file,
        folderId,
        scope,
        editorIds,
        viewerIds,
        groupCanEdit,
      }: {
        file: File
        folderId: number | null
        scope?: string
        editorIds?: number[]
        viewerIds?: number[]
        groupCanEdit?: boolean
      }) => {
        const fd = new FormData()
        fd.append('file', file)
        const params = new URLSearchParams()
        params.set('scope', scope || 'private')
        if (folderId) params.set('folder_id', String(folderId))
        params.set('group_can_edit', String(!!groupCanEdit))
        // Repeated keys, not a comma list — the route takes List[int].
        for (const id of editorIds ?? []) params.append('editor_ids', String(id))
        for (const id of viewerIds ?? []) params.append('viewer_ids', String(id))
        return apiClient.post(`${FILE_UPLOAD}?${params.toString()}`, fd).then((r) => r.data)
      },
    }),
    updateFile: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${FILES_LIST}/${id}`, body),
    }),
    deleteFile: useMutation({ mutationFn: (id: number) => apiDelete(`${FILES_LIST}/${id}`) }),
    shareLink: useMutation({
      mutationFn: (id: number) => apiPost<{ share_slug: string; path: string }>(`${FILES_LIST}/${id}/share-link`, {}),
    }),
  }
}
