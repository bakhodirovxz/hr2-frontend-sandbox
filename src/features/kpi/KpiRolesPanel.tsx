import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import {
  Avatar,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import {
  useKpiRoleMembers,
  useKpiRoleMutations,
  useKpiRoles,
  usePermissionCatalog,
  type KpiRole,
} from './useKpiRoles'

/**
 * KPI ROL KATALOGI — who may do what inside the module.
 *
 * Two things live here and they are deliberately together: the ROLES (and who
 * is in them) and the GRANT MATRIX (role × screen × action). Splitting them
 * across screens is how a role ends up existing with no permissions, or a
 * permission row pointing at a role nobody remembers creating.
 *
 * ⚠️ Writing here is MASTER-ADMIN ONLY — the server enforces it
 * (`_assert_kpi_role_admin`) because attaching a role grants authority. Other
 * roles see the catalogue read-only.
 */
/**
 * Roles the server derives on its own (`KpiPermissionService.roles_of`):
 * every account with an employee record IS «employee», a person with
 * subordinates IS «supervisor», and so on. Manual members only ADD people.
 * For «employee» adding anyone is meaningless — everyone already has it — so
 * the picker is not offered there at all.
 */
const AUTO_ROLE_NOTE: Record<string, string> = {
  employee: 'kpi.roleAutoEmployee',
  supervisor: 'kpi.roleAutoSupervisor',
  hr: 'kpi.roleAutoHr',
  admin: 'kpi.roleAutoAdmin',
  kpi_admin: 'kpi.roleAutoKpiAdmin',
}

export function KpiRolesPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  // Server `_assert_kpi_role_admin` = site master-admin only.
  const canWrite = roles.isSiteMasterAdmin(user)

  const { roles: allRoles, loading, denied } = useKpiRoles()
  // The master admin is NOT a grantable role: the server short-circuits on
  // `is_master_admin` before it ever reads the grant table, and `grants()`
  // answers from code for that role. Leaving it in the catalogue invited
  // administrators to tick boxes and add members that change nothing.
  const list = useMemo(() => allRoles.filter((r) => r.code !== 'master-admin'), [allRoles])
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = useMemo(
    () => list.find((r) => r.id === activeId) ?? list[0] ?? null,
    [list, activeId],
  )
  const { members } = useKpiRoleMembers(active?.id ?? null)
  const { screens, matrix, denied: grantsDenied } = usePermissionCatalog(!!active)
  const { options: employees } = useEmployeeOptions(branchId, true)
  const mut = useKpiRoleMutations()
  const confirm = useConfirm()

  const [roleModal, setRoleModal] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', description: '' })
  const [addMember, setAddMember] = useState('')
  const [deleteRole, setDeleteRole] = useState<KpiRole | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.ok(ok)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.roleFailed')))
    }
  }

  const toggleGrant = async (screen: string, action: string, on: boolean) => {
    if (!active?.code) return
    const current = matrix[active.code]?.[screen] ?? []
    const next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action)
    if (!(await confirm({ kind: 'status', subject: `${active.name ?? active.code}: ${screen} · ${action}` }))) return
    await run(
      () => mut.saveGrants.mutateAsync({ role: active.code as string, screen, actions: next }),
      t('kpi.roleSaved'),
    )
  }

  if (loading) return <CenteredSpinner />
  if (denied)
    return (
      <EmptyState
        icon={<Lock size={20} />}
        title={t('kpi.rolesDenied')}
        description={t('kpi.rolesDeniedHint')}
      />
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ── The catalogue ─────────────────────────────────────────────── */}
      <div className="rounded-inner border border-line">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <ShieldCheck size={15} className="text-brand-strong" />
          <span className="engrave text-fg">{t('kpi.rolesTitle')}</span>
          {canWrite && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              aria-label={t('kpi.roleNew')}
              onClick={() => {
                setForm({ code: '', name: '', description: '' })
                setRoleModal(true)
              }}
            >
              <Plus size={15} />
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="p-4 text-sm text-fg-subtle">{t('kpi.rolesEmpty')}</p>
        ) : (
          <ul className="p-1.5">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(r.id)}
                  aria-current={active?.id === r.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-inner px-3 py-2 text-left transition-colors',
                    active?.id === r.id ? 'bg-brand-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[13px] font-medium',
                        active?.id === r.id ? 'text-brand-strong' : 'text-fg',
                      )}
                    >
                      {r.name ?? r.code}
                    </span>
                    <span className="block truncate text-[11px] text-fg-subtle">{r.code}</span>
                  </span>
                  {r.is_system && (
                    <span title={t('kpi.roleSystem')}>
                      <Lock size={12} className="shrink-0 text-fg-subtle" />
                    </span>
                  )}
                  <span className="tabnum shrink-0 text-[11px] text-fg-subtle">
                    {r.code === 'employee' ? t('kpi.roleEveryone') : r.member_count ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-3 py-2.5 text-[11px] leading-[1.5] text-fg-subtle">
          {t('kpi.rolesMasterAdminNote')}
        </p>
      </div>

      {/* ── Members + grants ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {!active ? (
          <EmptyState title={t('kpi.rolePickOne')} />
        ) : (
          <>
            <div className="rounded-inner border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="engrave text-fg">{t('kpi.roleMembers')}</span>
                {canWrite && !active.is_system && (
                  <>
                    {/* «Faol» tumbleri — `updateRole` yozilgan edi, hech kim
                        chaqirmasdi: rolni yaratib va o'chirib bo'lardi, lekin
                        VAQTINCHA to'xtatib bo'lmasdi. */}
                    <Checkbox
                      className="ml-auto"
                      checked={active.is_active !== false}
                      onChange={async (e) => {
                        const isActive = e.target.checked
                        if (!(await confirm({ kind: 'status', subject: active.name ?? active.code }))) return
                        await run(
                          () =>
                            mut.updateRole.mutateAsync({
                              id: active.id,
                              body: { is_active: isActive },
                            }),
                          t('kpi.roleSaved'),
                        )
                      }}
                      label={t('kpi.roleActive')}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteRole(active)}
                    >
                      <Trash2 size={14} className="text-danger" />
                    </Button>
                  </>
                )}
              </div>

              {AUTO_ROLE_NOTE[active.code ?? ''] && (
                <p className="border-b border-line bg-brand/[0.05] px-4 py-2.5 text-[12.5px] text-fg-muted">
                  {t(AUTO_ROLE_NOTE[active.code ?? ''] as never)}
                </p>
              )}

              {canWrite && active.code !== 'employee' && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
                  <Combobox
                    value={addMember}
                    onChange={setAddMember}
                    options={employees}
                    placeholder={t('kpi.roleAddMember')}
                    className="w-72"
                  />
                  <Button
                    size="sm"
                    leftIcon={<UserPlus size={14} />}
                    disabled={!addMember}
                    loading={mut.addMembers.isPending}
                    onClick={async () => {
                      await run(
                        () =>
                          mut.addMembers.mutateAsync({
                            roleId: active.id,
                            employeeIds: [Number(addMember)],
                          }),
                        t('kpi.roleMemberAdded'),
                      )
                      setAddMember('')
                    }}
                  >
                    {t('kpi.roleAdd')}
                  </Button>
                </div>
              )}

              {members.length === 0 ? (
                active.code === 'employee' ? null : <p className="p-4 text-sm text-fg-subtle">{t('kpi.roleNoMembers')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar
                        src={m.employee?.photo_thumb_path}
                        name={m.employee?.legal_name}
                        size={28}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                        {m.employee?.legal_name ?? `#${m.employee_id}`}
                      </span>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('common.delete')}
                          onClick={async () => {
                            const ok = await confirm({
                              kind: 'delete',
                              subject: m.employee?.legal_name ?? `#${m.employee_id}`,
                            })
                            if (!ok) return
                            await run(
                              () =>
                                mut.removeMember.mutateAsync({
                                  roleId: active.id,
                                  employeeId: m.employee_id as number,
                                }),
                              t('kpi.roleMemberRemoved'),
                            )
                          }}
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-inner border border-line">
              <div className="border-b border-line px-4 py-2.5">
                <span className="engrave text-fg">{t('kpi.roleGrants')}</span>
                <p className="mt-1 text-xs text-fg-muted">{t('kpi.roleGrantsHint')}</p>
              </div>
              {grantsDenied ? (
                <p className="p-4 text-sm text-fg-subtle">{t('kpi.rolesDeniedHint')}</p>
              ) : screens.length === 0 ? (
                <p className="p-4 text-sm text-fg-subtle">{t('kpi.roleNoScreens')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {screens.map((sc) => {
                    const granted = matrix[active.code ?? '']?.[sc.screen] ?? []
                    return (
                      <li key={sc.screen} className="px-4 py-3">
                        <p className="text-[13px] font-medium text-fg">{sc.label || sc.screen}</p>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                          {sc.actions.map((a) => (
                            <Checkbox
                              key={a}
                              checked={granted.includes(a)}
                              disabled={!canWrite}
                              onChange={(e) => void toggleGrant(sc.screen, a, e.target.checked)}
                              label={a}
                            />
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={roleModal}
        onClose={() => setRoleModal(false)}
        size="sm"
        title={t('kpi.roleNew')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={mut.createRole.isPending}
              onClick={async () => {
                if (!form.code.trim() || !form.name.trim())
                  return toast.error(t('kpi.roleCodeRequired'))
                await run(
                  () =>
                    mut.createRole.mutateAsync({
                      code: form.code.trim().toLowerCase(),
                      name: form.name.trim(),
                      description: form.description.trim() || null,
                    }),
                  t('kpi.roleSaved'),
                )
                setRoleModal(false)
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label={t('kpi.roleCode')} required hint={t('kpi.roleCodeHint')}>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label={t('kpi.roleName')} required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t('kpi.okrDescription')}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteRole}
        onClose={() => setDeleteRole(null)}
        onConfirm={async () => {
          if (!deleteRole) return
          await run(() => mut.removeRole.mutateAsync(deleteRole.id), t('kpi.roleDeleted'))
          setDeleteRole(null)
          setActiveId(null)
        }}
        title={t('kpi.roleDeleteTitle')}
        description={deleteRole?.name ?? ''}
        danger
        confirmLabel={t('common.delete')}
        loading={mut.removeRole.isPending}
      />
    </div>
  )
}
