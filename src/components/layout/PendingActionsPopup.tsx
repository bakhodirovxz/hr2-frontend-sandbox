import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Car, CalendarCheck, FileText, FolderOpen, KanbanSquare, ScrollText, Wrench } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useMenuBadges } from '@/hooks/useMenuBadges'
import { useAuthStore } from '@/store/authStore'

/**
 * "Sizni kutmoqda" — everything waiting on this person, once per sign-in.
 *
 * v1 opens this on login (`PendingActionsPopup.jsx`); v2 had nothing, so the
 * only hint that a letter needed your signature was a small counter in the
 * menu — which you only see if you look at the menu.
 *
 * ⚠️ THE COUNTS COME FROM `menu-badges`, the same source the menu counters use.
 * v1 learned this the hard way: this popup used to count `/work-leaves` rows
 * itself while the menu counted them by a different rule, so one screen could
 * show two different numbers for the same thing.
 */
const ROWS: { path: string; labelKey: string; Icon: typeof FileText }[] = [
  { path: '/letters', labelKey: 'nav.letters', Icon: FileText },
  { path: '/orders', labelKey: 'nav.orders', Icon: ScrollText },
  { path: '/request-permission', labelKey: 'nav.requestPermission', Icon: CalendarCheck },
  { path: '/texnik-yordam', labelKey: 'nav.support', Icon: Wrench },
  { path: '/vehicles', labelKey: 'nav.vehicles', Icon: Car },
  { path: '/projects', labelKey: 'nav.projects', Icon: KanbanSquare },
  { path: '/hujjatlar', labelKey: 'nav.documents', Icon: FolderOpen },
]

const seenKey = (uid: number | string) => `hrm_pending_popup_seen:${uid}`

export function PendingActionsPopup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const badges = useMenuBadges()
  const uid = useAuthStore((s) => s.user?.id)
  const [open, setOpen] = useState(false)

  const rows = ROWS.map((r) => ({ ...r, count: badges[r.path] ?? 0 })).filter((r) => r.count > 0)
  const total = rows.reduce((sum, r) => sum + r.count, 0)

  useEffect(() => {
    if (!uid || total === 0) return
    try {
      // Once per session, not once per page — otherwise it reopens on every
      // navigation. A browser with storage blocked simply shows it again.
      if (sessionStorage.getItem(seenKey(uid))) return
    } catch {
      /* storage unavailable — showing it is better than crashing */
    }
    setOpen(true)
  }, [uid, total])

  const close = () => {
    setOpen(false)
    try {
      if (uid) sessionStorage.setItem(seenKey(uid), '1')
    } catch {
      /* ignore */
    }
  }

  if (!open || rows.length === 0) return null

  return (
    <Modal open onClose={close} title={t('pending.title')}>
      <p className="mb-3 text-[13px] text-fg-muted">{t('pending.subtitle', { count: total })}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map(({ path, labelKey, Icon, count }) => (
          <li key={path}>
            <button
              type="button"
              onClick={() => {
                close()
                navigate(path)
              }}
              className="flex w-full items-center gap-3 rounded-inner border border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
                <Icon size={16} />
              </span>
              <span className="flex-1 text-[13px] font-medium text-fg">{t(labelKey as never)}</span>
              <span className="rounded-pill bg-danger/[0.14] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-danger">
                {count}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={close}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  )
}
