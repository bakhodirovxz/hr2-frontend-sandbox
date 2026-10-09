import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER } from '@/components/ui/control'
import { LowVisionPanel } from '@/a11y/LowVisionPanel'
import { HelpButton } from '@/features/help/HelpButton'
import { AssistantButton } from '@/features/llm/AssistantButton'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

/**
 * O'qish sozlamalari — qo'llanma (F1), kam ko'ruvchilar rejimi, til, mavzu.
 *
 * ⚠️ TELEFONDA BULAR YO'QOLGAN EDI. Sarlavha qatori bitta qator, o'ralmaydi va
 * `overflow` ni ko'rsatmaydi: 390px da o'ng guruh (qo'llanma…profil) ekrandan
 * TASHQARIDA qolardi — foydalanuvchi tilni ham, mavzuni ham, hatto CHIQISHNI
 * ham bosa olmasdi, gorizontal aylantirish ham yo'q edi. Shuning uchun keng
 * ekranda to'rt boshqaruv joyida turadi, tor ekranda esa shu «⋯» menyusiga
 * yig'iladi; bildirishnoma va profil HAR DOIM qatorda qoladi.
 *
 * Ichkaridagi komponentlar O'ZGARISHSIZ ishlatiladi — qo'llanma va kam
 * ko'ruvchilar oynasi baribir `body` ga portal qilinadi, ya'ni menyu kengligi
 * ularni cheklamaydi.
 */
export function HeaderTools({ showHelp }: { showHelp: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {/* Keng ekran: qatorda */}
      <div className="hidden items-center gap-ui-sm lg:flex">
        <AssistantButton />
        {showHelp && <HelpButton />}
        <LowVisionPanel />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      {/* Tor ekran: yig'ma menyu */}
      <div className="relative lg:hidden">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t('header.moreTools')}
          aria-haspopup="menu"
          aria-expanded={open}
          title={t('header.moreTools')}
          className={cn(
            'grid h-icon w-icon place-items-center rounded-inner transition-colors',
            open ? 'bg-fg/[0.12] text-fg' : 'text-fg-muted hover:bg-fg/[0.08] hover:text-fg',
          )}
        >
          <MoreHorizontal size={19} />
        </button>

        <AnchoredPanel
          anchorRef={btnRef}
          open={open}
          onClose={() => setOpen(false)}
          width={POPOVER.menuW}
          height={200}
          label={t('header.moreTools')}
          className="p-1.5"
        >
            <ToolRow label={t('assistant.title')}><AssistantButton /></ToolRow>
            {showHelp && <ToolRow label={t('guide.title')}><HelpButton /></ToolRow>}
            <ToolRow label={t('a11y.title')}><LowVisionPanel /></ToolRow>
            <ToolRow label={t('header.language')}><LanguageSwitcher inline /></ToolRow>
          <ToolRow label={t('header.theme')}><ThemeToggle /></ToolRow>
        </AnchoredPanel>
      </div>
    </>
  )
}

/** Yorliq + boshqaruv: menyuda ikonka yolg'iz tushunarsiz bo'lardi. */
function ToolRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-inner px-2.5 py-1 hover:bg-surface-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
