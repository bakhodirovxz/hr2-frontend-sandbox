import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { Briefcase, FileSpreadsheet, FileText, GitBranch, History, List, Network, Plus, Shuffle, Printer } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { LoadError } from '@/components/data/LoadError'
import { errorMessage } from '@/api/errorMessage'
import { DEPARTMENTS_LIST } from '@/api/endpoints'
import { canWriteOrg } from '@/auth/permissions'
import { downloadFile } from '@/lib/download'
import { formatDateTime, inTashkent } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { DepartmentCardModal, type CardTab } from '@/features/structure/DepartmentCardModal'
import { DepartmentFormModal } from '@/features/structure/DepartmentFormModal'
import { OrgChart } from '@/features/structure/OrgChart'
import { RestructureWizard } from '@/features/structure/RestructureWizard'
import {
  DepartmentListView,
  DepartmentTreeView,
  type StructureNode,
  type StructureSource,
} from '@/features/structure/StructureViews'
import { buildTree, indexTree } from '@/features/structure/structureTree'
import { printStructure } from '@/features/structure/printStructure'
import { useBranches } from '@/hooks/useBranches'
import { useDepartmentsAll, type DepartmentRow } from '@/features/structure/useDepartmentAdmin'
import { useStructureSnapshot, type SnapshotPosition, type SnapshotStaffPosition } from '@/features/structure/useHierarchy'

type View = 'tree' | 'list' | 'scheme'
const VIEWS: View[] = ['tree', 'list', 'scheme']

/**
 * TASHKILIY TUZILMA — TZ S3, 4.2.6.
 *
 * Read by everyone: a tree, a flat sortable list and the drawn scheme
 * (`?view=`). «Sana bo'yicha» (`?on=`) rebuilds the tree / list from the
 * structure as it stood on that day (TZ 2029/2061) and is read-only. The
 * scheme is editable for `canWriteOrg(user,'structure')`. Department records
 * themselves are created and edited with the same forms as on `/departments`.
 */
export function StructurePage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const canEdit = canWriteOrg(user, 'structure')
  const canEditDepartments = canWriteOrg(user, 'structure', 'edit')

  const [params, setParams] = useSearchParams()
  const rawView = params.get('view') as View | null
  const view: View = rawView && VIEWS.includes(rawView) ? rawView : 'tree'
  const asOf = view !== 'scheme' ? params.get('on') ?? '' : ''
  const patch = (next: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) sp.set(k, v)
          else sp.delete(k)
        }
        return sp
      },
      { replace: true },
    )

  const list = useDepartmentsAll(true)
  const all = useMemo(() => (list.data ?? []) as (DepartmentRow & StructureSource)[], [list.data])
  const active = useMemo(() => all.filter((d) => !d.closed_at), [all])
  const roots = useMemo(() => buildTree<StructureSource>(all), [all])
  const byId = useMemo(() => indexTree(roots), [roots])

  const snapshot = useStructureSnapshot(branchId, asOf)
  const historyMode = !!asOf && snapshot.found && snapshot.departments.length > 0
  const asOfRoots = useMemo(() => buildTree<StructureSource>(historyMode ? snapshot.departments : []), [historyMode, snapshot.departments])
  const asOfById = useMemo(() => indexTree(asOfRoots), [asOfRoots])

  const [card, setCard] = useState<{ id: number; tab: CardTab } | null>(null)
  const [asOfNode, setAsOfNode] = useState<StructureNode | null>(null)
  const [form, setForm] = useState<{ value: DepartmentRow | null } | null>(null)
  const [wizard, setWizard] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)

  const { branches } = useBranches()
  const [printing, setPrinting] = useState(false)
  const doPrint = async () => {
    setPrinting(true)
    try {
      await printStructure({
        roots: historyMode ? asOfRoots : roots,
        orgName: branches.find((b) => b.id === Number(branchId))?.name ?? t('structure.title'),
        asOf: historyMode ? asOf : undefined,
        t,
        lang: i18n.language,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('structure.print.failed')))
    } finally {
      setPrinting(false)
    }
  }

  const doExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      await downloadFile({
        url: `${DEPARTMENTS_LIST}/export`,
        params: { format },
        filename: `${t('orgAdmin.exportFile')}.${format}`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('orgAdmin.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  const viewIcons: Record<View, ReactNode> = {
    tree: <Network size={14} />,
    list: <List size={14} />,
    scheme: <GitBranch size={14} />,
  }

  let body: ReactNode
  if (!branchId) {
    body = (
      <div className="grid flex-1 place-items-center p-8">
        <EmptyState icon={<GitBranch size={22} />} title={t('structure.chartPickBranch')} description={t('structure.chartPickBranchHint')} />
      </div>
    )
  } else if (view === 'scheme') {
    body = (
      <div className="relative h-[max(520px,calc(100dvh-17rem))]">
        <OrgChart branchId={branchId} canEdit={canEdit} />
      </div>
    )
  } else if (historyMode) {
    body =
      view === 'list' ? (
        <DepartmentListView roots={asOfRoots} byId={asOfById} onOpen={setAsOfNode} />
      ) : (
        <DepartmentTreeView key={`asof-${asOf}`} roots={asOfRoots} byId={asOfById} onOpen={setAsOfNode} />
      )
  } else if (list.isLoading) {
    body = (
      <div className="grid flex-1 place-items-center p-10">
        <Spinner />
      </div>
    )
  } else if (list.error) {
    body = (
      <div className="p-6">
        <LoadError error={list.error} onRetry={() => void list.refetch()} />
      </div>
    )
  } else {
    const open = (n: StructureNode) => setCard({ id: n.id, tab: 'info' })
    body =
      view === 'list' ? (
        <DepartmentListView roots={roots} byId={byId} onOpen={open} />
      ) : (
        <DepartmentTreeView key={`live-${branchId}`} roots={roots} byId={byId} onOpen={open} />
      )
  }

  return (
    <PageContainer className="flex min-h-full flex-col">
      <PageHeader
        title={t('structure.title')}
        subtitle={t('orgRef.structureSubtitle')}
        actions={
          <>
            <Button size="sm" variant="outline" leftIcon={<FileSpreadsheet size={14} />} loading={exporting === 'xlsx'} onClick={() => doExport('xlsx')}>
              Excel
            </Button>
            <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>
              PDF
            </Button>
            {branchId && (
              <Button size="sm" variant="outline" leftIcon={<Printer size={14} />} loading={printing} onClick={() => void doPrint()}>
                {t('structure.print.action')}
              </Button>
            )}
            {canEditDepartments && branchId && view !== 'scheme' && !historyMode && (
              <>
                <Button size="sm" variant="outline" leftIcon={<Shuffle size={14} />} onClick={() => setWizard(true)}>
                  {t('orgAdmin.restructure')}
                </Button>
                <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setForm({ value: null })}>
                  {t('orgRef.addDepartment')}
                </Button>
              </>
            )}
          </>
        }
      />

      <Card className="flex min-h-[560px] flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <Segmented
            value={view}
            onChange={(v) => patch({ view: v === 'tree' ? null : v })}
            options={VIEWS.map((v) => ({ value: v, label: t(`orgRef.view_${v}`), icon: viewIcons[v] }))}
          />
          {view !== 'scheme' && branchId && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[190px]">
                <DateInput value={asOf} onChange={(v) => patch({ on: v || null })} aria-label={t('orgRef.asOf')} />
              </div>
              {asOf && snapshot.loading && <Spinner />}
              {historyMode && (
                <Badge tone="warning">
                  <History size={12} className="mr-1 inline" />
                  {t('structure.chartHistory')}
                  {snapshot.takenAt ? ` · ${formatDateTime(snapshot.takenAt)}` : ''}
                </Badge>
              )}
              {asOf && !snapshot.loading && !historyMode && <span className="text-[12px] text-fg-muted">{t('structure.chartNoSnapshot')}</span>}
              {asOf && (
                <Button size="sm" variant="ghost" onClick={() => patch({ on: null })}>
                  {t('structure.chartNow')}
                </Button>
              )}
            </div>
          )}
        </div>
        {body}
      </Card>

      <AsOfDepartmentModal
        node={asOfNode}
        byId={asOfById}
        on={asOf}
        positions={snapshot.positions}
        staff={snapshot.staffPositions}
        onClose={() => setAsOfNode(null)}
      />
      <DepartmentCardModal
        id={card?.id ?? null}
        tab={card?.tab ?? 'info'}
        onTab={(tab) => setCard((c) => (c ? { ...c, tab } : c))}
        all={all}
        onOpen={(id) => setCard({ id, tab: 'info' })}
        onClose={() => setCard(null)}
        onEdit={
          canEditDepartments
            ? (d) => {
                setCard(null)
                setForm({ value: d })
              }
            : undefined
        }
      />
      <DepartmentFormModal open={!!form} value={form?.value ?? null} all={all} onClose={() => setForm(null)} />
      <RestructureWizard open={wizard} all={active} onClose={() => setWizard(false)} />
    </PageContainer>
  )
}

/** The department as it stood on the day — read-only: name, code, parent, positions (TZ 2029, 2061). */
function AsOfDepartmentModal({
  node,
  byId,
  on,
  positions,
  staff,
  onClose,
}: {
  node: StructureNode | null
  byId: Map<number, StructureNode>
  on: string
  positions: SnapshotPosition[]
  staff: SnapshotStaffPosition[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const parent = node?.parent_id != null ? byId.get(node.parent_id) : null
  const posById = new Map(positions.map((p) => [p.id, p]))
  const rows = node ? staff.filter((s) => s.department_id === node.id) : []
  return (
    <Modal
      open={!!node}
      onClose={onClose}
      placement="right"
      size="md"
      title={node?.name ?? ''}
      description={`${t('structure.chartHistory')} · ${on ? dayjs(on).format('DD.MM.YYYY') : ''}`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {node && (
        <div className="flex flex-col gap-5 text-[13px]">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[12px] text-fg-muted">{t('orgAdmin.colCode')}</dt>
              <dd className="text-fg">{node.code || '—'}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-fg-muted">{t('orgAdmin.colParent')}</dt>
              <dd className="text-fg">{parent?.name || '—'}</dd>
            </div>
            {node.raw.closed_at && (
              <div>
                <dt className="text-[12px] text-fg-muted">{t('orgAdmin.closedBadge')}</dt>
                <dd className="text-fg">{inTashkent(node.raw.closed_at).format('DD.MM.YYYY')}</dd>
              </div>
            )}
          </dl>
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
              <Briefcase size={13} /> {t('orgRef.positionsCount', { count: rows.length })}
            </h4>
            {rows.length === 0 ? (
              <p className="text-fg-muted">{t('orgRef.noPositionsOnDate')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-inner border border-line">
                {rows.map((s) => {
                  const p = s.job_position_id != null ? posById.get(s.job_position_id) : undefined
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className={s.closed ? 'text-fg-subtle line-through' : 'text-fg'}>{p?.name ?? `#${s.job_position_id}`}</span>
                      <span className="whitespace-nowrap text-[12px] text-fg-muted">
                        {[
                          p?.category ? t(`staff.cat_${p.category}` as never) : null,
                          p?.razryad != null ? `${t('structure.colRazryad')} ${p.razryad}` : null,
                          s.planned_units != null ? `${t('staff.planned')}: ${s.planned_units}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
