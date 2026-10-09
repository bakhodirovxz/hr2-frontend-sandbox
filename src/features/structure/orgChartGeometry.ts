import type { Handle } from './useHierarchy'

interface Point {
  x: number
  y: number
}

export interface Box extends Point {
  w: number
  h: number
}

/** Where an edge touches a card, per side. */
function anchor(b: Box, h: Handle): Point {
  switch (h) {
    case 'top':
      return { x: b.x + b.w / 2, y: b.y }
    case 'bottom':
      return { x: b.x + b.w / 2, y: b.y + b.h }
    case 'left':
      return { x: b.x, y: b.y + b.h / 2 }
    case 'right':
      return { x: b.x + b.w, y: b.y + b.h / 2 }
  }
}

/** Unit vector pointing AWAY from the card, so an edge leaves perpendicular. */
function outDir(h: Handle): Point {
  switch (h) {
    case 'top':
      return { x: 0, y: -1 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    case 'right':
      return { x: 1, y: 0 }
  }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** A point `d` px from `from` along the segment towards `to`. */
function towards(from: Point, to: Point, d: number): Point {
  const len = dist(from, to) || 1
  const t = Math.min(d, len) / len
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/**
 * Orthogonal polyline with rounded corners.
 *
 * The corner is a quadratic whose control point is the corner itself, and the
 * radius is clamped to half of the SHORTER of the two adjacent segments —
 * without that clamp a tight elbow (two cards almost touching) overshoots and
 * the line visibly doubles back on itself.
 */
function roundedPolyline(points: Point[], r = 14): string {
  const p = points.filter(
    (q, i) => i === 0 || Math.abs(q.x - points[i - 1].x) > 0.5 || Math.abs(q.y - points[i - 1].y) > 0.5,
  )
  if (p.length < 2) return ''
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1]
    const cur = p[i]
    const next = p[i + 1]
    const radius = Math.min(r, dist(prev, cur) / 2, dist(cur, next) / 2)
    const a = towards(cur, prev, radius)
    const b = towards(cur, next, radius)
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`
  }
  const last = p[p.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** How far an edge runs straight out of a card before it may turn. */
const STANDOFF = 26

/** Path from one card's handle to another's, routed at right angles. */
export function edgePath(s: Box, sh: Handle, t: Box, th: Handle): string {
  const from = anchor(s, sh)
  const to = anchor(t, th)
  const ds = outDir(sh)
  const dt = outDir(th)
  const s1 = { x: from.x + ds.x * STANDOFF, y: from.y + ds.y * STANDOFF }
  const t1 = { x: to.x + dt.x * STANDOFF, y: to.y + dt.y * STANDOFF }
  const sVertical = sh === 'top' || sh === 'bottom'
  const tVertical = th === 'top' || th === 'bottom'

  let middle: Point[]
  if (sVertical && tVertical) {
    const my = (s1.y + t1.y) / 2
    middle = [
      { x: s1.x, y: my },
      { x: t1.x, y: my },
    ]
  } else if (!sVertical && !tVertical) {
    const mx = (s1.x + t1.x) / 2
    middle = [
      { x: mx, y: s1.y },
      { x: mx, y: t1.y },
    ]
  } else if (sVertical) {
    middle = [{ x: s1.x, y: t1.y }]
  } else {
    middle = [{ x: t1.x, y: s1.y }]
  }

  return roundedPolyline([from, s1, ...middle, t1, to])
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Rectangle enclosing every card, padded so edges never touch the SVG edge. */
export function boundsOf(boxes: Box[], pad = 320): Bounds {
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: pad, maxY: pad }
  const minX = Math.min(...boxes.map((b) => b.x)) - pad
  const minY = Math.min(...boxes.map((b) => b.y)) - pad
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + pad
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + pad
  return { minX, minY, maxX, maxY }
}

export interface View {
  x: number
  y: number
  k: number
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2

export function clampZoom(k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k))
}

/** Scale and offset that centre every card inside a viewport of `w`×`h`. */
export function fitView(boxes: Box[], w: number, h: number, pad = 56): View {
  if (boxes.length === 0 || w <= 0 || h <= 0) return { x: 0, y: 0, k: 1 }
  const b = boundsOf(boxes, 0)
  const cw = Math.max(1, b.maxX - b.minX)
  const ch = Math.max(1, b.maxY - b.minY)
  // Never magnify past 1: a lone card blown up to fill the canvas looks broken.
  const k = clampZoom(Math.min((w - pad * 2) / cw, (h - pad * 2) / ch, 1))
  return {
    k,
    x: (w - cw * k) / 2 - b.minX * k,
    y: (h - ch * k) / 2 - b.minY * k,
  }
}
