import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { apiGet } from '@/api/http'
import { STRUCTURE_HISTORY_EVENTS } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { inTashkent } from '@/lib/format'

type Entity = 'department' | 'job_position' | 'staff_position'
type Action = 'created' | 'updated' | 'deleted'

interface FieldChange {
  field: string
  old: unknown
  new: unknown
  old_label?: string | null
  new_label?: string | null
}

interface Change {
  entity: Entity
  action: Action
  id: number
  name?: string | null
  fields: FieldChange[]
}

interface StructureEvent {
  id: number
  at: string
  author?: { user_id: number; name?: string | null } | null
  initial: boolean
  counts?: { departments?: number; positions?: number; staff_positions?: number } | null
  changes: Change[]
}

interface EventsPage {
  items: StructureEvent[]
  page: number
  size: number
  has_more: boolean
}

const PAGE_SIZE = 20

const FIELD_KEYS: Record<string, string> = {
  name: 'logName',
  code: 'logCode',
  parent_id: 'logParent',
  head_employee_id: 'logHead',
  unit_type: 'logUnitType',
  closed_at: 'logClosedAt',
  short_name: 'logShortName',
  category: 'logCategory',
  razryad: 'logRazryad',
  department_id: 'colDepartment',
  job_position_id: 'logJobPosition',
  planned_units: 'logPlanned',
  closed: 'logClosedAt',
}

/**
 * Structure-wide change journal (TZ S1 1116 / S2 1144 «Просмотр истории
 * изменений — все изменения структуры с указанием даты и автора»).
 *
 * One row per saved change of the organisation's structure: units, positions
 * and staff units that were created, changed or deleted, with date (Tashkent
 * time) and author. Deleted units stay listed — the journal is built from the
 * structure snapshots, not from the unit rows.
 */
export function StructureHistoryModal({
  open,
  branchId,
  onClose,
}: {
  open: boolean
  branchId: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const q = useInfiniteQuery({
    queryKey: ['structure-history', 'events', branchId],
    queryFn: ({ pageParam }) =>
      apiGet<EventsPage>(STRUCTURE_HISTORY_EVENTS, {
        organization_branch_id: branchId,
        page: pageParam,
        size: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    enabled: open && !!branchId,
  })
  const events = (q.data?.pages ?? []).flatMap((p) => p.items)

  const fieldLabel = (f: string) => {
    const key = FIELD_KEYS[f]
    return key ? t(`orgAdmin.${key}` as 'orgAdmin.logName') : f
  }
  const show = (c: FieldChange, which: 'old' | 'new'): string => {
    const label = which === 'old' ? c.old_label : c.new_label
    const v = which === 'old' ? c.old : c.new
    if (c.field === 'unit_type') return t(`orgAdmin.unit_${(v as string) || 'division'}` as 'orgAdmin.unit_division')
    if (c.field === 'closed_at' || c.field === 'closed') return v ? t('orgAdmin.closedBadge') : t('orgAdmin.activeBadge')
    if (label !== undefined && label !== null && label !== '') return String(label)
    if (v === null || v === undefined || v === '') return '—'
    return String(v)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="lg"
      title={t('orgAdmin.structureHistory')}
      description={t('orgAdmin.structureHistoryHint')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !events.length ? (
        <EmptyState icon={<History size={22} />} title={t('orgAdmin.historyEmpty')} />
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-fg-subtle">
                <span>
                  {t('orgAdmin.logAuthor')}: <span className="text-fg">{ev.author?.name || '—'}</span>
                </span>
                <span className="whitespace-nowrap tabular-nums">{inTashkent(ev.at).format('DD.MM.YYYY HH:mm')}</span>
              </div>
              {ev.initial ? (
                <p className="mt-1 text-fg">
                  {t('orgAdmin.historyInitial', {
                    departments: ev.counts?.departments ?? 0,
                    positions: ev.counts?.positions ?? 0,
                  })}
                </p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {ev.changes.map((c, i) => (
                    <li key={`${c.entity}-${c.id}-${i}`}>
                      <span className="font-semibold text-fg">
                        {t(`orgAdmin.ev_${c.entity}_${c.action}` as 'orgAdmin.ev_department_created')}
                      </span>
                      <span className="ml-1.5 text-fg">«{c.name || `#${c.id}`}»</span>
                      {c.fields.length > 0 && (
                        <ul className="mt-0.5 flex flex-col gap-0.5 pl-3 text-fg-muted">
                          {c.fields.map((f) => (
                            <li key={f.field} className="break-words">
                              {fieldLabel(f.field)}:{' '}
                              <span className="text-fg-subtle line-through decoration-line">{show(f, 'old')}</span>
                              <span className="mx-1.5 text-fg-subtle">→</span>
                              <span className="text-fg">{show(f, 'new')}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('orgAdmin.historyMore')}
          </Button>
        </div>
      )}
    </Modal>
  )
}
