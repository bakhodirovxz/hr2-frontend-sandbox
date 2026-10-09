/* Report parameters ⇄ URL search params.
 *
 * Scalars are stored as-is; lists as csv; range objects as two keys
 * (`period_from`/`period_to`). Only keys declared by the report are read, so a
 * stale URL from another report cannot smuggle values in. */

import type { ParamDef, ReportParams } from './types'

export function paramsToSearch(defs: ParamDef[], params: ReportParams, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base)
  for (const d of defs) {
    const v = params[d.name]
    if (d.kind === 'date_range' || d.kind === 'time_range') {
      const r = (v ?? {}) as { from?: string; to?: string }
      r.from ? sp.set(`${d.name}_from`, String(r.from)) : sp.delete(`${d.name}_from`)
      r.to ? sp.set(`${d.name}_to`, String(r.to)) : sp.delete(`${d.name}_to`)
      continue
    }
    if (Array.isArray(v)) {
      v.length ? sp.set(d.name, v.map(String).join(',')) : sp.delete(d.name)
      continue
    }
    if (v === undefined || v === null || v === '' || v === false) sp.delete(d.name)
    else sp.set(d.name, String(v))
  }
  return sp
}

export function searchToParams(defs: ParamDef[], sp: URLSearchParams): ReportParams {
  const out: ReportParams = {}
  for (const d of defs) {
    if (d.kind === 'date_range' || d.kind === 'time_range') {
      const from = sp.get(`${d.name}_from`)
      const to = sp.get(`${d.name}_to`)
      if (from || to) out[d.name] = { from: from ?? '', to: to ?? '' }
      continue
    }
    const raw = sp.get(d.name)
    if (raw == null || raw === '') continue
    const isList = ['branch_multi', 'division_tree', 'job_multi', 'employee_multi'].includes(d.kind)
      || (d.kind === 'enum' && d.multiple)
    if (isList) {
      const parts = raw.split(',').filter(Boolean)
      out[d.name] = d.kind === 'enum' ? parts : parts.map((x) => Number(x)).filter((n) => !Number.isNaN(n))
    } else if (d.kind === 'bool') out[d.name] = raw === 'true' || raw === '1'
    else if (d.kind === 'int') out[d.name] = Number(raw)
    else out[d.name] = raw  // month / date / text / enum
  }
  return out
}

/** Definition defaults resolved on the client (mirrors `base.resolve_default`). */
export function defaultParams(defs: ParamDef[]): ReportParams {
  const today = new Date()
  // Local calendar date — `toISOString()` is UTC and would shift a Tashkent
  // midnight to the previous day (31.08 for a 1 September default).
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const out: ReportParams = {}
  for (const d of defs) {
    if (d.default === 'current_month') {
      out[d.name] = d.kind === 'date_range' ? { from: iso(first), to: iso(last) } : iso(first).slice(0, 7)
    } else if (d.default === 'today') out[d.name] = iso(today)
    else if (d.default === 'previous_month') {
      const p = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      out[d.name] = iso(p).slice(0, 7)
    } else if (d.default === 'twelve_months_ago') {
      // With a current-month end this frames the last twelve months.
      const p = new Date(today.getFullYear(), today.getMonth() - 11, 1)
      out[d.name] = iso(p).slice(0, 7)
    } else if (d.default != null) out[d.name] = d.default
  }
  return out
}
