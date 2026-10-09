import { useEffect, useMemo, useState, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { useInViewOnce } from '@/components/DeferUntilVisible'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

interface AvatarProps {
  /** Primary image (usually the small thumbnail). */
  src?: string | null
  /** Tried when `src` fails — e.g. the full-size photo when the thumb 404s
   *  (thumbnails may not exist for every employee). */
  fallbackSrc?: string | null
  name?: string | null
  size?: number
  className?: string
  onClick?: () => void
}

function initials(name?: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—'
}

/**
 * Photo with a cascade: src (thumb) → fallbackSrc (full photo) → initials.
 *
 * Round by default. The squared ID-photo silhouette tried in the first PROPUSK
 * rendition made every roster read like a filing cabinet; a caller that wants
 * a card portrait can still pass `rounded-md`.
 */
export function Avatar({ src, fallbackSrc, name, size = 40, className, onClick }: AvatarProps) {
  const lv = useLowVisionScale()
  const sources = useMemo(
    () => [src, fallbackSrc].filter((s, i, arr): s is string => !!s && arr.indexOf(s) === i),
    [src, fallbackSrc],
  )
  const [idx, setIdx] = useState(0)
  useEffect(() => setIdx(0), [sources])
  const current = sources[idx] ?? null
  /**
   * ⚠️ `loading="lazy"` ALONE IS NOT LAZY ENOUGH FOR A ROSTER. Chromium starts
   * a lazy image once it is within ~1250 px of the viewport (more on a slow
   * link), so the employee board — 133 thumbnails in a 900 px window — still
   * fetched 68 of them on open (measured 2026-09-11: 68 requests, 145 KB, for
   * 18 faces actually on screen). The `src` is only attached once the box is
   * within 300 px, which brings that down to what is about to be seen. Not
   * idle-deferred: faces above the fold are first-paint content.
   */
  const [box, near] = useInViewOnce({ rootMargin: '300px', idle: false })

  // Interactive avatars must be real buttons — a clickable <div> is invisible to
  // the keyboard and to assistive tech.
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      ref={box as RefObject<never>}
      {...(onClick
        ? { type: 'button' as const, onClick, 'aria-label': name ?? undefined }
        : {})}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line',
        onClick &&
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      style={{ width: size * lv, height: size * lv }}
    >
      {current && !near ? (
        // Same grey box the <img> shows while its bytes are in flight, so
        // scrolling a face into view never flashes initials before the photo.
        <span aria-hidden className="block h-full w-full" />
      ) : current ? (
        <img
          src={current}
          alt={name ?? ''}
          width={size}
          height={size}
          loading="lazy"
          // MinIO photos are cross-origin. A plain (no-cors) <img> yields an
          // opaque response that Firefox's OpaqueResponseBlocking refuses to
          // render. MinIO reflects the Origin in Access-Control-Allow-Origin, so
          // requesting via CORS makes the response non-opaque and ORB no longer
          // applies — the image renders in every browser.
          crossOrigin="anonymous"
          onError={() => setIdx((i) => i + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center font-semibold text-fg-muted"
          style={{ fontSize: Math.max(11, size * 0.36) }}
        >
          {initials(name)}
        </span>
      )}
    </Tag>
  )
}
