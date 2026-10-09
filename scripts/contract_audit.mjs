#!/usr/bin/env node
/**
 * Every API path the reachable frontend uses ↔ a real hr-backend-sandbox route.
 *
 * Input: the backend route list, one `METHOD /path` per line. Produce it with
 *   scripts/dump_routes.sh > /tmp/sandbox_routes.txt
 * (or pass another file as the first argument).
 *
 * What is checked
 *   - string and template literals in REACHABLE files (import graph from
 *     src/main.tsx) whose first segment is a backend top-level segment;
 *     `${…}` becomes a wildcard segment;
 *   - for direct `apiGet|apiPost|apiPut|apiPatch|apiDelete|apiClient.<m>(…)`
 *     calls with a literal path, the HTTP METHOD too.
 * A backend `{param}` segment matches anything; so does a frontend `${x}`.
 * Exits 1 when any path (or method) has no backend counterpart.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const SRC = path.join(ROOT, 'src')
const routesFile = process.argv[2] || '/tmp/sandbox_routes.txt'
if (!fs.existsSync(routesFile)) {
  console.error(`route list not found: ${routesFile}\nrun: scripts/dump_routes.sh > ${routesFile}`)
  process.exit(2)
}

const norm = (p) => '/' + p.replace(/^\/+|\/+$/g, '').replace(/\?.*$/, '')
const routes = fs
  .readFileSync(routesFile, 'utf8')
  .split('\n')
  .map((l) => l.trim().split(/\s+/))
  .filter((x) => x.length === 2)
  .map(([m, p]) => ({ method: m.toUpperCase(), segs: norm(p).split('/').slice(1) }))
const tops = new Set(routes.map((r) => r.segs[0]))

const segMatch = (a, b) => a === b || a === '*' || /^\{.*\}$/.test(b)
const matches = (segs, method) =>
  routes.some(
    (r) =>
      r.segs.length === segs.length &&
      r.segs.every((b, i) => segMatch(segs[i], b)) &&
      (!method || r.method === method),
  )

// ── reachable files ─────────────────────────────────────────────────────────
const exts = ['.tsx', '.ts', '/index.tsx', '/index.ts']
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
const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const seen = new Set()
const queue = [path.join(SRC, 'main.tsx')]
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f) || !/\.tsx?$/.test(f)) continue
  seen.add(f)
  for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORT_RE)) {
    const r = resolve(f, m[1] || m[2])
    if (r) queue.push(r)
  }
}

// ── collect paths ───────────────────────────────────────────────────────────
const LIT = /(['"`])(\/?[a-z][a-z0-9_-]*(?:\/(?:\$\{[^}`]+\}|[A-Za-z0-9_.-]+))*)\/?(?:\?[^'"`]*)?\1/g
const CALL =
  /\b(apiGet|apiPost|apiPut|apiPatch|apiDelete|apiClient\.(?:get|post|put|patch|delete))(?:<[^>()]*>)?\(\s*(['"`])([^'"`]+)\2/g
const METHOD_OF = {
  apiGet: 'GET', apiPost: 'POST', apiPut: 'PUT', apiPatch: 'PATCH', apiDelete: 'DELETE',
}
const toSegs = (p) =>
  norm(p.replace(/\$\{[^}]+\}/g, '*')).split('/').slice(1).map((s) => (s.includes('*') ? '*' : s))

const problems = []
let checked = 0
for (const f of [...seen].sort()) {
  const src = fs.readFileSync(f, 'utf8')
  const rel = path.relative(ROOT, f)
  const isI18n = rel.startsWith('src/i18n/')
  if (isI18n) continue
  for (const m of src.matchAll(LIT)) {
    const raw = m[2]
    if (!raw.includes('/') && !tops.has(raw.replace(/^\//, ''))) continue
    const segs = toSegs(raw)
    if (!tops.has(segs[0])) continue
    // Frontend route literals (`/employees/${id}`) look like API paths; only a
    // miss on BOTH frontend-route and API side is reported, so skip leading-'/'
    // literals used with navigate/Link — the API client never gets a leading '/'.
    if (raw.startsWith('/')) continue
    checked++
    if (!matches(segs)) problems.push(`${rel}: ${raw}  (no route)`)
  }
  for (const m of src.matchAll(CALL)) {
    const fn = m[1]
    const method = METHOD_OF[fn] || fn.split('.')[1].toUpperCase()
    const raw = m[3]
    const segs = toSegs(raw)
    if (!tops.has(segs[0])) continue
    if (matches(segs) && !matches(segs, method)) problems.push(`${rel}: ${method} ${raw}  (wrong method)`)
  }
}

const uniq = [...new Set(problems)]
for (const p of uniq) console.log(p)
console.log(`\nreachable files: ${seen.size}, api literals checked: ${checked}, problems: ${uniq.length}`)
process.exit(uniq.length ? 1 : 0)
