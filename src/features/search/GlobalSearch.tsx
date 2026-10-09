import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft, Loader2, Search, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { SEARCH, SEARCH_SOURCES } from '@/api/endpoints'
import { normalizeLetterType } from '@/features/letters/useLetters'
import { ticketStatusKey } from '@/features/support/useSupport'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { getAllowedBranchIds } from '@/auth/roles'
import { useDynamicT } from '@/i18n/dynamicKey'
import { PAGES_TYPE, pagesForUser, resolveSearchUrl } from './searchRoutes'

/**
 * Kalit so'z bo'yicha global qidiruv — TZ 4.1.7 va 4.2
 * («поисковая строка, по ключевым словам» + «функции углубленного поиска,
 * где работа ведется с систематизированными данными»).
 *
 * CHUQURLASHTIRILGAN QIDIRUV = modul chiplari: natijani bitta modulga
 * toraytiradi va o'sha modulda ancha ko'proq qator ko'rsatadi.
 *
 * Ruxsat BACKENDDA hal qilinadi — bu ekran hech narsani yashirmaydi va hech
 * narsani ochmaydi, faqat kelgan natijani chizadi.
 *
 * IKKI MANBA: server natijalari (xodim, hujjat, ma'lumotnoma…) va SAHIFALAR.
 * Sahifalar mahalliy hisoblanadi (`searchRoutes.pagesForUser`) — ular
 * foydalanuvchining o'z menyusidan olinadi, ya'ni javob DARHOL keladi va
 * ruxsati yo'q bo'limga havola chiqmaydi.
 */

const MIN_QUERY = 2

/* A letter row's `meta` is the stored `letter_type` code (`application`,
 * `explanotary`…); the user knows it as «Ariza» / «Bildirgi». Other sources
 * already send display text (department, date, type name). */
const LETTER_TYPE_KEY: Record<string, string> = {
  explanatory: 'letters.typeBildirgi',
  application: 'letters.typeAriza',
  business_trip: 'letters.typeTrip',
  javob_xati: 'letters.typeReply',
}

interface SearchItem {
  id: number
  title: string
  subtitle?: string | null
  meta?: string | null
  url?: string | null
  /** Yozuv qaysi filialga tegishli (bo'lim, lavozim). Ro'yxat sahifalari
   *  TANLANGAN filial bilan cheklangan, qidiruv esa butun ko'lam bo'ylab
   *  ishlaydi — shu sababli o'tishdan oldin filial moslanadi. */
  branch_id?: number | null
}
interface SearchGroup {
  type: string
  label: string
  total: number
  items: SearchItem[]
}
interface SearchResponse {
  query: string
  total: number
  groups: SearchGroup[]
}
interface SearchSource {
  type: string
  label: string
}

export function GlobalSearch() {
  const { t } = useTranslation()
  // A ticket row's `subtitle` is the stored status code (`open`, `rated`…).
  const subtitleLabel = (type: string, subtitle?: string | null) => {
    if (!subtitle || type !== 'support') return subtitle
    const k = ticketStatusKey(subtitle)
    const KEY = { done: 'statusDone', taken: 'statusTaken', rated: 'statusRated', new: 'statusNew' } as const
    return t(`support.${KEY[k]}` as never) as string
  }
  const metaLabel = (type: string, meta?: string | null) => {
    if (!meta) return meta
    const key = type === 'letters' ? LETTER_TYPE_KEY[normalizeLetterType(meta)] : undefined
    return key ? (t(key as never) as string) : meta
  }
  const tk = useDynamicT()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [type, setType] = useState('') // '' = barcha modullar
  const [debounced, setDebounced] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd + K — klaviatura bilan ishlaydiganlar uchun.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])

  const sources = useQuery({
    queryKey: ['search-sources'],
    queryFn: () => apiGet<SearchSource[]>(SEARCH_SOURCES),
    enabled: open,
    staleTime: 10 * 60_000,
  })

  const results = useQuery({
    queryKey: ['global-search', debounced, type],
    /**
     * ⚠️ `signal` IS PASSED ON PURPOSE. This query re-keys on every debounced
     * keystroke, and without an abort signal react-query only DISCARDS the
     * superseded result — the HTTP request itself runs to completion. Typing a
     * name left a queue of searches the server still had to answer.
     */
    queryFn: ({ signal }) =>
      apiGet<SearchResponse>(
        SEARCH,
        {
        q: debounced,
        types: type || undefined,
        // Bitta modulga toraytirilganda ancha ko'proq qator ko'rsatiladi —
        // aynan shu «углубленный поиск» degani.
        limit: type ? 20 : 6,
        },
        { signal },
      ),
    // Sahifalar MAHALLIY manba — u tanlanganda serverga umuman bormaymiz
    // (backend `__pages` turini bilmaydi va bekorga bo'sh javob qaytarardi).
    enabled: open && debounced.length >= MIN_QUERY && type !== PAGES_TYPE,
    // Qidiruv qatorida xato qayta urinish faqat kechikish qo'shadi.
    retry: false,
  })

  const data = results.data

  /** Sahifalar — mahalliy manba. Tarjima qilingan NOM bo'yicha qidiriladi,
   *  ya'ni rus va kirill rejimida ham ishlaydi; manzil ham qidiriladi
   *  («/kpi» deb yozgan odam ham topsin). */
  const pageGroup = useMemo<SearchGroup | null>(() => {
    const term = debounced.trim().toLowerCase()
    if (term.length < MIN_QUERY) return null
    const hits = pagesForUser(user)
      .map((p) => ({ ...p, label: tk(`nav.${p.labelKey}`) }))
      .filter(
        (p) =>
          p.label.toLowerCase().includes(term) || p.path.toLowerCase().includes(term),
      )
    if (!hits.length) return null
    return {
      type: PAGES_TYPE,
      label: t('search.pages'),
      total: hits.length,
      items: hits.map((p, i) => ({
        id: -(i + 1), // manfiy: server id'lari bilan to'qnashmasin
        title: p.label,
        subtitle: p.path,
        url: p.path,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, user, t, tk])

  /** Ko'rsatiladigan guruhlar: sahifalar TEPADA (ular navigatsiya, ya'ni
   *  odatda aynan shu qidiriladi), keyin server natijalari. */
  const groups = useMemo<SearchGroup[]>(() => {
    const server = data?.groups ?? []
    if (type === PAGES_TYPE) return pageGroup ? [pageGroup] : []
    if (type) return server
    return pageGroup ? [pageGroup, ...server] : server
  }, [data, pageGroup, type])

  const flat = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, groupType: g.type }))),
    [groups],
  )

  useEffect(() => setCursor(0), [debounced, type])

  const go = useCallback(
    (item: (SearchItem & { groupType?: string }) | undefined, groupType?: string) => {
      if (!item) return
      const kind = groupType ?? item.groupType ?? ''

      // Topilgan yozuv BOSHQA filialda bo'lsa, ro'yxat sahifasi uni
      // ko'rsatolmaydi (u tanlangan filial bilan cheklangan) — foydalanuvchi
      // bo'sh jadvalga tushardi. Shuning uchun o'tishdan OLDIN ko'lam
      // moslanadi. Xavfsiz: qidiruv allaqachon faqat foydalanuvchi ko'ra
      // oladigan yozuvni qaytargan, ammo baribir ruxsat etilgan filiallar
      // ro'yxatiga qarshi tekshiramiz (ko'p filialli bo'lmaganlar uchun
      // ro'yxat bo'sh — u holda hech nima o'zgartirilmaydi).
      const branch = item.branch_id
      if (branch) {
        const { selectedBranchId, setSelectedBranchId } = useBranchStore.getState()
        const allowed = getAllowedBranchIds(user)
        if (selectedBranchId !== branch && (allowed.length === 0 || allowed.includes(branch))) {
          setSelectedBranchId(branch)
        }
      }

      // Sahifa natijasi allaqachon v2 manzili; server natijasi v1 manzilini
      // beradi va u SHU YERDA moslanadi (izohi `searchRoutes.ts` da).
      const url =
        kind === PAGES_TYPE ? item.url : resolveSearchUrl(kind, item.id, item.url, item.title)
      if (!url) return
      setOpen(false)
      setQ('')
      navigate(url)
    },
    [navigate, user],
  )

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flat.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % flat.length)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + flat.length) % flat.length)
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[cursor])
    }
  }

  const chips: SearchSource[] = [
    { type: '', label: t('search.all') },
    { type: PAGES_TYPE, label: t('search.pages') },
    ...(sources.data ?? []),
  ]
  let running = -1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${t('search.title')} (Ctrl+K)`}
        aria-label={t('search.title')}
        className="flex h-icon shrink-0 items-center gap-2 rounded-inner bg-fg/[0.06] px-3 text-fg-muted transition-colors hover:bg-fg/[0.12] hover:text-fg"
      >
        <Search size={17} />
        <span className="hidden text-sm lg:inline">{t('search.title')}</span>
        <kbd className="hidden rounded border border-line px-1.5 py-px font-mono text-[10px] text-fg-muted xl:inline">
          Ctrl K
        </kbd>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto px-4 pb-6 pt-[70px]">
            <div
              data-lv-backdrop
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-label={t('search.title')}
              data-lv-surface
              className="relative my-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
            >
              <div className="flex h-[58px] items-center gap-3 border-b border-line px-4">
                <Search size={18} className="shrink-0 text-brand-strong" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder={t('search.placeholder')}
                  aria-label={t('search.query')}
                  className="flex-1 border-none bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
                />
                {results.isFetching && <Loader2 size={16} className="animate-spin text-fg-subtle" />}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <X size={17} />
                </button>
              </div>

              {chips.length > 1 && (
                <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5">
                  {chips.map((s) => (
                    <button
                      key={s.type || 'all'}
                      type="button"
                      onClick={() => setType(s.type)}
                      aria-pressed={type === s.type}
                      className={cn(
                        'shrink-0 rounded-pill border px-3 py-1 text-xs font-semibold transition-colors',
                        type === s.type
                          ? 'border-brand bg-brand-soft text-brand-strong'
                          : 'border-line text-fg-muted hover:text-fg',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="scroll-thin max-h-[52vh] overflow-y-auto">
                {debounced.length < MIN_QUERY ? (
                  <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">
                    {t('search.minChars', { count: MIN_QUERY })}
                  </p>
                ) : results.isError ? (
                  <p className="px-4 py-8 text-center text-[13px] text-danger">
                    {t('search.failed')}
                  </p>
                ) : groups.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">
                    {results.isFetching && type !== PAGES_TYPE
                      ? t('search.searching')
                      : t('search.empty', { q: debounced })}
                  </p>
                ) : (
                  groups.map((g) => (
                    <div key={g.type}>
                      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
                        <span className="text-[11.5px] font-boldr text-brand-strong">
                          {g.label}
                        </span>
                        <span className="text-[11px] text-fg-subtle">
                          {g.items.length < g.total ? `${g.items.length} / ${g.total}` : g.total}
                        </span>
                      </div>
                      {g.items.map((item) => {
                        running += 1
                        const idx = running
                        const activeRow = idx === cursor
                        return (
                          <button
                            key={`${g.type}-${item.id}`}
                            type="button"
                            onClick={() => go(item, g.type)}
                            onMouseEnter={() => setCursor(idx)}
                            className={cn(
                              'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              activeRow ? 'bg-brand-soft' : 'hover:bg-surface-2',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-fg">{item.title}</div>
                              {(item.subtitle || item.meta) && (
                                <div className="truncate text-xs text-fg-muted">
                                  {[subtitleLabel(g.type, item.subtitle), metaLabel(g.type, item.meta)].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                            {activeRow && (
                              <CornerDownLeft size={14} className="shrink-0 text-fg-subtle" />
                            )}
                          </button>
                        )
                      })}
                      {g.items.length < g.total && !type && g.type !== PAGES_TYPE && (
                        <button
                          type="button"
                          onClick={() => setType(g.type)}
                          className="w-full px-4 py-1.5 text-left text-xs text-brand-strong transition-colors hover:bg-surface-2"
                        >
                          {t('search.seeAllIn', { label: g.label })}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex h-[38px] items-center gap-4 border-t border-line px-4 text-[11px] text-fg-subtle">
                <span>{t('search.hintMove')}</span>
                <span>{t('search.hintOpen')}</span>
                <span>{t('search.hintClose')}</span>
                <span className="ml-auto font-mono">Ctrl + K</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
