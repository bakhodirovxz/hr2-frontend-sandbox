import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FormError } from '@/components/ui/FormError'
import { useToast } from '@/components/ui/Toast'
import { apiGet, apiPost } from '@/api/http'
import { errorMessage, errorParams } from '@/api/errorMessage'
import { inTashkent } from '@/lib/format'

/**
 * TZ I2 1639 «Импорт данных из СКУД»: HR (own level) or the system
 * administrator loads a batch of turnstile passes (JSON list or CSV with a
 * header row in the import format); the automatic poll state is shown and
 * the system administrator can poll the configured source now.
 */

const COLUMNS = [
  'event_id',
  'happen_time',
  'event_type',
  'is_granted',
  'organization_branch_id',
  'device_code',
  'device_name',
  'employee_id',
  'direction_type',
] as const

type Row = Record<string, unknown>

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const head = lines[0].split(sep).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim())
    const row: Row = {}
    head.forEach((h, i) => {
      const v = cells[i] ?? ''
      if (v === '') return
      if (h === 'is_granted') row[h] = ['1', 'true', 'ha', 'yes'].includes(v.toLowerCase())
      else if (h === 'event_type' || h === 'organization_branch_id' || h === 'employee_id') row[h] = Number(v)
      else row[h] = v
    })
    return row
  })
}

async function readRows(file: File): Promise<Row[]> {
  const text = await file.text()
  if (file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const body = JSON.parse(text)
    const rows = Array.isArray(body) ? body : body?.items
    return Array.isArray(rows) ? rows : []
  }
  return parseCsv(text)
}

interface PullState {
  configured: boolean
  enabled: boolean
  interval_minutes?: number | null
  last_pulled_at?: string | null
  last_result?: { status?: string; received?: number; created?: number } | null
}

export function SkudImportModal({ open, onClose, canPull }: { open: boolean; onClose: () => void; canPull: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<{ row: number; field: string; message: string }[]>([])
  const [busy, setBusy] = useState<'import' | 'pull' | null>(null)

  const state = useQuery({
    queryKey: ['skud-pull'],
    queryFn: () => apiGet<PullState>('turnstile-attendance-events/skud-pull', { _no_branch_inject: true }),
    enabled: open,
    meta: { silent: true },
  })

  const reset = () => {
    setRows(null)
    setFileName('')
    setError(null)
    setRowErrors([])
  }

  const pick = async (file: File | undefined) => {
    reset()
    if (!file) return
    setFileName(file.name)
    try {
      const r = await readRows(file)
      if (!r.length) setError(t('skud.emptyFile'))
      setRows(r)
    } catch {
      setError(t('skud.badFile'))
    }
  }

  const doImport = async () => {
    if (!rows?.length) return
    setBusy('import')
    setError(null)
    setRowErrors([])
    try {
      const res = await apiPost<{ received: number; created: number }>('turnstile-attendance-events/import', rows)
      toast.ok(t('skud.imported', { received: res.received, created: res.created }))
      void qc.invalidateQueries({ queryKey: ['attendance'] })
      reset()
      onClose()
    } catch (e) {
      const p = errorParams(e) as { errors?: { row: number; field: string; message: string }[] } | null
      setRowErrors(p?.errors ?? [])
      setError(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(null)
    }
  }

  const pullNow = async () => {
    setBusy('pull')
    try {
      const r = await apiPost<{ status: string; received?: number; created?: number }>('turnstile-attendance-events/skud-pull', {})
      if (r.status === 'failed') toast.error(t('errors.skud_pull_failed'))
      else toast.ok(t('skud.imported', { received: r.received ?? 0, created: r.created ?? 0 }))
      void state.refetch()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(null)
    }
  }

  const s = state.data
  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={t('skud.title')}
      description={t('skud.hint')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Upload size={14} />} loading={busy === 'import'} disabled={!rows?.length} onClick={doImport}>
            {t('skud.import')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex cursor-pointer flex-col gap-1 rounded-inner border border-dashed border-line p-4 text-[13px] text-fg-muted hover:border-brand">
          <span className="font-medium text-fg">{fileName || t('skud.pickFile')}</span>
          <span className="text-[11.5px]">{t('skud.formats', { columns: COLUMNS.join(', ') })}</span>
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        {rows && rows.length > 0 && <p className="text-[12.5px] text-fg">{t('skud.rows', { count: rows.length })}</p>}
        <FormError>{error}</FormError>
        {rowErrors.length > 0 && (
          <ul className="max-h-40 overflow-auto rounded-inner bg-surface-2 p-2 text-[12px] text-danger">
            {rowErrors.slice(0, 50).map((r, i) => (
              <li key={i}>
                {t('skud.rowError', { row: r.row, field: r.field })}: {r.message}
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-inner border border-line p-3 text-[12.5px] text-fg-muted">
          <p className="font-medium text-fg">{t('skud.autoTitle')}</p>
          <p className="mt-1">
            {!s?.configured
              ? t('skud.autoOff')
              : s.enabled
                ? t('skud.autoOn', { minutes: s.interval_minutes ?? 5 })
                : t('skud.autoDisabled')}
          </p>
          {s?.last_pulled_at && (
            <p className="mt-1">
              {t('skud.lastPull', {
                at: inTashkent(s.last_pulled_at).format('DD.MM.YYYY HH:mm'),
                created: s.last_result?.created ?? 0,
              })}
              {s.last_result?.status === 'failed' && ` — ${t('errors.skud_pull_failed')}`}
            </p>
          )}
          {canPull && s?.configured && (
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw size={13} />}
              loading={busy === 'pull'}
              disabled={!!busy}
              onClick={() => void pullNow()}
            >
              {t('skud.pullNow')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
