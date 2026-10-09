import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Eye, Image as ImageIcon, RotateCcw, Type, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDynamicT } from '@/i18n/dynamicKey'
import {
  LV_FONT_STEPS,
  LV_SCHEMES,
  getLowVision,
  isLowVisionOn,
  resetLowVision,
  setLowVision,
  subscribeLowVision,
  type LowVisionState,
} from './lowVisionStore'

/**
 * «Kam ko'ruvchilar uchun» rejim boshqaruvi — TZ 4.1.4 / 4.1.7.
 *
 * Sarlavhadagi ko'z tugmasidan ochiladi. Tanlovlar DARHOL qo'llanadi
 * («Saqlash» tugmasi yo'q): foydalanuvchi natijani ko'rib turib tanlaydi,
 * bu aynan shu rejimda muhim.
 *
 * ⚠️ «Odatiy ko'rinishga qaytarish» — YOPISHTIRILGAN altlikda. A++ da panel
 * ekrandan oshib ketadi va tugma pastga tushib qolardi: foydalanuvchi uni
 * ko'rmay, rejimda QAMALIB qolgandek his qilardi (aylantirsa yetardi, ammo
 * aynan shu rejimdagi odam uni izlab yurmasligi kerak). Endi panel o'zining
 * ichida aylanadi, sarlavha ham, altlik ham doim ko'rinib turadi.
 */
export function LowVisionPanel() {
  const { t } = useTranslation()
  // Sxema nomlari `lowVisionStore` da KALIT sifatida turadi (matn u yerda
  // emas), ya'ni kalit runtime'da hisoblanadi.
  const tk = useDynamicT()
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<LowVisionState>(getLowVision())

  useEffect(() => subscribeLowVision(setCfg), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const active = isLowVisionOn(cfg)

  const chip = (selected: boolean) =>
    cn(
      'rounded-inner border-2 px-3 py-2 text-left text-sm font-medium transition-colors',
      selected
        ? 'border-brand bg-brand-soft text-brand-strong'
        : 'border-line text-fg-muted hover:border-border-strong hover:text-fg',
    )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('a11y.title')}
        aria-label={t('a11y.title')}
        aria-pressed={active}
        className={cn(
          'grid h-icon w-icon place-items-center rounded-inner transition-colors',
          active ? 'bg-brand text-fg-on-brand' : 'text-fg-muted hover:bg-fg/[0.08] hover:text-fg',
        )}
      >
        <Eye size={18} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto px-4 pb-6 pt-[60px]">
            <div
              data-lv-backdrop
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-label={t('a11y.title')}
              data-lv-surface
              className="relative my-auto flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
            >
              <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-medium text-fg">{t('a11y.title')}</h2>
                  <p className="mt-0.5 text-xs text-fg-muted">{t('a11y.subtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-fg">{t('a11y.scheme')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {LV_SCHEMES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setLowVision({ scheme: s.id })}
                        aria-pressed={cfg.scheme === s.id}
                        className={chip(cfg.scheme === s.id)}
                      >
                        <span className="block">{tk(s.labelKey)}</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-fg-subtle">
                          {tk(s.hintKey)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                    <Type size={14} /> {t('a11y.fontSize')}
                  </h3>
                  <div className="flex gap-2">
                    {LV_FONT_STEPS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setLowVision({ font: f.id })}
                        aria-pressed={cfg.font === f.id}
                        aria-label={`${t('a11y.fontSize')}: ${f.label}`}
                        className={cn(chip(cfg.font === f.id), 'flex-1 text-center')}
                        style={{ fontSize: `${13 * f.scale}px` }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold text-fg">{t('a11y.extras')}</h3>
                  <button
                    type="button"
                    onClick={() => setLowVision({ spacing: !cfg.spacing })}
                    aria-pressed={cfg.spacing}
                    className={chip(cfg.spacing)}
                  >
                    {t('a11y.spacing')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLowVision({ images: !cfg.images })}
                    aria-pressed={!cfg.images}
                    className={cn(chip(!cfg.images), 'flex items-center gap-2')}
                  >
                    <ImageIcon size={15} /> {t('a11y.hideImages')}
                  </button>
                </section>

              </div>

              <div className="shrink-0 border-t border-line px-5 py-3.5">
                <button
                  type="button"
                  onClick={resetLowVision}
                  disabled={!active}
                  className="flex w-full items-center justify-center gap-2 rounded-inner border-2 border-line px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={15} /> {t('a11y.reset')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
