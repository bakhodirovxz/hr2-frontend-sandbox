import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { flattenNav, getNavForUser, isGroup, type NavKey, type NavNode } from '@/components/layout/navConfig'
import { isGuest } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'

/**
 * «Tizim xaritasi» (TZ 442, GEN-6 — pastki paneldagi «карта Системы»): joriy
 * foydalanuvchi ko'ra oladigan BARCHA menyu bandlari matnli daraxt
 * ko'rinishida, havolalar bilan. Manba — asosiy menyu bilan bir xil
 * (`getNavForUser`), shuning uchun xaritada ochilmaydigan sahifa bo'lmaydi.
 */

const LINK_CLS =
  'rounded-inner text-[14px] text-brand hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

function Tree({ items, depth = 0 }: { items: NavNode[]; depth?: number }) {
  const { t } = useTranslation()
  const label = (k: NavKey) => t(`nav.${k}` as const)
  return (
    <ul className={depth ? 'ml-2 mt-1.5 space-y-1.5 border-l border-line pl-4' : 'space-y-2'}>
      {items.map((item) => (
        <li key={item.key}>
          {isGroup(item) ? (
            <>
              <span className="text-[14px] font-semibold text-fg">{label(item.labelKey)}</span>
              <Tree items={item.children} depth={depth + 1} />
            </>
          ) : (
            <Link to={item.path} className={LINK_CLS}>
              {label(item.labelKey)}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SitemapPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const nav = useMemo(() => getNavForUser(user), [user])

  /** Menyuda yo'q, lekin har kimga ochiq umumiy sahifalar. */
  const extra = useMemo(() => {
    const list: { key: string; labelKey: NavKey; path: string }[] = [
      { key: 'myProfile', labelKey: 'myProfile', path: '/my-profile' },
      ...(isGuest(user) ? [] : [{ key: 'search', labelKey: 'search' as NavKey, path: '/search' }]),
      { key: 'contacts', labelKey: 'contacts', path: '/contacts' },
      { key: 'sitemap', labelKey: 'sitemap', path: '/sitemap' },
    ]
    const inNav = new Set(flattenNav(nav).map((l) => l.path))
    return list.filter((i) => !inNav.has(i.path))
  }, [nav, user])

  return (
    <PageContainer>
      <PageHeader title={t('nav.sitemap')} subtitle={t('sitemap.subtitle')} />
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <nav aria-label={t('nav.sitemap')}>
            <Tree items={nav} />
          </nav>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-fg-muted">{t('sitemap.general')}</h2>
          <ul className="space-y-2">
            {extra.map((i) => (
              <li key={i.key}>
                <Link to={i.path} className={LINK_CLS}>
                  {t(`nav.${i.labelKey}` as const)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageContainer>
  )
}
