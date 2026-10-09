import { useEffect, useMemo, useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  FileSignature,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  ScrollText,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm, type ConfirmOptions } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { useBranchStore } from '@/store/branchStore'
import { ScopeTabs } from '@/features/documents/ScopeTabs'
import {
  letterScopeParams,
  letterScopesFor,
  resolveScope,
  type LetterScope,
} from '@/features/documents/scopes'
import { Segmented } from '@/components/ui/Segmented'
import { CreateLetterModal } from '@/features/letters/CreateLetterModal'
import { BlankSettingsButton } from '@/features/tabel/BlankSettingsButton'
import { useBranchLeaders } from '@/features/tabel/useTabel'
import { LetterStampBar } from '@/features/letters/LetterStampBar'
import { LetterReportPanel } from '@/features/letters/LetterReportPanel'
import { TripMovementsPanel } from '@/features/letters/TripMovementsPanel'
import { TripActionsBar } from '@/features/letters/TripActionsBar'
import { TripRegisterModal } from '@/features/letters/TripRegisterModal'
import { TripAttendancePanel } from '@/features/letters/TripAttendancePanel'
import { downloadFile } from '@/lib/download'
import { errorMessage } from '@/api/errorMessage'
import { LETTERS_LIST } from '@/api/endpoints'
import { FlowSteps, type FlowStep } from '@/components/data/FlowSteps'
import { cn } from '@/lib/cn'
import { formatAppDate } from '@/lib/format'
import {
  useLetter,
  useLetterMutations,
  useLetters,
  LETTER_STATUS_FILTERS,
  allAgreementsAgreed,
  letterStatusKey,
  normalizeLetterType,
  type LetterAgreer,
  type LetterListItem,
  type LetterStatusKey,
  useMySelfFinishTrips,
} from '@/features/letters/useLetters'
import type { Translation } from '@/i18n/uz'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'

type LKey = keyof Translation['letters']
const STATUS: Record<LetterStatusKey, { label: LKey; tone: BadgeTone; dot: string }> = {
  draft: { label: 'stDraft', tone: 'neutral', dot: '--fg-subtle' },
  agreeing: { label: 'stAgreeing', tone: 'warning', dot: '--warning' },
  signed: { label: 'stSigned', tone: 'info', dot: '--info' },
  registered: { label: 'stRegistered', tone: 'success', dot: '--success' },
  chancellery: { label: 'stChancellery', tone: 'info', dot: '--info' },
  pendingReg: { label: 'stPendingReg', tone: 'warning', dot: '--warning' },
  management: { label: 'stManagement', tone: 'info', dot: '--info' },
  report: { label: 'stReport', tone: 'info', dot: '--info' },
  rejected: { label: 'stRejected', tone: 'danger', dot: '--danger' },
  returned: { label: 'stReturned', tone: 'danger', dot: '--danger' },
}
/* Backend letter_type values. `bildirgi`/`ariza` are display labels, never
 * stored values — older rows also carry the legacy spellings. */
const TYPE_LABEL: Record<string, LKey> = {
  explanatory: 'typeBildirgi',
  explanotary: 'typeBildirgi',
  bildirgi: 'typeBildirgi',
  notification: 'typeBildirgi',
  application: 'typeAriza',
  ariza: 'typeAriza',
  business_trip: 'typeTrip',
  javob_xati: 'typeReply',
}

const LIST_KEYS = ['type', 'doc', 'scope', 'from', 'to', 'status', 'addressee'] as const

const TABS = [
  { value: '', label: 'tabAll' as LKey },
  { value: 'explanatory', label: 'tabBildirgi' as LKey },
  { value: 'application', label: 'tabAriza' as LKey },
  { value: 'business_trip', label: 'tabTrip' as LKey },
]

/**
 * Which attachment types OnlyOffice can actually render. The server answers 415
 * for the rest (pictures, archives), so those must not be routed into the
 * editor at all — the client falls back to the stored file.
 */
const OO_VIEWABLE = new Set([
  'docx', 'doc', 'odt', 'rtf', 'txt', 'pdf',
  'xlsx', 'xls', 'csv', 'ods', 'pptx', 'ppt', 'odp',
])

function attachmentIsViewable(filename?: string | null): boolean {
  const ext = (filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  return OO_VIEWABLE.has(ext)
}

export function LettersPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } =
    useListParams(LIST_KEYS)

  // WHOSE letters — the role decides which slices exist and where the page
  // opens. A plain employee has no "Barchasi": the branch's correspondence is
  // not theirs to browse.
  const scopes = useMemo(() => letterScopesFor(user, branchId), [user, branchId])
  // «Rahbariyat»: filter by the leader a document is ADDRESSED to. Only the
  // director and their deputies can be an addressee, so the picker offers
  // exactly those — the same two roles v1 shows.
  const { leaders } = useBranchLeaders(branchId, true)
  const addresseeOptions = useMemo(
    () =>
      leaders
        .filter((l) => l.employee && ['director', 'deputy'].includes(l.leadership_role ?? ''))
        .map((l) => ({
          value: String(l.employee?.id),
          label: l.employee?.legal_name ?? '—',
          subLabel: l.employee?.job_position?.name,
        })),
    [leaders],
  )
  const scope = resolveScope<LetterScope>(filters.scope || null, scopes)
  const scopeParams = useMemo(
    () => letterScopeParams(scope, { employeeId: user?.employee?.id, branchId }),
    [scope, user, branchId],
  )
  // Some scopes ARE a status (the registration queue, the approval queue) —
  // a second status filter would only fight them, so it is hidden there.
  const scopeHasStatus = 'status' in scopeParams

  // Dates and status live in the URL; the server does the narrowing. An
  // unknown status value from a hand-edited URL is dropped, never sent — the
  // API answers 422 for it.
  const statusKey = (filters.status in LETTER_STATUS_FILTERS ? filters.status : '') as LetterStatusKey | ''
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  const { letters, total, pages, loading, fetching } = useLetters(filters.type, search, scopeParams, {
    dateFrom: filters.from,
    dateTo: filters.to,
    status: !scopeHasStatus && statusKey ? LETTER_STATUS_FILTERS[statusKey] : undefined,
    addresseeId: filters.addressee || undefined,
    page,
    size,
    enabled: !rangeInvalid,
  })
  // Faqat XODIMNING o'z safarlari uchun; ro'yxatga belgi qo'yadi.
  const { selfFinish } = useMySelfFinishTrips()
  const selectedId = filters.doc ? Number(filters.doc) : null

  // The type tabs, search, dates and status are the filters the "clear" button
  // owns. Scope and the open document are navigation, not filters.
  const filterCount =
    [filters.from, filters.to, statusKey, filters.type, filters.addressee, search].filter(Boolean).length
  const resetFilters = () =>
    setFilters({ from: null, to: null, status: null, type: null, addressee: null, q: null, doc: null })
  // Search stays out (used on every visit); dates, status and addressee fold
  // behind «Filtrlar», as on the orders page — five stacked controls ate the
  // top of this 360px column before a single letter was visible.
  const foldedCount = [filters.from, filters.to, statusKey, filters.addressee].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)
  // Phone: the detail opens full-screen over the list instead of a second
  // full-height card stacked under it.
  const wide = useMediaQuery('(min-width: 1024px)')

  // Auto-select the first letter on load.
  // Desktop only: on a phone the list IS the first screen, the detail opens on tap.
  useEffect(() => {
    if (wide && !filters.doc && letters[0]) setFilter('doc', String(letters[0].id))
  }, [wide, filters.doc, letters, setFilter])

  const [creating, setCreating] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)

  const statusOptions = useMemo(
    () =>
      (Object.keys(LETTER_STATUS_FILTERS) as LetterStatusKey[]).map((k) => ({
        value: k,
        label: t(`letters.${STATUS[k].label}`),
      })),
    [t],
  )

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title={t('letters.title')}
        subtitle={t('letters.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Blank sozlamasi yaratish tugmasi YONIDA — devonxona va kadr
                hujjatni aynan shu yerda yasaydi. */}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ScrollText size={15} />}
              onClick={() => setRegisterOpen(true)}
            >
              {t('letters.tripRegister')}
            </Button>
            <BlankSettingsButton />
            <Button data-tour="letters-create" leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
              {t('letters.create')}
            </Button>
          </div>
        }
      />

      {/* Whose letters (role-scoped), then which kind */}
      {/* ScopeTabs props'ni tarqatmaydi, shu bois tur langari o'ramda. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <span data-tour="letters-scopes" className="contents">
        <ScopeTabs
          scopes={scopes}
          value={scope}
          onChange={(next) => setFilters({ scope: next, doc: null })}
          className="w-fit"
        />
      </span>

      {/* Tabs. The count chip sits on the ACTIVE tab only: the list is paged on
          the server now, so per-type totals for the other tabs would need a
          request each — the chip shows `total` from the envelope instead. */}
      <div className="scroll-thin flex max-w-full items-center gap-1.5 overflow-x-auto sm:flex-wrap">
        {TABS.map((tab) => {
          const active = (filters.type || '') === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilters({ type: tab.value, doc: null })}
              className={cn(
                // EDO tabs: plain label + a count chip, with the active tab
                // underlined in the accent rather than filled.
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] px-4 py-2 text-[14px]',
                'transition-[background-color,color,box-shadow,transform] duration-150',
                active
                  ? 'accent-tile font-semibold'
                  : 'font-medium text-fg-muted hover:-translate-y-0.5 hover:bg-surface-2 hover:text-fg',
              )}
            >
              {t(`letters.${tab.label}`)}
              {active && !rangeInvalid && (
                <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-white/25 px-1.5 text-[11px] font-bold tabular-nums text-white">
                  {total}
                </span>
              )}
            </button>
          )
        })}
      </div>
      </div>

      {/* Master-detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* List */}
        <Card className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden">
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('letters.searchPlaceholder')}
                delay={300}
                className="min-w-0 flex-1"
              />
              <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
            </div>
            {filtersOpen && (<>
            <div className="grid grid-cols-2 gap-2">
              <DateInput
                value={filters.from}
                onChange={(v) => setFilter('from', v)}
                invalid={rangeInvalid}
                aria-label={t('letters.dateFrom')}
              />
              <DateInput
                value={filters.to}
                onChange={(v) => setFilter('to', v)}
                invalid={rangeInvalid}
                aria-label={t('letters.dateTo')}
              />
            </div>
            {rangeInvalid && (
              <p role="alert" className="text-xs text-danger">{t('list.invalidRange')}</p>
            )}
            {!scopeHasStatus && (
              <Select
                value={statusKey}
                onChange={(e) => setFilter('status', e.target.value)}
                options={statusOptions}
                placeholder={t('letters.allStatuses')}
                aria-label={t('letters.allStatuses')}
              />
            )}
            {addresseeOptions.length > 0 && (
              <Combobox
                value={filters.addressee}
                onChange={(v) => setFilter('addressee', v)}
                options={addresseeOptions}
                placeholder={t('letters.allAddressees')}
              />
            )}
            <FilterReset count={filterCount} onReset={resetFilters} />
            </>)}
            {!filtersOpen && filterCount > 0 && <FilterReset count={filterCount} onReset={resetFilters} />}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : letters.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title={filterCount > 0 ? t('list.noResultsFiltered') : t('letters.empty')}
                description={filterCount > 0 ? t('list.noResultsFilteredHint') : undefined}
              />
            ) : (
              <ul>
                {letters.map((l) => (
                  <LetterRow
                    key={l.id}
                    letter={l}
                    active={selectedId === l.id}
                    canSelfFinish={selfFinish.has(l.id)}
                    onClick={() => setFilter('doc', String(l.id))}
                  />
                ))}
              </ul>
            )}
          </div>
          {/* The 360px column cannot hold the range text and the page buttons
              on one line — stack the two rows of the shared control. */}
          <div className="[&>div]:!flex-col [&>div]:!items-stretch">
            <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
          </div>
        </Card>

        {/* Detail */}
        {wide && (
          <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
            {selectedId ? (
              <LetterDetail id={selectedId} onClose={() => setFilter('doc', '')} />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState icon={<FileText size={22} />} title={t('letters.selectDoc')} />
              </div>
            )}
          </Card>
        )}
      </div>
      {!wide && selectedId && (
        <Modal open onClose={() => setFilter('doc', '')} size="full" bodyFill title={t('letters.title')}>
          <div className="flex min-h-0 w-full flex-col">
            <LetterDetail id={selectedId} onClose={() => setFilter('doc', '')} />
          </div>
        </Modal>
      )}

      <CreateLetterModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setFilter('doc', id ? String(id) : '') }} />

      <TripRegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />

    </PageContainer>
  )
}

function LetterRow({ letter, active, canSelfFinish, onClick }: { letter: LetterListItem; active: boolean; canSelfFinish?: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  // v1 shows the AUTHOR (`creator_employee`) and keeps `submitter` as the
  // fallback for older rows that predate the column.
  const sender = letter.creator_employee?.legal_name || letter.submitter?.legal_name || ''
  const senderEmp = letter.creator_employee?.legal_name ? letter.creator_employee : letter.submitter
  const sk = letterStatusKey(letter.status)
  const typeKey = TYPE_LABEL[normalizeLetterType(letter.letter_type)]
  return (
    <li className="px-2.5 py-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'shape-ticket relative flex w-full items-start gap-2.5 py-2.5 pl-4 pr-3 text-left',
          'transition-[background-color,box-shadow,transform] duration-150',
          active
            ? 'bg-brand-soft shadow-sm ring-1 ring-inset ring-brand/20'
            : 'hover:translate-x-0.5 hover:bg-surface-2/70',
        )}
      >
        {/* The stub's rail carries the status colour — the row is legible
            before a single word is read. */}
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1 w-1 rounded-pill"
          style={{ backgroundColor: `rgb(var(${STATUS[sk].dot}))` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-fg">{letter.letter_number || `#${letter.id}`}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{letter.letter_date ? formatAppDate(letter.letter_date) : ''}</span>
          </div>
          <p className="truncate text-[11px] font-medium text-brand">{typeKey ? t(`letters.${typeKey}`) : letter.letter_type}</p>
          <p className="truncate text-[12px] text-fg-muted">{letter.description || '—'}</p>
          {/*
            KIMDAN va HOLAT MATNI — ikkalasi ham `LetterListItem` da keladi va
            v1 ro'yxatida ustun bo'lib turadi. v2 da holat FAQAT chap chetdagi
            rang chizig'i bilan berilardi: u `aria-hidden`, ya'ni skrinrider
            uchun holat umuman yo'q edi, ko'rgan odam esa palitrani yodlashi
            kerak edi. Muallif esa umuman ko'rinmasdi.
          */}
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-px text-[10.5px] font-semibold"
              style={{ color: `rgb(var(${STATUS[sk].dot}))`, backgroundColor: `rgb(var(${STATUS[sk].dot}) / 0.12)` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(var(${STATUS[sk].dot}))` }} />
              {t(`letters.${STATUS[sk].label}` as never)}
            </span>
            {sender && (
              <span className="flex min-w-0 items-center gap-1 text-[11px] text-fg-subtle">
                <Avatar src={senderEmp?.photo_thumb_path} fallbackSrc={senderEmp?.photo_path} name={sender} size={16} />
                <span className="truncate">{sender}</span>
              </span>
            )}
          </div>
          {/* Qatorni OCHMASDAN turib ko'rinadigan belgi: bu safarni xodim
              o'zi yakunlashi mumkin (server Face ID bo'yicha hal qiladi). */}
          {canSelfFinish && (
            <span className="mt-1 inline-flex items-center rounded-pill bg-success/[0.12] px-2 py-0.5 text-[10.5px] font-semibold text-success">
              {t('letters.canSelfFinish')}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

function LetterDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { letter, loading, failed } = useLetter(id)
  const mut = useLetterMutations()
  const confirm = useConfirm()
  const myEmployeeId = useAuthStore((s) => s.user?.employee?.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [agreeAction, setAgreeAction] = useState<'agree' | 'disagree' | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'document' | 'report' | 'movements' | 'attendance'>('document')
  const attachRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore((s) => s.user)
  // Registration (stamp / return) belongs to the chancellery; master-admin may
  // force any step, matching the backend's permission model.
  //
  // isAnyChancellery, NOT isChancellery: a BRANCH-level chancellery (assigned in
  // Tabel sozlamalari, or a department literally named "devonxona") carries no
  // multi-org role — their displayed role is still "Xodim". With the narrow
  // check they landed in the registration queue and found no way to register
  // anything, because the list used one rule and the buttons another.
  if (failed) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<FileText size={22} />}
          title={t('list.docNotFound')}
          description={t('list.docNotFoundHint')}
          action={<Button variant="secondary" size="sm" onClick={onClose}>{t('common.close')}</Button>}
        />
      </div>
    )
  }
  if (loading || !letter) {
    return <div className="space-y-4 p-5"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>
  }

  // ⚠️ AND FOR THIS LETTER'S BRANCH. `LetterService._is_chancellery_viewer`
  // binds even the global role to the person's own branches, so the wider
  // client check drew Register on another branch's letter and took a 403.
  // Computed after the null guard — the letter's own branch is the question.
  // ⚠️ `isSiteMasterAdmin`, not `isMasterAdmin`. The wider predicate also
  // matches a MINISTR, and the server's `is_master_admin` deliberately does
  // not — measured live on letter 148518: ministr → 403 `not_authorized` on
  // confirm-registration, a real master-admin → 200.
  const isRegistrar =
    roles.canActAsChancellery(user, letter.organization_branch_id) ||
    roles.isSiteMasterAdmin(user)

  // ⚠️ WAS `isRegistrar || letter.creator_employee != null` — the second term is
  // true for every letter that has an author, so the Add/Edit leg buttons were
  // drawn for everyone. Measured live on letter 141122: of ten roles only HR and
  // the master admin were allowed; the other eight took a 403 `not_authorized`.
  // The server's rule (`BusinessTripMovementService._assert_can_manage`) is
  // master-admin, or KADR of the trip's home branch or any destination branch —
  // branch-bound on purpose, or an unrelated branch's HR could write someone
  // else's legs by id. `isBranchHr` already encodes exactly that pair of checks.
  // Finalized trips are closed to everyone so the certificate cannot be rewritten.
  const tripBranchIds = [
    letter.organization_branch_id,
    ...(letter.destination_branches ?? []).map((b) => b.id),
  ].filter((b): b is number => b != null)
  const canManageMovements =
    !['report_approved', 'rejected', 'cancelled'].includes(letter.status ?? '') &&
    // ⚠️ `isSiteMasterAdmin`, NOT `isMasterAdmin` — the latter also returns true
    // for a ministr, while the server's `is_master_admin` accepts only
    // `type == "master-admin"`. Measured on letter 141122: ministr took a 403.
    (roles.isSiteMasterAdmin(user) || tripBranchIds.some((bid) => roles.isBranchHr(user, bid)))

  // Home branch ONLY — see the note on `TripMovementsPanel.canConfirmReturn`.
  const canConfirmTripReturn =
    !['report_approved', 'rejected', 'cancelled'].includes(letter.status ?? '') &&
    (roles.isSiteMasterAdmin(user) || roles.isBranchHr(user, letter.organization_branch_id))

  const sk = letterStatusKey(letter.status)
  const isDraft = sk === 'draft'
  const isAgreementLetter = ['explanatory', 'application'].includes(
    normalizeLetterType(letter.letter_type),
  )
  // Only the author drives a letter forward (backend: send_to_registry and
  // submit_agreement both check creator_employee_id / submitter_id).
  const isCreator = !!myEmployeeId && (letter.creator_employee?.id ?? letter.creator_employee_id) === myEmployeeId
  const isSubmitter = !!myEmployeeId && letter.submitter_id === myEmployeeId
  /* Edit / delete mirror the server (services/letter.py update_letter,
     delete_letter). A bildirgi/ariza stays editable by its author until it
     goes to the chancellery — while agreeing, after an agreer said no, after
     the chancellery returned it. The buttons used to exist only on a draft, so
     an author whose letter was rejected or returned was stuck (09-25 sweep).
     Deleting stops once anyone has agreed or it is registered. */
  const rawStatus = letter.status ?? 'draft'
  const isAuthor = isCreator || isSubmitter
  const canEditLetter = roles.isSiteMasterAdmin(user)
    ? isDraft || isAgreementLetter
    : isAgreementLetter
      ? isAuthor && ['draft', 'pending', 'pending_agreement', 'returned', 'signed'].includes(rawStatus)
      : isDraft && isCreator
  const anyAgreed = (letter.assigned_signers ?? []).some((a) => a.signer_type === 'agreement' && a.agreed === true)
  const canDeleteLetter = roles.isSiteMasterAdmin(user)
    ? isDraft || (isAgreementLetter && rawStatus !== 'registered')
    : isAgreementLetter
      ? isAuthor && rawStatus !== 'registered' && !anyAgreed
      : isAuthor && ['draft', 'pending', 'rejected'].includes(rawStatus)
  // Every agreer has agreed → the author may send it on for registration.
  // Without this button the flow dead-ended right here.
  const canSendToRegistry =
    isAgreementLetter &&
    // Same reason as `isRegistrar`: the server wants the creator/submitter or a
    // REAL master-admin (`send_to_registry`). Measured: ministr → 403.
    (isCreator || roles.isSiteMasterAdmin(user)) &&
    allAgreementsAgreed(letter) &&
    ['draft', 'pending', 'signed', 'returned'].includes((letter.status ?? '').toLowerCase())
  // Chancellery closes the loop: pending_registration → registered.
  const canConfirmRegistration = isRegistrar && sk === 'pendingReg'
  const myAgreer = (letter.assigned_signers ?? []).find((a) => a.employee_id === myEmployeeId && a.signer_type === 'agreement')
  const canAgree = myAgreer && myAgreer.agreed == null && sk === 'agreeing'
  // Signing a BUSINESS TRIP. The gate is the server's own flag, not a rule
  // re-derived here: only the "main" signer signs a trip (management does not —
  // the chancellery registering it counts as their approval), and the window is
  // the `pending` stage. See LetterAvailableActions.
  const acts = letter.available_actions ?? {}
  const canSign = !!acts.can_sign
  const canRejectLetter = !!acts.can_reject
  const typeKey = TYPE_LABEL[normalizeLetterType(letter.letter_type)]
  const isTrip = normalizeLetterType(letter.letter_type) === 'business_trip'
  /* The generated letter and the UPLOADED attachment are two different files.
     Folding them into one flag made the card open the generated document
     whenever an attachment existed — and offer "create document" never, so a
     letter that only had a scan could not get its own document at all. */
  const hasDocument = !!letter.generated_document_path
  const hasAttachment = !!letter.attachment_filename

  /** Editor for what OnlyOffice can render, the raw file for everything else. */
  const openAttachment = () => {
    if (attachmentIsViewable(letter.attachment_filename)) {
      navigate(`/hujjatlar/edit/letter-attachment-${letter.id}`)
    } else if (letter.attachment_path) {
      window.open(letter.attachment_path, '_blank', 'noopener,noreferrer')
    }
  }

  /** Author → each agreer → registration, as chevron steps. Built here so it
   *  can use the strongly-typed t() without fighting its generic signature. */
  const flow: FlowStep[] = [
    {
      key: 'author',
      label: t('letters.stepAuthor'),
      hint: letter.creator_employee?.legal_name ?? undefined,
      state: 'done',
    },
    ...(letter.assigned_signers ?? [])
      .filter((a) => a.signer_type === 'agreement')
      .map((a): FlowStep => ({
        key: `a-${a.id}`,
        label: a.employee?.legal_name ?? '—',
        hint:
          a.agreed == null
            ? t('letters.waiting')
            : a.agreed
              ? t('letters.agreed')
              : t('letters.disagreed'),
        state: a.agreed == null ? (sk === 'agreeing' ? 'current' : 'pending') : a.agreed ? 'done' : 'rejected',
      })),
    {
      key: 'reg',
      label: t('letters.stepRegistered'),
      hint: letter.registered_number ?? undefined,
      state: sk === 'registered' ? 'done' : 'pending',
    },
  ]

  // The mutation cache already toasts a failure; catching here keeps the
  // success notice from showing and the rejection from going unhandled.
  const run = async (p: Promise<unknown>, msg: string) => {
    try { await p } catch { return }
    mut.invalidate(); setNotice(msg)
  }
  // One-click letter steps are asked first; the number names the letter.
  const confirmThen = async (o: ConfirmOptions, go: () => Promise<unknown>) => {
    if (await confirm({ subject: letter.letter_number ? `№${letter.letter_number}` : undefined, ...o })) await go()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Action bar */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft size={15} />} onClick={onClose} className="lg:hidden">{t('letters.back')}</Button>
        <div className="ml-auto flex items-center gap-2">
          {canEditLetter && (
            <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              {t('letters.edit')}
            </Button>
          )}
          {/* Trips: the server's `can_submit_trip` (creator ONLY — a submitter
              who is not the creator got 403). Agreement letters: draft +
              creator/submitter/site admin — the same rule `submit-agreement`
              enforces. */}
          {isDraft && (isTrip ? !!acts.can_submit_trip : isCreator || isSubmitter || roles.isSiteMasterAdmin(user)) && (
            <Button size="sm" leftIcon={<Send size={14} />} onClick={() => confirmThen({ kind: 'send', confirmLabel: t('letters.send') }, () => run(mut.submit.mutateAsync({ id: letter.id, letterType: letter.letter_type }), t('letters.sent')))}>{t('letters.send')}</Button>
          )}
          {canSendToRegistry && !isDraft && (
            <Button
              size="sm"
              leftIcon={<Send size={14} />}
              loading={mut.sendToRegistryFlow.isPending}
              onClick={() => confirmThen({ kind: 'send', confirmLabel: t('letters.sendToRegistryAction') }, () => run(mut.sendToRegistryFlow.mutateAsync(letter.id), t('letters.sentToRegistry')))}
            >
              {t('letters.sendToRegistryAction')}
            </Button>
          )}
          {canConfirmRegistration && (
            <Button
              size="sm"
              leftIcon={<Check size={14} />}
              loading={mut.confirmRegistration.isPending}
              onClick={() => confirmThen({ kind: 'approve', confirmLabel: t('letters.confirmRegistration') }, () => run(mut.confirmRegistration.mutateAsync(letter.id), t('letters.registrationConfirmed')))}
            >
              {t('letters.confirmRegistration')}
            </Button>
          )}
          {canAgree && (
            <>
              <Button size="sm" variant="secondary" leftIcon={<Check size={14} />} onClick={() => setAgreeAction('agree')}>{t('letters.agree')}</Button>
              <Button size="sm" variant="danger" leftIcon={<X size={14} />} onClick={() => setAgreeAction('disagree')}>{t('letters.disagree')}</Button>
            </>
          )}
          {canSign && (
            <Button
              size="sm"
              leftIcon={<FileSignature size={14} />}
              loading={mut.sign.isPending}
              onClick={() => confirmThen({ kind: 'sign', confirmLabel: t('letters.sign') }, () => run(mut.sign.mutateAsync(letter.id), t('letters.signed')))}
            >
              {t('letters.sign')}
            </Button>
          )}
          {canRejectLetter && (
            <Button
              size="sm"
              variant="danger"
              leftIcon={<X size={14} />}
              loading={mut.reject.isPending}
              onClick={() => setConfirmReject(true)}
            >
              {t('letters.reject')}
            </Button>
          )}
          {hasDocument && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Download size={14} />}
              loading={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadFile({
                    url: `${LETTERS_LIST}/${letter.id}/download-pdf`,
                    mime: 'application/pdf',
                    filename: `${letter.registered_number || letter.letter_number || letter.id}.pdf`,
                  })
                } catch (e) {
                  setNotice(errorMessage(e, t('letters.actionFailed')))
                } finally {
                  setDownloading(false)
                }
              }}
            >
              {t('letters.downloadPdf')}
            </Button>
          )}
          {canDeleteLetter && (
            <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} className="text-danger" onClick={() => setConfirmDelete(true)}>{t('common.delete')}</Button>
          )}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
        {notice && <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{notice}</div>}

        {/* Registration stamp + chancellery actions */}
        <LetterStampBar
          letter={letter}
          canRegister={isRegistrar}
          /* `_is_trip_hr_scoped`: HR of the trip's own branch or of a
             destination branch may fix the certificate number. */
          canEditGuvohnoma={
            isTrip &&
            (isRegistrar ||
              roles.isBranchHr(user, letter.organization_branch_id) ||
              (letter.destination_branches ?? []).some((b) => roles.isBranchHr(user, b.id)))
          }
          onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
        />

        {/* A business trip carries a report and movement legs; a bildirgi/ariza does not. */}
        {isTrip && (
          <div className="mb-5">
            <Segmented
              value={detailTab}
              onChange={(v) => setDetailTab(v)}
              options={[
                { value: 'document', label: t('letters.tabDocument') },
                { value: 'report', label: t('letters.tabReport') },
                { value: 'movements', label: t('letters.tabMovements') },
                { value: 'attendance', label: t('letters.tabAttendance') },
              ]}
            />
          </div>
        )}

        {/* The trip's own lifecycle (cancel / extend / certificate / basis
            decree) — none of it belongs to the registration flow above. */}
        {isTrip && detailTab === 'document' && (
          <TripActionsBar
            letter={letter}
            onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
          />
        )}

        {isTrip && detailTab === 'report' && (
          <LetterReportPanel
            letter={letter}
            canRegister={isRegistrar}
            onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
          />
        )}

        {isTrip && detailTab === 'movements' && (
          <TripMovementsPanel
            letterId={letter.id}
            canManage={canManageMovements}
            canConfirmReturn={canConfirmTripReturn}
            onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
          />
        )}

        {/* Proof the trip happened: the timesheet for the trip days plus every
            turnstile pass in that window, home branch and destination alike. */}
        {isTrip && detailTab === 'attendance' && <TripAttendancePanel letterId={letter.id} />}

        {isTrip && detailTab !== 'document' ? null : (
        <>
        {/* Approval chain as a directional strip — the shape says "flow",
            the table below it says "who and when". */}
        <section className="mb-6">
          <h3 className="mb-3 text-[15px] font-semibold text-fg">{t('letters.agreers')}</h3>
          <FlowSteps className="mb-4" steps={flow} />
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] font-semibold text-fg-muted">
                <tr>
                  <th className={TH}>{t('letters.colName')}</th>
                  <th className={TH}>{t('letters.colComment')}</th>
                  <th className={TH}>{t('letters.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {(letter.assigned_signers ?? []).filter((a) => a.signer_type === 'agreement').map((a) => (
                  <AgreerRow key={a.id} agreer={a} />
                ))}
                {(letter.assigned_signers ?? []).filter((a) => a.signer_type === 'agreement').length === 0 && (
                  <tr><td colSpan={3} className={TD_MESSAGE}>—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Metadata */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[15px] font-semibold text-brand">{typeKey ? t(`letters.${typeKey}`) : letter.letter_type}</span>
            <ChevronRight size={15} className="text-fg-subtle" />
            <span className="text-[15px] font-semibold text-fg">{letter.letter_number || `#${letter.id}`}</span>
            <Badge tone={STATUS[sk].tone}>{t(`letters.${STATUS[sk].label}`)}</Badge>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Meta label={t('letters.docNumber')} value={letter.letter_number || '—'} />
            <Meta label={t('letters.docDate')} value={letter.letter_date ? formatAppDate(letter.letter_date) : '—'} />
            <Meta label={t('letters.docType')} value={typeKey ? t(`letters.${typeKey}`) : (letter.letter_type ?? '—')} />
            {/* The value is the AUTHOR; the row used to be captioned «Ustun»
                (column) — the i18n key was misnamed (audit 2026-09-21). */}
            <Meta label={t('letters.stepAuthor')} value={letter.creator_employee?.legal_name || '—'} />
            {isTrip && (
              <Meta
                label={t('letters.tripPeriod')}
                value={`${letter.departure_date ? formatAppDate(letter.departure_date) : '—'} — ${
                  letter.arrival_date ? formatAppDate(letter.arrival_date) : '—'
                }`}
              />
            )}
            {isTrip && letter.actual_return_date && (
              <Meta label={t('letters.actualReturn')} value={formatAppDate(letter.actual_return_date)} />
            )}
            {isTrip && (letter.destination_branches?.length || letter.destination_regions?.length) && (
              <Meta
                label={t('letters.destination')}
                value={
                  letter.destination_branches?.length
                    ? letter.destination_branches.map((b) => b.name).filter(Boolean).join(', ')
                    : (letter.destination_regions ?? []).join(', ')
                }
                wide
              />
            )}
            <Meta label={t('letters.summary')} value={letter.description || '—'} wide />
            {/* The fleet's answer used to reach the traveller only as a
                notification — the letter itself never said which car or
                driver was given (mobile shows it; v1 did not). */}
            {isTrip && letter.vehicle_request && !['cancelled'].includes(letter.vehicle_request.status ?? '') && (
              <Meta
                label={t('letters.vehicleBlock')}
                value={[
                  t(`letters.vehicleStatus_${letter.vehicle_request.status ?? 'pending'}` as never, { defaultValue: letter.vehicle_request.status ?? '' }) as string,
                  letter.vehicle_request.vehicle
                    ? [letter.vehicle_request.vehicle.model, letter.vehicle_request.vehicle.plate_number].filter(Boolean).join(' ')
                    : null,
                  letter.vehicle_request.assigned_driver?.legal_name
                    ? `${t('letters.vehicleDriver')}: ${letter.vehicle_request.assigned_driver.legal_name}`
                    : null,
                  letter.vehicle_request.response_text || letter.vehicle_request.approval_note || null,
                ].filter(Boolean).join(' · ')}
                wide
              />
            )}
          </dl>
          {letter.document_out_of_sync && (
            <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
              {t('letters.outOfSync')}
            </p>
          )}
          {letter.return_reason && (
            <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
              {t('letters.returnReason')}: {letter.return_reason}
            </p>
          )}
          {sk === 'rejected' && letter.rejection_reason && (
            <p className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger">{letter.rejection_reason}</p>
          )}
        </section>

        {/* Document — always offer OnlyOffice; generate it when missing */}
        <section className="mb-6">
          {/* Clicking the file opens it; edit or read-only is the SERVER's call
              (see the order screen for the same reasoning). */}
          <Card
            className={cn(
              'flex flex-wrap items-center gap-4 p-4',
              hasDocument && 'cursor-pointer transition-colors hover:border-brand/50 hover:bg-brand-soft/30',
            )}
            role={hasDocument ? 'button' : undefined}
            tabIndex={hasDocument ? 0 : undefined}
            aria-label={hasDocument ? t('letters.openFile') : undefined}
            onClick={hasDocument ? () => navigate(`/hujjatlar/edit/letter-${letter.id}`) : undefined}
            onKeyDown={
              hasDocument
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/hujjatlar/edit/letter-${letter.id}`)
                    }
                  }
                : undefined
            }
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><FileText size={22} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">
                {hasDocument ? t('letters.openFile') : t('letters.documentMissing')}
              </p>
              <p className="text-[11px] text-fg-subtle">
                {hasDocument
                  ? t('letters.openFileHint')
                  : letter.letter_date
                    ? formatAppDate(letter.letter_date)
                    : ''}
              </p>
            </div>
            {/* Server `assert_can_modify` — creator/submitter, site admin, trip
                home-branch HR. Was ungated: chancellery, deputies and signers
                saw it and got 403 (2026-09-11). */}
            {hasDocument || !acts.can_modify ? null : (
              <Button
                size="sm"
                leftIcon={<FileText size={14} />}
                onClick={async () => {
                  if (!(await confirm({ kind: 'action', confirmLabel: t('letters.createDocument') }))) return
                  try {
                    await mut.generateDocument.mutateAsync(letter.id)
                    mut.invalidate()
                    navigate(`/hujjatlar/edit/letter-${letter.id}`)
                  } catch {
                    setNotice(t('letters.actionFailed'))
                  }
                }}
              >
                {t('letters.createDocument')}
              </Button>
            )}
          </Card>

          {/* THE UPLOADED ATTACHMENT — "Ilova yoki asos". Its own row, its own
              config route. OnlyOffice cannot open a picture or an archive and
              answers 415 for those, so anything outside the viewable list goes
              straight to the stored file instead of into a dead editor. */}
          {hasAttachment && (
            <Card
              className={cn(
                'mt-3 flex flex-wrap items-center gap-4 p-4',
                (letter.attachment_path || attachmentIsViewable(letter.attachment_filename)) &&
                  'cursor-pointer transition-colors hover:border-brand/50 hover:bg-brand-soft/30',
              )}
              role="button"
              tabIndex={0}
              aria-label={t('letters.openAttachment')}
              onClick={openAttachment}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openAttachment()
                }
              }}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                <Paperclip size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg">{letter.attachment_filename}</p>
                <p className="text-[11px] text-fg-subtle">{t('letters.openAttachmentHint')}</p>
              </div>
            </Card>
          )}

          {/* GUVOHNOMA — the trip's certificate. It is generated when the trip
              is sent and is a SEPARATE file from the letter itself, so it needs
              its own way in; v2 stored the path but offered no way to open it. */}
          {isTrip && letter.guvohnoma_path && (
            <Card
              className="mt-3 flex flex-wrap items-center gap-4 p-4 cursor-pointer transition-colors hover:border-brand/50 hover:bg-brand-soft/30"
              role="button"
              tabIndex={0}
              aria-label={t('letters.openGuvohnoma')}
              onClick={() => navigate(`/hujjatlar/edit/letter-guvohnoma-${letter.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/hujjatlar/edit/letter-guvohnoma-${letter.id}`)
                }
              }}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <ScrollText size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg">{t('letters.openGuvohnoma')}</p>
                <p className="text-[11px] text-fg-subtle">
                  {letter.guvohnoma_number || t('letters.openFileHint')}
                </p>
              </div>
            </Card>
          )}
        </section>

        {/* Attachment actions */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={attachRef}
            type="file"
            aria-label={t('letters.addAttachment')}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await mut.uploadAttachment.mutateAsync({ id: letter.id, file: f })
                mut.invalidate()
                setNotice(t('letters.attachmentUploaded'))
              } catch {
                setNotice(t('letters.attachmentFailed'))
              } finally {
                if (attachRef.current) attachRef.current.value = ''
              }
            }}
          />
          {!!acts.can_modify && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Paperclip size={14} />}
            onClick={() => attachRef.current?.click()}
          >
            {t('letters.addAttachment')}
          </Button>
          )}
        </div>
        </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { setConfirmDelete(false); await run(mut.remove.mutateAsync(letter.id), t('letters.deleted')); onClose() }}
        danger
        title={t('letters.deleteTitle')}
        description={t('letters.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />

      {/* Rejecting a trip is not undoable from the UI, so it asks first —
          the same treatment delete gets. */}
      <RejectLetterModal
        open={confirmReject}
        loading={mut.reject.isPending}
        onClose={() => setConfirmReject(false)}
        onSubmit={async (reason) => { setConfirmReject(false); await run(mut.reject.mutateAsync({ id: letter.id, reason }), t('letters.rejected')) }}
      />

      <CreateLetterModal
        open={editing}
        editLetter={letter}
        onClose={() => setEditing(false)}
        onCreated={() => {
          setEditing(false)
          mut.invalidate()
          setNotice(t('letters.updated'))
        }}
      />

      <AgreeModal
        action={agreeAction}
        loading={mut.agree.isPending || mut.disagree.isPending}
        onClose={() => setAgreeAction(null)}
        onSubmit={async (comment) => {
          const a = agreeAction
          setAgreeAction(null)
          if (a === 'agree') await run(mut.agree.mutateAsync({ id: letter.id, comment }), t('letters.agreedNotice'))
          else await run(mut.disagree.mutateAsync({ id: letter.id, comment }), t('letters.disagreedNotice'))
        }}
      />
    </div>
  )
}

function AgreerRow({ agreer }: { agreer: LetterAgreer }) {
  const { t } = useTranslation()
  const status = agreer.agreed == null ? { label: t('letters.waiting'), tone: 'warning' as BadgeTone } : agreer.agreed ? { label: t('letters.agreed'), tone: 'success' as BadgeTone } : { label: t('letters.disagreed'), tone: 'danger' as BadgeTone }
  return (
    <tr className="border-t border-line">
      <td className={TD}>
        <div className="flex items-center gap-2">
          <Avatar src={agreer.employee?.photo_thumb_path} name={agreer.employee?.legal_name} size={26} />
          <span className="text-fg">{agreer.employee?.legal_name || '—'}</span>
        </div>
      </td>
      <td className={cn(TD, "text-fg-muted")}>{agreer.comment || <span className="italic text-fg-subtle">{t('letters.noComment')}</span>}</td>
      <td className={TD}><Badge tone={status.tone}>{status.label}</Badge></td>
    </tr>
  )
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-fg">{value}</dd>
    </div>
  )
}

function AgreeModal({ action, loading, onClose, onSubmit }: { action: 'agree' | 'disagree' | null; loading: boolean; onClose: () => void; onSubmit: (comment: string) => void }) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (action) { setComment(''); setError('') } }, [action])
  const submit = () => {
    if (!comment.trim()) return setError(t('letters.commentRequired'))
    onSubmit(comment.trim())
  }
  return (
    <Modal open={!!action} onClose={onClose} title={action === 'disagree' ? t('letters.disagree') : t('letters.agree')} size="sm" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button variant={action === 'disagree' ? 'danger' : 'primary'} onClick={submit} loading={loading}>{t('common.confirm')}</Button>
      </>
    }>
      <Field label={t('letters.colComment')}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} aria-label={t('letters.colComment')}
       />
      </Field>
      <FormError className="mt-1.5 text-xs">{error}</FormError>
    </Modal>
  )
}

/**
 * Reject with a reason. The plain confirm it replaces sent no body, so the
 * signer's reason — which the server stores (`rejection_reason`) and this
 * page shows to the author — was never collected. Mirrors OrdersPage.
 */
function RejectLetterModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('letters.rejectTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => (reason.trim().length >= 3 ? onSubmit(reason.trim()) : setError(t('letters.rejectReasonHint')))} loading={loading}>
            {t('letters.reject')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">{t('letters.rejectConfirm')}</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-label={t('letters.rejectReasonLabel')} placeholder={t('letters.rejectReasonLabel')} />
      <FormError className="mt-1.5 text-xs">{error}</FormError>
    </Modal>
  )
}
