import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Download, Eye, FileText, Plus, QrCode, ShieldCheck, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { formatAppDate, formatDateTime, inTashkent } from '@/lib/format'
import { DetailRow } from '@/components/data/DetailRow'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { ReportTableView } from '@/features/reports/ReportTableView'
import type { ReportTableJson } from '@/features/reports/types'
import {
  KPI_REPORT,
  KPI_REPORTS,
  KPI_REPORT_APPROVE,
  KPI_REPORT_DOWNLOAD,
  KPI_REPORT_PREVIEW,
  KPI_REPORT_VERIFY,
} from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import {
  Button,
  Card,
  EmptyState,
  Modal,
  useToast,
} from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { cn } from '@/lib/cn'
import { useBranchStore } from '@/store/branchStore'
import { useKpiPermissions } from './useKpiPermissions'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'

interface KpiReport {
  id: number
  title?: string | null
  period_start?: string | null
  period_end?: string | null
  status?: string | null
  row_count?: number | null
  signature_kind?: string | null
  approved_by_name?: string | null
  approved_by_position?: string | null
  approved_at?: string | null
  verify_token?: string | null
  revoked_at?: string | null
  revoked_by_name?: string | null
  revoke_reason?: string | null
  superseded_by_id?: number | null
  created_at?: string | null
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-fg/[0.06] text-fg-muted',
  ready: 'bg-brand/[0.14] text-brand-strong',
  approved: 'bg-success/[0.12] text-success',
  revoked: 'bg-danger/[0.10] text-danger',
}

/**
 * KPI HISOBOTI — a period's results frozen into a signed file.
 *
 * The point is not the spreadsheet: it is that an APPROVED report carries the
 * approver's name and position and a verify token, so a copy printed and
 * carried out of the building can be checked back against the system. The
 * signature is the approver's OWN, not an E-IMZO one — that decision is
 * recorded in the Verifix parity round and must not be "upgraded" silently.
 */
export function KpiReportsTab({ canManage }: { canManage: boolean }) {
  // Server gates: create → `kpi_report.run`, approve → `kpi_report.sign_file`,
  // delete → any `kpi_report` grant. Measured as the ministr: `run` yes,
  // `sign_file` no — so "approve" 403'd while the button was shown.
  const perms = useKpiPermissions()
  const canRun = canManage && perms.can('kpi_report', 'run')
  const canSign = perms.can('kpi_report', 'sign_file')
  const canDelete = canManage && perms.can('kpi_report')
  // An approved or revoked report went out with a QR: only the master admin
  // may remove it (the server answers 403 to everyone else).
  const isMaster = roles.isSiteMasterAdmin(useAuthStore((s) => s.user))
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const navigate = useNavigate()

  const q = useQuery({
    queryKey: ['kpi', 'reports', branchId],
    queryFn: () => apiGet<KpiReport[]>(KPI_REPORTS),
    retry: false,
  })
  const reports = q.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi', 'reports'] })

  const [previewRow, setPreviewRow] = useState<{ row: KpiReport; table: ReportTableJson } | null>(null)
  const [deleteRow, setDeleteRow] = useState<KpiReport | null>(null)
  const [verifyRow, setVerifyRow] = useState<{ row: KpiReport; data: unknown } | null>(null)
  type VerifyData = {
    id?: number; title?: string | null; status?: string | null; row_count?: number | null
    period_start?: string | null; period_end?: string | null
    approved_by_name?: string | null; approved_by_position?: string | null; approved_at?: string | null
  }
  const [busy, setBusy] = useState<number | null>(null)

  const approve = useMutation({
    mutationFn: (id: number) => apiPost<KpiReport>(KPI_REPORT_APPROVE(id), {}),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(KPI_REPORT(id)),
    onSuccess: invalidate,
  })

  /**
   * Shakllantirish happens on the generic run page (`/reports/kpi_report`):
   * the same parameters, a live preview with drill-down, then «Saqlash va
   * tasdiqlashga yuborish» stores the frozen document that appears here.
   */
  const openRun = () => navigate('/reports/kpi_report')

  const preview = async (row: KpiReport) => {
    setBusy(row.id)
    try {
      const table = await apiGet<ReportTableJson>(KPI_REPORT_PREVIEW(row.id))
      setPreviewRow({ row, table })
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.reportFailed')))
    } finally {
      setBusy(null)
    }
  }

  const download = async (row: KpiReport) => {
    setBusy(row.id)
    try {
      await downloadFile({
        url: KPI_REPORT_DOWNLOAD(row.id),
        mime: XLSX_MIME,
        filename: `KPI_hisobot_${row.id}.xlsx`,
      })
      toast.ok(t('kpi.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.exportFailed')))
    } finally {
      setBusy(null)
    }
  }

  const verify = async (row: KpiReport) => {
    setBusy(row.id)
    try {
      // The verify endpoint needs the report's token (two-factor check, like
      // the public QR page) — without it the server answered 422.
      const data = await apiGet<unknown>(KPI_REPORT_VERIFY(row.id), { token: row.verify_token })
      setVerifyRow({ row, data })
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.reportVerifyFailed')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <p className="text-xs text-fg-muted">{t('kpi.reportsHint')}</p>
        {canRun && (
          <Button
            size="sm"
            className="ml-auto"
            leftIcon={<Plus size={15} />}
            onClick={openRun}
          >
            {t('kpi.reportNew')}
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <CenteredSpinner />
      ) : q.isError ? (
        <EmptyState icon={<FileText size={20} />} title={t('kpi.reportsDenied')} />
      ) : reports.length === 0 ? (
        <EmptyState title={t('kpi.reportsEmpty')} description={t('kpi.reportsEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">
                  {r.title || t('kpi.reportDefaultTitle')}
                </span>
                <span className="tabnum block text-[11px] text-fg-subtle">
                  {r.period_start ? dayjs(r.period_start).format('DD.MM.YYYY') : '—'} —{' '}
                  {r.period_end ? dayjs(r.period_end).format('DD.MM.YYYY') : '—'}
                  {r.row_count != null ? ` · ${t('kpi.reportRows', { count: r.row_count })}` : ''}
                </span>
                {r.status === 'revoked' && (
                  <span className="mt-0.5 block text-[11px] text-danger">
                    {t('kpi.reportRevokedLine', { reason: r.revoke_reason ?? '—', who: r.revoked_by_name ?? '—' })}
                    {r.superseded_by_id ? ` · ${t('kpi.reportSuperseded', { id: r.superseded_by_id })}` : ''}
                  </span>
                )}
              </span>

              {r.approved_by_name && (
                <span className="min-w-0 shrink-0 text-right text-[11px] text-fg-subtle">
                  <span className="block truncate text-fg-muted">{r.approved_by_name}</span>
                  {r.approved_at && (
                    <span className="tabnum block">
                      {inTashkent(r.approved_at).format('DD.MM.YYYY HH:mm')}
                    </span>
                  )}
                </span>
              )}

              <span
                className={cn(
                  'shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                  STATUS_TONE[r.status ?? 'draft'] ?? 'bg-fg/[0.06] text-fg-muted',
                )}
              >
                {t(`kpi.reportStatus_${r.status ?? 'draft'}` as never)}
              </span>

              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title={t('reports.preview')}
                  disabled={busy === r.id}
                  onClick={() => preview(r)}
                >
                  <Eye size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={t('kpi.reportDownload')}
                  disabled={busy === r.id}
                  onClick={() => download(r)}
                >
                  <Download size={14} />
                </Button>
                {r.verify_token && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('kpi.reportVerify')}
                    disabled={busy === r.id}
                    onClick={() => verify(r)}
                  >
                    <QrCode size={14} />
                  </Button>
                )}
                {canSign && r.status !== 'approved' && r.status !== 'revoked' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={approve.isPending}
                    leftIcon={<BadgeCheck size={14} />}
                    onClick={async () => {
                      const ok = await confirm({
                        kind: 'sign',
                        subject: r.title || t('kpi.reportDefaultTitle'),
                        confirmLabel: t('kpi.reportApprove'),
                      })
                      if (!ok) return
                      try {
                        await approve.mutateAsync(r.id)
                        toast.ok(t('kpi.reportApproved'))
                      } catch (e) {
                        toast.error(errorMessage(e, t('kpi.reportFailed')))
                      }
                    }}
                  >
                    {t('kpi.reportApprove')}
                  </Button>
                )}
                {canDelete && (isMaster || (r.status !== 'approved' && r.status !== 'revoked')) && (
                  <Button aria-label={t('common.delete')} size="sm" variant="ghost" onClick={() => setDeleteRow(r)}>
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        size="full"
        title={previewRow?.row.title || t('kpi.reportDefaultTitle')}
        footer={
          <Button variant="ghost" onClick={() => setPreviewRow(null)}>
            {t('common.close')}
          </Button>
        }
      >
        {previewRow && <ReportTableView table={previewRow.table} maxHeight="60vh" />}
      </Modal>

      <Modal
        open={!!verifyRow}
        onClose={() => setVerifyRow(null)}
        size="sm"
        title={t('kpi.reportVerify')}
        footer={
          <Button variant="ghost" onClick={() => setVerifyRow(null)}>
            {t('common.close')}
          </Button>
        }
      >
        {/* Same shape as the public QR page — a reader must not see raw JSON. */}
        {(() => {
          const d = (verifyRow?.data ?? {}) as VerifyData
          const approved = d.status === 'approved'
          return (
            <div>
              <div className="mb-3 flex items-center gap-2">
                {approved ? <BadgeCheck size={18} className="text-success" /> : <ShieldCheck size={18} className="text-fg-muted" />}
                <span className="text-sm font-semibold text-fg">
                  {approved ? t('kpiVerify.genuine') : t('kpiVerify.found')}
                </span>
                <span className="text-xs text-fg-subtle">
                  {t('kpiVerify.report')} №{d.id}
                </span>
              </div>
              <dl className="divide-y divide-line/60">
                <DetailRow label={t('kpiVerify.name')} value={d.title} />
                <DetailRow
                  label={t('kpiVerify.period')}
                  value={d.period_start && d.period_end ? `${formatAppDate(d.period_start)} — ${formatAppDate(d.period_end)}` : null}
                />
                <DetailRow label={t('kpiVerify.rowCount')} value={d.row_count} />
                <DetailRow
                  label={t('kpiVerify.approvedBy')}
                  value={d.approved_by_name ? [d.approved_by_name, d.approved_by_position].filter(Boolean).join(', ') : null}
                />
                <DetailRow label={t('kpiVerify.approvedAt')} value={d.approved_at ? formatDateTime(d.approved_at) : null} />
              </dl>
            </div>
          )
        })()}
      </Modal>

      <ConfirmDialog
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={async () => {
          if (!deleteRow) return
          try {
            await remove.mutateAsync(deleteRow.id)
            toast.ok(t('kpi.reportDeleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('kpi.reportFailed')))
          }
          setDeleteRow(null)
        }}
        title={t('kpi.reportDeleteTitle')}
        description={deleteRow?.title ?? ''}
        danger
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
      />
    </Card>
  )
}
