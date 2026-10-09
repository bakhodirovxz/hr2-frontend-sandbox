import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { CONTROL_PAD, control } from './control'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/**
 * Multi-line control. Replaces the `const textareaCls = '…'` string that had
 * been copy-pasted into eleven files — same chrome as every other control,
 * from the same definition.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(control({ invalid, auto: true }), CONTROL_PAD.plain, 'w-full py-2', className)}
      {...props}
    />
  )
})
