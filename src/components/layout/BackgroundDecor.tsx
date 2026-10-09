import { useTheme } from '@/theme/ThemeProvider'

/**
 * BackgroundDecor — the ground behind the product.
 *
 * NOCTURNE world (2026-08-25). The ground itself — the five wide washes of
 * teal, green, violet and indigo — is painted by `.app-bg` in global.css off
 * the tokens. What lives here is the SCENERY the dashboard designs put on top
 * of it, and only the parts that carry meaning:
 *
 *   · three long wave lines breaking across the bottom — the company is a
 *     hydro-power operator, and this is the only place the product says so;
 *   · a shallow arc falling in from the top-right, so the corner the header
 *     leaves empty is not dead space;
 *   · four coloured points at the lamp hues (violet, amber, green, cyan) —
 *     the palette's own legend, scattered;
 *
 *   · `panel` — the RULED REGISTER behind the login form: the faint horizontal
 *     ruling of the guard's log book, every fifth line heavier.
 *
 * All of it is inert: `aria-hidden`, `pointer-events: none`, behind the
 * content's stacking context. Cards are opaque, so it only shows in the gaps.
 */
export function BackgroundDecor({ variant = 'app' }: { variant?: 'app' | 'panel' }) {
  const { theme } = useTheme()

  if (variant === 'panel') {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden"
        style={{
          backgroundImage: [
            // every 5th rule, heavier — the register's block markers
            'repeating-linear-gradient(180deg, rgb(var(--border-strong) / 0.42) 0 1px, transparent 1px 140px)',
            // the ruling itself
            'repeating-linear-gradient(180deg, rgb(var(--border) / 0.55) 0 1px, transparent 1px 28px)',
          ].join(','),
          // The ruling belongs to the top of the sheet and runs out of ink.
          maskImage: 'linear-gradient(180deg, rgb(0 0 0 / 0.9), transparent 78%)',
          WebkitMaskImage: 'linear-gradient(180deg, rgb(0 0 0 / 0.9), transparent 78%)',
        }}
      />
    )
  }

  // The scenery is drawn for the night ground. Light is still the PROPUSK
  // rendition (a lit office next to paper) and wants nothing behind it.
  if (theme !== 'dark') return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden">
      {/* Water breaking across the bottom of the desk. */}
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 block h-[300px] w-full"
      >
        <path
          d="M0 210 C 180 150, 340 260, 540 205 S 900 130, 1100 195 S 1380 250, 1440 200"
          fill="none"
          stroke="rgb(var(--info) / 0.10)"
          strokeWidth="1.5"
        />
        <path
          d="M0 255 C 200 200, 380 300, 600 250 S 960 180, 1160 240 S 1400 290, 1440 250"
          fill="none"
          stroke="rgb(var(--info) / 0.07)"
          strokeWidth="1.5"
        />
        <path
          d="M0 300 C 220 255, 420 340, 660 295 S 1020 235, 1240 285 S 1420 320, 1440 300"
          fill="none"
          stroke="rgb(var(--brand) / 0.08)"
          strokeWidth="1.5"
        />
      </svg>

      {/* The arc falling into the top-right corner. */}
      <svg viewBox="0 0 600 200" className="absolute right-0 top-10 block h-[190px] w-[560px]">
        <path
          d="M600 30 C 480 60, 420 140, 300 150 S 80 120, 0 170"
          fill="none"
          stroke="rgb(var(--info) / 0.12)"
          strokeWidth="1.5"
        />
        <path
          d="M600 70 C 500 95, 440 170, 320 178"
          fill="none"
          stroke="rgb(var(--success) / 0.10)"
          strokeWidth="1.5"
        />
      </svg>

      <span className="absolute left-[46%] top-[90px] h-2 w-2 rounded-pill bg-brand opacity-90" />
      <span className="absolute right-[38px] top-[200px] h-[7px] w-[7px] rounded-pill bg-accent opacity-85" />
      <span className="absolute bottom-[150px] left-[30%] h-1.5 w-1.5 rounded-pill bg-success opacity-85" />
      <span className="absolute left-3 top-[55%] h-1.5 w-1.5 rounded-pill bg-danger opacity-70" />
      <span className="absolute bottom-[60px] right-[26%] h-[9px] w-[9px] rounded-pill bg-info opacity-60" />
    </div>
  )
}
