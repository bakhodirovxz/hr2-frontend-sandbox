import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ExternalLink, Newspaper } from 'lucide-react'
import { apiGet } from '@/api/http'
import { joinApiUrl } from '@/api/client'
import { PanelEmpty } from './Panel'

/**
 * COMPANY NEWS — from the corporate site, uzgidro.uz (user, 2026-09-24).
 *
 * Read through `/dashboard/company-news` (the site sends no CORS headers and
 * ships the full article text in three languages per item; the backend trims
 * and caches it). Picture, title, date; a click opens the article on the site
 * itself, in a new tab.
 */
export interface CompanyNews {
  id: number
  title: string
  excerpt?: string
  views?: number
  /** The original picture on upload.uzgidro.uz — fallback if ours fails. */
  image_source?: string | null
  date: string | null
  image: string | null
  url: string
}

export function useCompanyNews(limit = 6) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ru' ? 'ru' : 'uz'
  const q = useQuery({
    queryKey: ['board', 'company-news', lang, limit],
    // `image` is an API path (our own WebP thumbnail) — made absolute here.
    queryFn: () =>
      apiGet<CompanyNews[]>('dashboard/company-news', { limit, lang }).then((rows) =>
        rows.map((r) => ({ ...r, image: r.image?.startsWith('/') ? joinApiUrl(r.image) : r.image })),
      ),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return { news: q.data ?? [], loading: q.isLoading }
}

/** The whole archive, page by page (`/dashboard/company-news/page`). */
export function useCompanyNewsPage(page: number, size: number) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ru' ? 'ru' : 'uz'
  const q = useQuery({
    queryKey: ['news-archive', lang, page, size],
    queryFn: () =>
      apiGet<{ items: CompanyNews[]; page: number; pages: number; size: number; total?: number }>('dashboard/company-news/page', {
        page,
        size,
        lang,
      }).then((r) => ({
        ...r,
        items: r.items.map((x) => ({ ...x, image: x.image?.startsWith('/') ? joinApiUrl(x.image) : x.image })),
      })),
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
    retry: false,
  })
  return { data: q.data ?? null, loading: q.isLoading, fetching: q.isFetching }
}

export function CompanyNewsFace({ news }: { news: CompanyNews[] }) {
  const { t } = useTranslation()
  if (news.length === 0) return <PanelEmpty text={t('dashboard.board.newsEmpty')} />
  return (
    <ul className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3">
      {news.map((n) => (
        <li key={n.id}>
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            title={n.title}
            className="group flex items-center gap-3 rounded-inner bg-fg/[0.035] p-2 transition-colors hover:bg-brand-soft"
          >
            <Thumb src={n.image} fallback={n.image_source} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">{n.title}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
                {n.date ? dayjs(n.date).format('DD.MM.YYYY · HH:mm') : ''}
                <ExternalLink size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Thumb({ src, fallback }: { src: string | null; fallback?: string | null }) {
  const [step, setStep] = useState(0)
  const url = step === 0 ? src : step === 1 ? fallback : null
  if (!url)
    return (
      <span className="grid h-14 w-20 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-strong">
        <Newspaper size={18} />
      </span>
    )
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setStep((s) => s + 1)}
      className="h-14 w-20 shrink-0 rounded-[10px] object-cover"
    />
  )
}
