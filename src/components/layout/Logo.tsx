import { cn } from '@/lib/cn'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

/**
 * The corporate mark — the OFFICIAL UZBEKGIDROENERGO logo file.
 *
 * ⚠️ This used to be a hand-drawn approximation (a bolt on an azure tile).
 * It read as "close enough" next to the real mark but it was not the brand:
 * the real logo is the UG monogram with the green bolt cutting through the
 * G. The asset is the same `public/logo.svg` the v1 product ships, so both
 * applications now show the identical mark.
 *
 * `bare` renders the white version, for placing on an already-coloured
 * surface (the sidebar's brand disc).
 */
export function LogoMark({
  size = 34,
  className,
  bare = false,
}: {
  size?: number
  className?: string
  bare?: boolean
}) {
  const lv = useLowVisionScale()
  // ⚠️ THE FILE IS A LOCKUP, NOT A SQUARE GLYPH (87x51: the UG monogram over
  // the UZBEKGIDROENERGO wordmark). Forcing it into a square box shrank the
  // wordmark into an unreadable smudge, so callers give a HEIGHT and the
  // width follows the artwork's own ratio.
  const ratio = 87 / 51
  return (
    <img
      src={bare ? '/logo-white.svg' : '/logo.svg'}
      alt=""
      aria-hidden
      className={cn('shrink-0 object-contain', className)}
      style={{ height: size * lv, width: Math.round(size * lv * ratio) }}
    />
  )
}
