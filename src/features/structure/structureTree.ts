import type { SelectOption } from '@/components/ui/Select'

/**
 * Bo'limlar ierarxiyasi (TZ 4.2.6, S1–S2) — v1 `pages/tuzilma/structureTree.js`
 * ning tiplangan nusxasi. Yassi ro'yxat `parent_id` bo'yicha daraxtga
 * yig'iladi; ota topilmasa yoki sikl bo'lsa tugun ildizga chiqadi — ma'lumot
 * yo'qolmaydi.
 */

export interface TreeSource {
  id: number
  name?: string | null
  code?: string | null
  parent_id?: number | null
}

export interface TreeNode<T extends TreeSource> {
  id: number
  name: string
  code: string
  parent_id: number | null
  raw: T
  children: TreeNode<T>[]
}

function isAncestor<T extends TreeSource>(nodes: Map<number, TreeNode<T>>, id: number, startId: number | null) {
  const seen = new Set<number>()
  let cur = startId
  while (cur != null && !seen.has(cur)) {
    if (cur === id) return true
    seen.add(cur)
    cur = nodes.get(cur)?.parent_id ?? null
  }
  return false
}

function sortTree<T extends TreeSource>(nodes: TreeNode<T>[]) {
  nodes.sort((a, b) => a.name.localeCompare(b.name, 'uz'))
  nodes.forEach((n) => sortTree(n.children))
}

export function buildTree<T extends TreeSource>(list: T[]): TreeNode<T>[] {
  const nodes = new Map<number, TreeNode<T>>()
  for (const d of list) {
    nodes.set(d.id, {
      id: d.id,
      name: d.name || `#${d.id}`,
      code: d.code || '',
      parent_id: d.parent_id ?? null,
      raw: d,
      children: [],
    })
  }
  const roots: TreeNode<T>[] = []
  for (const node of nodes.values()) {
    const pid = node.parent_id
    const parent = pid != null && pid !== node.id ? nodes.get(pid) : undefined
    if (parent && !isAncestor(nodes, node.id, parent.parent_id)) parent.children.push(node)
    else {
      node.parent_id = null
      roots.push(node)
    }
  }
  sortTree(roots)
  return roots
}

/** Daraxt → chuqurligi bilan yassi ro'yxat (oldindan-tartib). */
export function flattenTree<T extends TreeSource>(
  roots: TreeNode<T>[],
  depth = 0,
  out: { node: TreeNode<T>; depth: number }[] = [],
) {
  for (const n of roots) {
    out.push({ node: n, depth })
    flattenTree(n.children, depth + 1, out)
  }
  return out
}

export function indexTree<T extends TreeSource>(roots: TreeNode<T>[]) {
  const byId = new Map<number, TreeNode<T>>()
  flattenTree(roots).forEach(({ node }) => byId.set(node.id, node))
  return byId
}

/** Tugunning barcha avlodlari id lari. */
export function descendantIds<T extends TreeSource>(node: TreeNode<T> | undefined | null): Set<number> {
  const out = new Set<number>()
  const walk = (n: TreeNode<T>) =>
    n.children.forEach((c) => {
      out.add(c.id)
      walk(c)
    })
  if (node) walk(node)
  return out
}

/**
 * Ota tanlagichi variantlari — chuqurlik bo'yicha chekinish bilan.
 * `exclude` (tahrirlanayotgan bo'lim va uning avlodlari) chiqarib tashlanadi:
 * bo'limni o'z avlodiga bo'ysundirib bo'lmaydi (422 `department_cycle`).
 */
export function parentOptions<T extends TreeSource>(roots: TreeNode<T>[], exclude: Set<number> = new Set()): SelectOption[] {
  return flattenTree(roots)
    .filter(({ node }) => !exclude.has(node.id))
    .map(({ node, depth }) => ({
      value: String(node.id),
      label: `${' '.repeat(depth)}${depth ? '└ ' : ''}${node.name}`,
      subLabel: node.code || undefined,
    }))
}

/** Ko'chirishlar qo'llanganda sikl bormi? `parentMap` — id → parent_id.
 *  Sikl bo'lsa unga tushgan bo'lim id si, aks holda null. */
export function findCycle(parentMap: Map<number, number | null>): number | null {
  for (const start of parentMap.keys()) {
    const seen = new Set<number>()
    let cur: number | null = start
    while (cur != null) {
      if (seen.has(cur)) return cur
      seen.add(cur)
      cur = parentMap.get(cur) ?? null
    }
  }
  return null
}
