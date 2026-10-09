import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Driver } from 'driver.js'
import { TOURS } from './tours'
import { useTourStore } from './tourStore'

/** Selektor chizilishini kutadi; yetib kelmasa `false`. */
function waitFor(selector: string, timeout = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true)
      if (Date.now() - started >= timeout) return resolve(false)
      setTimeout(tick, 100)
    }
    tick()
  })
}

/**
 * TUR DVIGATELI — `driver.js` ni boshqaradi.
 *
 * ⚠️ QADAMLAR OLDINDAN FILTRLANADI. Har bir rol boshqa tugmalarni ko'radi, va
 * yo'q elementga ishora qilingan qadam driver.js da bo'sh oyna bo'lib chiqadi.
 * Shuning uchun tur boshlanishidan oldin har bir selektor tekshiriladi va
 * topilmagani TUSHIRIB QOLDIRILADI (v1 ham shunday qiladi).
 *
 * ⚠️ MARSHRUT AVVAL. Qadam boshqa sahifada bo'lsa, avval o'sha yerga o'tamiz
 * va element chizilishini kutamiz — aks holda tur bo'sh ekranda ochilardi.
 */
export function useTourEngine() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const active = useTourStore((s) => s.active)
  const stop = useTourStore((s) => s.stop)
  const markSeen = useTourStore((s) => s.markSeen)
  const ref = useRef<Driver | null>(null)

  useEffect(() => {
    if (!active) return
    const def = TOURS.find((x) => x.id === active)
    if (!def) {
      stop()
      return
    }

    let cancelled = false

    const run = async () => {
      const steps: { element?: string; popover: Record<string, unknown> }[] = []
      for (const s of def.steps) {
        if (cancelled) return
        if (s.nav) {
          navigate(s.nav)
          // Sahifa almashgach DOM darhol tayyor bo'lmaydi.
          await new Promise((r) => setTimeout(r, 350))
        }
        if (s.el) {
          const found = await waitFor(s.el, s.nav ? 4000 : 1200)
          if (!found) continue
        }
        steps.push({
          element: s.el,
          popover: {
            title: t(s.titleKey as never),
            description: t(s.textKey as never),
            side: s.side,
          },
        })
      }
      if (cancelled || steps.length === 0) {
        stop()
        return
      }

      /**
       * ⚠️ driver.js IS LOADED HERE, NOT AT MODULE LEVEL. The engine has to be
       * mounted in the shell (`Header` -> `TourLauncher`), so a static import
       * put the library AND its stylesheet into the ENTRY chunk — ~28 KB paid
       * by every visitor on every page for a feature almost nobody starts. We
       * are already inside the `active` effect, i.e. someone has just started a
       * tour, so this is the first moment the code is genuinely needed.
       */
      const [{ driver }] = await Promise.all([
        import('driver.js'),
        import('driver.js/dist/driver.css'),
      ])
      if (cancelled) return

      const d = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: true,
        stagePadding: 6,
        stageRadius: 10,
        popoverOffset: 12,
        nextBtnText: t('tour.next'),
        prevBtnText: t('tour.prev'),
        doneBtnText: t('tour.done'),
        steps,
        onDestroyed: () => {
          // Esc, overlay yoki «Tugatish» — hammasi bir xil yakun.
          markSeen(def.id)
          stop()
        },
      })
      ref.current = d
      d.drive()
    }

    void run()
    return () => {
      cancelled = true
      ref.current?.destroy()
      ref.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
