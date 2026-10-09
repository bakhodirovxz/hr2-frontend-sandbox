import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '@/lib/format'
import {
  GitBranch,
  Link2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDepartmentRecords } from '@/hooks/useReferenceData'
import type { Department } from './useStructure'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import {
  boundsOf,
  clampZoom,
  edgePath,
  fitView,
  type Box,
  type View,
} from './orgChartGeometry'
import {
  useHierarchy,
  useHierarchyMutations,
  useStructureSnapshot,
  type Handle,
  type HierarchyNode,
} from './useHierarchy'

/** Card width. Fixed, because the stored x/y were laid out against it. */
const NODE_W = 240
/** Used until the real card has been measured, so edges are never wild. */
const NODE_H_FALLBACK = 76

/**
 * ⚠️ RAW HEX, DELIBERATELY — and the only place in v2 where that is allowed.
 * `accent_color` is DATA: every existing row was saved with one of these
 * values by v1, and the chart must draw the colour the row actually carries.
 * Mapping them onto theme tokens would silently repaint charts people built.
 */
const ACCENTS = ['#10b981', '#0275ff', '#22d3ee', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

type NodeType = 'deptNode' | 'topNode'

interface ModalState {
  node?: HierarchyNode
  /** Set when the new unit is created as a child of an existing one. */
  parent?: HierarchyNode
}

interface Props {
  branchId: number | null
  canEdit: boolean
}

export function OrgChart({ branchId, canEdit }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const mut = useHierarchyMutations()

  const [asOf, setAsOf] = useState('')
  const snapshot = useStructureSnapshot(branchId, asOf)
  const live = useHierarchy(branchId, true)

  /* A date view draws the snapshot and is READ-ONLY: history cannot be edited.
     When no snapshot exists for the chosen day the live chart stays on screen
     with a notice, rather than an empty canvas that looks like data loss. */
  const historyMode = !!snapshot.nodes
  const nodes = snapshot.nodes ?? live.nodes
  const editable = canEdit && !historyMode

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({})
  const [drag, setDrag] = useState<Record<number, { x: number; y: number }>>({})
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [connectFrom, setConnectFrom] = useState<number | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [toDelete, setToDelete] = useState<HierarchyNode | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const didFit = useRef<number | null>(null)

  const box = useCallback(
    (n: HierarchyNode): Box => {
      const pos = drag[n.id]
      return {
        x: pos ? pos.x : (n.position_x ?? 0),
        y: pos ? pos.y : (n.position_y ?? 0),
        w: NODE_W,
        h: sizes[n.id]?.h ?? NODE_H_FALLBACK,
      }
    },
    [drag, sizes],
  )

  const boxes = useMemo(() => nodes.map(box), [nodes, box])
  const bounds = useMemo(() => boundsOf(boxes), [boxes])

  /* Fit once per branch, after the cards have been measured. Re-fitting on
     every data change would yank the canvas away from a user who had panned. */
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el || nodes.length === 0) return
    if (didFit.current === branchId) return
    if (nodes.some((n) => !sizes[n.id])) return
    didFit.current = branchId
    setView(fitView(boxes, el.clientWidth, el.clientHeight))
  }, [branchId, nodes, sizes, boxes])

  useEffect(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
    setConnectFrom(null)
  }, [branchId, asOf])

  const measure = useCallback((id: number, el: HTMLDivElement | null) => {
    if (!el) return
    const h = Math.round(el.offsetHeight)
    setSizes((prev) => (prev[id]?.h === h ? prev : { ...prev, [id]: { w: NODE_W, h } }))
  }, [])

  /* ── panning / zooming ─────────────────────────────────────────────────── */

  const pan = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    setSelectedNode(null)
    setSelectedEdge(null)
    pan.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    setView((v) => ({ ...v, x: p.ox + (e.clientX - p.px), y: p.oy + (e.clientY - p.py) }))
  }

  const onBackgroundUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pan.current = null
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }

  /** Zoom towards the pointer, so the card under the cursor stays put. */
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const el = viewportRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    setView((v) => {
      const k = clampZoom(v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
      const ratio = k / v.k
      return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }
    })
  }

  const zoomBy = (factor: number) => {
    const el = viewportRef.current
    if (!el) return
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    setView((v) => {
      const k = clampZoom(v.k * factor)
      const ratio = k / v.k
      return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }
    })
  }

  const fit = () => {
    const el = viewportRef.current
    if (el) setView(fitView(boxes, el.clientWidth, el.clientHeight))
  }

  /* ── moving a card ─────────────────────────────────────────────────────── */

  const nodeDrag = useRef<{
    id: number
    px: number
    py: number
    ox: number
    oy: number
    moved: boolean
  } | null>(null)

  const onNodeDown = (e: ReactPointerEvent<HTMLDivElement>, n: HierarchyNode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (!editable) {
      setSelectedNode(n.id)
      return
    }
    nodeDrag.current = {
      id: n.id,
      px: e.clientX,
      py: e.clientY,
      ox: n.position_x ?? 0,
      oy: n.position_y ?? 0,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onNodeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = nodeDrag.current
    if (!d) return
    // The pointer moves in SCREEN px; the canvas is scaled, so the delta has to
    // be divided by the zoom or the card runs away from the cursor.
    const dx = (e.clientX - d.px) / view.k
    const dy = (e.clientY - d.py) / view.k
    if (!d.moved && Math.hypot(dx, dy) * view.k < 4) return
    d.moved = true
    setDrag((prev) => ({ ...prev, [d.id]: { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) } }))
  }

  const onNodeUp = async (e: ReactPointerEvent<HTMLDivElement>, n: HierarchyNode) => {
    const d = nodeDrag.current
    nodeDrag.current = null
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    if (!d) return

    if (!d.moved) {
      if (connectFrom != null && connectFrom !== n.id) {
        void makeConnection(connectFrom, n.id)
        return
      }
      setSelectedEdge(null)
      setSelectedNode((cur) => (cur === n.id ? null : n.id))
      return
    }

    const pos = drag[d.id]
    if (!pos) return
    try {
      await mut.updateNode.mutateAsync({ id: d.id, body: { position_x: pos.x, position_y: pos.y } })
      mut.invalidate()
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    } finally {
      // Drop the local override only after the server answered, or the card
      // snaps back to its old spot for the instant before the refetch lands.
      setDrag((prev) => {
        const next = { ...prev }
        delete next[d.id]
        return next
      })
    }
  }

  /* ── connections ───────────────────────────────────────────────────────── */

  const makeConnection = async (source: number, target: number) => {
    setConnectFrom(null)
    try {
      await mut.connect.mutateAsync({
        source_id: source,
        target_id: target,
        source_handle: 'bottom',
        target_handle: 'top',
      })
      mut.invalidate()
      toast.ok(t('structure.chartConnected'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  const removeConnection = useCallback(
    async (id: number) => {
      // Reached from Backspace/Delete — a stray keypress must not drop a link.
      if (!(await confirm({ kind: 'delete' }))) return
      try {
        await mut.disconnect.mutateAsync(id)
        mut.invalidate()
        setSelectedEdge(null)
        toast.ok(t('structure.chartDisconnected'))
      } catch (err) {
        toast.error(errorMessage(err, t('common.actionFailed')))
      }
    },
    [mut, t, toast, confirm],
  )

  /* Backspace / Delete removes the SELECTED CONNECTION only. Cards are never
     deletable by keyboard: one stray keypress would drop a whole unit. */
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key === 'Escape') {
        setConnectFrom(null)
        setSelectedEdge(null)
        setSelectedNode(null)
        return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedEdge != null) {
        e.preventDefault()
        void removeConnection(selectedEdge)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, selectedEdge, removeConnection])

  /* ── writes ────────────────────────────────────────────────────────────── */

  const saveNode = async (form: Record<string, unknown>) => {
    try {
      if (modal?.node) {
        await mut.updateNode.mutateAsync({ id: modal.node.id, body: form })
        toast.ok(t('structure.chartUpdated'))
      } else {
        const parent = modal?.parent ?? null
        const position = parent
          ? { position_x: parent.position_x ?? 0, position_y: (parent.position_y ?? 0) + 170 }
          : { position_x: 120, position_y: 80 + nodes.length * 24 }
        const created = await mut.createNode.mutateAsync({ ...form, ...position })
        if (parent && created?.id) {
          await mut.connect.mutateAsync({
            source_id: parent.id,
            target_id: created.id,
            source_handle: 'bottom',
            target_handle: 'top',
          })
        }
        toast.ok(t('structure.chartCreated'))
      }
      mut.invalidate()
      setModal(null)
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await mut.removeNode.mutateAsync(toDelete.id)
      mut.invalidate()
      setToDelete(null)
      setSelectedNode(null)
      toast.ok(t('structure.chartDeleted'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  const linkSuggested = async (n: HierarchyNode) => {
    if (!n.suggested_department_id) return
    if (!(await confirm({ kind: 'action', subject: n.suggested_department_name, confirmLabel: t('structure.chartLink') }))) return
    try {
      await mut.updateNode.mutateAsync({ id: n.id, body: { department_id: n.suggested_department_id } })
      mut.invalidate()
      toast.ok(t('structure.chartLinked'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  if (!branchId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={<GitBranch size={22} />}
          title={t('structure.chartPickBranch')}
          description={t('structure.chartPickBranchHint')}
        />
      </div>
    )
  }

  const loading = live.loading || snapshot.loading
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = nodes.flatMap((n) => n.outgoing_connections ?? [])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={viewportRef}
        onPointerDown={onBackgroundDown}
        onPointerMove={onBackgroundMove}
        onPointerUp={onBackgroundUp}
        onPointerCancel={onBackgroundUp}
        onWheel={onWheel}
        className={cn(
          'relative h-full w-full touch-none overflow-hidden bg-surface-2/40',
          pan.current ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        {/* The dotted ground reads as a drafting sheet and, unlike a plain
            fill, makes panning visible even in an empty region. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: 'radial-gradient(rgb(var(--fg-subtle) / 0.28) 1px, transparent 1px)',
            backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg
            className="pointer-events-none absolute"
            style={{ left: bounds.minX, top: bounds.minY }}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
          >
            <defs>
              <marker
                id="orgchart-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--brand))" />
              </marker>
            </defs>
            <g transform={`translate(${-bounds.minX} ${-bounds.minY})`}>
              {edges.map((e) => {
                const s = byId.get(e.source_id)
                const tgt = byId.get(e.target_id)
                if (!s || !tgt) return null
                const d = edgePath(
                  box(s),
                  (e.source_handle as Handle) || 'bottom',
                  box(tgt),
                  (e.target_handle as Handle) || 'top',
                )
                const active = selectedEdge === e.id
                return (
                  <g key={e.id}>
                    {/* A 1.6px line is almost impossible to hit with a mouse,
                        so a fat transparent twin carries the clicks. */}
                    {editable && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        style={{ pointerEvents: 'stroke' }}
                        className="cursor-pointer"
                        onPointerDown={(ev) => {
                          ev.stopPropagation()
                          setSelectedNode(null)
                          setSelectedEdge(e.id)
                        }}
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={active ? 'rgb(var(--danger))' : 'rgb(var(--brand))'}
                      strokeWidth={active ? 2.4 : 1.6}
                      strokeOpacity={active ? 1 : 0.55}
                      strokeDasharray={e.edge_style === 'dashed' ? '6 4' : undefined}
                      markerEnd="url(#orgchart-arrow)"
                    />
                  </g>
                )
              })}
            </g>
          </svg>

          {nodes.map((n) => {
            const b = box(n)
            return (
              <NodeCard
                key={n.id}
                node={n}
                left={b.x}
                top={b.y}
                selected={selectedNode === n.id}
                connectSource={connectFrom === n.id}
                connectTarget={connectFrom != null && connectFrom !== n.id}
                editable={editable}
                measure={measure}
                onPointerDown={(e) => onNodeDown(e, n)}
                onPointerMove={onNodeMove}
                onPointerUp={(e) => void onNodeUp(e, n)}
                onEdit={() => setModal({ node: n })}
                onAddChild={() => setModal({ parent: n })}
                onDelete={() => setToDelete(n)}
                onConnect={() => setConnectFrom(n.id)}
                onLinkSuggested={() => void linkSuggested(n)}
              />
            )
          })}
        </div>

        {loading && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}

        {!loading && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <EmptyState
              icon={<GitBranch size={22} />}
              title={t('structure.chartEmpty')}
              description={t('structure.chartEmptyHint')}
              action={
                editable ? (
                  <Button leftIcon={<Plus size={16} />} onClick={() => setModal({})}>
                    {t('structure.chartAddFirst')}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>

      {/* ── date view (TZ 4.2.6) ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto w-[190px]">
          <DateInput value={asOf} onChange={setAsOf} aria-label={t('structure.chartAsOf')} />
        </div>
        {historyMode && (
          <span className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-tag border border-warning/35 bg-warning-soft px-3 text-[12px] font-semibold text-warning">
            {t('structure.chartHistory')}
            {snapshot.takenAt ? ` · ${formatDateTime(snapshot.takenAt)}` : ''}
          </span>
        )}
        {snapshot.missing && (
          <span className="pointer-events-auto inline-flex h-9 items-center rounded-tag border border-line bg-surface px-3 text-[12px] text-fg-muted">
            {t('structure.chartNoSnapshot')}
          </span>
        )}
        {asOf && (
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto"
            onClick={() => setAsOf('')}
          >
            {t('structure.chartNow')}
          </Button>
        )}
      </div>

      {/* ── edit bar ───────────────────────────────────────────────────── */}
      {editable && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2.5">
          <span className="hidden max-w-[520px] text-right text-[11px] leading-tight text-fg-subtle lg:block">
            {t('structure.chartHint')}
          </span>
          <Button
            size="sm"
            leftIcon={<Plus size={15} />}
            className="pointer-events-auto"
            onClick={() => setModal({})}
          >
            {t('structure.chartAdd')}
          </Button>
        </div>
      )}

      {connectFrom != null && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-tag border border-brand/35 bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand-strong">
          <Link2 size={14} />
          {t('structure.chartConnectHint')}
          <button
            type="button"
            onClick={() => setConnectFrom(null)}
            aria-label={t('common.cancel')}
            className="rounded p-0.5 transition-colors hover:bg-brand/15"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── zoom ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-card border border-line bg-surface p-1 shadow-sm">
        <IconButton size="sm" label={t('structure.chartZoomIn')} onClick={() => zoomBy(1.2)}>
          <Plus size={14} />
        </IconButton>
        <IconButton size="sm" label={t('structure.chartZoomOut')} onClick={() => zoomBy(1 / 1.2)}>
          <Minus size={14} />
        </IconButton>
        <IconButton size="sm" label={t('structure.chartFit')} onClick={fit}>
          <Maximize2 size={14} />
        </IconButton>
      </div>

      <NodeModal
        state={modal}
        branchId={branchId}
        onClose={() => setModal(null)}
        onSave={saveNode}
        loading={mut.createNode.isPending || mut.updateNode.isPending}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={t('structure.chartDeleteTitle')}
        description={t('structure.chartDeleteText', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        loading={mut.removeNode.isPending}
      />
    </div>
  )
}

/* ──────────────────────────────── card ──────────────────────────────────── */

interface CardProps {
  node: HierarchyNode
  left: number
  top: number
  selected: boolean
  connectSource: boolean
  connectTarget: boolean
  editable: boolean
  measure: (id: number, el: HTMLDivElement | null) => void
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
  onEdit: () => void
  onAddChild: () => void
  onDelete: () => void
  onConnect: () => void
  onLinkSuggested: () => void
}

function NodeCard({
  node,
  left,
  top,
  selected,
  connectSource,
  connectTarget,
  editable,
  measure,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onEdit,
  onAddChild,
  onDelete,
  onConnect,
  onLinkSuggested,
}: CardProps) {
  const { t } = useTranslation()
  const accent = node.accent_color || ACCENTS[0]
  const isTitle = node.node_type === 'topNode'
  const linked = !!node.department_id
  const occupied = Number(node.occupied_units ?? 0)
  const planned = Number(node.planned_units ?? 0)
  const vacant = Number(node.vacant_units ?? 0)

  return (
    <div className="absolute" style={{ left, top, width: NODE_W }}>
      {selected && editable && (
        /* ⚠️ The toolbar sits OUTSIDE the card, so a pointerdown on it reaches
           the canvas background handler, which clears the selection — the
           toolbar then unmounted before the click could land and every button
           here was dead. Swallow the pointer event; the click still fires. */
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-10 right-0 flex items-center gap-1 rounded-card border border-line bg-surface p-1 shadow-md"
        >
          <IconButton size="sm" label={t('common.edit')} onClick={onEdit}>
            <Pencil size={13} />
          </IconButton>
          <IconButton size="sm" label={t('structure.chartAddChild')} onClick={onAddChild}>
            <Plus size={13} />
          </IconButton>
          <IconButton size="sm" label={t('structure.chartConnect')} onClick={onConnect}>
            <Link2 size={13} />
          </IconButton>
          <IconButton size="sm" label={t('common.delete')} onClick={onDelete}>
            <Trash2 size={13} className="text-danger" />
          </IconButton>
        </div>
      )}

      <div
        ref={(el) => measure(node.id, el)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'relative select-none overflow-hidden rounded-card border bg-surface shadow-sm transition-shadow',
          editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          selected ? 'border-brand shadow-md ring-2 ring-brand/20' : 'border-line',
          connectSource && 'ring-2 ring-brand/40',
          connectTarget && 'border-brand/60',
        )}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />

        {isTitle ? (
          <p className="px-4 py-3.5 pl-5 text-center text-[13px] font-bold text-fg">
            {node.name}
          </p>
        ) : (
          <div className="flex flex-col gap-1 px-3.5 py-3 pl-5">
            <h3 className="text-[14px] font-bold leading-tight text-fg">{node.name}</h3>
            {node.description && (
              <p className="text-[11px] leading-tight text-fg-subtle">{node.description}</p>
            )}

            {/* A LINKED card reports the staffing table (occupied / approved);
                an unlinked one can only show the number typed into it. */}
            {linked ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span
                  title={t('structure.chartStaffed')}
                  className="inline-flex items-center gap-1.5 rounded-tag border border-brand/30 bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-strong"
                >
                  <Users size={12} />
                  <span className="tabular-nums">
                    {occupied} / {planned}
                  </span>
                </span>
                {vacant > 0 && (
                  <span className="rounded-tag bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                    {t('structure.chartVacant')} {vacant}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {!!node.employee_count && (
                  <span className="inline-flex items-center gap-1.5 rounded-tag bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-fg-muted">
                    <Users size={12} />
                    <span className="tabular-nums">{node.employee_count}</span>
                  </span>
                )}
                {/* The server only ever SUGGESTS a department — a wrong guess
                    would otherwise silently rewrite the headcount shown. */}
                {editable && node.suggested_department_id && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={onLinkSuggested}
                    title={node.suggested_department_name ?? ''}
                    className="rounded-tag border border-dashed border-brand/45 px-2 py-0.5 text-[11px] font-semibold text-brand-strong transition-colors hover:bg-brand-soft"
                  >
                    {t('structure.chartLink')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────── modal ─────────────────────────────────── */

function NodeModal({
  state,
  branchId,
  onClose,
  onSave,
  loading,
}: {
  state: ModalState | null
  branchId: number | null
  onClose: () => void
  onSave: (form: Record<string, unknown>) => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const editing = state?.node ?? null
  // Every department, not the management table's first page of 25 — this is a
  // picker (see useDepartmentRecords).
  const departments = useDepartmentRecords<Department>()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [count, setCount] = useState('')
  const [type, setType] = useState<NodeType>('deptNode')
  const [accent, setAccent] = useState(ACCENTS[0])
  const [departmentId, setDepartmentId] = useState('')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!state) return
    setInvalid(false)
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setCount(editing?.employee_count ? String(editing.employee_count) : '')
    setType((editing?.node_type as NodeType) === 'topNode' ? 'topNode' : 'deptNode')
    setAccent(editing?.accent_color || ACCENTS[0])
    setDepartmentId(editing?.department_id ? String(editing.department_id) : '')
  }, [state, editing])

  if (!state) return null

  const submit = () => {
    if (!name.trim()) {
      setInvalid(true)
      return
    }
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      employee_count: count ? Number(count) : null,
      node_type: type,
      accent_color: accent,
      department_id: departmentId ? Number(departmentId) : null,
      organization_branch_id: branchId,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('structure.chartEditNode') : t('structure.chartNewNode')}
      description={state.parent ? t('structure.chartChildOf', { name: state.parent.name ?? '' }) : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={loading}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label={t('structure.chartFieldName')} required error={invalid ? t('structure.nameRequired') : undefined}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setInvalid(false)
            }}
            invalid={invalid}
          />
        </Field>

        <Field label={t('structure.chartFieldDescription')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label={t('structure.chartFieldType')}>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value === 'topNode' ? 'topNode' : 'deptNode')}
              options={[
                { value: 'deptNode', label: t('structure.chartTypeDept') },
                { value: 'topNode', label: t('structure.chartTypeTitle') },
              ]}
            />
          </Field>

          {/* A title block is a heading, not a unit: it has no headcount and
              nothing to link to, so those two fields disappear for it. */}
          {type === 'deptNode' && (
            <Field label={t('structure.chartFieldCount')} hint={t('structure.chartCountHint')}>
              <Input
                value={count}
                inputMode="numeric"
                onChange={(e) => setCount(e.target.value.replace(/\D+/g, '').slice(0, 5))}
              />
            </Field>
          )}
        </div>

        {type === 'deptNode' && (
          <Field label={t('structure.chartFieldDepartment')} hint={t('structure.chartDepartmentHint')}>
            <Combobox
              value={departmentId}
              onChange={setDepartmentId}
              placeholder={t('common.choose')}
              options={departments.map((d) => ({ value: String(d.id), label: d.name ?? '—' }))}
            />
          </Field>
        )}

        <Field label={t('structure.chartFieldColor')}>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={accent === c}
                onClick={() => setAccent(c)}
                style={{ background: c }}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-transform',
                  accent === c ? 'scale-110 border-fg' : 'border-transparent hover:scale-105',
                )}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
