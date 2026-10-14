import { useEffect, useState } from 'react'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeft, ArrowRightLeft, FileDown, History, Info, Pencil, Trash2, UserCheck } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ForbiddenState } from '@/components/layout/RequireRole'
import { Button } from '@/components/ui/Button'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
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
import { useArchivedRow, useEmployeeDetail } from '@/features/employees/useEmployees'
import { RestoreEmployeeModal, canRestoreUntil } from '@/features/employees/RestoreEmployeeModal'
import { inUtc } from '@/lib/format'
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
  const navigate = useNavigate()
  const { id: rawId } = useParams()
  const id = Number(rawId) || null
  const [params, setParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const q = useEmployeeDetail(id)
  const t2 = useT2Card(id)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [placement, setPlacement] = useState<'rehire' | 'migrate' | null>(null)
  const [exporting, setExporting] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  // TZ C4: the archive list's «Tiklash» dialog sends here with `?action=rehire`
  // when the server says the card can only be rehired.
  const wantsRehire = params.get('action') === 'rehire'
  const canFullEarly = canWriteOrg(user, 'employees', 'full')
  const archivedRow = useArchivedRow(q.data, canFullEarly)
  useEffect(() => {
    if (!wantsRehire || !q.data?.is_archived) return
    setPlacement('rehire')
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        sp.delete('action')
        return sp
      },
      { replace: true },
    )
  }, [wantsRehire, q.data?.is_archived, setParams])

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
  // C4: archive / delete / rehire / migrate / restore — `employees = full` (HR).
  const canFull = canFullEarly
  // TZ C4 1087: restoring is possible until `restore_until` (archive row).
  const restoreUntil = archivedRow.data?.restore_until ?? null
  const restorable = archived && canFull && canRestoreUntil(restoreUntil)

  // T-2 card (TZ 2157) and «Ma'lumotnoma» / объективка (TZ 360).
  const exportDoc = async (kind: 't2' | 'obyektivka', format: 'docx' | 'pdf') => {
    setExporting(`${kind}-${format}`)
    const safe = String(employee.legal_name || employee.id).replace(/[\\/:*?"<>|]+/g, '_').trim()
    const url = kind === 't2' ? `employees/${employee.id}/t2/export` : `employees/${employee.id}/obyektivka`
    const prefix = kind === 't2' ? 'T-2' : 'Obyektivka'
    try {
      await downloadFile({ url, params: { format, _no_branch_inject: true }, filename: `${prefix}_${safe}.${format}` })
    } catch (e) {
      toast.error(errorMessage(e, t('personnel.card.exportFailed')))
    } finally {
      setExporting('')
    }
  }
  const own = user?.employee?.id === employee.id
  const canObyektivka = canFull || own

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
        subtitle={ln(employee.job_position) || undefined}
        actions={
          <>
            {canEdit && (
              <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
                {t('common.edit')}
              </Button>
            )}
            {canFull && !archived && (
              <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={14} />} onClick={() => setArchiveOpen(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button size="sm" variant="outline" leftIcon={<History size={14} />} onClick={() => setTab('asof')}>
              {t('personnel.card.history')}
            </Button>
            <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 't2-docx'} onClick={() => void exportDoc('t2', 'docx')}>
              {t('personnel.card.exportWord')}
            </Button>
            <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 't2-pdf'} onClick={() => void exportDoc('t2', 'pdf')}>
              {t('personnel.card.exportPdf')}
            </Button>
            {canObyektivka && (
              <>
                <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 'obyektivka-docx'} onClick={() => void exportDoc('obyektivka', 'docx')}>
                  {t('personnel.card.obyektivkaWord')}
                </Button>
                <Button size="sm" variant="outline" leftIcon={<FileDown size={14} />} loading={exporting === 'obyektivka-pdf'} onClick={() => void exportDoc('obyektivka', 'pdf')}>
                  {t('personnel.card.obyektivkaPdf')}
                </Button>
              </>
            )}
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
          {restorable && (
            <span className="text-[12.5px] font-semibold text-fg">{t('hrExt.restore.until', { date: inUtc(restoreUntil) })}</span>
          )}
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
                <>
                  {restorable && (
                    <Button size="sm" leftIcon={<ArchiveRestore size={14} />} onClick={() => setRestoreOpen(true)}>
                      {t('hrExt.restore.title')}
                    </Button>
                  )}
                  <Button size="sm" variant={restorable ? 'outline' : 'primary'} leftIcon={<UserCheck size={14} />} onClick={() => setPlacement('rehire')}>
                    {t('personnel.actions.rehire')}
                  </Button>
                </>
              )}
            </div>
          )}
          <CardTabs employee={employee} active={tab} onChange={setTab} canEdit={canEdit} onEditEmployee={canEdit ? () => setEditOpen(true) : undefined} />
        </div>
      </div>

      <EmployeeFormDrawer open={editOpen} editId={employee.id} onClose={() => setEditOpen(false)} />
      <ArchiveEmployeeModal employee={archiveOpen ? employee : null} onClose={() => setArchiveOpen(false)} onDone={() => navigate('/employees')} />
      <PlacementModal mode={placement} employee={employee} onClose={() => setPlacement(null)} />
      <RestoreEmployeeModal
        target={restoreOpen ? { id: employee.id, legal_name: employee.legal_name, restore_until: restoreUntil } : null}
        onClose={() => setRestoreOpen(false)}
        onRehire={() => setPlacement('rehire')}
      />
    </PageContainer>
  )
}
