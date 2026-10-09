import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Languages } from 'lucide-react'
import { LANGS, setLanguage, type Lang } from '@/i18n'
import { cn } from '@/lib/cn'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER } from '@/components/ui/control'

/**
 * Til tanlagich — TZ 4.1.7 («узбекский (латиница/кириллица) и русский»).
 *
 * Tanlov `localStorage` da: bir qurilmadagi sozlama, hisobga bog'lanmagan.
 * i18next tilni almashtirganda react-i18next butun daraxtni qayta chizadi —
 * qo'shimcha sahifa yangilash SHART EMAS.
 */
/**
 * `inline` — ochiluvchi ro'yxat o'rniga uchta chip.
 *
 * ⚠️ Tor ekrandagi «Qo'shimcha sozlamalar» menyusi ICHIDA ochiluvchi ro'yxat
 * ISHLAMAYDI: ikkala panel ham `body` ga portal qilinadi, ya'ni ichkaridagi
 * ro'yxatga bosish tashqi menyu uchun "tashqarida" hisoblanadi — tashqi menyu
 * yopiladi va bosish tanlovga umuman yetib bormaydi. Bir qavatli variant bu
 * muammoni butunlay yo'q qiladi va bitta tegishda tanlanadi.
 */
export function LanguageSwitcher({ inline = false }: { inline?: boolean }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])

  if (inline) {
    return (
      <div role="radiogroup" aria-label={t('header.language')} className="flex items-center gap-1">
        {LANGS.map((l) => {
          const active = l.code === i18n.language
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={l.label}
              title={l.label}
              onClick={() => setLanguage(l.code as Lang)}
              className={cn(
                'rounded-control px-2 py-1 text-[11px] font-semibold uppercase transition-colors',
                active
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {l.short}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('header.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('header.language')}
        className="flex h-icon items-center gap-1.5 rounded-inner px-2.5 text-fg-muted transition-colors hover:bg-fg/[0.08] hover:text-fg"
      >
        <Languages size={18} />
        <span className="text-xs font-semibold">{current.short}</span>
      </button>

      <AnchoredPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={POPOVER.langW}
        height={140}
        label={t('header.language')}
        className="overflow-hidden py-1"
      >
          {LANGS.map((l) => {
            const active = l.code === i18n.language
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLanguage(l.code as Lang)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  active ? 'text-brand-strong' : 'text-fg hover:bg-surface-2',
                )}
              >
                <span className="w-7 shrink-0 font-mono text-[11px] text-fg-subtle">{l.short}</span>
                <span className="flex-1">{l.label}</span>
                {active && <Check size={14} className="shrink-0" />}
              </button>
            )
          })}
      </AnchoredPanel>
    </div>
  )
}
