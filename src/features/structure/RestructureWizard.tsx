import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { SearchInput } from '@/components/data/SearchInput'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { searchFold } from '@/lib/searchFold'
import { BasisFields, EMPTY_BASIS, isBasisComplete } from './BasisFields'
import { buildTree, descendantIds, findCycle, flattenTree, indexTree, parentOptions, type TreeNode } from './structureTree'
import { useDepartmentAdminMutations, type Basis, type DepartmentRow } from './useDepartmentAdmin'

const ROOT = ''
const STEPS = ['stepMove', 'stepRename', 'stepReview'] as const

const currentParent = (n: TreeNode<DepartmentRow>) => (n.parent_id != null ? String(n.parent_id) : ROOT)

/**
 * «Qayta tuzish» ustasi (TZ 4.2.6 · 2037/2062 «Массовая корректировка данных
 * при изменении структуры организации», «Переподчинение подразделений»):
 *   1) bo'limlarni yangi yuqori bo'limga ko'chirish,
 *   2) qayta nomlash,
 *   3) asos (buyruq raqami va sanasi) + tekshiruv → `POST departments/restructure`.
 * Sikl (bo'limni o'z avlodiga bo'ysundirish) mijozda ham tekshiriladi.
 */
export function RestructureWizard({
  open,
  all,
  onClose,
}: {
  open: boolean
  /** Filialning faol bo'limlari. */
  all: DepartmentRow[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { restructure } = useDepartmentAdminMutations()
  const [step, setStep] = useState(0)
  const [moves, setMoves] = useState<Record<number, string>>({})
  const [renames, setRenames] = useState<Record<number, string>>({})
  const [basis, setBasis] = useState<Basis>(EMPTY_BASIS)
  const [query, setQuery] = useState('')
  const [basisError, setBasisError] = useState('')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setMoves({})
    setRenames({})
    setBasis(EMPTY_BASIS)
    setQuery('')
    setBasisError('')
    setSubmitError('')
  }, [open])

  const active = useMemo(() => all.filter((d) => !d.closed_at), [all])
  const roots = useMemo(() => buildTree(active), [active])
  const byId = useMemo(() => indexTree(roots), [roots])
  const rows = useMemo(() => flattenTree(roots), [roots])

  const optionsFor = useMemo(() => {
    const cache = new Map<number, ReturnType<typeof parentOptions>>()
    return (node: TreeNode<DepartmentRow>) => {
      let opts = cache.get(node.id)
      if (!opts) {
        const ex = descendantIds(node)
        ex.add(node.id)
        opts = [{ value: ROOT, label: t('orgAdmin.rootLevel') }, ...parentOptions(roots, ex)]
        cache.set(node.id, opts)
      }
      return opts
    }
  }, [roots, t])

  const moveList = useMemo(
    () =>
      Object.entries(moves)
        .map(([id, to]) => ({ node: byId.get(Number(id)), to }))
        .filter((m): m is { node: TreeNode<DepartmentRow>; to: string } => !!m.node && m.to !== currentParent(m.node)),
    [moves, byId],
  )
  const renameList = useMemo(
    () =>
      Object.entries(renames)
        .map(([id, name]) => ({ node: byId.get(Number(id)), name: name.trim() }))
        .filter((r): r is { node: TreeNode<DepartmentRow>; name: string } => !!r.node && !!r.name && r.name !== r.node.name),
    [renames, byId],
  )

  // Ko'chirishlar qo'llangandagi sikl tekshiruvi.
  const cycleNode = useMemo(() => {
    const map = new Map<number, number | null>()
    byId.forEach((n) => map.set(n.id, n.parent_id ?? null))
    moveList.forEach((m) => map.set(m.node.id, m.to === ROOT ? null : Number(m.to)))
    const bad = findCycle(map)
    return bad != null ? byId.get(bad) ?? null : null
  }, [byId, moveList])

  const q = searchFold(query.trim())
  const shown = q
    ? rows.filter(({ node }) => searchFold(node.name).includes(q) || searchFold(node.code).includes(q))
    : rows
  const nameOf = (pid: string) => (pid === ROOT ? t('orgAdmin.rootLevel') : byId.get(Number(pid))?.name ?? `#${pid}`)
  const nothing = moveList.length === 0 && renameList.length === 0

  const submit = async () => {
    if (!isBasisComplete(basis)) {
      setBasisError(t('orgAdmin.basisRequired'))
      return
    }
    if (cycleNode) {
      setStep(0)
      return
    }
    setSubmitError('')
    try {
      await restructure.mutateAsync({
        moves: moveList.map((m) => ({ department_id: m.node.id, new_parent_id: m.to === ROOT ? null : Number(m.to) })),
        renames: renameList.map((r) => ({ department_id: r.node.id, name: r.name })),
        basis_number: basis.number.trim(),
        basis_date: basis.date,
      })
      toast.ok(t('orgAdmin.restructured'))
      onClose()
    } catch (e) {
      setSubmitError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const rowCls = (changed: boolean) =>
    cn(
      'grid items-center gap-2 rounded-lg border px-3 py-1.5 md:grid-cols-[minmax(0,1fr)_20rem]',
      changed ? 'border-brand/50 bg-brand-soft/50' : 'border-line bg-surface-2/40',
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('orgAdmin.restructureTitle')}
      description={`${step + 1}/3 · ${t(`orgAdmin.${STEPS[step]}`)}`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="mr-auto text-[12px] text-fg-muted">
            {t('orgAdmin.restructureCounts', { moves: moveList.length, renames: renameList.length })}
          </span>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              {t('common.previous')}
            </Button>
          )}
          {step < 2 ? (
            <Button rightIcon={<ArrowRight size={15} />} disabled={step === 0 && !!cycleNode} onClick={() => setStep((s) => s + 1)}>
              {t('orgAdmin.next')}
            </Button>
          ) : (
            <Button leftIcon={<Check size={15} />} disabled={nothing} loading={restructure.isPending} onClick={submit}>
              {t('orgAdmin.apply')}
            </Button>
          )}
        </div>
      }
    >
      <ol className="mb-4 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center justify-center rounded-lg px-2 text-center text-[12px] font-semibold',
              i === step ? 'bg-brand text-white' : i < step ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-fg-muted',
            )}
          >
            <span className="truncate">
              {i + 1}. {t(`orgAdmin.${s}`)}
            </span>
          </li>
        ))}
      </ol>

      {rows.length === 0 ? (
        <EmptyState title={t('orgAdmin.emptyDept')} />
      ) : step === 2 ? (
        <div className="flex flex-col gap-4">
          <BasisFields
            value={basis}
            onChange={(b) => {
              setBasis(b)
              setBasisError('')
            }}
            title={t('orgAdmin.basisRestructure')}
            error={basisError}
          />
          {nothing && <p className="text-[13px] text-fg-muted">{t('orgAdmin.nothingChosen')}</p>}
          {moveList.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-[13px] font-semibold text-fg">
                {t('orgAdmin.movesTitle')} ({moveList.length})
              </h4>
              <ul className="flex flex-col gap-1 text-[13px]">
                {moveList.map((m) => (
                  <li key={m.node.id} className="rounded-md bg-surface-2/60 px-3 py-1.5 text-fg-muted">
                    <b className="text-fg">{m.node.name}</b>: {nameOf(currentParent(m.node))}
                    <span className="mx-1.5 text-fg-subtle">→</span>
                    <span className="text-brand-strong">{nameOf(m.to)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {renameList.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-[13px] font-semibold text-fg">
                {t('orgAdmin.renamesTitle')} ({renameList.length})
              </h4>
              <ul className="flex flex-col gap-1 text-[13px]">
                {renameList.map((r) => (
                  <li key={r.node.id} className="rounded-md bg-surface-2/60 px-3 py-1.5 text-fg-muted">
                    {r.node.name}
                    <span className="mx-1.5 text-fg-subtle">→</span>
                    <b className="text-brand-strong">{r.name}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {submitError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {submitError}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-fg-muted">{step === 0 ? t('orgAdmin.moveHint') : t('orgAdmin.renameHint')}</p>
          {step === 0 && cycleNode && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
              <AlertTriangle size={16} className="shrink-0" />
              {t('orgAdmin.cycleError', { name: cycleNode.name })}
            </div>
          )}
          <SearchInput value={query} onChange={setQuery} placeholder={t('orgAdmin.searchDept')} />
          <div className="flex flex-col gap-1.5">
            {shown.map(({ node, depth }) => {
              if (step === 0) {
                const val = moves[node.id] ?? currentParent(node)
                return (
                  <div key={node.id} className={rowCls(val !== currentParent(node))}>
                    <span className="truncate text-[13px] text-fg" style={{ paddingLeft: depth * 14 }}>
                      {node.name}
                      {node.code && <span className="text-fg-subtle"> ({node.code})</span>}
                    </span>
                    <Combobox
                      value={val}
                      onChange={(v) => setMoves((m) => ({ ...m, [node.id]: v ?? ROOT }))}
                      options={optionsFor(node)}
                      placeholder={t('orgAdmin.rootLevel')}
                      searchPlaceholder={t('orgAdmin.searchDept')}
                      hidePlaceholderOption
                      clearable={false}
                      className="w-full"
                    />
                  </div>
                )
              }
              const val = renames[node.id] ?? node.name
              return (
                <div key={node.id} className={rowCls(val.trim() !== node.name)}>
                  <span className="truncate text-[13px] text-fg-muted" style={{ paddingLeft: depth * 14 }}>
                    {node.name}
                  </span>
                  <Input
                    value={val}
                    maxLength={255}
                    aria-label={t('orgAdmin.newNameFor', { name: node.name })}
                    onChange={(e) => setRenames((r) => ({ ...r, [node.id]: e.target.value }))}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
