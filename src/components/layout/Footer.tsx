import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Eye, Mail, Phone } from 'lucide-react'
import { cn } from '@/lib/cn'
import { siteText, telHref, useSiteInfo } from '@/features/site/useSiteInfo'
import { numberLocale } from '@/lib/format'

/**
 * PASTKI PANEL (TZ 442, GEN-6): matnli yengil navigatsiya — «Kontaktlar»,
 * «Tizim xaritasi», «Pochta»; tizim egasi (nom, manzil); tashriflar
 * hisoblagichi (bugun / jami — muvaffaqiyatli kirishlar, `GET /site/info`).
 *
 * `publicMode` — login sahifasi: ichki havolalar yo'q (kirmagan odam ularni
 * ocholmaydi), o'rniga yordam telefoni.
 */
export function Footer({ publicMode = false, className }: { publicMode?: boolean; className?: string }) {
  const { t, i18n } = useTranslation()
  const site = useSiteInfo().data
  const fmt = (n: number) => n.toLocaleString(numberLocale())
  const link = 'rounded-inner hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

  return (
    <footer
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-surface/80 px-page py-2 text-[12px] text-fg-muted',
        className,
      )}
    >
      <nav aria-label={t('site.footerNav')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!publicMode && (
          <>
            <Link to="/contacts" className={link}>
              {t('site.contacts')}
            </Link>
            <Link to="/sitemap" className={link}>
              {t('site.sitemap')}
            </Link>
          </>
        )}
        {site?.support_email && (
          <a href={`mailto:${site.support_email}`} className={cn(link, 'inline-flex items-center gap-1')}>
            <Mail size={12} aria-hidden />
            {t('site.mail')}
          </a>
        )}
        {publicMode && site?.support_phone && (
          <a href={telHref(site.support_phone)} className={cn(link, 'inline-flex items-center gap-1')}>
            <Phone size={12} aria-hidden />
            {site.support_phone}
          </a>
        )}
      </nav>

      {site && (
        <span className="min-w-0">
          © {new Date().getFullYear()} {siteText(i18n.language, site.owner_name, site.owner_name_ru)}
          {site.owner_address ? ` · ${siteText(i18n.language, site.owner_address, site.owner_address_ru)}` : ''}
        </span>
      )}

      {site?.visits && (
        <span className="ml-auto inline-flex items-center gap-1.5 tabnum" aria-label={t('site.visits')}>
          <Eye size={12} aria-hidden />
          {t('site.visitsToday')}: <b className="font-semibold text-fg">{fmt(site.visits.today)}</b>
          <span aria-hidden>·</span>
          {t('site.visitsTotal')}: <b className="font-semibold text-fg">{fmt(site.visits.total)}</b>
        </span>
      )}
    </footer>
  )
}
