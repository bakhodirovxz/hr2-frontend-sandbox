import type { PhoneEntry } from './usePhoneDirectory'

/**
 * The phone book's ORDER — ported from v1 (pages/TabelPage.jsx
 * `groupByDepartment`), which the user wants back (2026-09-26):
 *
 *   1. «Rahbariyat» first, always: everyone whose position is the board chair
 *      / a director, or whose department is the leadership one. Inside it by
 *      seniority — chair, first deputy, deputies, advisers, directors.
 *   2. Then the departments in their STRUCTURE order (`department_index`,
 *      the order HR set on the Tuzilma page); no index sorts last, a tie by name.
 *   3. Inside a department: razryad, highest first; then name A–Z.
 *
 * v2 used to sort departments and people alphabetically.
 */

const RAHBARIYAT_DEPT_NAMES = ['rahbariyat', 'бошқарув', 'руководство', 'leadership', 'management']
// Deliberately specific: a bare «o'rinbosar» would also catch
// «Departament boshlig'i o'rinbosari».
const LEADERSHIP_POSITION_KEYWORDS = ['boshqaruv rais', 'бошқарув раис', 'direktor', 'директор']

/** Lower case with every Uzbek apostrophe variant folded to ' . */
const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[‘’`ʼ]/g, "'")

export const isLeadershipPosition = (job?: string | null) => {
  const l = norm(job)
  return !!l && LEADERSHIP_POSITION_KEYWORDS.some((k) => l.includes(k))
}

const isRahbariyatDept = (dept?: string | null) => {
  const l = norm(dept).trim()
  return !!l && RAHBARIYAT_DEPT_NAMES.some((n) => l.includes(n))
}

/** Seniority inside the leadership group (lower = higher). */
export function leadershipRank(job?: string | null): number {
  const l = norm(job)
  if (!l) return 99
  if (l.includes('raisi') && !l.includes("o'rinbosar") && !l.includes('maslahatch')) return 0
  if (l.includes('birinchi') && l.includes("o'rinbosar")) return 1
  if (l.includes("o'rinbosar")) return 2
  if (l.includes('maslahatch')) return 3
  if (l.includes('direktor')) return 4
  return 5
}

const razryad = (e: PhoneEntry) => e.job_position_razryad ?? -1

const byRazryadThenName = (a: PhoneEntry, b: PhoneEntry) =>
  razryad(b) - razryad(a) || (a.legal_name ?? '').localeCompare(b.legal_name ?? '', 'uz')

export interface PhoneGroup {
  /** Department name, or the leadership / «no department» label. */
  dept: string
  leadership: boolean
  rows: PhoneEntry[]
}

export function groupPhoneBook(
  rows: PhoneEntry[],
  labels: { leadership: string; noDepartment: string },
): PhoneGroup[] {
  const LEAD = '\u0000lead'
  const map = new Map<string, PhoneEntry[]>()
  for (const e of rows) {
    const key = isLeadershipPosition(e.job_position_name) || isRahbariyatDept(e.department_name)
      ? LEAD
      : e.department_name || labels.noDepartment
    const list = map.get(key) ?? []
    list.push(e)
    map.set(key, list)
  }
  const indexOf = (list: PhoneEntry[]) =>
    list.find((e) => e.department_index != null)?.department_index ?? Number.MAX_SAFE_INTEGER

  return [...map.entries()]
    .sort(([ak, al], [bk, bl]) => {
      if (ak === LEAD) return -1
      if (bk === LEAD) return 1
      return indexOf(al) - indexOf(bl) || ak.localeCompare(bk, 'uz')
    })
    .map(([key, list]) => ({
      dept: key === LEAD ? labels.leadership : key,
      leadership: key === LEAD,
      rows: key === LEAD
        ? list.sort((a, b) => leadershipRank(a.job_position_name) - leadershipRank(b.job_position_name) || byRazryadThenName(a, b))
        : list.sort(byRazryadThenName),
    }))
}
