import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Debounce before `onChange` fires (ms). */
  delay?: number
  className?: string
  autoFocus?: boolean
}

/**
 * Debounced search box shared by every list screen.
 *
 * The field keeps its own draft so typing stays instant, and only pushes
 * the value out after `delay` ms of silence — previously several pages
 * wired the input straight into the URL, which fired one request per
 * keystroke (two on Structure, which loads departments AND positions).
 *
 * When the outer `value` changes on its own (a "clear filters" reset, the
 * back button, a global-search deep link) the draft follows it, so the box
 * never shows stale text next to a list that no longer matches it.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  delay = 400,
  className,
  autoFocus,
}: SearchInputProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Last value we emitted ourselves — lets us tell an external reset apart
  // from the echo of our own debounced update.
  const lastEmitted = useRef(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setDraft(value)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const emit = (v: string, immediate = false) => {
    setDraft(v)
    if (timer.current) clearTimeout(timer.current)
    const fire = () => {
      lastEmitted.current = v
      onChange(v)
    }
    if (immediate || delay <= 0) fire()
    else timer.current = setTimeout(fire, delay)
  }

  return (
    <Input
      /* The server rejects a search longer than 200 characters (`core/search`),
         so the box stops there rather than turning a long paste into an error. */
      maxLength={200}
      type="search"
      value={draft}
      onChange={(e) => emit(e.target.value)}
      onKeyDown={(e) => {
        // Enter = search now, do not wait for the debounce.
        if (e.key === 'Enter') emit(draft, true)
      }}
      placeholder={placeholder ?? t('common.search')}
      aria-label={placeholder ?? t('common.search')}
      autoFocus={autoFocus}
      spellCheck={false}
      autoComplete="off"
      leftIcon={<Search size={16} />}
      wrapperClassName={className}
      rightSlot={
        draft ? (
          <button
            type="button"
            onClick={() => emit('', true)}
            aria-label={t('common.clear')}
            className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={14} />
          </button>
        ) : undefined
      }
    />
  )
}
