import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Send, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/**
 * ONE confirmation for every state-changing action (user, 2026-09-24: «har bir
 * o'chirish, tahrirlash yoki tasdiqlash ... albatta ogohlantirish chiqsin»).
 *
 *   const confirm = useConfirm()
 *   onClick={async () => { if (await confirm({ kind: 'sign', subject: title })) mut.sign(id) }}
 *
 * `kind` picks the wording, the icon and the button colour, so a hundred call
 * sites need no new dictionary entries each: delete / reject are red, sign /
 * approve green, send / status / action brand. `subject` names WHAT is being
 * acted on («Buyruq №45»), `description` overrides the whole sentence.
 */
export type ConfirmKind = 'delete' | 'sign' | 'approve' | 'reject' | 'send' | 'status' | 'action'
export interface ConfirmOptions {
  kind?: ConfirmKind
  title?: string
  subject?: string | null
  description?: ReactNode
  confirmLabel?: string
  /** For bulk actions: how many rows the action will touch. */
  count?: number
}

type Ask = (o: ConfirmOptions) => Promise<boolean>
const Ctx = createContext<Ask | null>(null)

const ICON = { delete: Trash2, reject: ShieldAlert, sign: CheckCircle2, approve: CheckCircle2, send: Send, status: AlertTriangle, action: AlertTriangle }
const TONE: Record<ConfirmKind, string> = {
  delete: 'from-[#FB7185] to-[#E11D48]',
  reject: 'from-[#FB7185] to-[#E11D48]',
  sign: 'from-[#34D399] to-[#059669]',
  approve: 'from-[#34D399] to-[#059669]',
  send: 'from-[#8B5CF6] to-[#6D28D9]',
  status: 'from-[#FCD34D] to-[#F59E0B]',
  action: 'from-[#8B5CF6] to-[#6D28D9]',
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [req, setReq] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const ask = useCallback<Ask>((o) => {
    resolver.current?.(false)
    setReq(o)
    return new Promise<boolean>((res) => {
      resolver.current = res
    })
  }, [])
  const done = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setReq(null)
  }

  const kind = req?.kind ?? 'action'
  const Icon = ICON[kind]
  const danger = kind === 'delete' || kind === 'reject'
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal
        open={!!req}
        onClose={() => done(false)}
        size="sm"
        title={
          <span className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br text-white ${TONE[kind]}`}>
              <Icon size={18} />
            </span>
            <span>{req?.title ?? t(`confirm.title_${kind}` as never)}</span>
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => done(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={() => done(true)} autoFocus>
              {req?.confirmLabel ?? t(`confirm.do_${kind}` as never)}
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm leading-relaxed text-fg-muted">
          {req?.description ??
            (req?.count != null
              ? t(`confirm.bulk_${kind}` as never, { count: req.count })
              : req?.subject
                ? t(`confirm.q_${kind}` as never, { subject: req.subject })
                : t(`confirm.q_${kind}_plain` as never))}
        </p>
        {danger && <p className="mb-0 mt-2 text-[12.5px] font-semibold text-danger">{t('confirm.irreversible')}</p>}
      </Modal>
    </Ctx.Provider>
  )
}

/** `await confirm({...})` → true when the user pressed the action button. */
export function useConfirm(): Ask {
  const ask = useContext(Ctx)
  // Outside the provider (tests, isolated renders) fall back to the browser's own dialog.
  return ask ?? ((o) => Promise.resolve(window.confirm(typeof o.description === 'string' ? o.description : o.title ?? '?')))
}
