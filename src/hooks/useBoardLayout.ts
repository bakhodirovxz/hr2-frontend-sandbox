import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

/**
 * PANEL SIZES THE READER CHOSE, kept on this device.
 *
 * The board's proportions are a design decision, but a design decision cannot
 * know that this particular person watches the live register all day and barely
 * glances at the rotating windows. So the dividers can be dragged, and where
 * they were put is remembered.
 *
 * localStorage, not the server, deliberately: this is a per-DEVICE preference
 * like the collapsed sidebar and the low-vision mode — a big wall display and a
 * laptop want different proportions from the same account. Nothing is lost when
 * it is unavailable (a private window, cleared site data); the board simply
 * opens at its designed size.
 */
export interface BoardLayout {
  /** Left register column, px. */
  leftW: number
  /** Stat-tile column beside the demographics panel, px. */
  tilesW: number
  /** Bottom row of rotating windows, px. */
  bottomH: number
}

export const BOARD_DEFAULTS: BoardLayout = { leftW: 320, tilesW: 252, bottomH: 340 }

/** Bounds keep a dragged divider from hiding a panel completely. */
export const BOARD_LIMITS: Record<keyof BoardLayout, [number, number]> = {
  leftW: [240, 620],
  tilesW: [180, 460],
  bottomH: [200, 560],
}

const KEY = 'board_layout_v1'
/** Each board keeps its own sizes: the employee board's columns are not the HR board's. */
const keyFor = (board?: string) => (board ? `${KEY}:${board}` : KEY)

function clamp(k: keyof BoardLayout, v: number): number {
  const [lo, hi] = BOARD_LIMITS[k]
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

function read(board?: string): BoardLayout {
  try {
    const raw = localStorage.getItem(keyFor(board))
    if (!raw) return BOARD_DEFAULTS
    const saved = JSON.parse(raw) as Partial<BoardLayout>
    return {
      leftW: clamp('leftW', Number(saved.leftW) || BOARD_DEFAULTS.leftW),
      tilesW: clamp('tilesW', Number(saved.tilesW) || BOARD_DEFAULTS.tilesW),
      bottomH: clamp('bottomH', Number(saved.bottomH) || BOARD_DEFAULTS.bottomH),
    }
  } catch {
    return BOARD_DEFAULTS
  }
}

export function useBoardLayout(board?: string) {
  const [stored, setLayout] = useState<BoardLayout>(() => read(board))
  // Sizes are STORED at the normal font step and DRAWN multiplied by the
  // low-vision scale: at A++ a 320px column holding 1.5× text must be 480px,
  // or the enlarged content no longer fits the box it was designed for.
  const scale = useLowVisionScale()
  const layout = useMemo<BoardLayout>(
    () => ({ leftW: stored.leftW * scale, tilesW: stored.tilesW * scale, bottomH: stored.bottomH * scale }),
    [stored, scale],
  )
  const limits = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(BOARD_LIMITS).map(([k, [lo, hi]]) => [k, [lo * scale, hi * scale]]),
      ) as Record<keyof BoardLayout, [number, number]>,
    [scale],
  )

  // Written on every change rather than on drag end: a browser closed mid-drag
  // still keeps what the person had settled on.
  useEffect(() => {
    try {
      localStorage.setItem(keyFor(board), JSON.stringify(stored))
    } catch {
      /* storage may be shut; the size still applies for this session */
    }
  }, [stored, board])

  /** `v` is a size ON SCREEN (what the splitter measured). */
  const set = useCallback(
    (k: keyof BoardLayout, v: number) => {
      setLayout((prev) => ({ ...prev, [k]: clamp(k, v / scale) }))
    },
    [scale],
  )

  const resetOne = useCallback((k: keyof BoardLayout) => {
    setLayout((prev) => ({ ...prev, [k]: BOARD_DEFAULTS[k] }))
  }, [])

  const resetAll = useCallback(() => setLayout(BOARD_DEFAULTS), [])

  const isCustom =
    stored.leftW !== BOARD_DEFAULTS.leftW ||
    stored.tilesW !== BOARD_DEFAULTS.tilesW ||
    stored.bottomH !== BOARD_DEFAULTS.bottomH

  return { layout, limits, set, resetOne, resetAll, isCustom }
}
