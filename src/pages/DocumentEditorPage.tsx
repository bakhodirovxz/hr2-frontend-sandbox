import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { apiGet } from '@/api/http'
import { FILES_LIST, LETTERS_LIST, ORDER_ACTS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTheme } from '@/theme/ThemeProvider'

const ONLYOFFICE_URL = import.meta.env.VITE_ONLYOFFICE_URL || 'https://doc-editor.uzgidro.uz'

interface DocsAPI {
  DocEditor: new (id: string, config: unknown) => { destroyEditor?: () => void }
}
declare global {
  interface Window {
    DocsAPI?: DocsAPI
  }
}

/**
 * The editor is reached as /hujjatlar/edit/:id, where :id is prefixed by what
 * kind of document it is. Each source has its OWN config endpoint — a letter is
 * not a file in the document library — so resolve it here rather than assuming
 * everything lives under /files.
 */
function configUrl(rawId: string): string {
  // A SHARED document is addressed by its slug, not its id — that link is the
  // only handle someone outside the folder has on the file.
  const slugMatch = /^slug-(.+)$/.exec(rawId)
  if (slugMatch) return `${FILES_LIST}/by-slug/${slugMatch[1]}/editor-config`

  const reportMatch = /^letter-report-(\d+)$/.exec(rawId)
  if (reportMatch) return `${LETTERS_LIST}/${reportMatch[1]}/report-editor-config`

  /* The trip CERTIFICATE is a third document hanging off the same letter, with
     its own generated file and its own editor config. */
  const guvohnomaMatch = /^letter-guvohnoma-(\d+)$/.exec(rawId)
  if (guvohnomaMatch) return `${LETTERS_LIST}/${guvohnomaMatch[1]}/guvohnoma-editor-config`

  /* The letter's UPLOADED ATTACHMENT — the scan or basis document someone
     attached — is a different file from the letter the system generated, and
     has its own config route. Opening it through the letter's own config
     showed the generated document instead of the file the user clicked. */
  const attachmentMatch = /^letter-attachment-(\d+)$/.exec(rawId)
  if (attachmentMatch) return `${LETTERS_LIST}/${attachmentMatch[1]}/attachment-editor-config`

  const letterMatch = /^letter-(\d+)$/.exec(rawId)
  if (letterMatch) return `${LETTERS_LIST}/${letterMatch[1]}/editor-config`

  const orderMatch = /^order-(\d+)$/.exec(rawId)
  if (orderMatch) return `${ORDER_ACTS}/${orderMatch[1]}/editor-config`

  return `${FILES_LIST}/${rawId}/editor-config`
}

/** Load a script once, resolving when ready. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if (window.DocsAPI) return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('script load failed')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('script load failed'))
    document.head.appendChild(s)
  })
}

/**
 * Is this OnlyOffice `onError` fatal?
 *
 * NEGATIVE codes come from the document server itself — bad/expired token
 * (-20), download failure (-4), conversion error (-3) — and always mean the
 * document did not open. Positive 1–8 are the editor's own fatal codes.
 * Anything else is cross-origin / feature-policy noise that must not blank a
 * working editor.
 *
 * A previous version only listed 1–8, so a −20 token rejection was silently
 * swallowed: OnlyOffice showed its own Russian modal while our UI sat on a
 * spinner with nothing to explain it.
 */
function isFatalEditorError(code: number | null | undefined): boolean {
  if (code == null) return true
  return code < 0 || (code >= 1 && code <= 8)
}

/** OnlyOffice document editor — loads the DocsAPI and mounts the editor with the
 *  server-provided config (documentType, document, editorConfig, token). */
export function DocumentEditorPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  // 'edit' unless the caller explicitly asked for read-only; the backend still
  // has the final say and downgrades the config when the user may not edit.
  const mode = params.get('mode') === 'view' ? 'view' : 'edit'
  const rawId = String(id ?? '')

  // The editor is opened from several screens (letters, orders, the document
  // library). Going "back" must return where the user actually came from —
  // sending everyone to /hujjatlar was why opening a letter's document and
  // pressing Orqaga dumped you in the file library.
  const fallbackRoute = rawId.startsWith('letter-')
    ? '/letters'
    : rawId.startsWith('order-')
      ? '/orders'
      : '/hujjatlar'
  const goBack = useCallback(() => {
    // history.idx > 0 means we navigated here from inside the app.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallbackRoute)
  }, [navigate, fallbackRoute])

  // OnlyOffice REPLACES the mount node with its iframe, so a fixed id cannot be
  // reused across retries or a second effect run — the element is simply gone.
  // Mount into a fresh child of a stable wrapper instead (v1 does the same).
  const wrapRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null)
  /* `stalled` exists because clearing the spinner is not the same as the
   * document having opened. Measured (2026-09-10): with the document server
   * half-reachable — api.js loads but its assets do not — the 15 s timer put
   * the page in `ready`, and 19 s in the screen held an EMPTY iframe, no
   * spinner, and exactly one word of text: "Orqaga". The user cannot tell
   * whether the document is blank, still loading, or broken. */
  const [state, setState] = useState<'loading' | 'ready' | 'stalled' | 'error'>('loading')
  const [detail, setDetail] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let readyTimer = 0

    async function boot() {
      setState('loading')
      setDetail(null)
      try {
        const config = await apiGet<Record<string, unknown>>(configUrl(rawId), { mode, theme })
        await loadScript(`${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`)
        if (cancelled) return
        if (!window.DocsAPI) throw new Error('DocsAPI unavailable')

        const wrapper = wrapRef.current
        if (!wrapper) return
        editorRef.current?.destroyEditor?.()
        wrapper.innerHTML = ''
        const mountEl = document.createElement('div')
        mountEl.id = `onlyoffice-editor-${Date.now()}`
        mountEl.style.width = '100%'
        mountEl.style.height = '100%'
        wrapper.appendChild(mountEl)

        // The config is signed as a whole by the backend — do NOT touch it.
        // `events` is the one key OnlyOffice excludes from the JWT payload.
        // Recovers from `stalled` too: a slow editor that eventually reports
        // ready must clear the warning.
        const markReady = () => {
          if (cancelled) return
          window.clearTimeout(readyTimer)
          setState('ready')
        }
        ;(config as { events?: unknown }).events = {
          // Document Server 9.x never emits `onReady` — its api.js dispatches
          // `onAppReady` (editor UI booted) and `onDocumentReady` (content
          // loaded, view and edit mode alike). Waiting on `onReady` alone left
          // the spinner over an already-rendered document and, 15 s later,
          // raised the "not ready" banner on a perfectly working editor.
          // `onReady` stays for older builds that still send it.
          onAppReady: markReady,
          onDocumentReady: markReady,
          onReady: markReady,
          onError: (e: { data?: { errorCode?: number; errorDescription?: string } }) => {
            const code = e?.data?.errorCode
            const description = e?.data?.errorDescription
            // Surface what the document server actually said. A blank
            // "couldn't load" hid a JWT/secret mismatch behind a shrug.
            console.warn('OnlyOffice error:', code, description)
            if (!isFatalEditorError(code)) return
            if (cancelled) return
            // OnlyOffice sends its description as HTML (it embeds <br>).
            const text = String(description ?? '').replace(/<br\s*\/?>/gi, ' ').trim()
            // -20 is ALWAYS an environment pairing problem, never a document
            // problem: the API signed the config with one JWT secret and this
            // document server verifies with another. Say that, because the raw
            // message ("contact the Document Server administrator") sends
            // people looking in the wrong place.
            const hint = Number(code) === -20 ? `${t('documents.editorTokenMismatch')} ` : ''
            setDetail(`${hint}${text ? `${text} ` : ''}(code ${code})`)
            setState((prev) => (prev === 'ready' ? 'ready' : 'error'))
            // (`stalled` falls through to 'error' — a document server that
            // reported a fatal code did not open the document.)
          },
          onWarning: (e: unknown) => console.warn('OnlyOffice warning:', e),
        }

        editorRef.current = new window.DocsAPI.DocEditor(mountEl.id, config)
        // Safety net for an editor that boots but never reports back (e.g. the
        // document server's own assets unreachable). Clear the spinner anyway
        // so the user sees whatever DID render instead of a dead page — but
        // say so, rather than pretending the document opened.
        readyTimer = window.setTimeout(() => {
          if (!cancelled) setState((prev) => (prev === 'loading' ? 'stalled' : prev))
        }, 15000)
      } catch (err) {
        if (cancelled) return
        setDetail(errorMessage(err, ''))
        setState('error')
      }
    }

    boot()
    return () => {
      cancelled = true
      window.clearTimeout(readyTimer)
      editorRef.current?.destroyEditor?.()
      editorRef.current = null
    }
  }, [rawId, mode, theme, attempt])

  return (
    <div className="flex h-full flex-col">
      <div className="glass flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={goBack}>
          {t('documents.back')}
        </Button>
        {state === 'stalled' && (
          /* Deliberately in the header and NOT an overlay: if the editor did
           * render, the document must stay usable. The point is only that the
           * screen stops being silent. */
          <div
            role="status"
            className="ml-auto flex min-w-0 items-center gap-2 text-[12px] text-warning"
          >
            <AlertTriangle size={14} className="shrink-0" />
            <span className="truncate">{t('documents.editorNotReady')}</span>
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t('common.retry')}
            </Button>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {state === 'loading' && (
          // pointer-events-none: the editor mounts UNDER this overlay, so a
          // spinner that never clears (OnlyOffice can boot without firing
          // onReady) would otherwise swallow every click on a working editor.
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Spinner />
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg">
            <EmptyState
              title={t('documents.editorLoadError')}
              description={detail ?? undefined}
              action={
                <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                  {t('common.retry')}
                </Button>
              }
            />
          </div>
        )}
        <div ref={wrapRef} className="h-full w-full" />
      </div>
    </div>
  )
}
