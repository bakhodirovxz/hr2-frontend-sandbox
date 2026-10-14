import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Always the light theme (TZ 1836 «Единый стиль оформления»). The dark/light
 * switch was not asked for by the TZ and has been removed; readers who need a
 * dark screen use the low-vision «white on black» scheme (src/a11y).
 */
function readInitialTheme(): Theme {
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement
    root.setAttribute('data-theme', t)
    root.style.colorScheme = t
    // Read --bg back out of the tokens rather than hardcoding a hex here —
    // hardcoded values silently drift every time the palette changes.
    const channels = getComputedStyle(root).getPropertyValue('--bg').trim()
    if (!channels) return
    const hex =
      '#' +
      channels
        .split(/\s+/)
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute('content', hex))
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
