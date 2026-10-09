import dayjs from 'dayjs'

/**
 * Today's calendar date in the user's own zone, as `YYYY-MM-DD`.
 *
 * ⚠️ NOT `new Date().toISOString().slice(0, 10)`. That formats the **UTC**
 * date, and Tashkent is UTC+5 with no DST — so between 00:00 and 05:00 local
 * it returns YESTERDAY. Measured in a browser pinned to Asia/Tashkent at
 * 02:00 on 2026-03-05: the KPP kiosk asked the server for
 * `date_from=2026-03-04&date_to=2026-03-04` (see `e2e/date-today.spec.js`).
 *
 * That was not a hypothetical. `useCurrentDay` in `features/kpp/useKpp.ts`
 * carries a comment saying it exists precisely because a kiosk left running
 * overnight kept showing the previous day's passes — and it kept doing so,
 * just rolling over at 05:00 instead of at midnight.
 *
 * Every default date a form seeds ("registered today", "the decree is dated
 * today", "returned today") has the same failure at the same hours.
 */
export function todayIso(): string {
  return dayjs().format('YYYY-MM-DD')
}
