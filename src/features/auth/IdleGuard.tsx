import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { apiGet } from '@/api/http'
import { USER_INFO } from '@/api/endpoints'
import { useLogout } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { setLogoutReason } from './logoutReason'

/** Ogohlantirish chiqishdan qancha oldin ko'rinadi. */
const WARN_MS = 60_000
/** Faol foydalanuvchi uchun serverdagi `last_active` ni yangilab turish. */
const KEEPALIVE_MS = 4 * 60_000
/** Barcha ochiq tablar bitta oxirgi faollik vaqtini bo'lishadi. */
const SHARED_KEY = 'hrm.lastActivity'
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

function readShared(): number {
  try {
    return Number(localStorage.getItem(SHARED_KEY)) || 0
  } catch {
    return 0
  }
}

function writeShared(at: number): void {
  try {
    localStorage.setItem(SHARED_KEY, String(at))
  } catch {
    /* storage yopiq — tab o'z hisobini yuritadi */
  }
}

/**
 * TZ U2 789 «Автоматический выход — запускается при длительном бездействии
 * пользователя». Muddat serverdan (`/auth/me` → `idle_timeout_minutes`,
 * xavfsizlik siyosati; 0 — o'chirilgan). Server yopiq tabdagi sessiyani o'zi
 * yopadi; ochiq tabda esa fon so'rovlari (qo'ng'iroq, doska) sessiyani tirik
 * ushlab turadi — shuning uchun harakatsizlikni faqat mijoz ko'ra oladi:
 * sichqoncha/klaviatura/teginish. Chiqishdan bir daqiqa oldin ogohlantiradi.
 */
export function IdleGuard() {
  const { t } = useTranslation()
  const minutes = useAuthStore((s) => s.user?.idle_timeout_minutes ?? 0)
  const logout = useLogout()
  const [left, setLeft] = useState<number | null>(null)
  const last = useRef(Date.now())
  const lastPing = useRef(Date.now())

  useEffect(() => {
    if (!minutes || minutes <= 0) return
    const limit = minutes * 60_000
    last.current = Math.max(Date.now(), readShared())
    writeShared(last.current)

    let throttle = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - throttle < 1000) return
      throttle = now
      last.current = now
      writeShared(now)
      if (now - lastPing.current > KEEPALIVE_MS) {
        lastPing.current = now
        apiGet(USER_INFO).catch(() => {})
      }
    }
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const tick = window.setInterval(() => {
      const at = Math.max(last.current, readShared())
      last.current = at
      const remaining = at + limit - Date.now()
      if (remaining <= 0) {
        window.clearInterval(tick)
        setLogoutReason('idle')
        logout()
        return
      }
      setLeft(remaining <= WARN_MS ? Math.ceil(remaining / 1000) : null)
    }, 1000)

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes])

  const stay = () => {
    const now = Date.now()
    last.current = now
    lastPing.current = now
    writeShared(now)
    setLeft(null)
    apiGet(USER_INFO).catch(() => {})
  }

  return (
    <Modal
      open={left != null}
      onClose={stay}
      size="sm"
      title={t('authx.idleTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={logout}>
            {t('header.logout')}
          </Button>
          <Button onClick={stay} autoFocus>
            {t('authx.idleStay')}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Clock size={22} className="shrink-0 text-warning" aria-hidden />
        <p className="text-[13.5px] text-fg" aria-live="polite">
          {t('authx.idleBody', { n: left ?? 0 })}
        </p>
      </div>
    </Modal>
  )
}
