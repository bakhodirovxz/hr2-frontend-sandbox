import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import type { Card, EmployeeBrief, Label } from './useBoard'

export const cardMembers = (c: Card): EmployeeBrief[] =>
  (c.members ?? []).map((m) => m.member).filter((m): m is EmployeeBrief => !!m)

export const cardLabels = (c: Card): Label[] =>
  (c.labels ?? []).map((l) => l.label).filter((l): l is Label => !!l)

/** Overdue is a fact about an OPEN task; a finished one is never late. */
export const isOverdue = (c: Card) =>
  !c.is_completed && !!c.end_date && dayjs(c.end_date).endOf('day').isBefore(dayjs())

export const isDueSoon = (c: Card) =>
  !c.is_completed && !!c.end_date && !isOverdue(c) && dayjs(c.end_date).diff(dayjs().startOf('day'), 'day') <= 1

/** Red when late, amber for today/tomorrow — the two dates that change a plan. */
export const dueTone = (c: Card) => (isOverdue(c) ? 'text-danger' : isDueSoon(c) ? 'text-warning' : 'text-fg-muted')

/**
 * «Bugun», «Ertaga», «3 kun kechikdi» — the due date as the reader thinks of
 * it. The absolute date stays in the tooltip/panel; a row only needs how far.
 */
export function relativeDue(date: string, t: TFunction): string {
  const d = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (d === 0) return t('projects.dueToday')
  if (d === 1) return t('projects.dueTomorrow')
  if (d === -1) return t('projects.dueYesterday')
  if (d < 0) return t('projects.dueLate', { count: -d })
  if (d <= 7) return t('projects.dueIn', { count: d })
  return dayjs(date).format('DD.MM.YYYY')
}

export function checklistProgress(c: Card) {
  const items = c.checklist ?? []
  const done = items.filter((i) => i.is_done).length
  const total = items.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}
