import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import dayjs from 'dayjs'
import { Button, Checkbox, Modal, useToast } from '@/components/ui'
import { apiClient } from '@/api/client'
import { errorMessage } from '@/api/errorMessage'
import { EMPLOYEES_EXPORT_EXCEL } from '@/api/endpoints'
import { XLSX_MIME } from '@/lib/download'
import { useBranchStore } from '@/store/branchStore'

/** The column groups the export endpoint understands, in reading order. */
const GROUPS: { key: string; cols: string[] }[] = [
  {
    key: 'personal',
    cols: [
      'include_photo',
      'include_fish',
      'include_gender',
      'include_birth_date',
      'include_nationlity',
      'include_maritial_status',
      'include_address',
    ],
  },
  {
    key: 'documents',
    cols: [
      'include_pasport',
      'include_pasport_id_number',
      'include_pasport_issue_by',
      'include_pinfl',
      'include_inn',
      'include_inps',
    ],
  },
  { key: 'contact', cols: ['include_email', 'include_phone', 'include_internal_phone'] },
  {
    key: 'work',
    cols: [
      'include_branch',
      'include_department',
      'include_job_position',
      'include_supervisor',
      'include_job_acceptance_date',
      'include_working_hours',
      'include_lunch_hours',
      'include_working_days',
      'include_stavka',
    ],
  },
  { key: 'education', cols: ['include_education', 'include_work_experience'] },
]

/** A sensible sheet on first open: who they are, where they sit, how to reach them. */
const DEFAULTS = new Set([
  'include_fish',
  'include_department',
  'include_job_position',
  'include_phone',
  'include_job_acceptance_date',
])

/**
 * Excel export — the columns are CHOSEN, never "everything".
 *
 * A roster export is the easiest way for passport numbers and JSHSHIR to walk
 * out of the building in a file nobody tracks, so the sheet starts as the plain
 * directory and every PII column has to be ticked on purpose.
 */
export function EmployeeExportModal({
  open,
  onClose,
  filters,
  kpiFilterActive,
}: {
  open: boolean
  onClose: () => void
  /** The screen's current narrowing — what you see is what you export. */
  filters: { search?: string; departmentId?: string; jobPositionId?: string }
  /**
   * The screen is narrowed by a KPI band or the free range, which
   * `/employees/export-excel` cannot express — it has no `kpi_min`/`kpi_max`.
   * The file will therefore be WIDER than the table, and this is the warning
   * that says so before a roster carrying passport numbers is produced.
   */
  kpiFilterActive?: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [picked, setPicked] = useState<Set<string>>(new Set(DEFAULTS))
  const [busy, setBusy] = useState(false)

  const toggle = (col: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })

  const run = async () => {
    if (!picked.size) return toast.error(t('employees.exportNoColumns'))
    setBusy(true)
    try {
      const body = Object.fromEntries([...picked].map((c) => [c, true]))
      const res = await apiClient.post(EMPLOYEES_EXPORT_EXCEL, body, {
        params: {
          organization_branch_id: branchId || undefined,
          search: filters.search || undefined,
          department_id: filters.departmentId || undefined,
          job_position_id: filters.jobPositionId || undefined,
        },
        responseType: 'blob',
        // Photos make this slow; the backend streams thumbnails but a full
        // branch still takes the better part of a minute.
        timeout: 300_000,
      })
      const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: XLSX_MIME }))
      const link = document.createElement('a')
      link.href = href
      link.download = `Xodimlar_${dayjs().format('DD.MM.YYYY')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
      toast.ok(t('employees.exportDone'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('employees.exportFailed')))
    } finally {
      setBusy(false)
    }
  }

  const allCols = GROUPS.flatMap((g) => g.cols)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('employees.exportTitle')}
      description={t('employees.exportHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={run} loading={busy} leftIcon={<Download size={15} />}>
            {t('employees.exportRun')}
          </Button>
        </>
      }
    >
      {kpiFilterActive && (
        <p className="mb-3 rounded-inner border border-warning/40 bg-warning/[0.10] px-3 py-2 text-[12px] text-warning">
          {t('employees.exportIgnoresKpi')}
        </p>
      )}
      <div className="mb-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setPicked(new Set(allCols))}>
          {t('employees.exportSelectAll')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
          {t('employees.exportClear')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-inner border border-line p-3.5">
            <p className="engrave mb-2.5 text-fg">{t(`employees.exportGroup_${g.key}` as never)}</p>
            <div className="flex flex-col gap-2">
              {g.cols.map((c) => (
                <Checkbox
                  key={c}
                  checked={picked.has(c)}
                  onChange={() => toggle(c)}
                  label={t(`employees.col_${c}` as never)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
