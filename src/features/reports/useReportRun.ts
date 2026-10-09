import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiPost } from '@/api/http'
import { REPORT_RUN } from '@/api/endpoints'
import type { DrillRef, ReportParams, ReportPrefs, ReportTableJson } from './types'

export interface DrillLevel {
  drill: DrillRef | null
  label: string
  table: ReportTableJson
}

interface RunBody {
  params: ReportParams
  prefs?: ReportPrefs | null
  format?: 'json' | 'xlsx' | 'csv'
  drill?: DrillRef | null
  lang?: 'uz' | 'ru'
}

/**
 * Runs a report and keeps a drill-down stack: level 0 is the report itself,
 * every drill pushes a level (its table cached), the breadcrumb pops back
 * without refetching.
 */
export function useReportRun(code: string) {
  const [stack, setStack] = useState<DrillLevel[]>([])

  const run = useMutation({
    mutationFn: (body: RunBody) =>
      apiPost<ReportTableJson>(REPORT_RUN(code), { ...body, format: 'json' }),
  })

  const generate = useCallback(
    async (params: ReportParams, prefs: ReportPrefs | null, lang: 'uz' | 'ru', label: string) => {
      const table = await run.mutateAsync({ params, prefs, lang })
      setStack([{ drill: null, label, table }])
      return table
    },
    [run],
  )

  const drill = useCallback(
    async (params: ReportParams, prefs: ReportPrefs | null, lang: 'uz' | 'ru', ref: DrillRef, label: string) => {
      const table = await run.mutateAsync({ params, prefs, lang, drill: ref })
      setStack((s) => [...s, { drill: ref, label, table }])
      return table
    },
    [run],
  )

  const popTo = useCallback((index: number) => setStack((s) => s.slice(0, index + 1)), [])
  const reset = useCallback(() => setStack([]), [])

  return { stack, current: stack[stack.length - 1] ?? null, generate, drill, popTo, reset, isPending: run.isPending, error: run.error }
}

/** POST the run with `format` and hand the file to the browser. */
export async function downloadReport(
  code: string,
  body: RunBody & { format: 'xlsx' | 'csv' },
  filename: string,
): Promise<void> {
  const res = await apiClient.post(REPORT_RUN(code), body, { responseType: 'blob', timeout: 300_000 })
  const blob = res.data as Blob
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
