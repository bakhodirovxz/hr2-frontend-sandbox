import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 className={cn('animate-spin text-brand', className)} size={size} />
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-fg-muted">
      <Spinner size={26} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}
