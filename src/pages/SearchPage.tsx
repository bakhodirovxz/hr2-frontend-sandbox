import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Search, SearchX } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { LoadError } from '@/components/data/LoadError'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { apiGet } from '@/api/http'
import { useDynamicT } from '@/i18n/dynamicKey'
import { useBranchStore } from '@/store/branchStore'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { isInvalidRange } from '@/lib/dateRange'
import { SEARCH_MODULES, type SearchModule } from '@/features/search/searchRoutes'

/**
 * Kengaytirilgan qidiruv (TZ 1840, 1867, GEN-8): kalit so'z + modullar +
 * filial / bo'lim / holat / sana oralig'i → `GET /search`. Natijalar modul
 * bo'yicha guruhlanadi, har biri serverdan kelgan tayyor `url` bilan.
 *
 * Holat URL'da (`?q=&modules=&branch_id=&department_id=&status=&date_from=&date_to=`):
 * shapkadagi qidiruvning «Barcha natijalar» havolasi shu sahifani
 * `?q=…&modules=…` bilan ochadi, natijani havola bilan ulashish mumkin.
 */

const MIN_QUERY = 2
const FIELDS = ['branch_id', 'department_id', 'status', 'date_from', 'date_to'] as const
type FieldKey = (typeof FIELDS)[number]
const STATUSES = ['active', 'archived', 'draft', 'approved', 'rejected', 'in_progress'] as const

interface SearchItem {
  id: number | string
  title: string
  subtitle?: string | null
  url?: string | null
}
interface SearchResponse {
  results: Record<string, SearchItem[]>
  total?: number
}

interface FormState extends Record<FieldKey, string> {
  q: string
  modules: SearchModule[]
}

const ALL = SEARCH_MODULES as readonly SearchModule[]

function readParams(sp: URLSearchParams): FormState {
  const mods = sp.get('modules')
  return {
    q: sp.get('q') ?? '',
    modules: mods ? (mods.split(',').filter((m) => (ALL as readonly string[]).includes(m)) as SearchModule[]) : [...ALL],
    branch_id: sp.get('branch_id') ?? '',
    department_id: sp.get('department_id') ?? '',
    status: sp.get('status') ?? '',
    date_from: sp.get('date_from') ?? '',
    date_to: sp.get('date_to') ?? '',
  }
}

export function SearchPage() {
  const { t } = useTranslation()
  const tk = useDynamicT()
  const [sp, setSp] = useSearchParams()
  const applied = useMemo(() => readParams(sp), [sp])
  const [form, setForm] = useState<FormState>(applied)
  // URL o'zgarsa (shapkadagi qidiruv, orqaga tugmasi) shakl ham ergashadi.
  useEffect(() => setForm(applied), [applied])

  const branches = useBranchStore((s) => s.branches)
  const departments = useDepartmentOptions(form.branch_id ? Number(form.branch_id) : null)
  const badRange = isInvalidRange(form.date_from, form.date_to)

  const term = applied.q.trim()
  const modules = applied.modules.length ? applied.modules : [...ALL]
  const results = useQuery({
    queryKey: ['search-page', term, modules.join(','), ...FIELDS.map((k) => applied[k])],
    queryFn: ({ signal }) =>
      apiGet<SearchResponse>(
        'search',
        {
          _no_branch_inject: true,
          q: term,
          modules: modules.length < ALL.length ? modules.join(',') : undefined,
          limit: 20,
          branch_id: applied.branch_id || undefined,
          department_id: applied.department_id || undefined,
          status: applied.status || undefined,
          date_from: applied.date_from || undefined,
          date_to: applied.date_to || undefined,
        },
        { signal },
      ),
    enabled: term.length >= MIN_QUERY && !isInvalidRange(applied.date_from, applied.date_to),
    retry: false,
  })

  const groups = useMemo(() => {
    const res = results.data?.results ?? {}
    return Object.entries(res)
      .filter(([, items]) => Array.isArray(items) && items.length)
      .sort(([a], [b]) => {
        const ia = (ALL as readonly string[]).indexOf(a)
        const ib = (ALL as readonly string[]).indexOf(b)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      .map(([module, items]) => ({ module, items }))
  }, [results.data])
  const total = results.data?.total ?? groups.reduce((s, g) => s + g.items.length, 0)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (badRange) return
    const next: Record<string, string> = {}
    if (form.q.trim()) next.q = form.q.trim()
    if (form.modules.length && form.modules.length < ALL.length) next.modules = form.modules.join(',')
    for (const k of FIELDS) if (form[k]) next[k] = form[k]
    setSp(next)
  }
  const reset = () => setSp(form.q.trim() ? { q: form.q.trim() } : {})
  const toggle = (m: SearchModule, on: boolean) =>
    setForm((f) => ({ ...f, modules: on ? ALL.filter((x) => x === m || f.modules.includes(x)) : f.modules.filter((x) => x !== m) }))
  const set = (k: FieldKey, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <PageContainer>
      <PageHeader title={t('searchPage.title')} subtitle={t('searchPage.subtitle')} />
      <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="p-4">
          <form role="search" onSubmit={submit} className="space-y-4" noValidate>
            <Field label={t('searchPage.keyword')}>
              <Input
                type="search"
                value={form.q}
                maxLength={200}
                autoFocus
                leftIcon={<Search size={15} />}
                placeholder={t('searchPage.keywordPh', { count: MIN_QUERY })}
                onChange={(e) => setForm((f) => ({ ...f, q: e.target.value }))}
              />
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">{t('searchPage.modules')}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {ALL.map((m) => (
                  <Checkbox
                    key={m}
                    label={tk(`search.mod_${m}`)}
                    checked={form.modules.includes(m)}
                    onChange={(e) => toggle(m, e.target.checked)}
                  />
                ))}
              </div>
            </fieldset>

            {branches.length > 1 && (
              <Field label={t('searchPage.branch')}>
                <Combobox
                  value={form.branch_id}
                  onChange={(v) => setForm((f) => ({ ...f, branch_id: v, department_id: '' }))}
                  options={branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
                  placeholder={t('searchPage.allBranches')}
                />
              </Field>
            )}
            <Field label={t('searchPage.department')}>
              <Combobox
                value={form.department_id}
                onChange={(v) => set('department_id', v)}
                options={departments}
                placeholder={t('searchPage.allDepartments')}
              />
            </Field>
            <Field label={t('searchPage.status')}>
              <Combobox
                value={form.status}
                onChange={(v) => set('status', v)}
                options={STATUSES.map((s) => ({ value: s, label: t(`searchPage.st_${s}` as const) }))}
                placeholder={t('searchPage.allStatuses')}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('searchPage.dateFrom')}>
                <DateInput value={form.date_from} onChange={(v) => set('date_from', v)} invalid={badRange} />
              </Field>
              <Field label={t('searchPage.dateTo')} error={badRange ? t('searchPage.badRange') : undefined}>
                <DateInput value={form.date_to} onChange={(v) => set('date_to', v)} invalid={badRange} />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" leftIcon={<Search size={15} />} disabled={badRange}>
                {t('searchPage.submit')}
              </Button>
              <IconButton label={t('searchPage.reset')} onClick={reset}>
                <RotateCcw size={16} />
              </IconButton>
            </div>
          </form>
        </Card>

        <section aria-live="polite" className="min-w-0 space-y-3">
          {term.length < MIN_QUERY ? (
            <Card className="p-6">
              <EmptyState icon={<Search size={22} />} title={t('searchPage.prompt')} description={t('searchPage.promptHint', { count: MIN_QUERY })} />
            </Card>
          ) : results.isLoading ? (
            <Card className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </Card>
          ) : results.error ? (
            <Card className="p-6">
              <LoadError error={results.error} onRetry={() => results.refetch()} />
            </Card>
          ) : groups.length === 0 ? (
            <Card className="p-6">
              <EmptyState icon={<SearchX size={22} />} title={t('searchPage.nothing')} description={t('searchPage.nothingHint')} />
            </Card>
          ) : (
            <>
              <p className="text-[13px] text-fg-muted">
                {t('searchPage.found')}: <b className="font-semibold text-fg">{total}</b>
              </p>
              {groups.map((g) => (
                <Card key={g.module} className="overflow-hidden p-0">
                  <h2 className="flex h-10 items-center justify-between border-b border-line px-4 text-[12.5px] font-bold uppercase tracking-wide text-brand">
                    {tk(`search.mod_${g.module}`)}
                    <span className="font-semibold text-fg-subtle">{g.items.length}</span>
                  </h2>
                  <ul className="divide-y divide-line/60">
                    {g.items.map((it) => (
                      <li key={`${g.module}-${it.id}`}>
                        {it.url ? (
                          <Link
                            to={it.url}
                            className="block px-4 py-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                          >
                            <span className="block text-[14px] text-fg">{it.title}</span>
                            {it.subtitle && <span className="mt-0.5 block text-[12px] text-fg-muted">{it.subtitle}</span>}
                          </Link>
                        ) : (
                          <div className="px-4 py-2.5">
                            <span className="block text-[14px] text-fg">{it.title}</span>
                            {it.subtitle && <span className="mt-0.5 block text-[12px] text-fg-muted">{it.subtitle}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </>
          )}
        </section>
      </div>
    </PageContainer>
  )
}
