import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { POPOVER_CLS, placePopover } from './control'

interface Props {
  /** Panel qaysi elementga tirkaladi (tugma). */
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  /** Xohlangan kenglik — `POPOVER` dan olinadi; ekran torroq bo'lsa siqiladi. */
  width: number
  /** Taxminiy balandlik: pastda joy bo'lmasa panel yuqoriga ag'dariladi. */
  height?: number
  align?: 'start' | 'end'
  label?: string
  role?: 'menu' | 'listbox' | 'dialog'
  className?: string
  children: ReactNode
}

/**
 * Tugmaga tirkaladigan suzuvchi panel — YAGONA primitiv.
 *
 * ⚠️ NEGA KERAK: ilgari har bir menyu o'z geometriyasini yozardi
 * (`absolute right-0 w-[min(268px,calc(100vw-1.5rem))]`). Bunday panel
 * TIRKALGAN TUGMAGA nisbatan joylashadi, ekranga emas — 320px da sarlavha
 * menyusi chap chetidan 54px tashqarida, filial ro'yxati esa o'ng chetidan
 * chiqib ketardi. Bu yerda joylashuvni `placePopover` hisoblaydi: kenglik
 * ekranga siqiladi, cheti hech qachon tashqarida qolmaydi, pastda joy
 * bo'lmasa panel yuqoriga ag'dariladi.
 *
 * `position: fixed` + portal: `overflow-hidden` li ota element (modal, jadval
 * konteyneri) panelni kesib qo'ymaydi. Tashqi bosish hujjat darajasida
 * kuzatiladi — komponentlar endi o'zining `useClickOutside` ini ulamaydi.
 */
export function AnchoredPanel({
  anchorRef,
  open,
  onClose,
  width,
  height = 320,
  align = 'end',
  label,
  role = 'menu',
  className,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    setRect(placePopover(el.getBoundingClientRect(), width, height, align))
  }, [anchorRef, width, height, align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // ⚠️ To'suvchi FON QO'YILMAYDI. Ekranni qoplaydigan ko'rinmas qatlam
    // tashqaridagi birinchi bosishni YUTIB YUBORARDI: telefonda menyu ochiq
    // turganda boshqa tugmani bosish uchun ikki marta tegish kerak bo'lardi
    // (birinchisi menyuni yopadi, xolos), tugmaning o'zi ham fon ostida
    // qolardi. Buning o'rniga hujjatdagi bosish kuzatiladi va tirkalgan
    // tugma bilan panel ichi hisobga olinmaydi — bosish MO'LJALGA yetadi.
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open, place, onClose, anchorRef])

  if (!open || !rect) return null

  return createPortal(
    <>
      <div
        ref={panelRef}
        role={role}
        aria-label={label}
        data-lv-surface
        className={cn(POPOVER_CLS, 'fixed z-[190] animate-scale-in', className)}
        style={{ left: rect.left, top: rect.top, width: rect.width }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
