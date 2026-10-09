import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  /**
   * Let the content manage its own scrolling instead of the modal body.
   * Needed for grids: otherwise the body scrolls vertically and the grid's
   * horizontal scrollbar ends up below the fold, unreachable until you scroll
   * all the way down.
   */
  bodyFill?: boolean
  /**
   * `false` = the dialog cannot be dismissed: no × button, Escape and the
   * backdrop do nothing. For the one case where the person must act before
   * the page may be used again (the mandatory password change) — every other
   * modal stays closable.
   */
  dismissable?: boolean
  /**
   * `right` = a side sheet: full height, slides in from the right edge
   * (v1's drawers — the attendance row opens the person's timesheet there,
   * so the list stays in place behind it). `size` sets its width.
   */
  placement?: 'center' | 'right'
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  /** Spreadsheet-style editors need the width. */
  full: 'max-w-[min(1400px,96vw)]',
} as const

/**
 * Accessible modal dialog: rendered in a portal, focus moves inside and is
 * trapped, Escape and the backdrop close it, the page behind is scroll-locked
 * and focus returns to the trigger on close.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bodyFill = false,
  dismissable = true,
  placement = 'center',
}: ModalProps) {
  const side = placement === 'right'
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  useEscapeKey(onClose, open && dismissable)
  // The element to give focus back to, taken DURING RENDER on the closed→open
  // flip. In the effect it was too late: a field with `autoFocus` inside the
  // dialog has already taken focus by then, so the dialog «restored» focus to
  // its own (now unmounted) input and the keyboard user landed on <body>
  // (Zoom «Yig'ilish ochish»).
  const restoreRef = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) restoreRef.current = document.activeElement as HTMLElement | null
  wasOpen.current = open

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused = restoreRef.current
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

    // Start where typing happens: a field that asked for focus keeps it,
    // otherwise the first form field, otherwise the first control. It used to
    // be the header's «×» — Enter on a fresh dialog closed it.
    // On touch screens a focused field pops the keyboard over half the dialog
    // before the user has read it — there the first control is enough.
    const touch = window.matchMedia?.('(pointer: coarse)').matches
    if (!panel.contains(document.activeElement)) {
      const field = touch ? null : panel.querySelector<HTMLElement>(
        '[autofocus], [data-autofocus], input:not([disabled]):not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea:not([disabled]), select:not([disabled]), button[aria-haspopup=listbox]:not([disabled])',
      )
      ;(field && field.offsetParent !== null ? field : focusables()[0])?.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] flex',
        side ? 'justify-end' : 'items-end justify-center p-0 sm:items-center sm:p-4',
      )}
    >
      {/* `data-lv-backdrop`: kam ko'ruvchilar rejimida bu qatlam shaffof
          bo'ladi — u yerda oyna o'z qalin chegarasi bilan ajralib turadi va
          qorong'i parda faqat orqadagi matnni o'qib bo'lmas qilardi. */}
      <div
        data-lv-backdrop
        className="absolute inset-0 animate-fade-in bg-black/50"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative flex w-full flex-col overflow-hidden border-line bg-elevated shadow-pop',
          side
            ? 'h-full animate-slide-in-right border-l'
            : 'max-h-[92vh] animate-scale-in rounded-t-2xl border sm:rounded-2xl',
          'pb-[env(safe-area-inset-bottom)]',
          // No forced height: a short grid shrinks to its content (scrollbar sits
          // right under the rows), a tall one caps at max-h and scrolls inside.
          SIZES[size],
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-medium tracking-[-0.01em] text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X size={17} />
            </button>
          )}
        </div>

        {children && (
          <div
            className={cn(
              'min-h-0 flex-1',
              bodyFill
                ? 'flex overflow-hidden'
                : 'scroll-thin overflow-y-auto overscroll-contain px-5 py-4',
            )}
          >
            {children}
          </div>
        )}

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
