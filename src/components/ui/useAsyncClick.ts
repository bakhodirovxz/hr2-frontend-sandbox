import { useCallback, useEffect, useRef, useState, type MouseEvent, type MouseEventHandler } from 'react'

/**
 * Double-submit guard for every button at once.
 *
 * Forty-four buttons (measured 2026-09-11) call `mutateAsync` from `onClick`
 * with no `loading`/`disabled` of their own, so a second click during the
 * request fires the mutation twice — a second "add movement", a second bulk
 * sign reported as a partial failure. Fixing them one by one leaves the next
 * one unguarded; the button itself can tell: when the handler returns a
 * promise, stay disabled until it settles. Handlers that return nothing are
 * untouched, and the state is dropped if the button unmounts mid-flight.
 */
export function useAsyncClick(
  onClick?: MouseEventHandler<HTMLButtonElement>,
): [MouseEventHandler<HTMLButtonElement> | undefined, boolean] {
  const [pending, setPending] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const handle = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (!onClick) return
      const out = (onClick as (ev: MouseEvent<HTMLButtonElement>) => unknown)(e)
      if (out && typeof (out as PromiseLike<unknown>).then === 'function') {
        setPending(true)
        void Promise.resolve(out).finally(() => {
          if (alive.current) setPending(false)
        })
      }
    },
    [onClick],
  )
  return [onClick ? handle : undefined, pending]
}
