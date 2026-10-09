/**
 * LOW-VISION SCALING AT BUILD TIME — «shrift kattalashtirilsa buzilib ketadi»
 * (2026-09-24).
 *
 * The low-vision font step sets `html { font-size: 16px × 1.25 | 1.5 }`. Before
 * this plugin that grew only the rem-based utilities; every `text-[12.5px]`,
 * `h-[76px]`, `w-[260px]` stayed put, so the mode forced a `max(1em, 20px)`
 * floor onto every element — big letters inside boxes of the old size. Tiles
 * clipped their numbers, labels overlapped, names were cut to «Urunov…».
 *
 * What a reader needs is what the browser's own Ctrl + does: everything grows
 * TOGETHER and the page falls back to the layout for a narrower screen. Two
 * steps give exactly that:
 *
 *   1. px → rem in every declaration of OUR stylesheets. At the normal step
 *      1rem = 16px, so nothing changes by a single pixel; at A+/A++ text,
 *      padding and fixed boxes all scale with the root font size.
 *   2. Every width media query is emitted three times, gated on the step:
 *      normal at its own width, A+ at ×1.25, A++ at ×1.5. At 1600px wide with
 *      A++ the page therefore lays out as it would on a 1067px screen (the
 *      tablet composition), instead of cramming the desktop grid.
 *
 * The gates are wrapped in `:where()`, which adds ZERO specificity, so the
 * cascade between utilities is exactly what it was.
 *
 * Third-party CSS (node_modules: maplibre, driver.js) is left alone — its
 * pixel values are tuned against its own JS.
 *
 * ⚠️ `useMediaQuery` (JS) must scale its breakpoints the same way — see
 * `src/hooks/useMediaQuery.ts`. The steps here mirror `LV_FONT_STEPS`.
 */
const STEPS = [
  { id: 'large', scale: 1.25 },
  { id: 'xlarge', scale: 1.5 },
]
const NORMAL = STEPS.map((s) => `:not([data-lv-font='${s.id}'])`).join('')
const PX = /(-?\d*\.?\d+)px\b/g
const WIDTH_FEATURE = /\((?:min|max)-width\s*:\s*[\d.]+px\s*\)/

function toRem(value) {
  return value.replace(PX, (m, n) => {
    const v = Number(n)
    if (v === 0) return '0'
    // Keep hairlines crisp: a 1px border scaling to 1.25px would blur, and a
    // hairline is a line, not content.
    if (Math.abs(v) <= 1) return m
    return `${+(v / 16).toFixed(5)}rem`
  })
}

/** Put the gate on a selector without changing what it targets. */
function gate(selector, cond) {
  const m = selector.match(/^(\s*)(html|:root)(?![\w-])/)
  if (m) return selector.replace(m[0], `${m[1]}${m[2]}:where(${cond})`)
  return `:where(html${cond}) ${selector.trim()}`
}

function gateRules(atRule, cond) {
  atRule.walkRules((rule) => {
    // keyframe steps are not selectors
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
    rule.selectors = rule.selectors.map((s) => gate(s, cond))
  })
}

function scaleQuery(params, scale) {
  return params.replace(/((?:min|max)-width\s*:\s*)([\d.]+)px/g, (_, pre, n) => `${pre}${+(Number(n) * scale).toFixed(2)}px`)
}

export default function lvScale() {
  return {
    postcssPlugin: 'lv-scale',
    Once(root) {
      const file = root.source?.input?.file || ''
      if (file.includes('node_modules')) return

      root.walkDecls((decl) => {
        if (!decl.value.includes('px')) return
        // The root font size itself IS the scale; converting it would be circular.
        if (decl.value.includes('--lv-scale')) return
        decl.value = toRem(decl.value)
      })

      root.walkAtRules('media', (at) => {
        if (!WIDTH_FEATURE.test(at.params) || at.__lvDone) return
        for (const step of [...STEPS].reverse()) {
          const copy = at.clone({ params: scaleQuery(at.params, step.scale) })
          copy.__lvDone = true
          gateRules(copy, `[data-lv-font='${step.id}']`)
          at.after(copy)
        }
        at.__lvDone = true
        gateRules(at, NORMAL)
      })
    },
  }
}
lvScale.postcss = true
