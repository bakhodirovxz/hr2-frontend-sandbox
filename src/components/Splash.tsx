import { LogoMark } from '@/components/layout/Logo'
import { Spinner } from '@/components/ui/Spinner'

/** Full-screen brand loader shown while the session bootstraps. */
export function Splash() {
  return (
    <div className="grid h-full w-full place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={52} className="animate-pulse" />
        <Spinner />
      </div>
    </div>
  )
}
