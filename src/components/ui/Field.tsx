import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ERROR_CLS, HINT_CLS, LABEL_CLS } from './control'

interface FieldProps {
  label?: ReactNode
  /** Adds the red asterisk. Purely visual — validation stays in the form. */
  required?: boolean
  /** Helper text under the control. Hidden while an error is showing. */
  hint?: ReactNode
  /** Validation message; also what makes the control render its invalid state. */
  error?: ReactNode
  /** Span both columns of a two-column form grid. */
  wide?: boolean
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint/error, the one wrapper every form field uses.
 *
 * Before this, five files each declared their own private `Field` and about
 * forty call sites hand-wrote `<label><span className="mb-1.5 block text-sm
 * …">`, so a label tweak meant editing forty places. Everything routes here now.
 *
 * Rendered as a <div>, not a <label> WRAPPER: several controls (Combobox,
 * DateInput, RowList) are composites whose clickable part is a button, and
 * wrapping those in a <label> makes a click toggle the wrong element.
 *
 * ⚠️ It is still a real <label htmlFor>. Until 2026-09-07 the label was a bare
 * <span> with no association at all, so a screen reader announced almost every
 * field in the product as unlabelled — "edit text", forty times down a form.
 * The id is generated here and pushed onto the child control, which is why the
 * controls forward their props (Combobox takes an explicit `id`).
 */
export function Field({ label, required, hint, error, wide, className, children }: FieldProps) {
  const autoId = useId()
  // The FIRST element child is the control the label names; anything after
  // it (a «number taken» hint, a helper row) is decoration. Until 2026-09-22
  // only a single child was wired, so «Buyruq raqami» + NumberTakenHint left
  // the input without a label — nameless to a screen reader, and a click on
  // the caption focused nothing.
  const kids = Children.toArray(children)
  const firstIdx = kids.findIndex((k) => isValidElement(k))
  const first = firstIdx >= 0 ? (kids[firstIdx] as ReactElement<{ id?: string }>) : null
  const controlId = first ? (first.props.id ?? autoId) : undefined
  const child =
    first && !first.props.id
      ? kids.map((k, i) => (i === firstIdx ? cloneElement(first, { id: autoId }) : k))
      : children

  return (
    // A Combobox trigger is a <button>, and buttons shrink to their content
    // even as display:flex — inside a form field it must span the column like
    // the Input/Select next to it (Millati/Oilaviy holati were 100px stubs).
    // Scoped to direct children so filter bars keep their own widths.
    <div className={cn(wide && 'sm:col-span-2', '[&>button[aria-haspopup=listbox]]:w-full', className)}>
      {label && (
        <label htmlFor={controlId} className={LABEL_CLS}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {child}
      {error ? <p className={ERROR_CLS}>{error}</p> : hint ? <p className={HINT_CLS}>{hint}</p> : null}
    </div>
  )
}
