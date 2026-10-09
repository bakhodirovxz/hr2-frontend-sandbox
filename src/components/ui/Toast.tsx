import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastKind = 'ok' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastApi {
  ok: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

/** Mount qilingan provider — `notify` shu orqali ishlaydi. */
let bridge: ToastApi | null = null

/**
 * React daraxtidan TASHQARIDAN toast ko'rsatish (react-query `MutationCache`).
 * Provider mount qilinmagan bo'lsa jim qoladi — toast hech qachon
 * ishning bajarilishiga to'sqinlik qilmaydi.
 */
export const notify: ToastApi = {
  ok: (t) => bridge?.ok(t),
  error: (t) => bridge?.error(t),
  info: (t) => bridge?.info(t),
}

/**
 * The one place this app says "saved" / "could not save".
 *
 * Before this, every screen that needed feedback grew its own banner in local
 * state, so the same event looked different on three pages and none of them
 * announced itself to a screen reader. A toast here is a LIVE REGION: it is
 * read out when it appears, it can always be dismissed by hand, and it never
 * steals focus — the user is usually mid-task when it fires.
 *
 * Errors do NOT auto-dismiss. A failure the user did not read is a failure
 * they will hit again.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((i) => i.id !== id))
  }, [])

  // ⚠️ Bir xil matn qisqa vaqt ichida IKKI marta ko'rsatilmaydi. Global xato
  // tarmog'i (queryClient) va sahifaning o'z `catch` bloki ayni bir nosozlik
  // haqida bir vaqtda gapirishi mumkin — foydalanuvchi ikkita bir xil qizil
  // xabar ko'rardi.
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const now = Date.now()
      if (lastRef.current.text === text && now - lastRef.current.at < 4000) return
      lastRef.current = { text, at: now }
      const id = ++seq.current
      setItems((list) => [...list.slice(-3), { id, kind, text }])
      if (kind !== 'error') setTimeout(() => remove(id), 3800)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      ok: (t: string) => push('ok', t),
      error: (t: string) => push('error', t),
      info: (t: string) => push('info', t),
    }),
    [push],
  )

  // Modul darajasidagi ko'prik: `queryClient` React ichida emas, shuning uchun
  // `useToast()` ni chaqira olmaydi. Provider o'zini shu yerga ro'yxatdan
  // o'tkazadi; provider yo'q bo'lsa `notify` jim qoladi.
  useEffect(() => {
    bridge = api
    return () => {
      if (bridge === api) bridge = null
    }
  }, [api])

  return (
    <Ctx.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
          >
            {items.map((i) => (
              <div
                key={i.id}
                className={cn(
                  'pointer-events-auto flex max-w-[min(560px,92vw)] items-start gap-2.5 rounded-inner px-4 py-3 text-[13px] shadow-pop',
                  i.kind === 'ok' && 'bg-success-soft text-success ring-1 ring-success/30',
                  i.kind === 'error' && 'bg-danger-soft text-danger ring-1 ring-danger/30',
                  i.kind === 'info' && 'bg-elevated text-fg ring-1 ring-line',
                )}
              >
                {i.kind === 'ok' ? (
                  <CheckCircle2 size={16} className="mt-px shrink-0" />
                ) : i.kind === 'error' ? (
                  <XCircle size={16} className="mt-px shrink-0" />
                ) : (
                  <Info size={16} className="mt-px shrink-0" />
                )}
                <span className="min-w-0 flex-1">{i.text}</span>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  aria-label="×"
                  className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  )
}

/** Never throws when the provider is missing — a toast is never load-bearing. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  const noop = useMemo<ToastApi>(() => ({ ok: () => {}, error: () => {}, info: () => {} }), [])
  return ctx ?? noop
}
