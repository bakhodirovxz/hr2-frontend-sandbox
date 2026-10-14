import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Settings2, Zap } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { flattenNav, getNavForUser, isGroup, type NavLeaf } from '@/components/layout/navConfig'
import { tipProps } from './boardDrill'

/**
 * TEZKOR TUGMALAR — the pages this person opens most, one click from home.
 *
 * The choice is the USER's (2026-09-24): «qaysi sahifalarga tez kiradi, shuni
 * sozlab oladi». The candidates are exactly the sidebar's items for this
 * account (`getNavForUser`, same overrides and branch), so a button can never
 * lead to a page the menu would hide.
 *
 * Tanlov shu brauzerda, foydalanuvchi bo'yicha saqlanadi (localStorage) —
 * bu shaxsiy qulaylik, server ma'lumoti emas.
 */
const LOCAL = 'quick-actions:'
// 12 = three full rows of four (user, 2026-09-24): with 9 the last row
// stood a third empty.
export const QUICK_MAX = 12

/** Sensible first picks per kind of reader, before anyone customises. */
const DEFAULTS_HR = ['employees', 'attendance', 'orders', 'letters', 'reports', 'kpi', 'ijro', 'guests', 'documents']
const DEFAULTS_EMP = ['myAttendance', 'requestPermission', 'letters', 'documents', 'phone', 'kpi', 'support', 'news', 'services']

function readLocal(uid: number | undefined): string[] | null {
  try {
    const raw = localStorage.getItem(LOCAL + (uid ?? 'anon'))
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}
function writeLocal(uid: number | undefined, paths: string[] | null) {
  try {
    if (paths) localStorage.setItem(LOCAL + (uid ?? 'anon'), JSON.stringify(paths))
    else localStorage.removeItem(LOCAL + (uid ?? 'anon'))
  } catch {
    /* storage blocked — the server copy still holds */
  }
}

export function useQuickActions(kind: 'hr' | 'employee') {
  const user = useAuthStore((s) => s.user)
  const uid = user?.id

  /** Everything this account may open, minus home itself. */
  const available = useMemo(
    () => flattenNav(getNavForUser(user)).filter((i) => i.path !== '/'),
    [user],
  )
  const [saved, setSaved] = useState<string[] | null>(() => readLocal(uid))

  const defaults = useMemo(() => {
    const pref = kind === 'hr' ? DEFAULTS_HR : DEFAULTS_EMP
    const byKey = new Map(available.map((i) => [i.labelKey as string, i]))
    const picked = pref.map((k) => byKey.get(k)).filter((x): x is NavLeaf => !!x)
    for (const i of available) if (picked.length < 8 && !picked.includes(i)) picked.push(i)
    return picked.slice(0, 8).map((i) => i.path)
  }, [available, kind])

  const byPath = useMemo(() => new Map(available.map((i) => [i.path, i])), [available])
  // A saved page the account lost access to simply drops out.
  const items = useMemo(
    () => (saved ?? defaults).map((p) => byPath.get(p)).filter((x): x is NavLeaf => !!x),
    [saved, defaults, byPath],
  )

  const save = useCallback(
    (paths: string[]) => {
      setSaved(paths)
      writeLocal(uid, paths)
    },
    [uid],
  )
  const reset = useCallback(() => {
    setSaved(null)
    writeLocal(uid, null)
  }, [uid])

  return { items, available, save, reset, isCustom: saved != null }
}

/** The carousel face: a grid of big buttons + «Sozlash». */
export function QuickActionsFace({ kind }: { kind: 'hr' | 'employee' }) {
  const { t } = useTranslation()
  const qa = useQuickActions(kind)
  const [editing, setEditing] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCols(e.contentRect.width >= 330 ? 4 : 3))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const slots = qa.items.length + (qa.items.length < QUICK_MAX ? 1 : 0)
  const rows = Math.max(1, Math.ceil(slots / cols))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 pb-2.5">
      {/* The grid FITS the panel (user, 2026-09-24: «joy ochiq qolyapti»,
          names cut in half): four columns when the panel is wide enough,
          three otherwise; the rows share the height evenly and never go below
          64px — only then does the grid scroll. A fixed tile height either
          left a gap under the tiles or cut the third row in half. */}
      <div
        ref={gridRef}
        className="scroll-thin grid min-h-0 flex-1 gap-1.5 overflow-y-auto pr-0.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(64px, 1fr))`,
        }}
      >
        {qa.items.map((i) => {
          const Icon = i.icon
          const label = t(`nav.${i.labelKey}` as never)
          return (
            <Link
              key={i.path}
              to={i.path}
              {...tipProps(label, [[t('dashboard.quick.open'), '']])}
              className="group flex min-h-0 flex-col items-center justify-center gap-1 rounded-inner bg-fg/[0.04] px-0 py-1.5 text-center transition-[transform,background] hover:-translate-y-0.5 hover:bg-brand-soft"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#0B7CD8] to-[#0967B4] text-white shadow-[0_6px_16px_-6px_rgba(10,112,194,0.6)] transition-transform group-hover:scale-105">
                <Icon size={15} />
              </span>
              <span className="line-clamp-2 w-full min-w-0 text-[11px] font-semibold tracking-[-0.035em] leading-[1.15] text-fg [overflow-wrap:normal]">{label}</span>
            </Link>
          )
        })}
        {/* The free slot says what it is for — one dashed «add» tile instead
            of an unexplained gap, until all twelve places are taken. */}
        {qa.items.length < QUICK_MAX && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex min-h-0 flex-col items-center justify-center gap-1 rounded-inner border border-dashed border-fg/15 px-1.5 py-1.5 text-center text-fg-subtle transition-colors hover:border-brand/50 hover:bg-brand-soft/60 hover:text-brand-strong"
          >
            <span className="grid h-7 w-7 place-items-center rounded-[10px] border border-dashed border-current">
              <Plus size={15} />
            </span>
            <span className="text-[11px] font-semibold leading-[1.15]">{t('dashboard.quick.add')}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex shrink-0 items-center justify-center gap-1.5 self-end rounded-pill px-2.5 py-0.5 text-[12px] font-semibold text-brand-strong transition-colors hover:bg-brand-soft"
      >
        <Settings2 size={14} /> {t('dashboard.quick.customize')}
        <span className="tabular-nums text-fg-subtle">{qa.items.length}/{QUICK_MAX}</span>
      </button>
      {editing && <QuickActionsEditor qa={qa} onClose={() => setEditing(false)} />}
    </div>
  )
}

/** Pick up to QUICK_MAX pages from the account's own menu; order = the grid order. */
function QuickActionsEditor({ qa, onClose }: { qa: ReturnType<typeof useQuickActions>; onClose: () => void }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<string[]>(() => qa.items.map((i) => i.path))
  const user = useAuthStore((s) => s.user)
  // Menyu guruhlari bo'yicha: guruhsiz bandlar — «Asosiy», qolgani o'z guruhi ostida.
  const groups = useMemo(() => {
    const allowed = new Set(qa.available.map((i) => i.path))
    const tree = getNavForUser(user)
    const main = tree.filter((n): n is NavLeaf => !isGroup(n) && allowed.has(n.path))
    const out: { key: string; labelKey: string; items: NavLeaf[] }[] = main.length
      ? [{ key: 'main', labelKey: 'dashboard.quick.section_main', items: main }]
      : []
    for (const n of tree) {
      if (!isGroup(n)) continue
      const items = n.children.filter((c) => allowed.has(c.path))
      if (items.length) out.push({ key: n.key, labelKey: `nav.${n.labelKey}`, items })
    }
    return out
  }, [qa.available, user])
  const byPath = useMemo(() => new Map(qa.available.map((i) => [i.path, i])), [qa.available])
  const toggle = (p: string) =>
    setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : cur.length >= QUICK_MAX ? cur : [...cur, p]))
  const move = (i: number, d: -1 | 1) =>
    setPicked((cur) => {
      const j = i + d
      if (j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2.5">
          <Zap size={18} className="text-brand-strong" /> {t('dashboard.quick.editTitle')}
        </span>
      }
      description={t('dashboard.quick.editHint', { max: QUICK_MAX })}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              qa.reset()
              onClose()
            }}
          >
            <RotateCcw size={15} /> {t('dashboard.quick.reset')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              qa.save(picked)
              onClose()
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 text-[12px] font-semibold text-fg-subtle">{t(g.labelKey as never)}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {g.items.map((i) => {
                  const on = picked.includes(i.path)
                  const full = !on && picked.length >= QUICK_MAX
                  const Icon = i.icon
                  return (
                    <button
                      key={i.path}
                      type="button"
                      aria-pressed={on}
                      disabled={full}
                      onClick={() => toggle(i.path)}
                      className={cn(
                        'flex items-center gap-2 rounded-control border px-2.5 py-2 text-left text-[12.5px] transition-colors',
                        on ? 'border-brand bg-brand-soft text-fg' : 'border-border text-fg-muted hover:bg-surface-2',
                        full && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      <Icon size={15} className={on ? 'text-brand-strong' : ''} />
                      <span className="min-w-0 flex-1 truncate">{t(`nav.${i.labelKey}` as never)}</span>
                      {on && <Check size={14} className="text-brand-strong" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-inner bg-surface-2 p-3">
          <p className="mb-2 text-[12px] font-semibold text-fg-muted">
            {t('dashboard.quick.order', { count: picked.length, max: QUICK_MAX })}
          </p>
          <ol className="flex flex-col gap-1">
            {picked.map((p, i) => {
              const it = byPath.get(p)
              if (!it) return null
              const Icon = it.icon
              return (
                <li key={p} className="flex items-center gap-2 rounded-control bg-surface px-2 py-1.5 text-[12.5px]">
                  <span className="w-4 text-fg-subtle tabular-nums">{i + 1}</span>
                  <Icon size={14} className="text-brand-strong" />
                  <span className="min-w-0 flex-1 truncate text-fg">{t(`nav.${it.labelKey}` as never)}</span>
                  <button type="button" aria-label={t('common.prev')} onClick={() => move(i, -1)} className="grid h-6 w-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 disabled:opacity-30" disabled={i === 0}>
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" aria-label={t('common.next')} onClick={() => move(i, 1)} className="grid h-6 w-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 disabled:opacity-30" disabled={i === picked.length - 1}>
                    <ArrowDown size={13} />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </Modal>
  )
}
