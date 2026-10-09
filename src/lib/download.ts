import { apiClient } from '@/api/client'

/**
 * Ask the API for a file and hand it to the browser.
 *
 * Exports on this product are generated server-side and come back as a binary
 * body, not a URL — so the only way to save one is to pull the blob through the
 * authenticated client and click a synthetic link at it. The object URL is
 * revoked immediately: a forgotten one pins the whole file in memory for the
 * lifetime of the tab, and these are workbooks.
 *
 * `method` is POST for the staff-position exports (they take the screen's
 * filters as query params) and GET for the dictionary export.
 */
export async function downloadFile({
  url,
  filename,
  params,
  method = 'get',
  mime,
}: {
  url: string
  filename: string
  params?: Record<string, unknown>
  method?: 'get' | 'post'
  mime?: string
}): Promise<void> {
  const res =
    method === 'post'
      ? await apiClient.post(url, null, { params, responseType: 'blob', timeout: 300_000 })
      : await apiClient.get(url, { params, responseType: 'blob', timeout: 300_000 })

  const blob = mime ? new Blob([res.data as BlobPart], { type: mime }) : (res.data as Blob)
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

/**
 * Save a file that already lives at an absolute URL.
 *
 * The guest QR is a PRESIGNED MinIO link on another host, so it must NOT go
 * through `apiClient` — that would attach our Authorization header to a foreign
 * origin and the signature is what authorises it anyway. Fetched as a blob so
 * the browser saves it under a readable name instead of navigating to a UUID.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const href = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const PDF_MIME = 'application/pdf'
export const XML_MIME = 'application/xml'
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type TableFormat = 'xlsx' | 'docx' | 'pdf'

const TABLE_MIME: Record<TableFormat, string> = {
  xlsx: XLSX_MIME,
  docx: DOCX_MIME,
  pdf: PDF_MIME,
}

/**
 * EKRANDAGI jadvalni Excel / Word / PDF qilib yuklab olish — TZ 4.2.5 va
 * 4.2.11 §5 («Экспорт сохранит все текущие настройки фильтрации и
 * форматирования данных»).
 *
 * ⚠️ QATORLAR SERVERGA YUBORILADI, u yerda qayta so'ralmaydi. Sabab shu
 * talabning o'zida: eksport foydalanuvchi KO'RIB TURGAN jadval bo'lishi kerak
 * — uning filtri, USTUN TANLOVI va saralashi bilan. Server so'rovni qaytadan
 * qursa, natija ekrandagidan farq qilib ketardi.
 */
export async function exportTable({
  title,
  subtitle,
  headers,
  rows,
  format,
  filename,
}: {
  title: string
  subtitle?: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
  format: TableFormat
  filename?: string
}): Promise<void> {
  const res = await apiClient.post(
    'exports/table',
    {
      title,
      subtitle: subtitle ?? '',
      format,
      filename,
      headers,
      rows: rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
    },
    { responseType: 'blob', timeout: 300_000 },
  )

  const blob = new Blob([res.data as BlobPart], { type: TABLE_MIME[format] })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${filename ?? title}.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
