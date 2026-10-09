import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CONTROL_PAD, control } from './control'

export interface SelectOption {
  value: string
  label: string
  /**
   * Second line under the label — a person's position, a department's branch.
   * Rendered as its own muted line by <Combobox>; a native <select> can only
   * hold text, so it gets it appended after an em dash.
   */
  subLabel?: string
  /**
   * Avatar shown beside the label in <Combobox>. Set it (even to null) to get
   * the picture-and-initials treatment; OMIT it entirely for plain options, or
   * every branch and department in the app grows an empty circle.
   */
  photo?: string | null
  /** Tried when `photo` 404s — the full-size image behind a missing thumbnail. */
  photoFallback?: string | null
  /**
   * Shown but NOT selectable — a vehicle already on another trip, a driver who
   * has not passed today's medical check. The reason belongs in `subLabel`:
   * hiding the row would leave the user wondering where the car went, and
   * letting them pick it only moves the refusal to a 400 after submit.
   */
  disabled?: boolean
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  placeholder?: string
  invalid?: boolean
  wrapperClassName?: string
}

/** Styled native <select>. For long lists use <Combobox> (searchable) instead. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, invalid, wrapperClassName, ...props },
  ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        // A filter select outside a <Field> has no label of its own; the
        // placeholder («Barcha qurilmalar») is the name a screen reader should
        // announce, otherwise it is just "combobox" (audit 2026-09-19).
        aria-label={props['aria-label'] ?? (props['aria-labelledby'] || props.id ? undefined : placeholder)}
        aria-invalid={invalid || undefined}
        className={cn(control({ invalid }), CONTROL_PAD.trailingIcon, 'w-full appearance-none', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {/* `disabled` was declared on SelectOption and honoured by Combobox
            but silently ignored here — a "vehicle already on a trip" or a
            KPI transition without a grant stayed pickable (2026-09-11). */}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled || undefined}>
            {o.subLabel ? `${o.label} — ${o.subLabel}` : o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  )
})
