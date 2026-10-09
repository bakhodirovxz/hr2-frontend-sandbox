import { useTranslation } from 'react-i18next'

/**
 * Inline warning under a document-number field: this number is already used in
 * this branch, and here is the next free one.
 *
 * ⚠️ THE SERVER HAS ANSWERED THIS QUESTION ALL ALONG AND NOTHING ASKED IT.
 * `/order-acts/act-number/availability` and `/letters/registered-number/availability`
 * both exist, both return `{available, suggested}`, and both had a v2 hook
 * written for them — with zero callers. So a clerk typing a number that was
 * already taken learned about it only when Save came back with a 400, after
 * the rest of the form had been filled in.
 *
 * The suggestion is a BUTTON rather than plain text: reading a number off a
 * hint and retyping it is exactly the step that reintroduces the clash.
 */
export function NumberTakenHint({
  available,
  suggested,
  onUse,
}: {
  available?: boolean
  suggested?: string | null
  onUse?: (value: string) => void
}) {
  const { t } = useTranslation()
  if (available !== false) return null
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-danger">
      <span>{t('common.numberTaken')}</span>
      {suggested && onUse && (
        <button
          type="button"
          onClick={() => onUse(suggested)}
          className="rounded-pill border border-line bg-surface px-2 py-px font-medium text-brand-strong transition-colors hover:bg-brand-soft"
        >
          {t('common.useFreeNumber', { number: suggested })}
        </button>
      )}
    </p>
  )
}
