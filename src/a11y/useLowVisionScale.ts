import { useSyncExternalStore } from 'react'
import { lowVisionScale, subscribeLowVision } from './lowVisionStore'

/**
 * The low-vision font scale as a live number (1, 1.25, 1.5).
 *
 * CSS scales by itself (px → rem at build time, `postcss/lvScale.js`), but a
 * size set from JS — a dragged panel width, a breakpoint checked with
 * `matchMedia` — is plain pixels and has to be multiplied here.
 */
export function useLowVisionScale(): number {
  return useSyncExternalStore(subscribeLowVision, () => lowVisionScale(), () => 1)
}
