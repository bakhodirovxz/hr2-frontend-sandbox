import { useCallback, useState } from 'react'

export interface BulkProgress {
  running: boolean
  done: number
  total: number
  failed: number
}

const IDLE: BulkProgress = { running: false, done: 0, total: 0, failed: 0 }

/**
 * Runs a per-item async action over a set of ids.
 *
 * NOTE: the API has no bulk endpoints — each selected row is one request, so we
 * cap concurrency and report partial failures instead of pretending the whole
 * batch is atomic. `run` resolves with the ids that failed, so the caller can
 * keep them selected and tell the user exactly what didn't go through.
 */
export function useBulkAction(concurrency = 5) {
  const [progress, setProgress] = useState<BulkProgress>(IDLE)

  const run = useCallback(
    async (ids: number[], action: (id: number) => Promise<unknown>): Promise<number[]> => {
      if (!ids.length) return []
      setProgress({ running: true, done: 0, total: ids.length, failed: 0 })

      const failed: number[] = []
      const queue = [...ids]

      const worker = async () => {
        for (;;) {
          const id = queue.shift()
          if (id === undefined) return
          try {
            await action(id)
          } catch {
            failed.push(id)
          }
          setProgress((p) => ({
            ...p,
            done: p.done + 1,
            failed: failed.length,
          }))
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
      setProgress(IDLE)
      return failed
    },
    [concurrency],
  )

  return { run, progress }
}
