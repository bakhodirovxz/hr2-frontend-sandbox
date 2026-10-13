import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiGet } from '@/api/http'
import { downloadFromUrl } from '@/lib/download'

/**
 * TZ A4 919 «Экспорт большого объёма данных — запускается при экспорте более
 * 10000 записей. Система выполняет экспорт в фоновом режиме и уведомляет
 * администратора по завершении».
 *
 * `GET /audit-logs/export` answers with the FILE up to 10 000 rows; above
 * that with 202 JSON `{job_id, row_count, status_url, download_url}` — the
 * file is built by a worker, its state is `GET /jobs/{id}`, and when it is
 * ready `GET /jobs/{id}/download` gives a presigned link (the requester also
 * gets a `background_job` notification). 503 `job_enqueue_failed` — the queue
 * is down.
 *
 * ⚠️ The request goes out as `responseType: 'blob'`, so the 202 body AND any
 * error body arrive as a Blob — both are read back as JSON here, otherwise
 * the job would be saved as a «file» and an error would show only the
 * generic fallback.
 */

export interface ExportJobStart {
  job_id: number
  row_count?: number
  format?: string
  status?: string
}

export interface BackgroundJob {
  id: number
  kind?: string
  status: 'queued' | 'running' | 'done' | 'failed' | string
  progress?: number | null
  error?: string | null
  file_name?: string | null
  row_count?: number | null
  has_file?: boolean
  created_at?: string | null
  finished_at?: string | null
}

async function blobJson(data: unknown): Promise<unknown> {
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())
    } catch {
      return null
    }
  }
  return data
}

/**
 * Runs the export. A small selection is saved at once (`{kind:'file'}`); a
 * big one comes back as a started background job.
 */
export async function runAuditExport(
  params: Record<string, unknown>,
  filename: string,
  mime: string,
): Promise<{ kind: 'file' } | { kind: 'job'; job: ExportJobStart }> {
  let res
  try {
    res = await apiClient.get('audit-logs/export', { params, responseType: 'blob', timeout: 300_000 })
  } catch (err) {
    // The error body is a Blob too — turn it back into JSON so
    // `errorMessage` / `errorCode` read the server's code and text.
    if (axios.isAxiosError(err) && err.response) err.response.data = await blobJson(err.response.data)
    throw err
  }
  if (res.status === 202) {
    const body = (await blobJson(res.data)) as ExportJobStart | null
    if (body?.job_id) return { kind: 'job', job: body }
  }
  const blob = new Blob([res.data as BlobPart], { type: mime })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
  return { kind: 'file' }
}

const RUNNING = new Set(['queued', 'running'])

/** State of one background job, polled every 2 s while it is still running. */
export function useBackgroundJob(id: number | null) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: () => apiGet<BackgroundJob>(`jobs/${id}`),
    enabled: id != null,
    retry: false,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return !s || RUNNING.has(s) ? 2000 : false
    },
    meta: { silent: true },
  })
}

export const jobRunning = (j?: BackgroundJob | null) => !j || RUNNING.has(j.status)

/** The finished file: a presigned link from `GET /jobs/{id}/download`. */
export async function downloadJobFile(job: BackgroundJob): Promise<void> {
  const { url } = await apiGet<{ url: string }>(`jobs/${job.id}/download`)
  const name = job.file_name || `export-${job.id}`
  try {
    await downloadFromUrl(url, name)
  } catch {
    // The object store refused a cross-origin fetch — let the browser follow
    // the link itself (the file is served as an attachment).
    window.open(url, '_blank', 'noopener')
  }
}
