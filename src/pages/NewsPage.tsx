import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ExternalLink, Eye, Newspaper, Search } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCompanyNewsPage, type CompanyNews } from '@/features/dashboard/nocturne/CompanyNewsFace'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'

/**
 * YANGILIKLAR — the company's news, straight from uzgidro.uz (user, 2026-09-24:
 * «barchasi apidan keladigan bo'ladi»). The in-house «news-posts» editor that
 * was opened for the press office is gone: the site is the one source, and a
 * card opens the article there, in a new tab.
 *
 * ⚠️ The site drops every query string, so its own pagination is broken. The
 * backend pages an index of the article ids that exist (see
 * services/uzgidro_news.page); the page number lives in the URL. The search box
 * filters the page on screen — the site offers no search to call.
 */
export function NewsPage() {
  const { t } = useTranslation()
  const { page, setPage, size, setSize } = useListParams([])
  const pageSize = Math.min(size, 100)
  const { data, loading, fetching } = useCompanyNewsPage(page, pageSize)
  const news = data?.items ?? []
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle
      ? news.filter((n) => `${n.title} ${n.excerpt ?? ''}`.toLowerCase().includes(needle))
      : news
  }, [news, q])
  // The big lead card only on the first page — deeper pages are an archive list.
  const [lead, ...rest] = page === 1 && !q ? shown : [undefined, ...shown]

  return (
    <PageContainer>
      <PageHeader
        title={t('news.title')}
        subtitle={t('news.sourceSubtitle')}
        actions={
          <a
            href="https://uzgidro.uz/news/index"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-pill border border-border px-4 py-2 text-[13px] font-semibold text-brand-strong hover:bg-brand-soft"
          >
            <ExternalLink size={15} /> {t('news.openSite')}
          </a>
        }
      />

      <label className="mb-4 flex h-11 max-w-xl items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 text-fg-subtle">
        <Search size={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('news.searchPagePlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Newspaper size={22} />} title={q ? t('news.noMatch') : t('dashboard.board.newsEmpty')} />
      ) : (
        <div className="flex flex-col gap-4">
          {lead && <LeadCard n={lead} />}
          <div className="grid gap-4 lg:grid-cols-2">
            {rest.map((n) => n && <NewsCard key={n.id} n={n} />)}
          </div>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="mt-5">
          <Pagination
            page={data.page}
            size={pageSize}
            total={data.total ?? data.pages * pageSize}
            pages={data.pages}
            onPage={(p) => {
              setPage(p)
              setQ('')
              document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onSize={setSize}
            loading={fetching}
          />
        </div>
      )}
    </PageContainer>
  )
}

function Meta({ n }: { n: CompanyNews }) {
  return (
    <span className="flex items-center gap-3 text-[12px] text-fg-subtle">
      {n.date && <span className="tabular-nums">{dayjs(n.date).format('DD.MM.YYYY · HH:mm')}</span>}
      {!!n.views && (
        <span className="flex items-center gap-1 tabular-nums">
          <Eye size={13} /> {n.views.toLocaleString('ru')}
        </span>
      )}
    </span>
  )
}

/** Our own resized copy at width `w` (the API resizes up to 1200px). */
const sized = (src: string, w: number) => `${src}${src.includes('?') ? '&' : '?'}w=${w}`

function Img({ src, fallback, className, lead = false }: { src: string | null; fallback?: string | null; className: string; lead?: boolean }) {
  const [step, setStep] = useState(0)
  const url = step === 0 ? src : step === 1 ? fallback : null
  if (!url)
    return (
      <span className={`grid place-items-center bg-brand-soft text-brand-strong ${className}`}>
        <Newspaper size={28} />
      </span>
    )
  // The lead photo is drawn ~1000px wide but was fetched as the 480px card
  // thumbnail — the blur in the screenshot. It now asks for a width that
  // fits the screen; cards keep the small one.
  const own = step === 0 && !!src?.includes('/dashboard/company-news/')
  return (
    <img
      src={own && lead ? sized(url, 1200) : url}
      srcSet={own ? (lead ? `${sized(url, 720)} 720w, ${sized(url, 1200)} 1200w` : `${sized(url, 480)} 480w, ${sized(url, 720)} 720w`) : undefined}
      sizes={lead ? '(min-width: 768px) 60vw, 100vw' : '176px'}
      alt=""
      loading={lead ? 'eager' : 'lazy'}
      fetchPriority={lead ? 'high' : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setStep((s) => s + 1)}
      className={`object-cover ${className}`}
    />
  )
}

function LeadCard({ n }: { n: CompanyNews }) {
  return (
    <a
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group grid overflow-hidden rounded-card border border-border bg-surface shadow-sm transition-shadow hover:shadow-md md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
    >
      {/* A fixed height: the photo's own aspect used to set the card at
          ~660px and leave the text column mostly empty. */}
      <Img lead src={n.image} fallback={n.image_source} className="h-60 w-full md:h-[380px] xl:h-[420px]" />
      <span className="flex flex-col justify-center gap-3 p-6 lg:p-8">
        <Meta n={n} />
        <span className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-fg group-hover:text-brand-strong">
          {n.title}
        </span>
        {n.excerpt && <span className="line-clamp-6 text-[14.5px] leading-relaxed text-fg-muted">{n.excerpt}</span>}
        <span className="mt-2">
          <ReadMore />
        </span>
      </span>
    </a>
  )
}

function NewsCard({ n }: { n: CompanyNews }) {
  return (
    <a
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 overflow-hidden rounded-card border border-border bg-surface p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <Img src={n.image} fallback={n.image_source} className="h-32 w-44 shrink-0 rounded-inner" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
        <Meta n={n} />
        <span className="line-clamp-2 text-[15px] font-bold leading-snug text-fg group-hover:text-brand-strong">{n.title}</span>
        {n.excerpt && <span className="line-clamp-2 text-[13px] text-fg-muted">{n.excerpt}</span>}
        <ReadMore />
      </span>
    </a>
  )
}

function ReadMore() {
  const { t } = useTranslation()
  return (
    <span className="mt-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-strong">
      {t('news.readOnSite')} <ExternalLink size={13} />
    </span>
  )
}
