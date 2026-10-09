import { useEffect, useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { KeyRound, Mail, Plus, Trash2 } from 'lucide-react'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import { useToast } from '@/components/ui/Toast'
import { PhotoPicker } from '@/features/employees/PhotoPicker'
import { errorMessage } from '@/api/errorMessage'
import { maskValue } from '@/lib/fieldMask'
import { useBranches } from '@/hooks/useBranches'
import { KIOSK_ROLES, useKioskUserMutations, useKioskUsers, type KioskUser } from './useKioskUsers'

/**
 * KIOSK ACCOUNTS — the logins a monitoring/turnstile kiosk signs in with.
 *
 * ⚠️ THE SERVER HAS HAD FULL CRUD HERE ALL ALONG AND NEITHER FRONTEND EVER
 * EXPOSED IT (v1 only ever declared the URL constant). Provisioning a kiosk
 * therefore meant calling the API by hand, and there was no way at all to see
 * which kiosk accounts existed, which branches each could watch, or to reset
 * one's password.
 */
export function KioskUsersTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const list = useKioskUsers()
  const mut = useKioskUserMutations()
  const [editing, setEditing] = useState<KioskUser | 'new' | null>(null)
  const [removing, setRemoving] = useState<KioskUser | null>(null)
  const { branches } = useBranches()

  const branchName = useMemo(() => {
    const map = new Map<number, string>()
    for (const b of branches) map.set(b.id, b.name ?? String(b.id))
    return map
  }, [branches])

  const columns: Column<KioskUser & { id: number }>[] = [
    {
      key: 'name',
      skeleton: 'w-56',
      header: t('users.kioskName'),
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.legal_name ?? r.username ?? ''} src={r.photo_thumb_path ?? undefined} fallbackSrc={r.photo_path ?? undefined} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-fg">{r.legal_name || '—'}</span>
            <span className="block truncate text-[12px] text-fg-muted">{r.username || '—'}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      skeleton: 'w-28',
      header: t('users.kioskRole'),
      cell: (r) => <Badge tone="neutral">{r.role || '—'}</Badge>,
    },
    {
      key: 'branches',
      skeleton: 'w-[420px]',
      header: t('users.kioskBranches'),
      cell: (r) =>
        r.organization_branch_ids?.length ? (
          <span className="flex flex-wrap gap-1">
            {r.organization_branch_ids.map((id) => (
              <span key={id} className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
                {branchName.get(id) ?? `#${id}`}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-fg-subtle">{t('users.kioskAllBranches')}</span>
        ),
    },
    {
      key: 'actions',
      skeleton: 'w-8',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <span className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Mail size={14} />}
            onClick={async () => {
              if (!(await confirm({ kind: 'action', subject: r.legal_name || r.username, confirmLabel: t('users.kioskSendPassword') }))) return
              try {
                await mut.sendPassword.mutateAsync(r.id)
                toast.ok(t('users.kioskPasswordSent'))
              } catch (e) {
                toast.error(errorMessage(e, t('common.actionFailed')))
              }
            }}
          >
            {t('users.kioskSendPassword')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={14} />} onClick={() => setRemoving(r)}>
            {t('common.delete')}
          </Button>
        </span>
      ),
    },
  ]

  if (list.denied) {
    return <EmptyState title={t('common.noAccess')} description={t('users.kioskDeniedHint')} />
  }

  return (
    <Card>
      <CardHeader
        title={t('users.tabKiosk')}
        subtitle={t('users.kioskHint')}
        action={
          <Button leftIcon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('users.kioskAdd')}
          </Button>
        }
      />

      <DataTable
        tableId="kiosk-users"
        columns={columns}
        rows={list.rows.filter((r): r is KioskUser & { id: number } => r.id != null)}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        emptyTitle={t('users.kioskEmpty')}
        emptyDescription={t('users.kioskEmptyHint')}
        minWidth={820}
      />

      <KioskUserModal
        value={editing}
        onClose={() => setEditing(null)}
        onDone={(msg) => {
          toast.ok(msg)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={t('users.kioskDeleteTitle')}
        description={removing?.username ?? undefined}
        confirmLabel={t('common.delete')}
        loading={mut.remove.isPending}
        onConfirm={async () => {
          if (!removing?.id) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('users.kioskDeleted'))
            setRemoving(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />
    </Card>
  )
}

function KioskUserModal({
  value,
  onClose,
  onDone,
}: {
  value: KioskUser | 'new' | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const mut = useKioskUserMutations()
  const { branches } = useBranches()
  const isEdit = !!value && value !== 'new'
  const row = isEdit ? (value as KioskUser) : null

  const [username, setUsername] = useState('')
  const [legalName, setLegalName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<string>(KIOSK_ROLES[0])
  const [pinfl, setPinfl] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [branchIds, setBranchIds] = useState<number[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setError('')
    setPassword('')
    setPhoto(null)
    setUsername(row?.username ?? '')
    setLegalName(row?.legal_name ?? '')
    setRole(row?.role ?? KIOSK_ROLES[0])
    setPinfl(row?.personal_identification_number ?? '')
    setBranchIds(row?.organization_branch_ids ?? [])
  }, [value, row])

  if (!value) return null

  const toggleBranch = (id: number) =>
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async () => {
    if (!isEdit && !username.trim()) return setError(t('users.kioskUsernameRequired'))
    /*
     * The create route wants a password up front; edit leaves it alone unless
     * one is typed, so an empty box means "keep the current password".
     *
     * ⚠️ EIGHT, NOT SIX. The employee-password screen's minimum is 6 and
     * copying it here got a `weak_password` 400 back from the server, which
     * enforces 8 for these accounts — a client gate looser than the server's is
     * how a form ends up rejecting only after Save.
     */
    const min = 8
    // A KPP/monitoring account is NOT an ordinary employee — it has no department
    // and no position, so its branch is the ONLY thing that can scope it. The
    // server refuses a branchless account on create AND refuses an update that
    // empties the list (both answer 422); this only says so before the round
    // trip. Omitting the field entirely still means "not changing it".
    if (branchIds.length === 0) return setError(t('users.kioskBranchRequired'))
    if (!isEdit && password.trim().length < min) return setError(t('users.kioskPasswordShort'))
    if (isEdit && password.trim() && password.trim().length < min) {
      return setError(t('users.kioskPasswordShort'))
    }
    try {
      if (isEdit && row?.id) {
        await mut.update.mutateAsync({
          id: row.id,
          body: {
            legal_name: legalName.trim() || null,
            role,
            organization_branch_ids: branchIds,
            personal_identification_number: pinfl.trim() || null,
            ...(password.trim() ? { password: password.trim() } : {}),
            ...(photo ? { photo_base64: photo } : {}),
          },
        })
        onDone(t('users.kioskUpdated'))
      } else {
        await mut.create.mutateAsync({
          username: username.trim(),
          password: password.trim(),
          role,
          legal_name: legalName.trim() || null,
          organization_branch_ids: branchIds,
          personal_identification_number: pinfl.trim() || null,
          ...(photo ? { photo_base64: photo } : {}),
        })
        onDone(t('users.kioskCreated'))
      }
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? t('users.kioskEditTitle') : t('users.kioskAdd')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            loading={mut.create.isPending || mut.update.isPending}
            leftIcon={<KeyRound size={15} />}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('users.kioskUsername')} required={!isEdit}>
          {/* The login itself is fixed once created — the server keys the
              account on it and renaming would strand the kiosk. */}
          <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={isEdit} />
        </Field>
        <Field label={t('users.kioskName')}>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field
          label={t('users.kioskPassword')}
          required={!isEdit}
          hint={isEdit ? t('users.kioskPasswordEditHint') : t('users.kioskPasswordShort')}
        >
          <Input value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('users.kioskRole')} hint={t('users.kioskRoleHint')}>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={KIOSK_ROLES.map((r) => ({ value: r, label: t(`users.kioskRole_${r === 'kpp' ? 'kpp' : 'monitoring'}` as never) }))}
          />
        </Field>
        <Field label={t('employees.fieldPinfl')}>
          <Input
            value={pinfl}
            onChange={(e) => setPinfl(maskValue('pinfl', e.target.value))}
            maxLength={14}
            inputMode="numeric"
          />
        </Field>
        <Field label={t('common.photo')}>
          <PhotoPicker
            value={photo}
            onChange={setPhoto}
            currentUrl={row?.photo_path ?? undefined}
            name={legalName || username}
            size={72}
          />
        </Field>
      </div>

      <Field label={t('users.kioskBranches')} hint={t('users.kioskBranchesHint')} className="mt-4" required>
        <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto rounded-inner border border-line p-2.5 sm:grid-cols-2">
          {branches.map((b) => (
            <Checkbox
              key={b.id}
              checked={branchIds.includes(b.id)}
              onChange={() => toggleBranch(b.id)}
              label={b.name ?? String(b.id)}
            />
          ))}
        </div>
      </Field>

      <FormError className="mt-3 text-[13px] text-[13px]">{error}</FormError>
    </Modal>
  )
}
