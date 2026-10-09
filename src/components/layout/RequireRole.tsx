import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Home, ShieldOff } from 'lucide-react'

/**
 * «Ruxsat yo'q» — manzil satri orqali darvozasi o'tmagan sahifaga kirilganda
 * (hr-frontend-sandbox `ForbiddenState` bilan bir xil xulq). Backend o'z
 * tekshiruvini mustaqil qiladi (403 `module_forbidden` / `out_of_scope`).
 */
export function ForbiddenState() {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-pill bg-danger/10 text-danger">
          <ShieldOff size={30} aria-hidden />
        </span>
        <h1 className="m-0 text-[20px] font-bold text-fg">{t('nav.forbiddenTitle')}</h1>
        <p className="m-0 text-[13.5px] text-fg-muted">{t('nav.forbiddenHint')}</p>
        <Link
          to="/"
          className="accent-tile mt-2 inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[13.5px] font-bold"
        >
          <Home size={16} aria-hidden /> {t('notFound.home')}
        </Link>
      </div>
    </div>
  )
}

/** Sahifani faqat ruxsati bor hisobga chizadi, qolganiga «Ruxsat yo'q». */
export function RequireRole({ allowed, children }: { allowed: boolean; title?: string; children: ReactNode }) {
  return allowed ? <>{children}</> : <ForbiddenState />
}
