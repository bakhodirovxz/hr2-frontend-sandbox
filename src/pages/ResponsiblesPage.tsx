import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, Building2, Trash2, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useListParams } from '@/hooks/useListParams'
import { useBranchStore } from '@/store/branchStore'
import { errorMessage } from '@/api/errorMessage'
import type { Employee } from '@/types'
import {
  useResponsibleMutations,
  useResponsibles,
  type Responsible,
  type ResponsibleModule,
} from '@/features/responsibles/useResponsibles'

const SCOPES = [
  { key: 'department', icon: Building2, labelKey: 'responsibles.scopeDepartment', hintKey: 'responsibles.hintDepartment' },
  { key: 'job_position', icon: Briefcase, labelKey: 'responsibles.scopePosition', hintKey: 'responsibles.hintPosition' },
  { key: 'employee', icon: User, labelKey: 'responsibles.scopeEmployee', hintKey: 'responsibles.hintEmployee' },
] as const

function ResponsiblesPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  useListParams(['module'])
  // Only «Ijro» is left: the news module now reads uzgidro.uz and has no editors.
  const moduleKey: ResponsibleModule = 'ijro'
  const branchId = useBranchStore((s) => s.selectedBranchId)

  const { rows, loading } = useResponsibles(moduleKey)
  const mut = useResponsibleMutations()
  const [scope, setScope] = useState<(typeof SCOPES)[number]['key']>('department')
  const [picked, setPicked] = useState<Employee | null>(null)
  const [removing, setRemoving] = useState<Responsible | null>(null)

  const departments = useDepartmentOptions(branchId)
  const positions = useJobPositionOptions(branchId)

  // Adding a responsible grants module rights on the spot — ask first.
  const add = async (scopeId: number, subject?: string | null) => {
    if (!(await confirm({ kind: 'action', subject, confirmLabel: t('common.add') }))) return
    try {
      await mut.add.mutateAsync({ module: moduleKey, scope_type: scope, scope_id: scopeId })
      toast.ok(t('responsibles.added'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const scopeLabel = (type?: string | null) =>
    t((SCOPES.find((s) => s.key === type) ?? SCOPES[0]).labelKey as never)

  return (
    <PageContainer>
      <PageHeader title={t('responsibles.title')} subtitle={t('responsibles.subtitle')} />


      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start gap-ui border-b border-line p-3">
          <div className="w-[13rem]">
            <Field label={t('responsibles.scopeKind')} hint={t(SCOPES.find((s) => s.key === scope)!.hintKey as never)}>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                options={SCOPES.map((s) => ({ value: s.key, label: t(s.labelKey as never) }))}
              />
            </Field>
          </div>
          <div className="min-w-[16rem] flex-1">
            <Field label={t('responsibles.pick')}>
              {scope === 'employee' ? (
                <EmployeePicker
                  value={picked}
                  onChange={(emp) => {
                    setPicked(null)
                    if (emp) void add(emp.id, emp.legal_name)
                  }}
                />
              ) : (
                <Combobox
                  value=""
                  onChange={(v) => {
                    if (!v) return
                    const opts = scope === 'department' ? departments : positions
                    void add(Number(v), opts.find((o) => String(o.value) === String(v))?.label)
                  }}
                  options={scope === 'department' ? departments : positions}
                  placeholder={t('t2.pick')}
                  className="w-full"
                />
              )}
            </Field>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<User size={20} />} title={t('responsibles.empty')} description={t('responsibles.emptyHint')} />
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone="neutral">{scopeLabel(r.scope_type)}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{r.label || `#${r.scope_id}`}</span>
                  {r.sub_label && <span className="block truncate text-[11.5px] text-fg-subtle">{r.sub_label}</span>}
                </span>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(r)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-[12px] text-fg-subtle">{t('responsibles.driverNote')}</p>

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('responsibles.removeTitle')}
        description={t('responsibles.removeConfirm', { name: removing?.label ?? '' })}
        loading={mut.remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('responsibles.removed'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </PageContainer>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function ResponsiblesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isHR(user) || roles.isSiteMasterAdmin(user)} title={t('responsibles.title')}>
      <ResponsiblesPageInner />
    </RequireRole>
  )
}

