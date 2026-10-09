import { Component, type ErrorInfo, type ReactNode } from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { isStaleChunkError, reloadForNewBuild } from '@/lib/staleChunk'
import { trackClientError } from '@/lib/pageTracker'

interface Props extends WithTranslation {
  children: ReactNode
  /** Changing this value clears the error — pass the route so navigating away recovers. */
  resetKey?: string
}
interface State {
  error: Error | null
}

/**
 * Catches render errors so one bad screen doesn't blank the whole app.
 *
 * Without this, a single unexpected null from any endpoint unmounts the entire
 * React tree: every route renders empty and only a full page reload recovers.
 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    // Navigating to another page should give the user a working screen again.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A lazy screen from the previous build: the fresh page has it.
    if (isStaleChunkError(error) && reloadForNewBuild()) return
    console.error('Render error:', error, info.componentStack)
    // A caught render crash never reaches window.onerror, so the journal's
    // «Xatoliklar» would not see the screen that broke.
    const frame = info.componentStack?.trim().split('\n')[0]?.trim() || 'render'
    trackClientError(error?.message || String(error), { source: `render ${frame}`.slice(0, 200) })
  }

  render() {
    const { error } = this.state
    const { t, children } = this.props
    if (!error) return children

    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <Card className="max-w-lg p-6 text-center">
          <h2 className="text-base font-semibold text-fg">{t('errors.renderTitle')}</h2>
          <p className="mt-2 text-sm text-fg-muted">{t('errors.renderBody')}</p>
          <pre className="scroll-thin mt-3 max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-fg-subtle">
            {error.message}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>
              <RefreshCw size={15} /> {t('common.retry')}
            </Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t('errors.reload')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner)
