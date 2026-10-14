import dayjs from 'dayjs'
import { ln, lt } from '@/i18n/display'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BriefcaseBusiness, CalendarClock, Columns3, Download, FileSpreadsheet, FileText, Filter, Inbox, Megaphone, Pencil, Send, Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { LoadError } from '@/components/data/LoadError'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { displayName } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { isGuest } from '@/auth/permissions'
import { Select } from '@/components/ui/Select'
import { StaffPositionModal } from '@/features/staff/StaffPositionModal'
import { ExportColumnsModal } from '@/features/staff/ExportColumnsModal'
import { canCreateVacancy, canManageStaff, headDepartmentIds } from '@/features/staff/useStaffPositions'
import { useListParams } from '@/hooks/useListParams'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { RequiredLanguagesChips, entryLabel } from '@/features/vacancies/RequiredLanguagesChips'
import {
  exportVacancies,
  shareVacancy,
  useApplyVacancy,
  useMyApplications,
  useVacancies,
  type Vacancy,
  type VacancyApplication,
  type VacancyFilters,
  type VacancySortKey,
} from '@/features/vacancies/useVacancies'
import { inTashkent } from '@/lib/format'
import { isInvalidRange } from '@/lib/dateRange'
import { todayIso } from '@/lib/today'
import { cn } from '@/lib/cn'
import type { User } from '@/types'

/**
 * «Vakansiyalar» — TZ 4.2.10 (2208, 2225–2227) va V3 «Просмотр вакансий —
 * все пользователи» (mehmon ham).
 *
 * Bo'sh o'rinlar shtat jadvalidan avtomatik hisoblanadi (backend). HAR BIR
 * ustun bo'yicha filtr (matn — qism-satr, son — «kamida», sana — «dan/gacha»)
 * va istalgan ustun bo'yicha o'sish/kamayish saralash. Filtr, saralash, sahifa
 * va ochiq kartochka (`?open=`) URL'da turadi — havola bilan ochiladi.
 * Qatorni bosish → tafsilot va «Ariza berish / Suhbatga yozilish» shakli;
 * «Mening arizalarim» — o'z arizalarining holati.
 */

const URL_KEYS = ['tab', 'org', 'dept', 'job', 'req', 'min', 'from', 'to', 'status', 'sort', 'order', 'open'] as const
const FILTER_KEYS = ['org', 'dept', 'job', 'req', 'min', 'from', 'to', 'status'] as const
const SORT_KEYS: VacancySortKey[] = ['organization', 'department', 'job_position', 'requirements', 'vacant_count', 'available_from']

const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—')
const fmtDateTime = (d?: string | null) => (d ? inTashkent(d).format('DD.MM.YYYY HH:mm') : '—')

/** DataTable bilan BIR XIL taqqoslash — butun ro'yxat saralanib, keyin sahifalanadi. */
function sortValue(row: Vacancy, key: VacancySortKey): string | number | null {
  switch (key) {
    case 'organization':
      return row.organization?.name ?? null
    case 'department':
      return row.department?.name ?? null
    case 'job_position':
      return row.job_position?.name ?? null
    case 'requirements':
      return row.requirements || null
    case 'vacant_count':
      return row.vacant_count ?? null
    case 'available_from':
      return row.available_from ?? null
  }
}

function sortRows(rows: Vacancy[], key: VacancySortKey, dir: 'asc' | 'desc'): Vacancy[] {
  const k = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * k
    return String(x).localeCompare(String(y), 'uz') * k
  })
}

type UrlFilters = Record<string, string>

function sortOf(f: UrlFilters): { key: VacancySortKey; dir: 'asc' | 'desc' } {
  return {
    key: (SORT_KEYS as string[]).includes(f.sort) ? (f.sort as VacancySortKey) : 'available_from',
    dir: f.order === 'desc' ? 'desc' : 'asc',
  }
}

/** The server filters from the URL — shared by the list and its export. */
function listQuery(f: UrlFilters): VacancyFilters {
  const badRange = isInvalidRange(f.from, f.to)
  return {
    organization: f.org,
    department: f.dept,
    job_position: f.job,
    requirements: f.req,
    vacant_count_min: /^\d+([.,]\d+)?$/.test(f.min) ? f.min.replace(',', '.') : '',
    date_from: badRange ? '' : f.from,
    date_to: badRange ? '' : f.to,
    // TZ V3 1311 «фильтры … по статусу»: open (default) / paused / closed.
    status: f.status === 'paused' || f.status === 'closed' ? f.status : '',
  }
}

/** TZ V3 1327 «Поделиться вакансией» — the link opens this vacancy's card. */
function useShare() {
  const { t } = useTranslation()
  const toast = useToast()
  return async (v: Vacancy) => {
    const res = await shareVacancy(v, v.job_position?.name || t('vacancies.vacancy'))
    if (res === 'copied') toast.ok(t('ordVac.linkCopied'))
    else if (res === 'failed') toast.error(t('ordVac.shareFailed'))
  }
}

const fmtCount = (n?: number | null) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toLocaleString('ru-RU'))

export function VacanciesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const lp = useListParams(URL_KEYS)
  const tab: 'list' | 'mine' = lp.filters.tab === 'mine' ? 'mine' : 'list'
  const f = lp.filters
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const user = useAuthStore((st) => st.user)
  // TZ V1 «Пользователь открывает раздел «Вакансии» … «Создать вакансию»» (HR, heads).
  const canCreate = canCreateVacancy(user)
  const [creating, setCreating] = useState(false)
  // TZ 2233 «Настройки экспорта»: chosen columns; visible (filtered) vs all data.
  const [exportCols, setExportCols] = useState<string[]>([])
  const [colsOpen, setColsOpen] = useState(false)
  const [exportAll, setExportAll] = useState(false)

  // TZ V3 1327 «Экспорт списка вакансий» — the list's own filters and order (guests too).
  const doExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      const q = exportAll ? { ...listQuery({ ...f, org: '', dept: '', job: '', req: '', min: '', from: '', to: '' }) } : listQuery(f)
      await exportVacancies(q, sortOf(f).key, sortOf(f).dir, format, exportCols)
      toast.ok(t('ordVac.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('ordVac.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('vacancies.title')}
        subtitle={t('vacancies.subtitle')}
        actions={
          tab === 'list' ? (
            <>
              <ActionMenu
                label={t('ordVac.export')}
                icon={<Download size={14} />}
                width={300}
                items={[
                  { key: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={14} />, loading: exporting === 'xlsx', onClick: () => void doExport('xlsx') },
                  { key: 'pdf', label: 'PDF', icon: <FileText size={14} />, loading: exporting === 'pdf', onClick: () => void doExport('pdf') },
                  {
                    key: 'scope',
                    label: exportAll ? t('ordVac.exportScopeAll') : t('ordVac.exportScopeVisible'),
                    hint: t('ordVac.exportScopeHint'),
                    icon: <Filter size={14} />,
                    divider: true,
                    onClick: () => setExportAll((v) => !v),
                  },
                  {
                    key: 'cols',
                    label: `${t('staff.exportColumns')}${exportCols.length ? ` (${exportCols.length})` : ''}`,
                    hint: t('ordVac.exportColumnsHint'),
                    icon: <Columns3 size={14} />,
                    onClick: () => setColsOpen(true),
                  },
                ]}
              />
              {canCreate && (
                <Button size="sm" leftIcon={<Megaphone size={15} />} onClick={() => setCreating(true)}>
                  {t('orgRef.createVacancy')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <Segmented
        className="mb-4"
        aria-label={t('vacancies.title')}
        value={tab}
        onChange={(v) => lp.setFilters({ tab: v === 'mine' ? 'mine' : null, open: null, page: null })}
        options={[
          { value: 'list', label: t('vacancies.tabList'), icon: <BriefcaseBusiness size={14} /> },
          { value: 'mine', label: t('vacancies.tabMine'), icon: <Inbox size={14} /> },
        ]}
      />
      {tab === 'list' ? <VacancyList lp={lp} /> : <MyApplications />}
      <ExportColumnsModal
        open={colsOpen}
        onClose={() => setColsOpen(false)}
        selected={exportCols}
        onApply={setExportCols}
        url="staff-positions/vacancies/export-columns"
      />
      {canCreate && (
        <StaffPositionModal
          open={creating}
          onClose={() => setCreating(false)}
          row={null}
          vacancyMode
          allowedDepartmentIds={headDepartmentIds(user)}
        />
      )}
    </PageContainer>
  )
}

type ListParams = ReturnType<typeof useListParams>

function VacancyList({ lp }: { lp: ListParams }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { filters: f, page, setPage, size, setSize, setFilter, setFilters } = lp

  const { key: sortKey, dir: sortDir } = sortOf(f)
  const badRange = isInvalidRange(f.from, f.to)
  const query = listQuery(f)
  const list = useVacancies(query, sortKey, sortDir)
  const share = useShare()
  const all = useMemo(() => sortRows(list.data ?? [], sortKey, sortDir), [list.data, sortKey, sortDir])
  const pages = Math.max(1, Math.ceil(all.length / size))
  const pageRows = all.slice((page - 1) * size, page * size)
  const filterCount = FILTER_KEYS.filter((k) => f[k]).length

  // Kartochka: `?open=<id>` (havola) — qator ro'yxatdan olinadi.
  const openId = Number(f.open) || null
  const selected = openId ? all.find((r) => r.id === openId) ?? null : null
  const [applying, setApplying] = useState(false)
  const openRow = (row: Vacancy, apply: boolean) => {
    setApplying(apply)
    // `page` explicitly — any other param change sends the list back to page 1.
    setFilters({ open: String(row.id), page: page > 1 ? String(page) : null })
  }
  const close = () => {
    setApplying(false)
    setFilters({ open: null, page: page > 1 ? String(page) : null })
  }

  const columns: Column<Vacancy>[] = [
    {
      key: 'n',
      header: '#',
      headerClassName: 'w-12',
      className: 'tabular-nums text-fg-subtle',
      skeleton: 'w-5',
      cell: (_r, i) => (page - 1) * size + i + 1,
    },
    {
      key: 'organization',
      header: t('vacancies.colOrg'),
      skeleton: 'w-40',
      sortValue: (r) => sortValue(r, 'organization'),
      cell: (r) => <span className="text-fg-muted">{r.organization?.name || '—'}</span>,
    },
    {
      key: 'department',
      header: t('vacancies.colDept'),
      skeleton: 'w-32',
      sortValue: (r) => sortValue(r, 'department'),
      cell: (r) => <span className="text-fg-muted">{ln(r.department) || '—'}</span>,
    },
    {
      key: 'job_position',
      header: t('vacancies.colJob'),
      skeleton: 'w-36',
      sortValue: (r) => sortValue(r, 'job_position'),
      cell: (r) => <span className="font-semibold text-fg">{ln(r.job_position) || '—'}</span>,
    },
    {
      key: 'requirements',
      header: t('vacancies.colReq'),
      skeleton: 'w-48',
      sortValue: (r) => sortValue(r, 'requirements'),
      cell: (r) => <span className="line-clamp-2 max-w-[18rem] text-fg-muted">{r.requirements || '—'}</span>,
    },
    {
      key: 'vacant_count',
      header: t('vacancies.colVacant'),
      headerClassName: 'whitespace-nowrap',
      skeleton: 'w-8',
      className: 'tabular-nums',
      sortValue: (r) => sortValue(r, 'vacant_count'),
      cell: (r) => <span className="font-semibold text-success">{fmtCount(r.vacant_count)}</span>,
    },
    {
      key: 'available_from',
      header: t('vacancies.colDate'),
      headerClassName: 'whitespace-nowrap',
      skeleton: 'w-20',
      className: 'tabular-nums text-fg-muted',
      sortValue: (r) => sortValue(r, 'available_from'),
      cell: (r) => fmtDate(r.available_from),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-44',
      className: 'pr-4 text-right whitespace-nowrap',
      skeleton: 'w-24',
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
        <IconButton
          size="sm"
          label={t('ordVac.share')}
          onClick={(e) => {
            e.stopPropagation()
            void share(r)
          }}
        >
          <Share2 size={15} />
        </IconButton>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            openRow(r, true)
          }}
        >
          {t('vacancies.apply')}
        </Button>
        </span>
      ),
    },
  ]

  const caption = (text: string) => (
    <span aria-hidden className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
      {text}
    </span>
  )

  return (
    <>
      {/* Har bir ustun uchun filtr — ustunlar tartibida (TZ 2226). */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_8rem_minmax(0,1.6fr)]">
          {(
            [
              ['org', 'vacancies.colOrg'],
              ['dept', 'vacancies.colDept'],
              ['job', 'vacancies.colJob'],
              ['req', 'vacancies.colReq'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="min-w-0">
              {caption(t(label))}
              <SearchInput
                value={f[key]}
                onChange={(v) => setFilter(key, v)}
                delay={350}
                placeholder={t('vacancies.filterCol', { col: t(label) })}
              />
            </div>
          ))}
          <div className="min-w-0">
            {caption(t('vacancies.colVacant'))}
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={f.min}
              onChange={(e) => setFilter('min', e.target.value)}
              placeholder={t('vacancies.atLeast')}
              aria-label={t('vacancies.filterMin', { col: t('vacancies.colVacant') })}
            />
          </div>
          <div className="min-w-0">
            {caption(t('vacancies.colDate'))}
            <div className="grid grid-cols-2 gap-2">
              <DateInput
                value={f.from}
                onChange={(v) => setFilter('from', v)}
                invalid={badRange}
                aria-label={t('vacancies.filterFrom', { col: t('vacancies.colDate') })}
              />
              <DateInput
                value={f.to}
                onChange={(v) => setFilter('to', v)}
                invalid={badRange}
                aria-label={t('vacancies.filterTo', { col: t('vacancies.colDate') })}
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-fg-muted">
          <span>
            {badRange ? (
              <span className="text-danger">{t('vacancies.badRange')}</span>
            ) : (
              t('vacancies.hint')
            )}
          </span>
          <span className="flex items-center gap-2">
            {!isGuest(user) && (
              <Select
                className="w-44"
                aria-label={t('vacancies.status')}
                value={f.status === 'paused' || f.status === 'closed' ? f.status : ''}
                onChange={(e) => setFilter('status', e.target.value)}
                options={[
                  { value: '', label: t('staff.vacOpen') },
                  { value: 'paused', label: t('ordVac.vacPaused') },
                  { value: 'closed', label: t('staff.vacClosed') },
                ]}
              />
            )}
            <FilterReset
              count={filterCount}
              onReset={() => setFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
            />
          </span>
        </div>
      </Card>

      <Card className={cn('flex min-h-0 flex-col overflow-hidden p-0', list.isFetching && !list.isLoading && 'opacity-80')}>
        <DataTable
          rows={pageRows}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(r) => openRow(r, false)}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={(s: SortState) => setFilters({ sort: s.key === 'available_from' ? null : s.key, order: s.dir === 'asc' ? null : 'desc' })}
          // TZ V3 · 1327 «Вакансии не найдены» — o'z matni (umumiy «natija yo'q» emas).
          emptyTitle={filterCount ? t('vacancies.emptyFiltered') : t('vacancies.empty')}
          emptyAction={
            <FilterReset count={filterCount} onReset={() => setFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} />
          }
          skeletonRows={6}
          minWidth={1040}
        />
        {all.length > 0 && (
          <Pagination page={Math.min(page, pages)} size={size} total={all.length} pages={pages} onPage={setPage} onSize={setSize} />
        )}
      </Card>

      <VacancyDrawer
        open={!!openId}
        loading={list.isLoading}
        vacancy={selected}
        applying={applying}
        setApplying={setApplying}
        onClose={close}
        user={user}
      />
    </>
  )
}

const EMPLOYMENT_KEYS = {
  full_time: 'vacancies.empFull',
  part_time: 'vacancies.empPart',
  contract: 'vacancies.empContract',
  temporary: 'vacancies.empTemporary',
} as const


function Fact({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children == null || children === '' || children === false
  return (
    <div className="border-b border-line/60 py-2.5 last:border-b-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-[13.5px] text-fg">{empty ? '—' : children}</dd>
    </div>
  )
}

function VacancyDrawer({
  open,
  loading,
  vacancy: v,
  applying,
  setApplying,
  onClose,
  user,
}: {
  open: boolean
  loading: boolean
  vacancy: Vacancy | null
  applying: boolean
  setApplying: (v: boolean) => void
  onClose: () => void
  user: User | null
}) {
  const { t, i18n } = useTranslation()
  const share = useShare()
  const navigate = useNavigate()
  const edu = useDictionaryOptions(v?.education_level_code ? 'education_levels' : null)
  const emp = v?.employment_type ? EMPLOYMENT_KEYS[v.employment_type as keyof typeof EMPLOYMENT_KEYS] : undefined
  // Maosh oralig'i: «7 000 000 – 9 000 000», «… dan», «… gacha».
  const money = (x: number) => Number(x).toLocaleString('ru-RU')
  const salary = !v
    ? null
    : v.salary_from != null && v.salary_to != null
      ? `${money(v.salary_from)} – ${money(v.salary_to)}`
      : v.salary_from != null
        ? t('vacancies.salaryFrom', { n: money(v.salary_from) })
        : v.salary_to != null
          ? t('vacancies.salaryTo', { n: money(v.salary_to) })
          : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title={ln(v?.job_position) || t('vacancies.vacancy')}
      description={v ? [ln(v.department), v.organization?.name].filter(Boolean).join(' · ') : undefined}
    >
      {!v ? (
        loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <EmptyState icon={<BriefcaseBusiness size={22} />} title={t('vacancies.notFound')} description={t('vacancies.notFoundHint')} />
        )
      ) : (
        <>
          <dl>
            <Fact label={t('vacancies.annStatus')}>
              <Badge tone={v.status === 'closed' ? 'neutral' : v.status === 'paused' ? 'warning' : 'success'} dot>
                {v.status === 'closed' ? t('vacancies.statusClosed') : v.status === 'paused' ? t('ordVac.vacPaused') : t('vacancies.statusOpen')}
              </Badge>
            </Fact>
            <Fact label={t('vacancies.colOrg')}>{v.organization?.name}</Fact>
            <Fact label={t('vacancies.colDept')}>{ln(v.department)}</Fact>
            <Fact label={t('vacancies.colVacant')}>{v.vacant_count != null ? fmtCount(v.vacant_count) : null}</Fact>
            <Fact label={t('vacancies.colReq')}>{v.requirements}</Fact>
            <Fact label={t('vacancies.experience')}>{v.experience_years != null ? String(v.experience_years) : null}</Fact>
            <Fact label={t('vacancies.skills')}>{v.required_skills}</Fact>
            <Fact label={t('vacancies.education')}>
              {v.education_level_code ? entryLabel(edu.options, v.education_level_code, i18n.language) : null}
            </Fact>
            <Fact label={t('vacancies.languages')}>
              {v.required_languages?.length ? <RequiredLanguagesChips value={v.required_languages} /> : null}
            </Fact>
            <Fact label={t('vacancies.salary')}>{salary}</Fact>
            <Fact label={t('vacancies.schedule')}>{v.schedule}</Fact>
            <Fact label={t('vacancies.employment')}>{emp ? t(emp) : v.employment_type}</Fact>
            <Fact label={t('vacancies.colDate')}>{v.available_from ? fmtDate(v.available_from) : null}</Fact>
            <Fact label={t('vacancies.deadline')}>{v.application_deadline ? fmtDate(v.application_deadline) : null}</Fact>
            <Fact label={t('vacancies.contact')}>
              {v.contact_person || v.contact_phone || v.contact_email ? (
                <span className="flex flex-col gap-0.5">
                  {v.contact_person && <span>{v.contact_person}</span>}
                  {v.contact_phone && (
                    <a className="text-brand hover:underline" href={`tel:${v.contact_phone.replace(/[^+\d]/g, '')}`}>
                      {v.contact_phone}
                    </a>
                  )}
                  {v.contact_email && (
                    <a className="text-brand hover:underline" href={`mailto:${v.contact_email}`}>
                      {v.contact_email}
                    </a>
                  )}
                </span>
              ) : null}
            </Fact>
          </dl>

          {applying ? (
            <ApplyForm key={v.id} vacancy={v} user={user} onDone={onClose} onCancel={() => setApplying(false)} />
          ) : (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:flex-1" leftIcon={<CalendarClock size={16} />} onClick={() => setApplying(true)}>
                {t('vacancies.applyLong')}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" leftIcon={<Share2 size={16} />} onClick={() => void share(v)}>
                {t('ordVac.share')}
              </Button>
              {canManageStaff(user) && (
                // TZ V2 «Редактирование вакансии» from the «Вакансии» section.
                <Button variant="outline" className="w-full sm:w-auto" leftIcon={<Pencil size={16} />} onClick={() => navigate(`/staffing?open=${v.id}`)}>
                  {t('common.edit')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function ApplyForm({
  vacancy,
  user,
  onDone,
  onCancel,
}: {
  vacancy: Vacancy
  user: User | null
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const apply = useApplyVacancy()
  const [form, setForm] = useState(() => ({
    full_name: displayName(user),
    phone: user?.employee?.phone_number || '',
    email: user?.email || '',
    about: '',
    preferred_date: '',
  }))
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  useEffect(() => setError(''), [form])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) return setError(t('vacancies.needName'))
    if (!form.phone.trim() && !form.email.trim()) return setError(t('vacancies.needContact'))
    try {
      await apply.mutateAsync({
        id: vacancy.id,
        body: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          about: form.about.trim() || null,
          preferred_date: form.preferred_date || null,
        },
      })
      toast.ok(t('vacancies.sent'))
      onDone()
    } catch (err) {
      setError(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-4" noValidate>
      <h3 className="text-[14px] font-bold text-fg">{t('vacancies.applyLong')}</h3>
      <Field label={t('vacancies.fullName')} required>
        <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" maxLength={255} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('vacancies.phone')}>
          <Input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998901234567"
          />
        </Field>
        <Field label={t('vacancies.email')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </Field>
      </div>
      <Field label={t('vacancies.preferredDate')}>
        <DateInput value={form.preferred_date} onChange={(v) => set('preferred_date', v)} min={todayIso()} />
      </Field>
      <Field label={t('vacancies.about')}>
        <Textarea
          rows={4}
          value={form.about}
          onChange={(e) => set('about', e.target.value)}
          placeholder={t('vacancies.aboutPh')}
        />
      </Field>
      <FormError>{error}</FormError>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={apply.isPending} leftIcon={<Send size={15} />}>
          {t('vacancies.send')}
        </Button>
      </div>
    </form>
  )
}

const APP_TONE: Record<string, BadgeTone> = {
  new: 'neutral',
  invited: 'warning',
  interviewed: 'info',
  hired: 'success',
  rejected: 'danger',
}
const APP_STATUS_KEYS = {
  new: 'vacancies.st_new',
  invited: 'vacancies.st_invited',
  interviewed: 'vacancies.st_interviewed',
  hired: 'vacancies.st_hired',
  rejected: 'vacancies.st_rejected',
} as const

function MyApplications() {
  const { t } = useTranslation()
  const mine = useMyApplications()
  const rows = mine.data ?? []

  const columns: Column<VacancyApplication>[] = [
    {
      key: 'created',
      header: t('vacancies.sentAt'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-28',
      cell: (a) => fmtDateTime(a.created_at),
    },
    {
      key: 'vacancy',
      header: t('vacancies.vacancy'),
      skeleton: 'w-56',
      cell: (a) => (
        <div className="min-w-0">
          <p className="font-semibold text-fg">
            {lt(a.job_position_name) || a.vacancy_title || t('vacancies.staffUnit', { id: a.staff_position_id })}
          </p>
          {(a.department_name || a.organization_name) && (
            <p className="text-[12px] text-fg-muted">{[lt(a.department_name), a.organization_name].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('vacancies.status'),
      skeleton: 'w-24',
      cell: (a) => {
        const key = APP_STATUS_KEYS[a.status as keyof typeof APP_STATUS_KEYS]
        return (
          <Badge tone={APP_TONE[a.status] ?? 'neutral'} dot>
            {key ? t(key) : a.status_label || a.status}
          </Badge>
        )
      },
    },
    {
      key: 'interview',
      header: t('vacancies.interviewAt'),
      className: 'tabular-nums text-fg-muted',
      skeleton: 'w-28',
      cell: (a) =>
        a.interview_at
          ? fmtDateTime(a.interview_at)
          : a.preferred_date
            ? `${fmtDate(a.preferred_date)} (${t('vacancies.requested')})`
            : '—',
    },
    {
      key: 'note',
      header: t('vacancies.note'),
      skeleton: 'w-40',
      cell: (a) => <span className="whitespace-pre-line text-fg-muted">{a.review_note || '—'}</span>,
    },
  ]

  if (mine.error) {
    return (
      <Card className="p-6">
        <LoadError error={mine.error} onRetry={() => mine.refetch()} />
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden p-0">
      <DataTable
        rows={rows}
        columns={columns}
        loading={mine.isLoading}
        emptyTitle={t('vacancies.mineEmpty')}
        emptyDescription={t('vacancies.mineEmptyHint')}
        skeletonRows={4}
        minWidth={820}
      />
    </Card>
  )
}
