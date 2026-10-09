/**
 * THE table density definition — one place for every `<th>` / `<td>` in the app.
 *
 * Before this each screen invented its own (`px-4 py-3`, `px-3 py-2`,
 * `py-3 pr-2` …), and none of them put a gutter on the first column, so text
 * ran flush into the card's edge and the columns had 12px between them. That
 * is what read as "cramped data".
 *
 * The rules:
 *   · the row breathes vertically (16px) — these tables are read, not skimmed
 *   · 32px between columns, so the eye can tell them apart without rules
 *   · 24px gutter at both edges, so nothing touches the card
 */

/** Column gutters + inter-column gap, shared by header and body cells. */
const GUTTERS = 'first:pl-6 last:pr-6 pr-8'

/** Header cell. */
export const TH = `py-4 ${GUTTERS} text-[12px] font-semibold text-fg-muted`

/** Body cell — comfortable (default). */
export const TD = `py-4 ${GUTTERS} text-[13.5px] leading-relaxed`

/** Body cell — compact, for genuinely long lists where height costs scrolling. */
export const TD_COMPACT = `py-2.5 ${GUTTERS} text-[13px]`

/** Full-width message row (empty / loading placeholder inside a table). */
export const TD_MESSAGE = 'px-6 py-12 text-center text-sm text-fg-subtle'
