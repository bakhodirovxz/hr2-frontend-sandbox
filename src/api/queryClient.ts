import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import i18n from 'i18next'
import { notify } from '@/components/ui/Toast'
import { errorMessage } from './errorMessage'

/**
 * ⚠️ YOZUV AMALLARI UCHUN GLOBAL XATO TARMOG'I.
 *
 * Ilovada 168 ta `mutateAsync` chaqiruvi bor va ularning katta qismi
 * `try/catch` siz edi: server so'rovni rad etsa (masalan 400
 * `organization_branch_id_required`) modal shunchaki OCHIQ TURARDI —
 * foydalanuvchi nega saqlanmayotganini bilmasdi, konsolda esa ushlanmagan
 * rad etish qolardi.
 *
 * Endi har qanday muvaffaqiyatsiz mutatsiya SERVERNING O'Z matnini
 * ko'rsatadi. Sahifaning o'z `catch` bloki ham xabar bersa, `Toast` bir xil
 * matnni takrorlamaydi. Xabar kerak bo'lmagan mutatsiya
 * `meta: { silent: true }` bilan chetlashtiriladi.
 */
/**
 * ⚠️ READ FAILURES WERE INVISIBLE. Measured 2026-09-18 on every route with
 * the page's own list answered 500 or cut off: 106 of 136 probes showed the
 * EMPTY copy — «Buyruq topilmadi 0–0 / 0», «Yangilik yo‘q — birinchi
 * yangilikni shu yerdan qo‘shing», the employee card said «Xodim topilmadi —
 * yozuv o‘chirilgan bo‘lishi mumkin» — with no error surface at all. Only the
 * DataTable pages (30 probes) said «Ma’lumotni yuklab bo‘lmadi».
 *
 * Every failed query now raises the same toast the mutations already use,
 * carrying the server's own text. 401/403/404 are left to the page: those are
 * answers («not yours», «gone»), not failures, and the pages already draw
 * them. A burst of failing queries on one screen (a lost connection fails
 * five at once) is folded into one toast per message for a few seconds.
 * `meta: { silent: true }` opts a query out.
 */
const recentQueryToasts = new Map<string, number>()
function queryFailureToast(error: unknown, meta?: Record<string, unknown>) {
  if (meta?.silent) return
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 401 || status === 403 || status === 404) return
  const text = errorMessage(error, i18n.t('list.loadFailed'))
  const now = Date.now()
  const last = recentQueryToasts.get(text) ?? 0
  if (now - last < 4000) return
  recentQueryToasts.set(text, now)
  notify.error(text)
}

/**
 * A failed mutation is reported ONCE, by the cache above. Most handlers then
 * `await mutateAsync(...)` without a try — the code after it (the success
 * notice) correctly does not run, but the rejection bubbled to the window as
 * an "Uncaught (in promise)" on every failed save (role sweep 2026-09-25).
 * Errors the cache has already shown are marked and silenced here; anything
 * else still surfaces.
 */
const REPORTED = Symbol.for('hrm.mutationErrorReported')
function markReported(error: unknown) {
  if (error && typeof error === 'object') (error as Record<symbol, boolean>)[REPORTED] = true
}
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Record<symbol, boolean> | undefined
    if (r && typeof r === 'object' && r[REPORTED]) e.preventDefault()
  })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => queryFailureToast(error, query.meta as Record<string, unknown> | undefined),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // Marked even when silent: the caller owns the message then.
      markReported(error)
      if (mutation.options.meta?.silent) return
      notify.error(errorMessage(error, i18n.t('common.actionFailed')))
    },
    // The sidebar counters (letters / orders / leave / fleet awaiting the
    // user) come from ONE cheap request that otherwise only polls every 60 s,
    // and no sign/approve mutation refreshed it — the red number lagged a
    // minute behind the action the user had just taken. Any successful write
    // may change it, so refresh it after every one.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu-badges'] })
    },
  }),
  defaultOptions: {
    queries: {
      /**
       * One retry for a network blip or a 5xx — never for a 4xx. A refusal
       * (403/404/422) answers the same the second time, and the server
       * journals EVERY error it returns, so each one was written twice
       * (`/employees/{id}/t2` 404 ×2, sweep 2026-10-05). 408/429 are worth
       * the second try.
       */
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } } | null)?.response?.status
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      /**
       * ⚠️ `gcTime` WAS NEVER SET, so it sat on react-query's 5-minute default.
       * With 63 lazily-mounted route pages that meant every screen the reader
       * left more than five minutes ago was a COLD load on return — the cache
       * had already been collected. Half an hour keeps a working session's
       * screens warm while still bounding memory; a stale entry is re-validated
       * on mount anyway, it is only the empty-screen-then-spinner that goes.
       */
      gcTime: 30 * 60_000,
    },
  },
})

/**
 * Preset for REFERENCE data — dictionaries, departments, job positions,
 * branches, system settings. These change a few times a year, are read by
 * nearly every form, and are expensive: `useReferenceData` walks up to 913 job
 * positions across two pages.
 *
 * Spread it into the query options rather than repeating the numbers:
 *     useQuery({ queryKey: [...], queryFn: ..., ...REFERENCE_QUERY })
 */
export const REFERENCE_QUERY = {
  staleTime: 30 * 60_000,
  gcTime: 60 * 60_000,
} as const
