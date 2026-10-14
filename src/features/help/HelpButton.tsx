import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpen, Info, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDynamicT } from '@/i18n/dynamicKey'
import { guideSectionForPath, type GuideBlock, type GuideSection } from './adminGuide'
import { guideModeFor, guideSections, guideTitleKey } from './userGuide'
import { useAuthStore } from '@/store/authStore'
import { Select } from '@/components/ui/Select'
import { control } from '@/components/ui/control'

/**
 * Administratorlik qo'llanmasi oynasi — TZ 8-bo'lim
 * («…неотъемлемой частью Системы (горячая клавиша F1)»).
 *
 * F1 bosilganda JORIY sahifaga mos bo'lim ochiladi (kontekstual yordam),
 * chapdagi ro'yxatdan boshqa bo'limga o'tish mumkin. Qo'llanma alohida PDF
 * EMAS — tizim ichida yashaydi va kod bilan birga yangilanadi.
 */
export function HelpButton() {
  const { t } = useTranslation()
  // Qo'llanma bloklari kalitni MA'LUMOT sifatida saqlaydi (adminGuide.ts).
  const tk = useDynamicT()
  const location = useLocation()
  // F1 is role-aware: administrators/HR get the administrator guide, guests a
  // short guest guide, everyone else the user guide.
  const mode = guideModeFor(useAuthStore((s) => s.user))
  const GUIDE = useMemo(() => guideSections(mode), [mode])
  const titleKey = guideTitleKey(mode)
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>(GUIDE[0].id)
  const [q, setQ] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const openFor = (pathname: string) => {
    const section = guideSectionForPath(pathname, GUIDE)
    setActiveId(section ? section.id : GUIDE[0].id)
    setOpen(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        // Brauzerning o'z yordamini to'xtatamiz — TZ aynan F1 ni tizim
        // qo'llanmasiga bog'lashni talab qiladi.
        e.preventDefault()
        setOpen((v) => {
          if (!v) {
            const section = guideSectionForPath(window.location.pathname, GUIDE)
            setActiveId(section ? section.id : GUIDE[0].id)
          }
          return !v
        })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Sahifa almashsa kontekst ham yangilanadi (oyna ochiq bo'lsa).
  useEffect(() => {
    if (!open) return
    const section = guideSectionForPath(location.pathname, GUIDE)
    if (section) setActiveId(section.id)
  }, [location.pathname, open])

  // Bo'lim almashganda matn boshidan ko'rinsin.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [activeId])

  /** Qidiruv bo'lim SARLAVHASI va butun MATNI bo'yicha — kalit emas, tarjima
   *  qilingan matn bo'yicha, ya'ni rus tilida ham ishlaydi. */
  const sectionText = (s: GuideSection): string =>
    [
      tk(s.titleKey),
      ...s.blocks.flatMap((b) => (b.t === 'list' ? b.items.map((k) => tk(k)) : [tk(b.k)])),
    ]
      .join(' ')
      .toLowerCase()

  const sections = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return GUIDE
    return GUIDE.filter((s) => sectionText(s).includes(term))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t, GUIDE])

  const active = GUIDE.find((s) => s.id === activeId) ?? GUIDE[0]

  return (
    <>
      <button
        type="button"
        onClick={() => openFor(location.pathname)}
        aria-label={tk(titleKey)}
        title={`${tk(titleKey)} (F1)`}
        className="grid h-icon w-icon place-items-center rounded-inner text-fg-muted transition-colors hover:bg-fg/[0.08] hover:text-fg"
      >
        <BookOpen size={18} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6">
            <div
              data-lv-backdrop
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-label={tk(titleKey)}
              data-lv-surface
              className="relative flex h-full max-h-[86vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
            >
              <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                <BookOpen size={18} className="shrink-0 text-brand-strong" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-medium text-fg">{tk(titleKey)}</h2>
                  <p className="text-xs text-fg-muted">{t('guide.subtitle')}</p>
                </div>
                <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">
                  F1
                </kbd>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1">
                <nav className="scroll-thin hidden w-[260px] shrink-0 flex-col overflow-y-auto border-r border-line p-3 md:flex">
                  <div className="relative mb-2">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
                    />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t('guide.search')}
                      aria-label={t('guide.search')}
                      className={cn(control({ size: 'sm' }), 'w-full pl-8 pr-2')}
                    />
                  </div>
                  {sections.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-fg-subtle">{t('guide.noMatch')}</p>
                  ) : (
                    sections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActiveId(s.id)}
                        className={cn(
                          'rounded-inner px-3 py-2 text-left text-[13px] transition-colors',
                          s.id === activeId
                            ? 'bg-brand-soft font-semibold text-brand-strong'
                            : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                        )}
                      >
                        {tk(s.titleKey)}
                      </button>
                    ))
                  )}
                </nav>

                <div ref={bodyRef} className="scroll-thin min-w-0 flex-1 overflow-y-auto px-5 py-4">
                  {/* Tor ekranda yon ro'yxat o'rniga tanlagich */}
                  <Select
                    value={activeId}
                    onChange={(e) => setActiveId(e.target.value)}
                    aria-label={t('guide.section')}
                    options={GUIDE.map((s) => ({ value: s.id, label: tk(s.titleKey) }))}
                    wrapperClassName="mb-4 md:hidden"
                  />

                  <h3 className="text-lg font-semibold text-fg">{tk(active.titleKey)}</h3>
                  {active.blocks.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Block({ block }: { block: GuideBlock }) {
  const tk = useDynamicT()

  if (block.t === 'h') {
    return <h4 className="mb-1.5 mt-4 text-[13px] font-bold text-brand-strong">{tk(block.k)}</h4>
  }
  if (block.t === 'list') {
    return (
      <ul className="my-2 flex list-disc flex-col gap-1.5 pl-5">
        {block.items.map((k, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-fg-muted">
            {tk(k)}
          </li>
        ))}
      </ul>
    )
  }
  if (block.t === 'warn') {
    return (
      <div className="my-2.5 flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft p-2.5 text-xs leading-relaxed text-fg">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
        <span>{tk(block.k)}</span>
      </div>
    )
  }
  if (block.t === 'note') {
    return (
      <div className="my-2.5 flex items-start gap-2 rounded-inner border border-line bg-surface-2 p-2.5 text-xs leading-relaxed text-fg-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
        <span>{tk(block.k)}</span>
      </div>
    )
  }
  return <p className="my-2 text-[13px] leading-relaxed text-fg-muted">{tk(block.k)}</p>
}
