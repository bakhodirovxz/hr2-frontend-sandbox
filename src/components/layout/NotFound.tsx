import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

/**
 * 404 — for an address that does not exist AND for a page this account has no
 * right to (user, 2026-09-24: «huquqi bor sahifalargina ko'rinsin, qolganlari
 * 404 bersin»). A closed page answers exactly like a missing one, so the
 * existence of a module is not advertised to accounts that cannot use it.
 */
export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="bg-gradient-to-br from-[#8B5CF6] via-[#C026D3] to-[#0EA5E9] bg-clip-text text-[96px] font-extrabold leading-none tracking-[-0.05em] text-transparent">
          404
        </span>
        <h1 className="m-0 text-[20px] font-bold text-fg">{t('notFound.title')}</h1>
        <p className="m-0 text-[13.5px] text-fg-muted">{t('notFound.hint')}</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-2 rounded-pill bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] px-5 py-2.5 text-[13.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(124,58,237,0.8)] hover:brightness-110"
        >
          <Home size={16} /> {t('notFound.home')}
        </Link>
      </div>
    </div>
  )
}
