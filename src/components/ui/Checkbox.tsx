import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type MutableRefObject } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Partially-selected state (a "select all" that only covers some rows). */
  indeterminate?: boolean
  /** Visible text rendered next to the box (and used as its accessible name). */
  label?: string
  /** Accessible name with NO visible text — for boxes whose meaning is already
   *  clear from context (a table's select-all / per-row checkbox). */
  srLabel?: string
  /** The box sits inside the caller's own <label> (rich label text: a hint
   *  line, an icon). Renders the box without its own <label>. */
  inLabel?: boolean
}

/** Checkbox built on a real <input type="checkbox"> — keyboard, form and AT
 *  behaviour come for free; the visible box is painted on top. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate = false, label, srLabel, inLabel = false, className, checked, ...props },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = inner.current
    if (el) el.indeterminate = indeterminate
  }, [indeterminate])

  // Ko'rinadigan yorliqsiz katakcha (jadval qatoridagi tanlash) O'ZI <label>
  // bo'ladi: shunda `tap-expand` bilan kengaytirilgan bosish maydoni ham
  // katakchani belgilaydi. Yorliq bo'lsa — tashqi <label> bor, ichkariga
  // yana <label> qo'yish HTML qoidasiga zid.
  const Box = label || inLabel ? 'span' : 'label'
  const box = (
    <Box
      className={cn(
        'relative inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center',
        // Sensorli qurilmada bosish maydoni kengayadi (global.css), katakchaning
        // O'ZI kattalashmaydi — jadval zichligi buzilmaydi.
        !label && 'tap-expand',
        // With a visible label the wrapper <label> carries the layout classes.
        !label && className,
      )}
    >
      {/* `rounded-[6px]`, not `rounded-sm`: the shape ladder (theme.css) starts
          at 10px, which on a 20px box is a CIRCLE — every checkbox read as a
          radio button, and in the task list it was indistinguishable from the
          round «done» toggle beside it (2026-09-24). The ladder governs
          containers; this is a glyph, soft but unmistakably square. */}
      <input
        ref={(node) => {
          inner.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = node
        }}
        type="checkbox"
        checked={checked}
        aria-label={label ?? srLabel}
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-surface transition-colors checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
        {...props}
      />
      <span className="pointer-events-none relative text-fg-on-brand opacity-0 transition-opacity peer-checked:opacity-100 peer-indeterminate:opacity-100">
        {indeterminate ? <Minus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}
      </span>
    </Box>
  )

  // A `label` used to be exposed only through aria-label, which left sighted
  // users staring at unlabelled boxes in every multi-select list. Render it.
  if (!label) return box

  return (
    // `flex w-fit`, not inline-flex: two labelled boxes in a block (LMS
    // «Integratsiya yoqilgan» + «Avtomatik sinxronizatsiya») ran together on
    // one line with no gap. In a flex row it is a flex item either way.
    <label className={cn('flex w-fit cursor-pointer items-center gap-2', className)}>
      {box}
      <span className="text-sm text-fg">{label}</span>
    </label>
  )
})
