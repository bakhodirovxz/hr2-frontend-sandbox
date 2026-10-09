import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { CONTROL_PAD, control } from './control'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  invalid?: boolean
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leftIcon, rightSlot, invalid, wrapperClassName, ...props },
  ref,
) {
  return (
    // Border/focus live on the WRAPPER so the icon slots sit inside the field;
    // everything about that chrome comes from control().
    <div
      className={cn(
        control({ invalid, focusWithin: true, className: wrapperClassName }),
        CONTROL_PAD.plain,
        'group flex items-center gap-2',
        props.disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {leftIcon && <span className="shrink-0 text-fg-subtle">{leftIcon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle',
          'disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {rightSlot}
    </div>
  )
})
