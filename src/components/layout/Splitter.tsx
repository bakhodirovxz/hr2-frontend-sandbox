import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  /** 'vertical' — a vertical bar that resizes WIDTH; 'horizontal' resizes HEIGHT. */
  orientation: 'vertical' | 'horizontal'
  /** Current size of the panel being resized, px. */
  value: number
  onChange: (next: number) => void
  /** Double-click / Home key restores the designed size. */
  onReset?: () => void
  min: number
  max: number
  /** Dragging right/down GROWS the panel by default; invert when the handle sits
   *  after the panel it controls. */
  invert?: boolean
  label: string
  className?: string
}

/**
 * DRAG HANDLE BETWEEN TWO PANELS — the spreadsheet gesture, on a board.
 *
 * Pointer capture rather than window listeners: the drag keeps following the
 * cursor when it leaves the handle, and it ends even if the pointer is released
 * over an iframe or outside the window.
 *
 * Keyboard is not an afterthought here — a splitter that only responds to a
 * mouse locks the layout for anyone who cannot use one. Arrows nudge by 16px,
 * Shift+arrows by 64, Home restores the default.
 */
export function Splitter({
  orientation,
  value,
  onChange,
  onReset,
  min,
  max,
  invert,
  label,
  className,
}: Props) {
  const vertical = orientation === 'vertical'
  const [dragging, setDragging] = useState(false)
  const start = useRef({ pos: 0, size: 0 })

  const apply = useCallback(
    (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next)))),
    [max, min, onChange],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { pos: vertical ? e.clientX : e.clientY, size: value }
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const delta = (vertical ? e.clientX : e.clientY) - start.current.pos
    apply(start.current.size + (invert ? -delta : delta))
  }

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    setDragging(false)
  }

  // While dragging, the whole document must stop selecting text and must show
  // the resize cursor — otherwise a fast drag selects half the board.
  useEffect(() => {
    if (!dragging) return
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging, vertical])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    const dec = vertical ? 'ArrowLeft' : 'ArrowUp'
    const inc = vertical ? 'ArrowRight' : 'ArrowDown'
    if (e.key === dec || e.key === inc) {
      e.preventDefault()
      const d = e.key === inc ? step : -step
      apply(value + (invert ? -d : d))
    } else if (e.key === 'Home' && onReset) {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative shrink-0 touch-none outline-none',
        // The hit area is deliberately wider than the line it draws: a 1px
        // target is a fair-weather control.
        vertical ? 'w-2 cursor-col-resize self-stretch' : 'h-2 cursor-row-resize',
        'focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute rounded-pill bg-line transition-colors',
          vertical ? 'inset-y-2 left-1/2 w-px -translate-x-1/2' : 'inset-x-2 top-1/2 h-px -translate-y-1/2',
          'group-hover:bg-brand group-focus-visible:bg-brand',
          dragging && 'bg-brand',
        )}
      />
      {/* The grip only appears on approach, so the board stays quiet at rest. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-brand opacity-0 transition-opacity',
          vertical ? 'h-8 w-1' : 'h-1 w-8',
          'group-hover:opacity-100 group-focus-visible:opacity-100',
          dragging && 'opacity-100',
        )}
      />
    </div>
  )
}
