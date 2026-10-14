import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Panel, SquareButton, type PanelWash } from './Panel'
import { ToneTile } from './boardDrill'

export interface CarouselSlide {
  key: string
  /** Shown as the panel's title while this slide is the visible one. */
  title: string
  content: ReactNode
  /** Drawn on the gradient tile beside the title (B board). */
  icon?: LucideIcon
}

interface CarouselPanelProps {
  /** @deprecated — the B head shows the slide icon instead; kept for callers. */
  eyebrow?: string
  slides: CarouselSlide[]
  /** Seconds between automatic turns. 0 disables the rotation entirely. */
  intervalSec?: number
  /** Staggered start, so three windows on one row never turn in lockstep. */
  offsetSec?: number
  wash?: PanelWash
  className?: string
}

/**
 * A WINDOW that turns.
 *
 * The dashboards carry more blocks than a screen has room for, and the design's
 * answer is not a scrollbar — it is a window that shows one face at a time and
 * turns on its own. Three rules keep that from becoming a slideshow nobody can
 * read:
 *
 *   · it stops the moment you point at it or tab into it, and resumes when you
 *     leave — a panel must never move out from under a click;
 *   · the arrows and the dots are real controls, so nothing here is reachable
 *     only by waiting;
 *   · "reduce motion" turns the rotation OFF and the slide transition with it.
 *     The window still works; it just waits to be told.
 */
export function CarouselPanel({
  slides,
  intervalSec = 8,
  offsetSec = 0,
  wash = 'violet',
  className,
}: CarouselPanelProps) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length

  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // A slide can disappear when its data does (an empty news list drops the
  // news face), so the index must be clamped rather than left dangling.
  useEffect(() => {
    setIdx((i) => (count === 0 ? 0 : Math.min(i, count - 1)))
  }, [count])

  const timer = useRef(0)
  useEffect(() => {
    if (reduced || paused || intervalSec <= 0 || count < 2) return
    timer.current = -offsetSec
    const id = setInterval(() => {
      timer.current += 1
      if (timer.current >= intervalSec) {
        timer.current = 0
        setIdx((i) => (i + 1) % count)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [reduced, paused, intervalSec, offsetSec, count])

  const go = useCallback(
    (next: number) => {
      timer.current = 0
      setIdx(((next % count) + count) % count)
    },
    [count],
  )

  if (count === 0) return null
  const active = slides[Math.min(idx, count - 1)]

  return (
    <Panel
      wash={wash}
      className={className}
      label={active.title}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* B board head: the slide's own icon + title, the dots and the arrows on
          one line. The old eyebrow printed the same «BO'LIM» on all three
          windows and said nothing. */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3.5 [container-type:inline-size]">
        <h2 className="m-0 flex min-w-0 items-center gap-2.5 text-[15px] font-bold text-fg">
          {active.icon && <ToneTile icon={active.icon} size={30} />}
          <span className="line-clamp-2 min-w-0 hyphens-auto leading-tight" title={active.title}>{active.title}</span>
        </h2>
        {count > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* The dots repeat what the arrows do: on a narrow panel they gave way to a
                clipped Russian title («опаздываю…»). */}
            <div className="mr-1 flex gap-1 [@container(max-width:340px)]:hidden">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={s.title}
                  aria-current={i === idx}
                  className={cn(
                    'h-[7px] rounded-pill transition-all',
                    i === idx
                      ? 'w-5 bg-gradient-to-r from-[#0A70C2] to-[#2FC96B]'
                      : 'w-[7px] bg-fg/[0.16] hover:bg-fg/[0.3]',
                  )}
                />
              ))}
            </div>
            <SquareButton label={t('common.prev')} onClick={() => go(idx - 1)}>
              <ChevronLeft size={14} />
            </SquareButton>
            <SquareButton label={t('common.next')} onClick={() => go(idx + 1)}>
              <ChevronRight size={14} />
            </SquareButton>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className={cn('flex h-full', !reduced && 'transition-transform duration-[550ms]')}
          style={{
            transform: `translateX(-${idx * 100}%)`,
            transitionTimingFunction: 'cubic-bezier(0.25,0.8,0.35,1)',
          }}
        >
          {slides.map((s, i) => (
            <div
              key={s.key}
              // Off-screen faces stay mounted so the turn can animate, so they
              // must be hidden from the tab order and the a11y tree.
              aria-hidden={i !== idx}
              {...(i !== idx ? { inert: '' } : {})}
              className="flex min-w-full flex-[0_0_100%] flex-col overflow-hidden"
            >
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
