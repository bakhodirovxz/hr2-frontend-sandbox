import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, RefreshCw, RotateCcw, Save, X } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { RequireRole } from '@/components/layout/RequireRole'
import { useListParams } from '@/hooks/useListParams'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { apiGet, apiPost, apiPut } from '@/api/http'
import { DICTIONARY_ENTRIES, DICTIONARY_ENTRY } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { allUzTexts, autoTranslation, reloadOverrides } from '@/i18n'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import { sha1Hex } from '@/lib/sha1'
import { cn } from '@/lib/cn'

/*
 * TIZIM LUG'ATI — TZ 4.2.1 «Работа со словарем Системы для обеспечения
 * полноценной работы двуязычного интерфейса» (ADM-7, faqat master-admin).
 *
 * Har bir interfeys matni (kalit = o'zbek lotin matnining o'zi, `uz` daraxti
 * barglari) uchun:
 *   • O'zbekcha (kirill) — avtomatik transliteratsiya, ustidan tuzatish;
 *   • Русский — `ru.ts` jadvalidagi tarjima, ustidan tuzatish.
 *
 * Tuzatishlar `ui_dictionary` ma'lumotnomasida saqlanadi (yozuv kodi =
 * sha1(kalit)[:16], `name` = kalit, `name_ru`, `extra.uz_cyrl`) va
 * `GET /i18n/overrides` orqali barcha foydalanuvchilarga tarqaladi. Sahifa
 * sessiyada bir marta barcha matnlarni `POST /i18n/keys/sync` bilan
 * yuboradi — server ro'yxati to'liq bo'lsin.
 */

const NB = { _no_branch_inject: true } as const
const TYPE = 'ui_dictionary'
const SYNC_FLAG = 'ui_dictionary_synced_v2'
const FILTER_KEYS = ['missing', 'edited'] as const

type Overrides = { ru: Record<string, string>; uz_cyrl: Record<string, string> }

interface Entry {
  id: number
  code: string
  name: string
  name_ru?: string | null
  extra?: Record<string, unknown> | null
}

interface DictRow {
  id: number
  key: string
  /** The `ui_dictionary` entry name the override is stored under (may differ
   *  from `key` in apostrophe style — the lookup is normalised). */
  entryName: string
  cyrAuto: string
  cyrOverride: string | null
  ruBase: string
  ruOverride: string | null
  folded: string
}

/** Same normalisation as `i18n/index.ts` (apostrophes, ellipsis, spaces, case). */
const norm = (s: string) =>
  s
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const NO_OVERRIDES: Overrides = { ru: {}, uz_cyrl: {} }
// Module-level so TanStack keeps the selected object stable between renders.
const selectOverrides = (d: Overrides | null): Overrides => ({ ru: d?.ru ?? {}, uz_cyrl: d?.uz_cyrl ?? {} })

/** Textarea height that shows a long text whole (2–8 lines). */
const rowsFor = (s: string) => Math.min(8, Math.max(2, Math.ceil(s.length / 45)))

/** A text with no Latin letter (a number, «—», a bare placeholder) needs no translation. */
const needsTranslation = (s: string) => /[A-Za-z]/.test(s)

async function findEntry(name: string): Promise<Entry | null> {
  type PageOf = { items?: Entry[] } | Entry[]
  const list = (d: PageOf) => (Array.isArray(d) ? d : (d?.items ?? []))
  const code = sha1Hex(name).slice(0, 16)
  const byCode = list(await apiGet<PageOf>(DICTIONARY_ENTRIES(TYPE), { search: code, size: 100, ...NB }))
  const hit = byCode.find((r) => r.code === code)
  if (hit) return hit
  const byName = list(await apiGet<PageOf>(DICTIONARY_ENTRIES(TYPE), { search: name, size: 100, ...NB }))
  return byName.find((r) => r.name === name) ?? byName.find((r) => norm(r.name) === norm(name)) ?? null
}

function UiDictionaryPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(FILTER_KEYS)
  const onlyMissing = filters.missing === '1'
  const onlyEdited = filters.edited === '1'

  const texts = useQuery({ queryKey: ['ui-dict', 'texts'], queryFn: allUzTexts, staleTime: Infinity })
  const overrides = useQuery({
    queryKey: ['ui-dict', 'overrides'],
    queryFn: () => apiGet<Overrides>('i18n/overrides', NB),
    select: selectOverrides,
    meta: { silent: true },
  })

  // ── Once per session: every known text goes to the server list. ────────
  const sync = useMutation({
    mutationFn: (keys: string[]) =>
      apiPost<{ created?: number; total?: number }>('i18n/keys/sync', { keys }, { params: NB, timeout: 120_000 }),
    // The automatic once-per-session sync must not raise a toast; the button does (below).
    meta: { silent: true },
  })
  const syncKeys = async (silent: boolean) => {
    const keys = await allUzTexts()
    try {
      const data = await sync.mutateAsync(keys)
      try {
        sessionStorage.setItem(SYNC_FLAG, '1')
      } catch {
        /* storage blocked — the next visit simply syncs again */
      }
      if (!silent || data?.created) toast.ok(t('uiDict.synced', { count: data?.created ?? 0 }))
    } catch (e) {
      if (!silent) toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }
  const synced = useRef(false)
  useEffect(() => {
    if (synced.current) return
    synced.current = true
    let done = false
    try {
      done = sessionStorage.getItem(SYNC_FLAG) === '1'
    } catch {
      /* ignore */
    }
    if (!done) void syncKeys(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keys: the Uzbek tree plus any override stored under a text the tree
  //    no longer has (so «only overridden» lists every correction). ─────────
  const ov = overrides.data ?? NO_OVERRIDES
  const keys = useMemo(() => {
    const list = texts.data ?? []
    const known = new Set(list.map(norm))
    const extra = [...Object.keys(ov.ru), ...Object.keys(ov.uz_cyrl)].filter((k) => k.trim() && !known.has(norm(k)))
    return [...new Set([...list, ...extra])].filter((k) => k.trim()).sort((a, b) => a.localeCompare(b, 'uz'))
  }, [texts.data, ov])

  // Automatic values, computed once per key (the Russian table is a lazy chunk).
  const autoCache = useRef(new Map<string, { cyr: string; ru: string }>())
  const [autoVersion, setAutoVersion] = useState(0)
  useEffect(() => {
    const todo = keys.filter((k) => !autoCache.current.has(k))
    if (todo.length === 0) return
    let cancelled = false
    void Promise.all(
      todo.map(async (k) => [k, await autoTranslation('uz_cyrl', k), await autoTranslation('ru', k)] as const),
    ).then((res) => {
      if (cancelled) return
      for (const [k, cyr, ru] of res) autoCache.current.set(k, { cyr, ru })
      setAutoVersion((v) => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [keys])

  const rows = useMemo<DictRow[]>(() => {
    const ruNorm = new Map(Object.entries(ov.ru).map(([k, v]) => [norm(k), [k, v] as const]))
    const cyrNorm = new Map(Object.entries(ov.uz_cyrl).map(([k, v]) => [norm(k), [k, v] as const]))
    return keys.map((key, i) => {
      const auto = autoCache.current.get(key) ?? { cyr: '', ru: '' }
      const ruHit = ov.ru[key] != null ? ([key, ov.ru[key]] as const) : ruNorm.get(norm(key))
      const cyrHit = ov.uz_cyrl[key] != null ? ([key, ov.uz_cyrl[key]] as const) : cyrNorm.get(norm(key))
      const ruOverride = ruHit?.[1] || null
      const cyrOverride = cyrHit?.[1] || null
      return {
        id: i + 1,
        key,
        entryName: ruHit?.[0] ?? cyrHit?.[0] ?? key,
        cyrAuto: auto.cyr,
        cyrOverride,
        ruBase: auto.ru,
        ruOverride,
        folded: searchFold([key, ruOverride ?? auto.ru, cyrOverride ?? auto.cyr].join('\n')),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, ov, autoVersion])

  const isMissing = (r: DictRow) => needsTranslation(r.key) && !r.ruBase && !r.ruOverride
  const missingCount = useMemo(() => rows.filter(isMissing).length, [rows])

  const filtered = useMemo(() => {
    const q = searchFold(search.trim())
    return rows.filter((r) => {
      if (onlyMissing && !isMissing(r)) return false
      if (onlyEdited && !(r.ruOverride || r.cyrOverride)) return false
      return !q || foldIncludes(r.folded, q)
    })
  }, [rows, search, onlyMissing, onlyEdited])

  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const pageRows = filtered.slice((page - 1) * size, page * size)

  // ── Inline edit ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<{ key: string; cyr: string; ru: string } | null>(null)
  const startEdit = (r: DictRow) => setEditing({ key: r.key, cyr: r.cyrOverride ?? r.cyrAuto, ru: r.ruOverride ?? r.ruBase })

  const save = useMutation({
    mutationFn: async ({ row, cyr, ru }: { row: DictRow; cyr: string; ru: string }) => {
      // Equal to the automatic value — not a correction, nothing is stored.
      const cyrNext = cyr.trim() && cyr.trim() !== row.cyrAuto ? cyr.trim() : null
      const ruNext = ru.trim() && ru.trim() !== row.ruBase ? ru.trim() : null
      const entry = await findEntry(row.entryName)
      if (entry) {
        const extra: Record<string, unknown> = { ...(entry.extra ?? {}) }
        if (cyrNext) extra.uz_cyrl = cyrNext
        else delete extra.uz_cyrl
        await apiPut(DICTIONARY_ENTRY(entry.id), { name_ru: ruNext, extra }, { params: NB })
      } else {
        await apiPost(DICTIONARY_ENTRIES(TYPE), {
          code: sha1Hex(row.key).slice(0, 16),
          name: row.key,
          name_ru: ruNext,
          extra: cyrNext ? { uz_cyrl: cyrNext } : {},
        }, { params: NB })
      }
    },
    onSuccess: async () => {
      toast.ok(t('common.saved'))
      setEditing(null)
      await qc.invalidateQueries({ queryKey: ['ui-dict', 'overrides'] })
      // The interface itself picks the correction up without a reload.
      await reloadOverrides()
    },
  })

  const editingRow = editing ? rows.find((r) => r.key === editing.key) : undefined

  const columns: Column<DictRow>[] = [
    {
      key: 'key',
      header: t('uiDict.colKey'),
      headerClassName: 'w-[31%]',
      className: 'align-top break-words text-fg',
      skeleton: 'w-56',
      lockVisible: true,
      cell: (r) => r.key,
    },
    {
      key: 'cyr',
      header: t('uiDict.colCyr'),
      headerClassName: 'w-[31%]',
      className: 'align-top break-words',
      skeleton: 'w-56',
      cell: (r) =>
        editing?.key === r.key ? (
          <Textarea
            rows={rowsFor(editing.cyr)}
            value={editing.cyr}
            onChange={(e) => setEditing((s) => (s ? { ...s, cyr: e.target.value } : s))}
            aria-label={`${t('uiDict.colCyr')}: ${r.key}`}
          />
        ) : (
          <Shown value={r.cyrOverride ?? r.cyrAuto} edited={!!r.cyrOverride} auto={r.cyrOverride ? r.cyrAuto : null} />
        ),
    },
    {
      key: 'ru',
      header: <span lang="ru">{t('uiDict.colRu')}</span>,
      label: t('uiDict.colRu'),
      headerClassName: 'w-[31%]',
      className: 'align-top break-words',
      skeleton: 'w-56',
      cell: (r) =>
        editing?.key === r.key ? (
          <Textarea
            rows={rowsFor(editing.ru)}
            lang="ru"
            value={editing.ru}
            onChange={(e) => setEditing((s) => (s ? { ...s, ru: e.target.value } : s))}
            aria-label={`${t('uiDict.colRu')}: ${r.key}`}
          />
        ) : r.ruOverride || r.ruBase ? (
          <Shown
            lang="ru"
            value={r.ruOverride ?? r.ruBase}
            edited={!!r.ruOverride}
            auto={r.ruOverride && r.ruBase ? r.ruBase : null}
          />
        ) : isMissing(r) ? (
          <span className="italic text-danger">{t('uiDict.noTranslation')}</span>
        ) : (
          <span className="text-fg-subtle">{r.key}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-[7%]',
      className: 'align-top whitespace-nowrap pr-4 text-right',
      skeleton: 'w-8',
      cell: (r) =>
        editing?.key === r.key ? (
          <span className="inline-flex gap-1">
            <IconButton
              size="sm"
              label={t('uiDict.resetValue')}
              onClick={() => setEditing((s) => (s ? { ...s, cyr: r.cyrAuto, ru: r.ruBase } : s))}
            >
              <RotateCcw size={14} />
            </IconButton>
            <IconButton size="sm" label={t('common.cancel')} onClick={() => setEditing(null)} disabled={save.isPending}>
              <X size={14} />
            </IconButton>
            <Button
              size="sm"
              aria-label={t('common.save')}
              loading={save.isPending}
              onClick={() => editing && editingRow && save.mutate({ row: editingRow, cyr: editing.cyr, ru: editing.ru })}
            >
              <Save size={14} />
            </Button>
          </span>
        ) : (
          <IconButton size="sm" label={t('uiDict.editRow', { key: r.key })} onClick={() => startEdit(r)}>
            <Pencil size={14} />
          </IconButton>
        ),
    },
  ]

  const loading = texts.isLoading || (keys.length > 0 && autoVersion === 0)

  return (
    <PageContainer>
      <PageHeader
        title={t('uiDict.title')}
        subtitle={t('uiDict.subtitle')}
        actions={
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={15} className={cn(sync.isPending && 'animate-spin')} />}
            disabled={sync.isPending}
            onClick={() => void syncKeys(false)}
          >
            {t('uiDict.sync')}
          </Button>
        }
      />

      <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('uiDict.searchPlaceholder')}
            className="flex-1 lg:max-w-md"
          />
          <Checkbox
            label={t('uiDict.onlyMissing', { count: missingCount })}
            checked={onlyMissing}
            onChange={(e) => setFilter('missing', e.target.checked ? '1' : '')}
          />
          <Checkbox
            label={t('uiDict.onlyEdited')}
            checked={onlyEdited}
            onChange={(e) => setFilter('edited', e.target.checked ? '1' : '')}
          />
          <FilterReset count={activeFilterCount} onReset={reset} />
          {overrides.isError && (
            <span role="alert" className="text-[12.5px] text-warning">
              {t('uiDict.overridesFailed')}
            </span>
          )}
        </div>

        <DataTable
          rows={pageRows}
          columns={columns}
          loading={loading}
          error={texts.error}
          onRetry={() => void texts.refetch()}
          emptyTitle={t('uiDict.empty')}
          filtered={activeFilterCount > 0}
          emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
          minWidth={960}
        />

        <Pagination
          page={Math.min(page, pages)}
          size={size}
          total={filtered.length}
          pages={pages}
          onPage={setPage}
          onSize={setSize}
        />
      </Card>
    </PageContainer>
  )
}

function Shown({
  value,
  edited,
  auto,
  lang,
}: {
  value: string
  edited: boolean
  auto: string | null
  lang?: string
}) {
  const { t } = useTranslation()
  return (
    <span lang={lang} className="block">
      <span className={edited ? 'text-fg' : 'text-fg-muted'}>{value}</span>
      {edited && (
        <Badge tone="warning" className="ml-1.5 align-middle">
          {t('uiDict.edited')}
        </Badge>
      )}
      {auto && (
        <span className="mt-0.5 block text-[11.5px] text-fg-subtle">{t('uiDict.autoValue', { value: auto })}</span>
      )}
    </span>
  )
}

/** Master-admin only — the sidebar hides it; this stops a typed URL. */
export function UiDictionaryPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={isSiteMasterAdmin(user)} title={t('uiDict.title')}>
      <UiDictionaryPageInner />
    </RequireRole>
  )
}
