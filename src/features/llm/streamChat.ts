import { ensureFreshAccessToken, joinApiUrl } from '@/api/client'
import i18n from '@/i18n'

/**
 * SSE oqimi — javob HARFLAB keladi.
 *
 * ⚠️ AXIOS EMAS, xom `fetch`. `apiClient` javobni butunlay o'qib bo'lgach
 * qaytaradi, ya'ni oqimning butun ma'nosi yo'qoladi.
 *
 * ⚠️ TOKENNI STORAGE'DAN O'QIMAYMIZ. `ensureFreshAccessToken()` —
 * `useAttendanceSocket` ishlatadigan o'sha primitiv: u muddati o'tayotgan
 * tokenni oqim boshlanishidan OLDIN yangilaydi. To'g'ridan-to'g'ri
 * `localStorage` dan olish uzun suhbat o'rtasida 401 berardi.
 */
export interface StreamHandlers {
  onChunk: (text: string) => void
  onDone?: () => void
  onError?: (e: unknown) => void
  signal?: AbortSignal
}

/** Server bo'lakni bir nechta nom ostida yuborishi mumkin. */
function pickChunk(payload: unknown): string {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload !== 'object') return String(payload)
  const p = payload as Record<string, unknown>
  for (const k of ['content', 'chunk', 'delta', 'text', 'response', 'message', 'token']) {
    const v = p[k]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

/** To'liq `data: …` qatorlarini ajratadi; tugallanmagan qoldiqni qaytaradi. */
function drain(buffer: string, onChunk: (t: string) => void): string {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || !line.startsWith('data:')) continue
    const body = line.slice(5).trim()
    if (body === '[DONE]') continue
    try {
      onChunk(pickChunk(JSON.parse(body)))
    } catch {
      // Ba'zi oqimlar JSON emas, xom matn yuboradi.
      onChunk(body)
    }
  }
  return rest
}

/**
 * Javob tili — SAYT tili, savol matni EMAS. Backend `lang` ni aynan shundan
 * oladi va `uz-cyrl` ham `uz` sanaladi (bir til, ikki yozuv).
 */
function answerLang(): string {
  const l = (i18n.language || 'uz').toLowerCase()
  return l.startsWith('ru') ? 'ru' : 'uz'
}

export async function streamSessionChat(
  sessionId: number,
  message: string,
  { onChunk, onDone, onError, signal }: StreamHandlers,
): Promise<void> {
  let res: Response
  try {
    const token = await ensureFreshAccessToken()
    res = await fetch(joinApiUrl(`llm/sessions/${sessionId}/chat/stream`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json, text/plain, */*',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, lang: answerLang() }),
      signal,
    })
  } catch (e) {
    if ((e as { name?: string })?.name !== 'AbortError') onError?.(e)
    return
  }

  if (!res.ok) {
    let detail: string = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.message || body?.detail || detail
    } catch {
      /* javob JSON emas — kodning o'zi yetarli */
    }
    onError?.(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)))
    return
  }

  const contentType = res.headers.get('content-type') ?? ''

  // Oqimsiz JSON javob — zaxira yo'l (server oqimni o'chirgan bo'lishi mumkin).
  if (contentType.includes('application/json')) {
    try {
      const json = await res.json()
      const text = pickChunk(json) || (json as { response?: string })?.response || ''
      if (text) onChunk(text)
      onDone?.()
    } catch (e) {
      onError?.(e)
    }
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    onError?.(new Error('stream_unavailable'))
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.includes('\n')) {
        buffer = drain(buffer, onChunk)
      } else if (!contentType.includes('event-stream') && buffer) {
        // Xom matn oqimi: qator kutmasdan chiqaramiz.
        onChunk(buffer)
        buffer = ''
      }
    }
    if (buffer.trim()) {
      const rest = drain(`${buffer}\n`, onChunk)
      if (rest.trim() && !rest.includes('data:')) onChunk(rest.trim())
    }
  } catch (e) {
    if ((e as { name?: string })?.name !== 'AbortError') onError?.(e)
    return
  }
  onDone?.()
}
