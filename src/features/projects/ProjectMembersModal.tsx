import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crown, Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { useConfirm } from '@/components/data/useConfirm'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import type { EmployeeBrief, useWorkspaceMutations } from './useBoard'

/**
 * THE PROJECT'S PEOPLE — find, add (several at once), remove.
 *
 * «Loyihalarda xodim qo'shish yo'q» (user, 2026-09-24): the old control was an
 * avatar chip that only the owner could open, and its list came from
 * `/employees`, which the server narrows to the CALLER'S branch (PII rule) —
 * with «Barcha filiallar» selected it did not load at all. So a project could
 * not get people, and without members a task had nobody to be assigned to.
 *
 * Candidates now come from `/employees/options`: the whole organisation, no
 * personal data, searched on the server (the same source as the guest form and
 * document sharing — see memory «employee picker scoping»). A cross-branch
 * member is exactly what the server's membership rule exists for.
 *
 * Only the project's owner (or an admin) changes membership — the server's
 * `require_owner`; everyone else sees the list read-only, with the reason.
 */
export function ProjectMembersModal({
  open,
  onClose,
  projectId,
  projectName,
  members,
  ownerId,
  canManage,
  wsMut,
  fresh,
}: {
  open: boolean
  onClose: () => void
  projectId: number
  projectName: string
  members: EmployeeBrief[]
  ownerId: number | null
  canManage: boolean
  wsMut: ReturnType<typeof useWorkspaceMutations>
  /** Just created — the window says so and invites the first people in. */
  fresh?: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Map<number, { id: number; name: string }>>(new Map())
  const [busy, setBusy] = useState(false)
  const { employees, loading } = useEmployeeSearch(null, open && canManage, q)
  const inProject = useMemo(() => new Set(members.map((m) => m.id)), [members])

  const toggle = (id: number, name: string) =>
    setPicked((cur) => {
      const next = new Map(cur)
      if (next.has(id)) next.delete(id)
      else next.set(id, { id, name })
      return next
    })

  const addPicked = async () => {
    const list = [...picked.values()]
    if (!list.length) return
    setBusy(true)
    let failed = 0
    for (const p of list) {
      try {
        await wsMut.addMember.mutateAsync({ id: projectId, memberId: p.id })
      } catch {
        failed++
      }
    }
    wsMut.invalidate()
    setBusy(false)
    setPicked(new Map())
    if (failed) toast.error(t('list.bulkPartialFail', { count: failed }))
    else toast.ok(t('projects.membersAdded', { count: list.length }))
  }

  const remove = async (m: EmployeeBrief) => {
    if (!(await confirm({ kind: 'delete', subject: m.legal_name ?? '', confirmLabel: t('projects.removeMember') }))) return
    try {
      await wsMut.removeMember.mutateAsync({ id: projectId, memberId: m.id })
      wsMut.invalidate()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <Users size={17} className="shrink-0 text-brand-strong" />
          <span className="min-w-0 truncate">{t('projects.members')} · {projectName}</span>
        </span>
      }
      description={fresh ? t('projects.membersFreshHint') : canManage ? t('projects.membersHint') : t('projects.membersReadOnly')}
      footer={
        canManage ? (
          <div className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
              {picked.size > 0 ? t('projects.pickedCount', { count: picked.size }) : ''}
            </span>
            <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
            <Button leftIcon={<UserPlus size={15} />} disabled={!picked.size} loading={busy} onClick={addPicked}>
              {t('projects.addPicked', { count: picked.size })}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      <div className={cn('grid gap-5', canManage && 'md:grid-cols-[minmax(0,1fr)_260px]')}>
        {canManage && (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('projects.memberSearch')}
                aria-label={t('projects.memberSearch')}
                className="pl-9"
                autoFocus
              />
            </div>
            <ul className="scroll-thin flex max-h-[46vh] min-h-[200px] flex-col gap-0.5 overflow-y-auto rounded-inner border border-line p-1">
              {loading && employees.length === 0 && <li className="grid place-items-center py-8"><Spinner /></li>}
              {!loading && employees.length === 0 && <li className="px-3 py-8 text-center text-[12.5px] text-fg-subtle">{t('common.noResults')}</li>}
              {employees.map((e) => {
                const already = inProject.has(e.id)
                const on = picked.has(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={already}
                      aria-pressed={on}
                      onClick={() => toggle(e.id, e.legal_name ?? '')}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                        on ? 'bg-brand-soft' : 'hover:bg-surface-2',
                        already && 'cursor-default opacity-60 hover:bg-transparent',
                      )}
                    >
                      <Avatar src={e.photo_path ?? undefined} name={e.legal_name ?? ''} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-fg">{e.legal_name}</span>
                        <span className="block truncate text-[11.5px] text-fg-subtle">
                          {[e.job_position_name, e.organization_name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {already ? (
                        <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">{t('projects.alreadyMember')}</span>
                      ) : (
                        <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border', on ? 'border-brand bg-brand text-fg-on-brand' : 'border-line')}>
                          {on && <Check size={13} strokeWidth={3} />}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="min-w-0">
          <p className="mb-2 text-[12.5px] font-semibold text-fg-muted">{t('projects.currentMembers', { count: members.length })}</p>
          <ul className="flex flex-col gap-0.5">
            {members.length === 0 && <li className="rounded-inner border border-dashed border-line px-3 py-6 text-center text-[12.5px] text-fg-subtle">{t('projects.noMembers')}</li>}
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
                <Avatar src={m.photo_thumb_path ?? undefined} fallbackSrc={m.photo_path ?? undefined} name={m.legal_name ?? ''} size={28} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{m.legal_name}</span>
                {m.id === ownerId ? (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
                    <Crown size={11} /> {t('projects.owner')}
                  </span>
                ) : canManage ? (
                  <IconButton size="sm" label={t('projects.removeMember')} onClick={() => remove(m)}>
                    <UserMinus size={14} />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
