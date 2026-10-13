import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArchiveRestore, KeyRound, LockOpen, MonitorSmartphone, Pencil, Plus, Power, PowerOff, ShieldCheck, Trash2 } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useConfirm } from '@/components/data/useConfirm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { useBranches } from '@/hooks/useBranches'
import { useAuthStore } from '@/store/authStore'
import { can, canAccessSystemAdmin, isBranchAdmin, isSiteMasterAdmin } from '@/auth/permissions'
import { inTashkent } from '@/lib/format'
import { UserDrawer } from '@/features/users/UserDrawer'
import { SetPasswordModal } from '@/features/users/SetPasswordModal'
import { isLocked, useRoles, useUserList, useUserMutations, type UserAdminRow } from '@/features/users/useUserAdmin'
import { UserSessionsModal } from '@/features/users/UserSessionsModal'
import { SecurityPolicyModal } from '@/features/users/SecurityPolicyModal'
import { ArchiveSettingsModal } from '@/features/employees/ArchiveSettingsModal'

const FILTER_KEYS = ['role', 'active', 'branch'] as const
const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

const fmtDateTime = (d?: string | null) => {
  if (!d) return '—'
  const x = inTashkent(d)
  return x.isValid() ? x.format('DD.MM.YYYY HH:mm') : '—'
}

/**
 * «Foydalanuvchilar» — TZ A3 «Управление пользователями».
 *
 * Ro'yxat (login, F.I.Sh., pochta, rol, filial, faollik, oxirgi kirish),
 * qidiruv va filtrlar (rol, faollik, filial); yaratish/tahrirlash paneli,
 * bloklash/faollashtirish, parol o'rnatish, o'chirish (o'zini emas).
 *
 * Filial administratori faqat o'z filiali hisoblarini ko'radi (backend);
 * filial filtri va formadagi filial uning filialiga qulflanadi.
 */
export function UsersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const me = useAuthStore((s) => s.user)
  const lockedBranchId = isBranchAdmin(me) ? (me?.admin?.organization_branch_id ?? null) : null
  const canEdit = canAccessSystemAdmin(me) && can(me, 'admin', 'edit')
  const canDelete = canAccessSystemAdmin(me) && can(me, 'admin', 'full')

  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)
  const list = useUserList({
    page,
    size,
    search,
    roleId: filters.role,
    active: filters.active,
    branchId: lockedBranchId || filters.branch,
  })
  const roles = useRoles()
  const { branches } = useBranches()
  const { setActive, remove, unlock } = useUserMutations()
  const [sessionsTarget, setSessionsTarget] = useState<UserAdminRow | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [archiveSettingsOpen, setArchiveSettingsOpen] = useState(false)

  const [drawer, setDrawer] = useState<{ open: boolean; initial: UserAdminRow | null }>({ open: false, initial: null })
  const [pwTarget, setPwTarget] = useState<UserAdminRow | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const roleOptions = useMemo(
    () => (roles.data ?? []).map((r) => ({ value: String(r.id), label: r.name })),
    [roles.data],
  )
  const branchOptions = useMemo(
    () =>
      branches
        .filter((b) => !lockedBranchId || Number(b.id) === Number(lockedBranchId))
        .map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
    [branches, lockedBranchId],
  )

  const nameOf = (u: UserAdminRow) => u.full_name || u.username

  const toggleActive = async (u: UserAdminRow) => {
    if (u.is_active) {
      const ok = await confirm({
        kind: 'status',
        title: t('userAdmin.blockTitle'),
        description: t('userAdmin.blockConfirm', { name: nameOf(u) }),
        confirmLabel: t('userAdmin.block'),
      })
      if (!ok) return
    }
    setBusyId(u.id)
    try {
      await setActive.mutateAsync({ id: u.id, active: !u.is_active })
      toast.ok(u.is_active ? t('userAdmin.blocked') : t('userAdmin.activated'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    } finally {
      setBusyId(null)
    }
  }

  /** TZ U1 772 — xato urinishlar bloki muddatidan oldin ochiladi. */
  const doUnlock = async (u: UserAdminRow) => {
    setBusyId(u.id)
    try {
      await unlock.mutateAsync(u.id)
      toast.ok(t('userAdmin.unlocked'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    } finally {
      setBusyId(null)
    }
  }

  const doRemove = async (u: UserAdminRow) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('userAdmin.deleteTitle'),
      description: t('userAdmin.deleteConfirm', { name: nameOf(u) }),
    })
    if (!ok) return
    setBusyId(u.id)
    try {
      await remove.mutateAsync(u.id)
      toast.ok(t('common.deleted'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<UserAdminRow>[] = [
    {
      key: 'username',
      header: t('userAdmin.login'),
      skeleton: 'w-28',
      cell: (u) => <span className="block min-w-[9rem] max-w-[12rem] break-all font-semibold text-fg">{u.username}</span>,
    },
    {
      key: 'full_name',
      header: t('userAdmin.fullName'),
      skeleton: 'w-44',
      cell: (u) => <span className="block min-w-[11rem] text-fg">{u.full_name || '—'}</span>,
    },
    {
      key: 'email',
      header: t('userAdmin.email'),
      skeleton: 'w-40',
      // 1280 px da (TZ asosiy ruxsat) amallar ustuni siqilib ko'rinmay qolardi.
      headerClassName: 'hidden 2xl:table-cell',
      className: 'hidden text-fg-muted 2xl:table-cell',
      cell: (u) => (
        <span className="block max-w-[14rem] truncate" title={u.email || undefined}>
          {u.email || '—'}
        </span>
      ),
    },
    {
      key: 'role',
      header: t('userAdmin.role'),
      skeleton: 'w-32',
      cell: (u) =>
        u.role?.name ? (
          <Badge tone="brand">{u.role.name}</Badge>
        ) : (
          <span className="text-fg-subtle">{t('userAdmin.noRole')}</span>
        ),
    },
    {
      key: 'branch',
      header: t('userAdmin.branch'),
      skeleton: 'w-40',
      className: 'text-fg-muted',
      cell: (u) => u.organization_branch?.name || '—',
    },
    {
      key: 'status',
      header: t('userAdmin.status'),
      skeleton: 'w-20',
      cell: (u) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={u.is_active ? 'success' : 'danger'} dot>
            {u.is_active ? t('userAdmin.active') : t('userAdmin.blockedState')}
          </Badge>
          {isLocked(u) && (
            <Badge tone="warning" title={t('userAdmin.lockedHint', { at: fmtDateTime(u.locked_until) })}>
              {t('userAdmin.lockedBadge', { at: fmtDateTime(u.locked_until) })}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'last_login',
      header: t('userAdmin.lastLogin'),
      skeleton: 'w-28',
      className: 'tabular-nums text-fg-muted whitespace-nowrap',
      cell: (u) => fmtDateTime(u.last_login_at),
    },
    {
      key: 'actions',
      header: '',
      label: t('userAdmin.actions'),
      headerClassName: 'w-40',
      className: 'pr-4',
      skeleton: 'w-24',
      lockVisible: true,
      cell: (u) => {
        const isSelf = me?.id === u.id
        const busy = busyId === u.id
        return (
          <div className="flex justify-end gap-0.5">
            {canEdit && (
              <>
                <IconButton size="sm" label={`${t('common.edit')}: ${u.username}`} onClick={() => setDrawer({ open: true, initial: u })}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton size="sm" label={`${t('userAdmin.setPassword')}: ${u.username}`} onClick={() => setPwTarget(u)}>
                  <KeyRound size={15} />
                </IconButton>
                {isLocked(u) && (
                  <IconButton
                    size="sm"
                    label={`${t('userAdmin.unlock')}: ${u.username}`}
                    disabled={busy}
                    className={DISABLED}
                    onClick={() => void doUnlock(u)}
                  >
                    <LockOpen size={15} />
                  </IconButton>
                )}
                <IconButton
                  size="sm"
                  label={`${t('userAdmin.sessions')}: ${u.username}`}
                  disabled={isSelf}
                  className={DISABLED}
                  onClick={() => setSessionsTarget(u)}
                >
                  <MonitorSmartphone size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  label={`${u.is_active ? t('userAdmin.block') : t('userAdmin.activate')}: ${u.username}`}
                  disabled={isSelf || busy}
                  className={DISABLED}
                  onClick={() => void toggleActive(u)}
                >
                  {u.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                </IconButton>
              </>
            )}
            {canDelete && (
              <IconButton
                size="sm"
                label={`${t('common.delete')}: ${u.username}`}
                disabled={isSelf || busy}
                  className={DISABLED}
                onClick={() => void doRemove(u)}
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
        title={t('userAdmin.title')}
        subtitle={t('userAdmin.subtitle')}
        actions={
          canEdit || isSiteMasterAdmin(me) ? (
            <>
              {isSiteMasterAdmin(me) && (
                <Button variant="secondary" leftIcon={<ShieldCheck size={16} />} onClick={() => setPolicyOpen(true)}>
                  {t('userAdmin.policyTitle')}
                </Button>
              )}
              {/* TZ C4 1087: arxivdan tiklash muddati — tizim sozlamasi. */}
              {isSiteMasterAdmin(me) && (
                <Button variant="secondary" leftIcon={<ArchiveRestore size={16} />} onClick={() => setArchiveSettingsOpen(true)}>
                  {t('hrExt.archiveSettings.title')}
                </Button>
              )}
              {canEdit && (
                <Button leftIcon={<Plus size={16} />} onClick={() => setDrawer({ open: true, initial: null })}>
                  {t('userAdmin.createTitle')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('userAdmin.searchPlaceholder')}
            className="flex-1 lg:max-w-sm"
          />
          <Combobox
            value={filters.role}
            onChange={(v) => setFilter('role', v)}
            options={roleOptions}
            placeholder={t('userAdmin.allRoles')}
            className="w-full lg:w-60"
          />
          <Combobox
            value={filters.active}
            onChange={(v) => setFilter('active', v)}
            options={[
              { value: 'yes', label: t('userAdmin.active') },
              { value: 'no', label: t('userAdmin.blockedState') },
            ]}
            placeholder={t('userAdmin.allStates')}
            className="w-full lg:w-44"
          />
          {!lockedBranchId && branchOptions.length > 0 && (
            <Combobox
              value={filters.branch}
              onChange={(v) => setFilter('branch', v)}
              options={branchOptions}
              placeholder={t('userAdmin.allBranches')}
              className="w-full lg:w-72"
            />
          )}
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        <DataTable
          tableId="users-admin"
          rows={list.data?.items ?? []}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyTitle={t('userAdmin.empty')}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={1100}
        />
        <Pagination
          page={page}
          size={size}
          total={list.data?.total ?? 0}
          pages={list.data?.pages ?? 0}
          onPage={setPage}
          onSize={setSize}
          loading={list.isFetching}
        />
      </Card>

      <UserDrawer
        open={drawer.open}
        initial={drawer.initial}
        isSelf={!!drawer.initial && drawer.initial.id === me?.id}
        roleOptions={roleOptions}
        branchOptions={branchOptions}
        lockedBranchId={lockedBranchId}
        onClose={() => setDrawer({ open: false, initial: null })}
      />
      <SetPasswordModal target={pwTarget} onClose={() => setPwTarget(null)} />
      <UserSessionsModal target={sessionsTarget} onClose={() => setSessionsTarget(null)} />
      <SecurityPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />
      <ArchiveSettingsModal open={archiveSettingsOpen} onClose={() => setArchiveSettingsOpen(false)} />
    </PageContainer>
  )
}
