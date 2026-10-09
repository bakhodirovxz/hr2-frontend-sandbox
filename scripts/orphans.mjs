#!/usr/bin/env node
/**
 * Files under src/ that nothing reachable imports.
 *
 * Deleting a page leaves its drawers, hooks and modals behind; each is a
 * reviewer's question ("what is this for?"). Walks the import graph from the
 * entry point and prints every source file that is not on it. Exits non-zero
 * when any remain, so the count is enforced, not reported.
 *
 * Usage: node scripts/orphans.mjs [--delete]
 *   --delete  remove the orphans (repeat until 0: removing one can orphan more)
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const SRC = path.join(ROOT, 'src')
const exts = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js']
const resolve = (from, spec) => {
  if (spec.startsWith('@/')) spec = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) spec = path.resolve(path.dirname(from), spec)
  else return null
  for (const e of ['', ...exts]) {
    const p = spec + e
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

const seen = new Set()
const queue = ['src/main.tsx'].map((f) => path.join(ROOT, f)).filter(fs.existsSync)
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f)) continue
  seen.add(f)
  const src = fs.readFileSync(f, 'utf8')
  if (f.endsWith('.css')) {
    for (const m of src.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
      const r = resolve(f, m[1].startsWith('.') ? m[1] : './' + m[1])
      if (r) queue.push(r)
    }
    continue
  }
  if (!/\.(tsx?|jsx?)$/.test(f)) continue
  for (const m of src.matchAll(IMPORT_RE)) {
    const r = resolve(f, m[1] || m[2] || m[3])
    if (r) queue.push(r)
  }
}

const all = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?|css)$/.test(e.name) && !e.name.endsWith('.d.ts')) all.push(p)
  }
}
walk(SRC)

const orphans = all.filter((f) => !seen.has(f))
let bytes = 0
for (const f of orphans) {
  bytes += fs.statSync(f).size
  console.log(path.relative(ROOT, f))
  if (process.argv.includes('--delete')) fs.unlinkSync(f)
}
console.log(
  `\n${orphans.length} orphan file(s), ${(bytes / 1024).toFixed(0)} KB (reachable: ${[...seen].filter((f) => all.includes(f)).length}/${all.length})`,
)
process.exit(orphans.length ? 1 : 0)
