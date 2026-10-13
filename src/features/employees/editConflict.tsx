import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { errorCode, errorParams } from '@/api/errorMessage'
import { inUtc } from '@/lib/format'

/**
 * TZ C3 1062 «Конфликт данных — при одновременном редактировании записи
 * несколькими пользователями. Система отображает предупреждение и предлагает
 * обновить данные».
 *
 * Every employee write that can collide (`PATCH /employees/{pk}`, `PATCH
 * /employees/{pk}/t2`, `PUT /employees/{pk}/t2/{section}`, `PATCH
 * /employees/me/self-update`) sends the `updated_at` the form was opened with
 * as `expected_updated_at`; the server answers 409 `edit_conflict` when
 * somebody saved in between.
 */
export interface EditConflictInfo {
  /** Who saved last (audit journal), `null` when unknown. */
  name: string | null
  /** When — naive UTC or an offset value. */
  at: string | null
}

/** `edit_conflict` details, or `null` for any other error. */
export function editConflictOf(err: unknown): EditConflictInfo | null {
  if (errorCode(err) !== 'edit_conflict') return null
  const p = errorParams(err)
  const by = (p.updated_by && typeof p.updated_by === 'object' ? p.updated_by : null) as { name?: string | null; at?: string | null } | null
  return {
    name: by?.name ? String(by.name) : null,
    at: (by?.at ? String(by.at) : null) ?? (p.updated_at ? String(p.updated_at) : null),
  }
}

/*
 * Our OWN saves move `updated_at` too. One editing session may keep several
 * T-2 sections (and the personal-data drawer) open at once: after section A is
 * saved, section B still holds the timestamp it was opened with, and sending
 * that would report a conflict with ourselves. Every successful own write is
 * recorded as «from → to», and a base is walked forward along that chain
 * before it is sent. A change made by somebody else is not in the chain, so it
 * is still caught.
 */
const ownWrites = new Map<number, Map<string, string>>()

export function recordOwnWrite(employeeId: number, from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to || from === to) return
  let chain = ownWrites.get(employeeId)
  if (!chain) {
    chain = new Map()
    ownWrites.set(employeeId, chain)
  }
  chain.set(from, to)
}

/** The base to send as `expected_updated_at` (`undefined` — no check). */
export function resolveBase(employeeId: number, base: string | null | undefined): string | undefined {
  if (!base) return undefined
  const chain = ownWrites.get(employeeId)
  let cur = base
  for (let i = 0; chain && i < 50; i++) {
    const next = chain.get(cur)
    if (!next) break
    cur = next
  }
  return cur
}

/**
 * The warning: «<name> bu yozuvni <at> da o‘zgartirdi». «Yangisini yuklash»
 * reloads the record (the caller resets its form); «Bekor qilish» leaves the
 * form open with the user's draft so it can be copied before reloading.
 */
export function EditConflictDialog({
  conflict,
  onReload,
  onClose,
}: {
  conflict: EditConflictInfo | null
  onReload: () => Promise<void> | void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const reload = async () => {
    setBusy(true)
    try {
      await onReload()
      onClose()
    } finally {
      setBusy(false)
    }
  }
  const at = conflict?.at ? inUtc(conflict.at) : '—'
  return (
    <Modal
      open={!!conflict}
      onClose={onClose}
      size="md"
      title={t('hrExt.conflict.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<RefreshCw size={14} />} onClick={() => void reload()} loading={busy}>
            {t('hrExt.conflict.reload')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-inner bg-warning-soft text-warning">
          <AlertTriangle size={18} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-2 text-[13px] leading-relaxed">
          <p role="alert" className="font-semibold text-fg">
            {conflict?.name ? t('hrExt.conflict.changedBy', { name: conflict.name, at }) : t('hrExt.conflict.changedByUnknown', { at })}
          </p>
          <p className="text-fg-muted">{t('hrExt.conflict.hint')}</p>
        </div>
      </div>
    </Modal>
  )
}

interface ConflictHost {
  show: (conflict: EditConflictInfo, onReload: () => Promise<void> | void) => void
}

/** One dialog for all T-2 sections of a card (the sections report into it). */
export const EditConflictContext = createContext<ConflictHost | null>(null)

export function EditConflictProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ conflict: EditConflictInfo; onReload: () => Promise<void> | void } | null>(null)
  const show = useCallback<ConflictHost['show']>((conflict, onReload) => setState({ conflict, onReload }), [])
  return (
    <EditConflictContext.Provider value={{ show }}>
      {children}
      <EditConflictDialog conflict={state?.conflict ?? null} onReload={() => state?.onReload()} onClose={() => setState(null)} />
    </EditConflictContext.Provider>
  )
}

export function useEditConflictHost() {
  return useContext(EditConflictContext)
}
