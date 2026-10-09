/**
 * Word-level diff for the decree edit history.
 *
 * v2 printed the whole `old_text` struck through above the whole `new_text`, so
 * a one-word correction in a long decree looked like the entire paragraph had
 * been rewritten and the reader had to spot the change by eye. v1 marks only
 * what actually moved; this is that algorithm, ported.
 *
 * Whitespace is kept as its own token so the rebuilt text still reads naturally
 * and indentation survives. No dependency: a plain LCS table over tokens.
 */
export type DiffKind = 'same' | 'del' | 'add'
export interface DiffSegment {
  kind: DiffKind
  text: string
}

const tokenize = (s: string): string[] => String(s ?? '').match(/\s+|\S+/g) ?? []

export function wordDiff(oldText?: string | null, newText?: string | null): DiffSegment[] {
  const a = tokenize(oldText ?? '')
  const b = tokenize(newText ?? '')
  // LCS lengths. Decree bodies are paragraphs, not files, so the quadratic
  // table is far cheaper here than pulling in a diff library.
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffSegment[] = []
  const push = (kind: DiffKind, text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('del', a[i++])
    } else {
      push('add', b[j++])
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('add', b[j++])
  return out
}
