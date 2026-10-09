import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArrowLeft, ArrowRightLeft, FileDown, Info, Pencil, Trash2, UserCheck } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ForbiddenState } from '@/components/layout/RequireRole'
import { Button } from '@/components/ui/Button'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { LoadError } from '@/components/data/LoadError'
import { errorMessage } from '@/api/errorMessage'
import { downloadFile } from '@/lib/download'
import { canManageEmployee, canWriteOrg } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { ArchiveEmployeeModal } from '@/features/employees/ArchiveEmployeeModal'
import { EmployeeFormDrawer } from '@/features/employees/EmployeeFormDrawer'
import { PlacementModal } from '@/features/employees/PlacementModal'
import { CARD_TABS, CardTabs, type CardTab } from '@/features/employees/profile/CardTabs'
import { ProfileInfo } from '@/features/employees/profile/ProfileInfo'
import { useT2Card } from '@/features/employees/t2/useT2'
import { useEmployeeDetail, useEmployeeMutations } from '@/features/employees/useEmployees'
import { fmtDate } from '@/features/employees/format'

const LEGACY_TABS: Record<string, CardTab> = { t2: 'general' }

/**
 * Xodim kartochkasi `/employees/:id` (TZ 4.2.7, C2–C4): left — organisation
 * and personal data; right — personnel actions and the T-2 tabs (`?tab=`).
 * Archived card is read-only; only «Qayta ishga qabul qilish» remains.
 */
export function EmployeeProfilePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { id: rawId } = useParams()
  const id = Number(rawId) || null
  const [params, setParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const q = useEmployeeDetail(id)
  const t2 = useT2Card(id)
  const { remove } = useEmployeeMutations()
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [placement, setPlacement] = useState<'rehire' | 'migrate' | null>(null)
  const [exporting, setExporting] = useState<'' | 'docx' | 'pdf'>('')

  const rawTab = params.get('tab') ?? ''
  const mapped = LEGACY_TABS[rawTab] ?? rawTab
  const tab: CardTab = (CARD_TABS as readonly string[]).includes(mapped) ? (mapped as CardTab) : 'general'
  const setTab = (next: CardTab) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        sp.set('tab', next)
        return sp
      },
      { replace: true },
    )

  if (q.isLoading) return <CenteredSpinner />
  const status = (q.error as { response?: { status?: number } } | null)?.response?.status
  if (!q.data) {
    if (status === 403) return <ForbiddenState />
    if (status === 404)
      return (
        <PageContainer>
          <EmptyState title={t('personnel.card.notFound')} description={t('personnel.card.notFoundHint')} action={<Link to="/employees" className="text-brand hover:underline">{t('personnel.card.backToList')}</Link>} />
        </PageContainer>
      )
    return (
      <PageContainer>
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      </PageContainer>
    )
  }

  const employee = q.data
  const archived = !!employee.is_archived
  const canEdit = !archived && canManageEmployee(user, employee)
  // C4: archive / delete / rehire / migrate — `employees = full` (HR).
  const canFull = canWriteOrg(user, 'employees', 'full')

  const exportT2 = async (format: 'docx' | 'pdf') => {
    setExporting(format)
    const safe = String(employee.legal_name || employee.id).replace(/[\\/:*?"<>|]+/g, '_').trim()
    try {
      await downloadFile({ url: `employees/${employee.id}/t2/export`, params: { format, _no_branch_inject: true }, filename: `T-2_${safe}.${format}` })
    } catch (e) {
      toast.error(errorMessage(e, t('personnel.card.exportFailed')))
    } finally {
      setExporting('')
    }
  }

  const doDelete = async () => {
    const ok = await confirm({ kind: 'delete', title: t('personnel.card.deleteTitle'), description: t('personnel.card.deleteConfirm', { name: employee.legal_name ?? '' }) })
    if (!ok) return
    try {
      await remove.mutateAsync(employee.id)
      toast.ok(t('personnel.card.deleted'))
      navigate('/employees')
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to="/employees" aria-label={t('personnel.card.backToList')} className="grid h-8 w-8 place-items-center rounded-inner text-fg-muted hover:bg-surface-2 hover:text-fg">
              <ArrowLeft size={18} />
            </Link>
            {employee.legal_name}
          </span>
        }
        subtitle={employee.job_position?.name ?? undefined}
        actions={
          <>
            {canEdit && (
              <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
                {t('common.edit')}
              </Button>
            )}
            {canFull && !archived && (
              <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={14} />} onClick={() => void doDelete()} loading={remove.isPending}>
                {t('common.delete')}
              </Button>
            )}
            <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 'docx'} onClick={() => void exportT2('docx')}>
              {t('personnel.card.exportWord')}
            </Button>
            <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 'pdf'} onClick={() => void exportT2('pdf')}>
              {t('personnel.card.exportPdf')}
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<Info size={14} />} onClick={() => setTab('general')}>
              {t('personnel.card.fullInfo')}
            </Button>
          </>
        }
      />

      {archived && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2.5 rounded-card border border-danger/35 bg-danger-soft px-4 py-2.5">
          <Archive size={16} className="shrink-0 text-danger" aria-hidden />
          <span className="text-[13px] font-bold text-danger">{t('personnel.card.archived')}</span>
          <span className="text-[12.5px] text-fg-muted">
            {t('personnel.card.archivedHint')}
            {employee.archived_at ? ` — ${fmtDate(employee.archived_at)}` : ''}
            {t2.data?.archive?.reason ? ` · ${t2.data.archive.reason}` : ''}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[360px]">
          <ProfileInfo employee={employee} card={t2.data} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {canFull && (
            <div role="toolbar" aria-label={t('personnel.card.actions')} className="flex flex-wrap items-center gap-2">
              {!archived ? (
                <>
                  <Button size="sm" variant="outline" leftIcon={<ArrowRightLeft size={14} />} onClick={() => setPlacement('migrate')}>
                    {t('personnel.actions.migrate')}
                  </Button>
                  <Button size="sm" variant="danger" leftIcon={<Archive size={14} />} onClick={() => setArchiveOpen(true)}>
                    {t('personnel.archive.title')}
                  </Button>
                </>
              ) : (
                <Button size="sm" leftIcon={<UserCheck size={14} />} onClick={() => setPlacement('rehire')}>
                  {t('personnel.actions.rehire')}
                </Button>
              )}
            </div>
          )}
          <CardTabs employee={employee} active={tab} onChange={setTab} canEdit={canEdit} onEditEmployee={canEdit ? () => setEditOpen(true) : undefined} />
        </div>
      </div>

      <EmployeeFormDrawer open={editOpen} editId={employee.id} onClose={() => setEditOpen(false)} />
      <ArchiveEmployeeModal employee={archiveOpen ? employee : null} onClose={() => setArchiveOpen(false)} />
      <PlacementModal mode={placement} employee={employee} onClose={() => setPlacement(null)} />
    </PageContainer>
  )
}
