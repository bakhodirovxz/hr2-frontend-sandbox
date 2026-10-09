#!/usr/bin/env node
/**
 * Every Uzbek text leaf (uz.core + uz.rest) has a Russian translation in ru.ts
 * (TZ 4.1.7 — the interface is bilingual). Lookup is normalised exactly as in
 * src/i18n/index.ts (apostrophe variants, ellipsis, nbsp, spaces, case).
 *
 * Usage: node scripts/i18n_coverage.mjs [--list]   (exit 1 when any are missing)
 * Leaves that are identical in both languages (codes, "KPI", numbers) count as
 * translated when ru.ts maps them to themselves or they contain no letters.
 */
import { build } from 'esbuild'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const load = async (rel) => {
  const out = await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  })
  const code = out.outputFiles[0].text
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default
}

const normalizeKey = (s) =>
  s.replace(/[‘’ʻʼ`´]/g, "'").replace(/…/g, '...').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

const [core, rest, ru] = await Promise.all([
  load('src/i18n/uz.core.ts'),
  load('src/i18n/uz.rest.ts'),
  load('src/i18n/ru.ts'),
])
const table = new Map(Object.entries(ru).map(([k, v]) => [normalizeKey(k), v]))

const leaves = []
const walk = (node, p) => {
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') leaves.push([`${p}${k}`, v])
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' && leaves.push([`${p}${k}.${i}`, x]))
    else walk(v, `${p}${k}.`)
  }
}
walk({ ...core, ...rest }, '')

const missing = leaves.filter(([, v]) => /[A-Za-z]/.test(v) && !table.has(normalizeKey(v)))
if (process.argv.includes('--list')) for (const [k, v] of missing) console.log(`${k}\t${v}`)
console.log(`uz leaves: ${leaves.length}, without ru: ${missing.length}`)
process.exit(missing.length ? 1 : 0)
