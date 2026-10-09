import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useConfirm } from '@/components/data/useConfirm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { useAuthStore } from '@/store/authStore'
import { can, canAccessSystemAdmin, isSiteMasterAdmin } from '@/auth/permissions'
import { LevelChip, useModuleLabel } from '@/features/users/PermissionLevel'
import { RoleModal } from '@/features/users/RoleModal'
import { ReassignRoleModal } from '@/features/users/ReassignRoleModal'
import { UserPermissionsPanel } from '@/features/users/UserPermissionsPanel'
import {
  normalizePerms,
  usePermissionRegistry,
  useRoleMutations,
  useRoles,
  type RoleRow,
} from '@/features/users/useUserAdmin'

const FILTER_KEYS = ['tab', 'user'] as const
const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

/**
 * Rollar va ruxsatlar — TZ A1 «Управление ролями», A2 «Назначение прав
 * доступа».
 *
 * Rol = modul × daraja matritsasi (`permissions = {modul: daraja}`). Tizim
 * rollari (`is_system`) o'chirilmaydi va ularni faqat bosh administrator
 * tahrirlaydi (`system_role_master_only`); filial administratori faqat o'z
 * filiali rollarini boshqaradi (`role_out_of_scope`). Foydalanuvchilari bor
 * rolni o'chirishda 409 `role_in_use` → qaysi rolga o'tkazishni so'raymiz.
 *
 * Ikkinchi tab — foydalanuvchiga alohida (shaxsiy) darajalar.
 */
export function RolesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const moduleLabel = useModuleLabel()
  const me = useAuthStore((s) => s.user)
  const isMaster = isSiteMasterAdmin(me)
  const canEdit = canAccessSystemAdmin(me) && can(me, 'admin', 'edit')
  const canDelete = canAccessSystemAdmin(me) && can(me, 'admin', 'full')

  const { search, setSearch, filters, setFilters } = useListParams(FILTER_KEYS)
  const tab: 'roles' | 'users' = filters.tab === 'users' ? 'users' : 'roles'

  const { modules, levels } = usePermissionRegistry()
  const list = useRoles(search)
  const all = useRoles()
  const { remove } = useRoleMutations()
  const [modal, setModal] = useState<{ role: RoleRow | null } | null>(null)
  const [reassign, setReassign] = useState<{ role: RoleRow; usersCount: number | null } | null>(null)

  const rows = useMemo(
    () =>
      [...(list.data ?? [])].sort(
        (a, b) => Number(!!b.is_system) - Number(!!a.is_system) || a.name.localeCompare(b.name, 'uz'),
      ),
    [list.data],
  )

  /** Rolni o'zgartira oladimi: tizim va umumiy rollar — faqat bosh administrator. */
  const lockReason = (g: RoleRow): string | null => {
    if (isMaster) return null
    if (g.is_system) return t('roleAdmin.systemMasterOnly')
    if (g.organization_branch_id == null) return t('roleAdmin.sharedMasterOnly')
    return null
  }

  const doRemove = async (g: RoleRow) => {
    const ok = await confirm({ kind: 'delete', title: t('roleAdmin.deleteTitle'), subject: g.name })
    if (!ok) return
    try {
      await remove.mutateAsync({ id: g.id })
      toast.ok(t('common.deleted'))
    } catch (err) {
      if (errorCode(err) === 'role_in_use') {
        const n = errorParams(err).users_count
        setReassign({ role: g, usersCount: typeof n === 'number' ? n : (g.users_count ?? null) })
      } else {
        toast.error(errorMessage(err, t('common.actionFailed')))
      }
    }
  }

  const columns: Column<RoleRow>[] = [
    {
      key: 'name',
      header: t('roleAdmin.name'),
      skeleton: 'w-48',
      cell: (g) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-fg">{g.name}</span>
          {g.is_system && (
            <Badge tone="neutral" title={t('roleAdmin.systemNoDelete')}>
              <Lock size={10} aria-hidden="true" /> {t('roleAdmin.system')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      header: t('roleAdmin.code'),
      skeleton: 'w-24',
      className: 'font-mono text-xs text-fg-muted',
      cell: (g) => g.code || '—',
    },
    {
      key: 'description',
      header: t('roleAdmin.description'),
      skeleton: 'w-56',
      className: 'max-w-[300px] text-fg-muted',
      cell: (g) => (
        <span className="line-clamp-3" title={g.description ?? undefined}>
          {g.description || '—'}
        </span>
      ),
    },
    {
      key: 'users',
      header: t('roleAdmin.usersCount'),
      skeleton: 'w-8',
      headerClassName: 'text-center',
      className: 'text-center tabular-nums',
      cell: (g) => g.users_count ?? '—',
    },
    {
      key: 'perms',
      header: t('roleAdmin.permissions'),
      skeleton: 'w-64',
      cell: (g) => {
        const perms = normalizePerms(g.permissions)
        const keys = modules.filter((m) => perms[m] && perms[m] !== 'none')
        if (!keys.length) return <span className="text-fg-subtle">{t('roleAdmin.noPermissions')}</span>
        return (
          <div className="flex max-w-[460px] flex-wrap gap-1">
            {keys.slice(0, 6).map((m) => (
              <LevelChip key={m} level={perms[m]!} prefix={moduleLabel(m)} />
            ))}
            {keys.length > 6 && <span className="self-center text-xs text-fg-subtle">+{keys.length - 6}</span>}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      label: t('userAdmin.actions'),
      headerClassName: 'w-24',
      className: 'pr-4',
      skeleton: 'w-16',
      lockVisible: true,
      cell: (g) => {
        const reason = lockReason(g)
        return (
          <div className="flex justify-end gap-0.5">
            {canEdit && (
              <IconButton
                size="sm"
                label={reason ?? `${t('common.edit')}: ${g.name}`}
                disabled={!!reason}
                className={DISABLED}
                onClick={() => setModal({ role: g })}
              >
                <Pencil size={15} />
              </IconButton>
            )}
            {canDelete && (
              <IconButton
                size="sm"
                label={g.is_system ? t('roleAdmin.systemNoDelete') : (reason ?? `${t('common.delete')}: ${g.name}`)}
                disabled={!!g.is_system || !!reason}
                className={DISABLED}
                onClick={() => void doRemove(g)}
              >
                <Trash2 size={15} />
              </IconButton>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('roleAdmin.title')}
        subtitle={t('roleAdmin.subtitle')}
        actions={
          canEdit && tab === 'roles' ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setModal({ role: null })}>
              {t('roleAdmin.createTitle')}
            </Button>
          ) : undefined
        }
      />

      <Segmented
        className="mb-4"
        aria-label={t('roleAdmin.title')}
        value={tab}
        onChange={(v) => setFilters({ tab: v === 'users' ? 'users' : null, q: null, user: null })}
        options={[
          { value: 'roles', label: t('roleAdmin.tabRoles'), icon: <ShieldCheck size={14} /> },
          { value: 'users', label: t('roleAdmin.tabUsers'), icon: <Users size={14} /> },
        ]}
      />

      {tab === 'roles' ? (
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('roleAdmin.searchPlaceholder')}
              className="flex-1 sm:max-w-sm"
            />
            <FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />
          </div>
          <DataTable
            tableId="roles-admin"
            rows={rows}
            columns={columns}
            loading={list.isLoading}
            error={list.error}
            onRetry={list.refetch}
            emptyTitle={t('roleAdmin.empty')}
            filtered={!!search}
            emptyAction={<FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />}
            minWidth={1000}
          />
        </Card>
      ) : (
        <UserPermissionsPanel
          userId={Number(filters.user) || null}
          onPick={(id) => setFilters({ user: id || null })}
          roles={all.data ?? []}
          modules={modules}
          levels={levels}
          canEdit={canEdit}
          meId={me?.id}
        />
      )}

      <RoleModal state={modal} modules={modules} levels={levels} onClose={() => setModal(null)} />
      <ReassignRoleModal state={reassign} roles={all.data ?? []} onClose={() => setReassign(null)} />
    </PageContainer>
  )
}
