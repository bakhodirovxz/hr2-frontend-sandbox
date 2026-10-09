import { useCallback, useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { dayMonth } from '@/lib/format'
import { CONTROL_PAD, POPOVER, POPOVER_CLS, control, placePopover } from './control'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  /** ISO date, `YYYY-MM-DD` (or empty). */
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** Earliest / latest selectable ISO date — days outside are greyed out. */
  min?: string
  max?: string
}

/** ISO (YYYY-MM-DD) → display (DD.MM.YYYY). */
function toDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/**
 * Years a personnel record can plausibly carry. A mistyped «9999» used to be
 * accepted as a real date and sent to the server (audit 2026-09-18); outside
 * this window the field stays invalid until the user corrects it.
 */
const MIN_YEAR = 1900
const MAX_YEAR = 2100

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** A real calendar date, or '' — no clamping, no silent correction. */
function validIso(y: number, mo: number, d: number): string {
  if (!y || !mo || !d || mo > 12 || y < MIN_YEAR || y > MAX_YEAR) return ''
  if (d > new Date(y, mo, 0).getDate()) return ''
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** «26» → 2026, «85» → 1985: a two-digit year up to ten years ahead is this century. */
function expandYear(yy: number): number {
  const now = new Date().getFullYear()
  const c = 2000 + yy
  return c <= now + 10 ? c : 1900 + yy
}

/** Typed digits (DDMMYYYY) → ISO, or '' while incomplete/invalid. */
function digitsToIso(digits: string): string {
  if (digits.length < 8) return ''
  return validIso(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)))
}

/**
 * Text with its own separators: «2026-09-25» (ISO, from Excel or a URL),
 * «25/09/2026», «5.9.2026». Pasting ISO used to be read digit-by-digit as
 * DD=20 MM=26 and «corrected» to 20.12.1900 — a wrong date sent without a word.
 * `twoDigitYear` is allowed only on blur: while typing, «25.09.20» is a date
 * still being written, not the year 2020.
 */
function parseLoose(raw: string, twoDigitYear: boolean): string {
  const m = /^\s*(\d{1,4})[.\-/ ](\d{1,2})[.\-/ ](\d{2}|\d{4})\s*$/.exec(raw)
  if (!m) return ''
  if (m[1].length === 4) return validIso(Number(m[1]), Number(m[2]), Number(m[3]))
  if (m[1].length > 2) return ''
  if (m[3].length === 2 && !twoDigitYear) return ''
  const y = m[3].length === 2 ? expandYear(Number(m[3])) : Number(m[3])
  return validIso(y, Number(m[2]), Number(m[1]))
}

/** Local-midnight Date for an ISO day — `new Date('2026-09-25')` is UTC. */
function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

type View = 'days' | 'months' | 'years'

/**
 * Date field in DD.MM.YYYY with the app's own calendar.
 *
 * A native <input type="date"> renders in the BROWSER's locale, so an en-US
 * browser shows mm/dd/yyyy and a foreign-looking picker. This is a masked text
 * field plus our own popup, so the format and the styling are the same for
 * every user — the same reasoning as TimeInput.
 *
 * Reworked 2026-09-25 after a Playwright pass: the calendar stayed open after
 * Tab and its invisible backdrop swallowed the next click; ISO paste became
 * 1900; «25.09.26» vanished on blur; the grid had no keyboard; and a birth date
 * in 1985 meant ~480 clicks on «previous month» — the header now opens month
 * and year grids.
 */
export function DateInput({ value, onChange, className, disabled, invalid, min, max, ...rest }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => toDisplay(value))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('days')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The calendar is position:FIXED, not absolute. Inside a Modal (which clips
  // with overflow-hidden and scrolls internally) an absolute popup is cut off.
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  // The panel is sized in JS (pixels), its cells in CSS (rem): with the
  // low-vision font at 150 % seven 48px columns no longer fit 268px.
  const lv = useLowVisionScale()
  const place = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    setRect(placePopover(el.getBoundingClientRect(), POPOVER.calW * lv, POPOVER.calH * lv))
  }, [lv])

  useLayoutEffect(() => {
    if (open) place()
    else setView('days')
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  // Follow external resets (form clears, edit-mode prefills).
  useEffect(() => {
    setText(toDisplay(value))
  }, [value])

  // Escape closes the calendar wherever focus is and hands focus back to the
  // field. Captured at the document so the surrounding Modal never sees it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      if (panelRef.current?.contains(document.activeElement)) inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  // A press outside closes it — and the press still reaches what it hit. The
  // old full-screen backdrop ate that click, so the next field needed two.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const commit = (iso: string) => {
    onChange(iso)
    setText(toDisplay(iso))
  }

  const handleType = (raw: string) => {
    const loose = parseLoose(raw, false)
    if (loose) {
      commit(loose)
      setOpen(false)
      return
    }
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let out = digits.slice(0, 2)
    if (digits.length > 2) out += `.${digits.slice(2, 4)}`
    if (digits.length > 4) out += `.${digits.slice(4, 8)}`
    setText(out)
    const iso = digitsToIso(digits)
    // Only emit a complete, valid date; clearing the field clears the value.
    if (iso) {
      onChange(iso)
      setOpen(false)
    } else if (digits.length === 0) onChange('')
  }

  /**
   * On leaving the field the TEXT must match the accepted value — otherwise
   * «99.99.9999» stayed on screen while the form value was empty. A two-digit
   * year is completed here; anything still not a real date reverts to the
   * current value instead of being «corrected» into a different day.
   */
  const normalize = () => {
    const digits = text.replace(/\D/g, '')
    if (!digits) {
      setText('')
      if (value) onChange('')
      return
    }
    const iso =
      parseLoose(text, true) ||
      digitsToIso(digits) ||
      (digits.length === 6 ? validIso(expandYear(Number(digits.slice(4, 6))), Number(digits.slice(2, 4)), Number(digits.slice(0, 2))) : '')
    if (iso) {
      if (iso !== value) onChange(iso)
      setText(toDisplay(iso))
      return
    }
    setText(toDisplay(value))
  }

  const selected = parseIso(value)
  const [cursor, setCursor] = useState(() => selected ?? new Date())
  useEffect(() => {
    if (selected) setCursor(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // Monday-first, matching the rest of the app's calendars.
  const leading = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const months = t('date.months', { returnObjects: true }) as unknown as string[]
  // ⚠️ DUSHANBADAN boshlanadigan QISQA nomlar — `date.weekdaysShort` yagona manba.
  const weekdaysShort = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const now = new Date()
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate())
  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max)
  const yearStart = year - (year % 12)

  /** Focus a day cell (after the grid re-renders for a new month). */
  const focusDay = (d: Date) => {
    setCursor(d)
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${isoOf(d.getFullYear(), d.getMonth(), d.getDate())}"]`)?.focus()
    })
  }

  /** Arrow keys walk days, PageUp/PageDown months (Shift: years). */
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const iso = (e.target as HTMLElement).dataset.iso
    const base = iso ? parseIso(iso) : null
    if (!base) return
    const step: Record<string, () => Date> = {
      ArrowLeft: () => new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1),
      ArrowRight: () => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1),
      ArrowUp: () => new Date(base.getFullYear(), base.getMonth(), base.getDate() - 7),
      ArrowDown: () => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7),
      PageUp: () => new Date(base.getFullYear() - (e.shiftKey ? 1 : 0), base.getMonth() - (e.shiftKey ? 0 : 1), 1),
      PageDown: () => new Date(base.getFullYear() + (e.shiftKey ? 1 : 0), base.getMonth() + (e.shiftKey ? 0 : 1), 1),
    }
    const next = step[e.key]
    if (!next) return
    e.preventDefault()
    focusDay(next())
  }

  const openCalendar = () => {
    if (!disabled) setOpen(true)
  }

  const headerBtn = 'rounded-md px-1.5 py-0.5 text-sm font-semibold capitalize text-fg hover:bg-surface-2'
  const navBtn = 'rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg'
  const cellBtn = 'grid place-items-center rounded-lg text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <div
      ref={wrapRef}
      className={cn('relative', className)}
      // Focus leaving the field AND its calendar closes it (Tab away used to
      // leave it open over the rest of the form).
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next && (wrapRef.current?.contains(next) || panelRef.current?.contains(next))) return
        setOpen(false)
      }}
    >
      <input
        {...rest}
        ref={inputRef}
        value={text}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('date.maskPlaceholder')}
        onChange={(e) => handleType(e.target.value)}
        onBlur={(e) => {
          normalize()
          rest.onBlur?.(e)
        }}
        onClick={openCalendar}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            // Swallow it — otherwise the surrounding Modal closes too.
            e.stopPropagation()
            setOpen(false)
          } else if (e.key === 'Tab' && open) {
            setOpen(false)
          } else if (e.key === 'ArrowDown' && (e.altKey || open)) {
            // Into the grid: the chosen day, else today.
            e.preventDefault()
            if (!open) setOpen(true)
            setView('days')
            focusDay(selected ?? now)
          }
          rest.onKeyDown?.(e)
        }}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(control({ invalid }), CONTROL_PAD.trailingIcon, 'w-full tabular-nums')}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('date.pickDate')}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
      >
        <CalendarIcon size={16} />
      </button>

      {open && !disabled && rect && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('date.pickDate')}
          data-date-panel
          className={cn(POPOVER_CLS, 'fixed z-[200] animate-scale-in p-3')}
          style={{ left: rect.left, top: rect.top, width: rect.width }}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={t('date.prev')}
              onClick={() =>
                view === 'years'
                  ? setCursor(new Date(year - 12, month, 1))
                  : view === 'months'
                    ? setCursor(new Date(year - 1, month, 1))
                    : setCursor(new Date(year, month - 1, 1))
              }
              className={navBtn}
            >
              <ChevronLeft size={16} />
            </button>
            {view === 'years' ? (
              <span className="text-sm font-semibold tabular-nums text-fg">
                {yearStart} – {yearStart + 11}
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                {view === 'days' && (
                  <button type="button" className={headerBtn} onClick={() => setView('months')} aria-label={t('date.pickMonth')}>
                    {months?.[month] ?? month + 1}
                  </button>
                )}
                <button type="button" className={cn(headerBtn, 'tabular-nums')} onClick={() => setView('years')} aria-label={t('date.pickYear')}>
                  {year}
                </button>
              </span>
            )}
            <button
              type="button"
              aria-label={t('date.next')}
              onClick={() =>
                view === 'years'
                  ? setCursor(new Date(year + 12, month, 1))
                  : view === 'months'
                    ? setCursor(new Date(year + 1, month, 1))
                    : setCursor(new Date(year, month + 1, 1))
              }
              className={navBtn}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {view === 'years' && (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }).map((_, i) => {
                const y = yearStart + i
                const off = y < MIN_YEAR || y > MAX_YEAR
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={off}
                    onClick={() => {
                      setCursor(new Date(y, month, 1))
                      setView('months')
                    }}
                    className={cn(
                      cellBtn,
                      'h-10',
                      y === year ? 'bg-brand font-semibold text-fg-on-brand' : y === now.getFullYear() ? 'text-brand-strong ring-1 ring-brand/40' : 'text-fg hover:bg-surface-2',
                    )}
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          )}

          {view === 'months' && (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }).map((_, m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setCursor(new Date(year, m, 1))
                    setView('days')
                  }}
                  className={cn(
                    cellBtn,
                    'h-10 capitalize',
                    m === month ? 'bg-brand font-semibold text-fg-on-brand' : 'text-fg hover:bg-surface-2',
                  )}
                >
                  {t(`date.month_${m + 1}` as 'date.month_1')}
                </button>
              ))}
            </div>
          )}

          {view === 'days' && (
            <>
              <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11.5px] text-fg-subtle">
                {weekdaysShort.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
                {Array.from({ length: leading }).map((_, i) => (
                  <span key={`x${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const iso = isoOf(year, month, day)
                  const isSelected = iso === value
                  const isToday = iso === todayIso
                  // One tab stop in the grid: the chosen day, else today, else the 1st.
                  const tabStop = value && value.startsWith(`${year}-${pad(month + 1)}`) ? isSelected : isToday || (!todayIso.startsWith(`${year}-${pad(month + 1)}`) && day === 1)
                  return (
                    <button
                      key={day}
                      type="button"
                      data-iso={iso}
                      tabIndex={tabStop ? 0 : -1}
                      disabled={outOfRange(iso)}
                      aria-label={`${dayMonth(iso)} ${year}`}
                      aria-pressed={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => {
                        commit(iso)
                        setOpen(false)
                        inputRef.current?.focus()
                      }}
                      className={cn(
                        cellBtn,
                        'h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                        isSelected
                          ? 'bg-brand font-medium text-fg-on-brand'
                          : isToday
                            ? 'bg-brand/10 font-semibold text-brand-strong ring-1 ring-inset ring-brand/40 hover:bg-brand/15'
                            : 'text-fg hover:bg-surface-2',
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex justify-between">
            <button
              type="button"
              disabled={outOfRange(todayIso)}
              onClick={() => {
                commit(todayIso)
                setOpen(false)
                inputRef.current?.focus()
              }}
              className="rounded px-2 py-1 text-xs font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-40"
            >
              {t('date.today')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setText('')
                  setOpen(false)
                  inputRef.current?.focus()
                }}
                className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-2"
              >
                {t('common.clearValue')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
