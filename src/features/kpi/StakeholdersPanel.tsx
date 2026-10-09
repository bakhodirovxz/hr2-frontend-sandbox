import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import type { Page } from '@/features/employees/useEmployees'
import type { Employee } from '@/types'
import {
  STAKEHOLDER_FLAGS,
  useKpiExtrasMutations,
  useStakeholders,
  type KpiObjectType,
  type KpiStakeholder,
  type StakeholderFlag,
} from './useKpiExtras'
import { POPOVER_CLS } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import { TH, TD } from '@/components/data/tableStyles'
import { errorMessage } from '@/api/errorMessage'
import { LoadError } from '@/components/data/LoadError'

const FLAG_LABEL: Record<StakeholderFlag, string> = {
  edit_access: 'kpi.accEdit',
  fact_insert_access: 'kpi.accFact',
  status_change_access: 'kpi.accStatus',
  task_approve_access: 'kpi.accApprove',
}

/**
 * Verifix stakeholder grants — extra per-object capabilities on top of role
 * permissions. The backend merges these into `my_access`, so what is checked
 * here is exactly what unlocks the buttons for that employee.
 */
export function StakeholdersPanel({
  objectType,
  objectId,
  canManage,
}: {
  objectType: KpiObjectType
  objectId: number
  canManage: boolean
}) {
  const { t } = useTranslation()
  const { stakeholders, loading, error: listError, refetch: refetchList } = useStakeholders(objectType, objectId)
  const mut = useKpiExtrasMutations()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [empSearch, setEmpSearch] = useState('')
  const [picked, setPicked] = useState<Employee | null>(null)
  const [flags, setFlags] = useState<Record<StakeholderFlag, boolean>>({
    edit_access: false,
    fact_insert_access: false,
    status_change_access: false,
    task_approve_access: false,
  })
  const [confirmDelete, setConfirmDelete] = useState<KpiStakeholder | null>(null)

  const { data, isError: searchFailed, error: searchError } = useQuery({
    queryKey: ['kpi', 'stakeholder-candidates', empSearch],
    queryFn: () => apiGet<Page<Employee>>(EMPLOYEES_LIST, { search: empSearch || undefined, size: 20 }),
    enabled: empSearch.trim().length > 0,
  })
  const candidates = data?.items ?? []

  const openForm = () => {
    setPicked(null)
    setEmpSearch('')
    setFlags({
      edit_access: false,
      fact_insert_access: false,
      status_change_access: false,
      task_approve_access: false,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!picked) return
    await mut.saveStakeholder.mutateAsync({
      object_type: objectType,
      object_id: objectId,
      stakeholder_id: picked.id,
      ...flags,
    })
    mut.invalidate()
    setOpen(false)
  }

  /** Toggling a flag on an existing row re-saves the whole grant (upsert). */
  const toggleFlag = async (row: KpiStakeholder, flag: StakeholderFlag) => {
    if (!(await confirm({ kind: 'status', subject: row.stakeholder?.legal_name }))) return
    await mut.saveStakeholder.mutateAsync({
      object_type: objectType,
      object_id: objectId,
      stakeholder_id: row.stakeholder_id,
      edit_access: row.edit_access ?? false,
      fact_insert_access: row.fact_insert_access ?? false,
      status_change_access: row.status_change_access ?? false,
      task_approve_access: row.task_approve_access ?? false,
      [flag]: !row[flag],
    })
    mut.invalidate()
  }

  const doDelete = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    if (!target?.id) return
    await mut.deleteStakeholder.mutateAsync(target.id)
    mut.invalidate()
  }

  return (
    <div>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={openForm}>
            <Plus size={14} /> {t('kpi.addAccess')}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-fg-subtle">…</p>
      ) : listError ? (
        <LoadError error={listError} onRetry={() => void refetchList()} />
      ) : stakeholders.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t('kpi.accessEmpty')}</p>
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 620 }}>
            <thead>
              <tr className="border-b border-line text-[11.5px] font-semibold text-fg-muted">
                <th className={TH}>{t('kpi.accessEmployee')}</th>
                {STAKEHOLDER_FLAGS.map((f) => (
                  <th key={f} className={cn(TH, "text-center")}>
                    {t(FLAG_LABEL[f] as never)}
                  </th>
                ))}
                {canManage && <th className={TH} />}
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((row) => (
                <tr key={row.id} className="border-b border-line text-sm last:border-0">
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <Avatar
                        src={row.stakeholder?.photo_thumb_path}
                        name={row.stakeholder?.legal_name}
                        size={26}
                      />
                      <span className="truncate text-fg">{row.stakeholder?.legal_name ?? '—'}</span>
                    </div>
                  </td>
                  {STAKEHOLDER_FLAGS.map((f) => (
                    <td key={f} className={cn(TD, "text-center")}>
                      <Checkbox
                        checked={!!row[f]}
                        disabled={!canManage}
                        onChange={() => void toggleFlag(row, f)}
                        aria-label={t(FLAG_LABEL[f] as never)}
                      />
                    </td>
                  ))}
                  {canManage && (
                    <td className={cn(TD, "text-right")}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-danger"
                        aria-label={t('common.delete')}
                        onClick={() => setConfirmDelete(row)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-fg-subtle">{t('kpi.accessHint')}</p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('kpi.addAccess')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!picked}>
              {t('kpi.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Input
              value={picked ? (picked.legal_name ?? '') : empSearch}
              onChange={(e) => {
                setPicked(null)
                setEmpSearch(e.target.value)
              }}
              placeholder={t('kpi.accessEmployee')}
              autoFocus
            />
            {!picked && empSearch.trim() && candidates.length === 0 && searchFailed && (
              <div className={cn(POPOVER_CLS, 'absolute z-10 mt-1 w-full px-3 py-4 text-center text-xs text-danger')}>
                {errorMessage(searchError, t('list.loadFailed'))}
              </div>
            )}
            {!picked && empSearch.trim() && candidates.length > 0 && (
              <div className={cn(POPOVER_CLS, 'absolute z-10 mt-1 max-h-56 w-full overflow-auto')}>
                {candidates.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      setPicked(emp)
                      setEmpSearch('')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <Avatar src={emp.photo_thumb_path} name={emp.legal_name} size={26} />
                    <span className="truncate text-fg">{emp.legal_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {STAKEHOLDER_FLAGS.map((f) => (
            <Checkbox
              key={f}
              checked={flags[f]}
              onChange={(e) => setFlags({ ...flags, [f]: e.target.checked })}
              label={t(FLAG_LABEL[f] as never)}
            />
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title={t('kpi.deleteAccessTitle')}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
