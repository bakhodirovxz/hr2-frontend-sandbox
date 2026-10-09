/**
 * True when both ends of a date range are set and `from` is after `to`.
 * ISO `YYYY-MM-DD` (or `YYYY-MM-DDTHH:mm`) strings compare correctly as
 * plain strings, so no date parsing is needed. Pages use this to mark the
 * inputs invalid and skip the query instead of asking the server for an
 * impossible window (which quietly returns an empty list).
 */
export function isInvalidRange(from?: string | null, to?: string | null): boolean {
  if (!from || !to) return false
  return from > to
}
