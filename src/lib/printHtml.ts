/** HTML matn uchun ekranlash (bosma shakl satrlari). */
export const escapeHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Bosma shakllar uchun umumiy A4 uslubi: jadval, sarlavha, izoh qatori. */
export const PRINT_BASE_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: 'Times New Roman', serif; color: #000; font-size: 11pt; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; }
  p.meta { text-align: center; font-size: 9.5pt; margin: 0 0 10pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 0.6pt solid #000; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: bold; }
  td:first-child, th:first-child { width: 28pt; text-align: right; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
`

/**
 * Tayyor HTML hujjatni brauzerning chop etish oynasiga beradi — yashirin
 * iframe orqali (bloklanadigan yangi oyna ochilmaydi).
 */
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.style.right = '0'
  frame.style.bottom = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error('print frame unavailable')
  }
  doc.open()
  doc.write(html)
  doc.close()
  await new Promise((r) => setTimeout(r, 150))
  win.focus()
  win.print()
  // The dialog is modal in most browsers; remove the frame a bit later either way.
  setTimeout(() => frame.remove(), 60_000)
}
