import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, Plus, ShieldQuestion, Trash2, UserCheck, UserX } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { MultiOrgTab } from '@/features/users/MultiOrgTab'
import { KioskUsersTab } from '@/features/users/KioskUsersTab'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { PhotoPicker } from '@/features/employees/PhotoPicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { BulkBar } from '@/components/data/BulkBar'
import { IconButton } from '@/components/ui/IconButton'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useBranches } from '@/hooks/useBranches'
import { useBranchStore } from '@/store/branchStore'
import {
  toItems,
  useAdmins,
  useEmployeeAccounts,
  useUserOps,
  type AdminRow,
  type EmployeeAccountRow,
} from '@/features/users/useUsers'

/**
 * Foydalanuvchilar — TZ 4.2.1 (Схема №1).
 *
 * To'rt tab: xodim hisoblari (faollashtirish/faolsizlantirish), administrator
 * hisoblari, ROL VAKILLARI — filiallar bo'ylab rol egalari (v1 dagi
 * «multi-modal» ro'yxati) va kiosk hisoblari. «Ruxsat guruhlari» tabi
 * olib tashlandi — server guruhlarni hech qayerda tekshirmaydi (useUsers.ts).
 *
 * ⚠️ FAOLSIZLANTIRISH O'CHIRISH EMAS: kartochka va butun tarix joyida qoladi,
 * faqat kirish to'xtaydi va jonli sessiyalar bekor qilinadi. Ishdan bo'shatish
 * uchun buyruq oqimi bor — bu esa administratorning qo'l tugmasi.
 */

type Tab = 'accounts' | 'admins' | 'multiorg' | 'kiosk'

export function UsersPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'accounts'

  const setTab = (v: string) => {
    const p = new URLSearchParams(params)
    p.set('tab', v)
    p.delete('page')
    setParams(p, { replace: true })
  }

  return (
    <PageContainer>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'accounts', label: t('users.tabAccounts') },
            { value: 'admins', label: t('users.tabAdmins') },
            { value: 'multiorg', label: t('users.tabMultiOrg') },
            { value: 'kiosk', label: t('users.tabKiosk') },
          ]}
        />
      </div>

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'admins' && <AdminsTab />}
      {tab === 'multiorg' && <MultiOrgTab />}
      {tab === 'kiosk' && <KioskUsersTab />}
    </PageContainer>
  )
}

function Denied() {
  const { t } = useTranslation()
  return (
    <Card className="p-10">
      <EmptyState
        icon={<ShieldQuestion size={26} />}
        title={t('common.noAccess')}
        description={t('users.noAccessHint')}
      />
    </Card>
  )
}

function is403(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 403
}

// ── Xodim hisoblari ────────────────────────────────────────────────────────

function AccountsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  // `confirm` below is the deactivate dialog's row — the hook is `ask`.
  const ask = useConfirm()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  // URL state via the shared hook (`q`, `page`, `size`) — this tab used to
  // hand-roll it with its own `search` key and a page size of 20.
  const { search, setSearch, page, setPage, size, setSize, reset } = useListParams()

  const list = useEmployeeAccounts({
    search,
    page,
    size,
    organization_branch_id: branchId,
  })
  const ops = useUserOps()
  const [confirm, setConfirm] = useState<EmployeeAccountRow | null>(null)
  // Bulk: a new hire intake gets one role for twenty people, a departure
  // round switches a dozen accounts off — row by row that was 20 dialogs.
  const bulk = useBulkAction()
  const [bulkActive, setBulkActive] = useState<boolean | null>(null)

  const rows = toItems(list.data)
  const selection = useRowSelection(rows, { resetKey: JSON.stringify([search, branchId]) })
  if (is403(list.error)) return <Denied />
  const runBulk = async (fn: (id: number) => Promise<unknown>, okText: string) => {
    const failed = await bulk.run(selection.selectedIds, fn)
    if (failed.length) toast.error(t('list.bulkPartialFail', { count: failed.length }))
    else {
      toast.ok(okText)
      selection.clear()
    }
  }

  const columns: Column<EmployeeAccountRow>[] = [
    {
      key: 'name',
      header: t('users.colEmployee'),
      skeleton: 'w-56',
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} name={r.legal_name ?? ''} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{r.legal_name || '—'}</p>
            <p className="truncate text-xs text-fg-muted">{r.email || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'place',
      header: t('users.colPlace'),
      skeleton: 'w-[520px]',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{r.department?.name || '—'}</p>
          <p className="truncate text-xs text-fg-muted">{r.job_position?.name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'state',
      header: t('users.colState'),
      skeleton: 'w-24',
      cell: (r) =>
        r.account_is_active == null ? (
          <Badge tone="neutral">{t('users.noAccount')}</Badge>
        ) : r.account_is_active ? (
          <Badge tone="success">{t('users.active')}</Badge>
        ) : (
          <Badge tone="danger">{t('users.inactive')}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      skeleton: 'w-8',
      className: 'text-right',
      cell: (r) =>
        r.account_is_active == null ? null : (
          // A rare, destructive action must not be the loudest thing on every
          // row: it was a filled red button, then red text, 150 times down the
          // page. Now an icon with a tooltip; «Faollashtirish» (the recovery)
          // keeps its label because it is the one worth noticing.
          r.account_is_active ? (
            <IconButton size="sm" label={t('users.deactivate')} onClick={() => setConfirm(r)} className="text-fg-subtle hover:bg-danger-soft hover:text-danger">
              <UserX size={15} />
            </IconButton>
          ) : (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<UserCheck size={14} />}
            onClick={async () => {
              {
                if (!(await ask({ kind: 'status', subject: r.legal_name, confirmLabel: t('users.activate') }))) return
                ops.setEmployeeActive.mutate(
                  { id: r.id, active: true },
                  {
                    onSuccess: () => toast.ok(t('users.activated')),
                    onError: (err) => toast.error(errorMessage(err, t('users.actionFailed'))),
                  },
                )
              }
            }}
          >
            {t('users.activate')}
          </Button>
          )
        ),
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('users.searchPlaceholder')}
          className="w-full max-w-[320px]"
        />
        <FilterReset count={search ? 1 : 0} onReset={reset} />
      </div>

      <Card>
        <DataTable
        tableId="users-1"
          rows={rows}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          filtered={!!search}
          emptyAction={<FilterReset count={search ? 1 : 0} onReset={reset} />}
          emptyTitle={t('users.emptyAccounts')}
          minWidth={980}
          selection={selection}
        />
        <Pagination
          page={page}
          size={size}
          total={(list.data as { total?: number } | undefined)?.total ?? rows.length}
          pages={(list.data as { pages?: number } | undefined)?.pages ?? 1}
          onPage={setPage}
          onSize={setSize}
          loading={list.isFetching}
        />
      </Card>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress}>
        <Button size="sm" variant="outline" leftIcon={<UserCheck size={14} />} onClick={() => setBulkActive(true)}>
          {t('users.activate')}
        </Button>
        <Button size="sm" variant="danger" leftIcon={<UserX size={14} />} onClick={() => setBulkActive(false)}>
          {t('users.deactivate')}
        </Button>
      </BulkBar>

      <ConfirmDialog
        open={bulkActive != null}
        onClose={() => setBulkActive(null)}
        danger={bulkActive === false}
        title={bulkActive ? t('users.activate') : t('users.deactivateTitle')}
        description={t(bulkActive ? 'users.bulkActivateConfirm' : 'users.bulkDeactivateConfirm', { count: selection.count })}
        confirmLabel={bulkActive ? t('users.activate') : t('users.deactivate')}
        onConfirm={() => {
          const v = !!bulkActive
          setBulkActive(null)
          // Rows without an account have nothing to switch.
          const ids = new Set(rows.filter((r) => r.account_is_active != null && r.account_is_active !== v).map((r) => r.id))
          void runBulk(
            (id) => (ids.has(id) ? ops.setEmployeeActive.mutateAsync({ id, active: v }) : Promise.resolve()),
            t(v ? 'users.activated' : 'users.deactivated'),
          )
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('users.deactivateTitle')}
        description={t('users.deactivateHint', { name: confirm?.legal_name ?? '' })}
        confirmLabel={t('users.deactivate')}
        danger
        loading={ops.setEmployeeActive.isPending}
        onConfirm={() => {
          if (!confirm) return
          ops.setEmployeeActive.mutate(
            { id: confirm.id, active: false },
            {
              onSuccess: () => {
                toast.ok(t('users.deactivated'))
                setConfirm(null)
              },
              onError: (err) => toast.error(errorMessage(err, t('users.actionFailed'))),
            },
          )
        }}
      />
    </>
  )
}

// ── Administrator hisoblari ────────────────────────────────────────────────

function AdminsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const admins = useAdmins()
  const { branches } = useBranches()
  const ops = useUserOps()

  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null)
  const [removing, setRemoving] = useState<AdminRow | null>(null)

  if (is403(admins.error)) return <Denied />

  const rows = toItems(admins.data)
  const branchName = (id?: number | null) =>
    branches.find((b) => b.id === id)?.name || t('users.allBranches')

  const columns: Column<AdminRow>[] = [
    {
      key: 'email',
      header: t('users.colAdmin'),
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.email ?? ''} size={30} />
          <span className="truncate font-medium text-fg">{r.email || '—'}</span>
        </div>
      ),
    },
    { key: 'branch', header: t('users.colBranch'), cell: (r) => branchName(r.organization_branch_id) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<KeyRound size={14} />}
            onClick={async () => {
              if (!(await confirm({ kind: 'action', subject: r.email, confirmLabel: t('users.sendPassword') }))) return
              ops.sendAdminPassword.mutate(r.id, {
                onSuccess: () => toast.ok(t('users.passwordSent')),
                onError: (err) => toast.error(errorMessage(err, t('users.actionFailed'))),
              })
            }}
          >
            {t('users.sendPassword')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
            {t('common.edit')}
          </Button>
          <Button
            size="sm"
            variant="danger-ghost"
            leftIcon={<Trash2 size={14} />}
            onClick={() => setRemoving(r)}
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      {/* ⚠️ Maslahat + tugma uchun ALOHIDA kartochka YO'Q: u deyarli bo'sh
          slab bo'lib, ekranning 60 pikselini yeb turardi. Amal sarlavha
          qatoriga, izoh esa jadval tepasiga bir qatorga ko'chdi. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-fg-subtle">{t('users.adminsHint')}</p>
        <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
          {t('users.newAdmin')}
        </Button>
      </div>

      <Card>
        <DataTable
        tableId="users-2"
          rows={rows}
          columns={columns}
          loading={admins.isLoading}
          error={admins.error}
          onRetry={admins.refetch}
          emptyTitle={t('users.emptyAdmins')}
          minWidth={860}
        />
      </Card>

      {editing && (
        <AdminModal
          row={editing === 'new' ? null : editing}
          branches={branches.map((b) => ({ id: b.id, name: b.name ?? `#${b.id}` }))}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('users.deleteAdminTitle')}
        description={removing?.email ?? ''}
        confirmLabel={t('common.delete')}
        danger
        loading={ops.deleteAdmin.isPending}
        onConfirm={() => {
          if (!removing) return
          ops.deleteAdmin.mutate(removing.id, {
            onSuccess: () => {
              toast.ok(t('users.adminDeleted'))
              setRemoving(null)
            },
            onError: (err) => toast.error(errorMessage(err, t('users.actionFailed'))),
          })
        }}
      />
    </>
  )
}

function AdminModal({
  row,
  branches,
  onClose,
}: {
  row: AdminRow | null
  branches: { id: number; name: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useUserOps()

  const [email, setEmail] = useState(row?.email ?? '')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState(String(row?.organization_branch_id ?? ''))
  /* The admin record carries a portrait: the model stores it and the schema
     takes `photo_base64` on both create and update. v1's drawer has always
     offered it; v2's had no file input at all, so an administrator account
     could never get a face — only the letter avatar. */
  const [photo, setPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')

  const save = async () => {
    if (!email.trim()) {
      setError(t('users.errEmail'))
      return
    }
    // ⚠️ 8: administrator hisobi ham `UserService.create_user` orqali ochiladi
    // va u foydalanuvchi tanlagan parolga 8 belgi chegarasini qo'yadi.
    // A new admin may be created WITHOUT a password: the worker then mails a
    // one-time password to the address. A chosen one is kept as entered.
    if (password && password.length < 8) {
      setError(t('register.errPasswordShort'))
      return
    }
    setError('')
    try {
      if (row) {
        const body: Record<string, unknown> = {
          email: email.trim(),
          organization_branch_id: branchId ? Number(branchId) : null,
        }
        // Parol faqat KIRITILGAN bo'lsa yuboriladi — bo'sh maydon mavjud
        // parolni tozalab yubormasin.
        if (password) body.password = password
        if (photo) body.photo_base64 = photo
        await ops.updateAdmin.mutateAsync({ id: row.id, body })
      } else {
        await ops.createAdmin.mutateAsync({
          email: email.trim(),
          password: password || null,
          organization_branch_id: branchId ? Number(branchId) : null,
          ...(photo ? { photo_base64: photo } : {}),
        })
      }
      toast.ok(t('users.adminSaved'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('users.actionFailed')))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? t('users.editAdmin') : t('users.newAdmin')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={ops.createAdmin.isPending || ops.updateAdmin.isPending}
            onClick={save}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex justify-center">
          <PhotoPicker
            value={photo}
            onChange={setPhoto}
            currentUrl={row?.photo_path}
            name={row?.email ?? email}
            size={88}
            onError={(m) => setError(m)}
          />
        </div>

        <Field label={t('users.colAdmin')} required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label={t('register.password')}
          hint={row ? t('users.passwordKeepHint') : t('users.passwordEmailHint')}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t('users.colBranch')}>
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder={t('users.allBranches')}
            options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
          />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
