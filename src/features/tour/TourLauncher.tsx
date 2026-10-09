import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Compass, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { getNavForUser } from '@/components/layout/navConfig'
import { useSystemSettings } from '@/features/settings/useSystemSettings'
import type { NavModuleOverrides } from '@/components/layout/navConfig'
import { useBranchStore } from '@/store/branchStore'
import { TOURS } from './tours'
import { useTourStore } from './tourStore'
import { useTourEngine } from './useTourEngine'

/**
 * QO'LLANMA-TUR: tugma, tanlash oynasi va birinchi kirishdagi taklif.
 *
 * Bitta joyda turadi, chunki uchalasi bir holatni boshqaradi va dvigatel
 * (`useTourEngine`) qobiqda BIR MARTA ulanishi kerak.
 */
export function TourLauncher() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { values } = useSystemSettings()
  const navOverrides = values['nav.modules'] as NavModuleOverrides | undefined
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { seen, welcomed, setWelcomed, start } = useTourStore()
  const [picker, setPicker] = useState(false)
  const [welcome, setWelcome] = useState(false)

  useTourEngine()

  /** Menyusida bo'lmagan modul turi taklif qilinmaydi. */
  const allowed = (() => {
    const keys = new Set(getNavForUser(user, navOverrides, branchId).map((i) => i.labelKey))
    return TOURS.filter((x) => !x.needsNav || keys.has(x.needsNav))
  })()

  // Birinchi kirish — taklif BIR MARTA. Odam «keyinroq» desa ham qaytmaydi:
  // tugma sarlavhada doim turadi.
  // Parol majburiy almashtirilishi kerak bo'lsa taklif KEYINROQ: ikkala oyna
  // ustma-ust tushib, parol oynasi (`PasswordGate`) ko'rinmay qolardi.
  const mustChangePassword = !!user?.password_must_change
  useEffect(() => {
    if (!user || welcomed || mustChangePassword) return
    const id = setTimeout(() => setWelcome(true), 1200)
    return () => clearTimeout(id)
  }, [user, welcomed, mustChangePassword])

  const launch = (id: string) => {
    setPicker(false)
    setWelcome(false)
    setWelcomed()
    start(id)
  }

  return (
    <>
      <IconButton label={t('tour.open')} onClick={() => setPicker(true)}>
        <Compass size={19} />
      </IconButton>

      <Modal
        open={picker}
        onClose={() => setPicker(false)}
        title={t('tour.pickTitle')}
        size="sm"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setPicker(false)}>{t('common.close')}</Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-1.5">
          {allowed.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => launch(x.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left',
                  'transition-colors hover:border-brand/50 hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-fg">{t(x.titleKey as never)}</span>
                  <span className="block text-[12px] text-fg-subtle">{t(x.descKey as never)}</span>
                </span>
                {seen.includes(x.id) && <Check size={15} className="mt-0.5 shrink-0 text-success" />}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={welcome}
        onClose={() => { setWelcome(false); setWelcomed() }}
        title={t('tour.welcomeTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setWelcome(false); setWelcomed() }}>
              {t('tour.later')}
            </Button>
            <Button onClick={() => launch('intro')}>{t('tour.startNow')}</Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-fg-muted">{t('tour.welcomeText')}</p>
      </Modal>
    </>
  )
}
