import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ShieldQuestion, XCircle } from 'lucide-react'
import { AuthMethodBadge, useAuthMethodLabel } from '@/features/registration/AuthMethodBadge'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { Combobox } from '@/components/ui/Combobox'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import dayjs from 'dayjs'
import { inTashkent } from '@/lib/format'
import { useRoles } from '@/features/users/useUserAdmin'
import {
  useRegisterOptions,
  useRegistrationOps,
  useRegistrations,
  type RegistrationOption,
  type RegistrationRow,
} from '@/features/registration/useRegistration'

const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : null)
const fmtDateTime = (d?: string | null) => (d ? inTashkent(d).format('DD.MM.YYYY HH:mm') : '—')
const toOptions = (list: RegistrationOption[]) => list.map((o) => ({ value: String(o.id), label: o.name }))

/**
 * Ro'yxatdan o'tish arizalari (administrator) — TZ 4.2.2.
 *
 * «Администратор подтверждает личность пользователя»: ariza kartochkasida
 * shaxsni tasdiqlovchi hujjat ma'lumotlari va surat ko'rsatiladi, tasdiqlashda
 * esa administrator xodimning HAQIQIY joyini belgilaydi — arizadagi filial va
 * bo'lim faqat DA'VO bo'lib qoladi.
 */

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const REG_KEYS = ['status'] as const

export function RegistrationsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  // URL state via the shared hook (`q`, `page`, `size`, `status`) — this page
  // used to hand-roll it with its own `search` key and a page size of 20.
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter } =
    useListParams(REG_KEYS)
  const status = filters.status || 'pending'

  const list = useRegistrations({ status, search, page, size })
  const denied = (list.error as { response?: { status?: number } } | null)?.response?.status === 403

  const [active, setActive] = useState<RegistrationRow | null>(null)

  const columns: Column<RegistrationRow>[] = [
    {
      key: 'name',
      header: t('registrations.colName'),
      // Dizayn tilida har qator YUZ bilan boshlanadi: ariza — odam haqida,
      // uning suratini kartochkani ochmasdan ko'rish kerak.
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={r.photo_url} name={r.full_name ?? ''} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{r.full_name || '—'}</p>
            <p className="truncate text-xs text-fg-muted">{r.username || r.email || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'claim',
      header: t('registrations.colClaim'),
      cell: (r) =>
        r.is_uge_employee ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{r.claimed_branch_name || '—'}</p>
            <p className="truncate text-xs text-fg-muted">
              {[r.claimed_department_name, r.claimed_job_position_name].filter(Boolean).join(' · ') ||
                '—'}
            </p>
          </div>
        ) : (
          <span className="text-sm text-fg-muted">{t('registrations.guest')}</span>
        ),
    },
    {
      // TZ 4.2.2 · 1894 — the sign-in method the applicant chose.
      key: 'auth',
      header: t('regAuth.col'),
      cell: (r) => <AuthMethodBadge method={r.auth_method} />,
    },
    {
      key: 'pinfl',
      header: t('registrations.colPinfl'),
      cell: (r) => <span className="font-mono text-xs text-fg-muted">{r.pinfl || '—'}</span>,
    },
    {
      key: 'phone',
      header: t('registrations.colPhone'),
      cell: (r) => <span className="text-sm text-fg-muted">{r.phone_number || '—'}</span>,
    },
    {
      key: 'submitted',
      header: t('account.regSubmitted'),
      cell: (r) => <span className="tabnum text-xs text-fg-muted">{fmtDateTime(r.created_at)}</span>,
      sortValue: (r) => r.created_at ?? '',
    },
    {
      key: 'status',
      header: t('registrations.colStatus'),
      cell: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
          {t(`registrations.status_${r.status}` as 'registrations.status_pending')}
        </Badge>
      ),
    },
    // ⚠️ «Ko'rib chiqildi» FAQAT ko'rib chiqilganlar ro'yxatida ma'noga ega:
    // kutilayotgan arizada u har doim «—» bo'lib, ustun kengligini bekorga
    // yeb turardi.
    ...(status === 'pending'
      ? []
      : [
          {
            key: 'reviewed',
            header: t('registrations.colReviewed'),
            cell: (r: RegistrationRow) => (
              <span className="text-xs text-fg-muted">
                {r.reviewed_at ? `${fmtDateTime(r.reviewed_at)} · ${r.reviewed_by_name ?? ''}` : '—'}
              </span>
            ),
          },
        ]),
  ]

  if (denied) {
    return (
      <PageContainer>
        <PageHeader title={t('registrations.title')} subtitle={t('registrations.subtitle')} />
        <Card className="p-10">
          <EmptyState
            icon={<ShieldQuestion size={26} />}
            title={t('common.noAccess')}
            description={t('registrations.noAccessHint')}
          />
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('registrations.title')} subtitle={t('registrations.subtitle')} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          value={status}
          onChange={(v) => setFilter('status', v === 'pending' ? '' : v)}
          options={[
            { value: 'pending', label: t('registrations.status_pending') },
            { value: 'approved', label: t('registrations.status_approved') },
            { value: 'rejected', label: t('registrations.status_rejected') },
            { value: 'all', label: t('registrations.allStatuses') },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('registrations.searchPlaceholder')}
          className="w-full max-w-[280px]"
        />
        <FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />
      </div>

      <Card>
        <DataTable
        tableId="registrations"
          rows={list.data?.items ?? []}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={setActive}
          filtered={!!search}
          emptyAction={<FilterReset count={search ? 1 : 0} onReset={() => setSearch('')} />}
          emptyTitle={t('registrations.empty')}
          emptyDescription={t('registrations.emptyHint')}
          minWidth={1080}
        />
        <Pagination
          page={page}
          size={size}
          total={list.data?.total ?? 0}
          pages={list.data?.pages ?? 0}
          onPage={setPage}
          onSize={setSize}
          loading={list.isFetching}
        />
      </Card>

      {active && (
        <RegistrationDetail
          row={active}
          onClose={() => setActive(null)}
          onDone={(msg) => {
            toast.ok(msg)
            setActive(null)
          }}
          onError={(e) => toast.error(errorMessage(e, t('registrations.actionFailed')))}
        />
      )}
    </PageContainer>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-2 last:border-b-0">
      <span className="w-[46%] shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-fg">{value || '—'}</span>
    </div>
  )
}

function RegistrationDetail({
  row,
  onClose,
  onDone,
  onError,
}: {
  row: RegistrationRow
  onClose: () => void
  onDone: (message: string) => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const authLabel = useAuthMethodLabel()
  const { approve, reject } = useRegistrationOps()
  // Tashkilot / bo'lim / lavozim — ochiq forma bilan bir xil ro'yxat
  // (`/auth/register/options`, bo'lim va lavozimda `parent_id` = tashkilot).
  const options = useRegisterOptions()
  const roles = useRoles()
  const [mode, setMode] = useState<'view' | 'approve' | 'reject'>('view')
  const [branchId, setBranchId] = useState(String(row.claimed_branch_id ?? ''))
  const [departmentId, setDepartmentId] = useState(String(row.claimed_department_id ?? ''))
  const [positionId, setPositionId] = useState(String(row.claimed_job_position_id ?? ''))
  const [roleId, setRoleId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  /** Bo'lim va lavozim — TAYINLANAYOTGAN tashkilotniki (boshqa tashkilot
   *  bo'limi bilan tasdiqlash `department_branch_mismatch` bilan qulardi). */
  const deptOptions = toOptions((options.data?.departments ?? []).filter((d) => String(d.parent_id ?? '') === branchId))
  const posOptions = toOptions((options.data?.job_positions ?? []).filter((d) => String(d.parent_id ?? '') === branchId))
  const roleOptions = (roles.data ?? [])
    .filter((r) => r.code !== 'guest')
    .map((r) => ({ value: String(r.id), label: r.name }))

  const doApprove = async () => {
    if (!branchId) {
      setError(t('registrations.errBranchRequired'))
      return
    }
    setError('')
    try {
      await approve.mutateAsync({
        id: row.id,
        organization_branch_id: Number(branchId),
        department_id: departmentId ? Number(departmentId) : null,
        job_position_id: positionId ? Number(positionId) : null,
        role_id: roleId ? Number(roleId) : null,
      })
      onDone(t('registrations.approved'))
    } catch (e) {
      onError(e)
    }
  }

  const doReject = async () => {
    if (reason.trim().length < 3) {
      setError(t('registrations.errReasonRequired'))
      return
    }
    setError('')
    try {
      await reject.mutateAsync({ id: row.id, reason: reason.trim() })
      onDone(t('registrations.rejected'))
    } catch (e) {
      onError(e)
    }
  }

  const pending = row.status === 'pending'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row.full_name || t('registrations.title')}
      description={t(`registrations.status_${row.status}` as 'registrations.status_pending')}
      footer={
        pending ? (
          mode === 'view' ? (
            <>
              <Button
                variant="danger"
                leftIcon={<XCircle size={15} />}
                onClick={() => setMode('reject')}
              >
                {t('registrations.reject')}
              </Button>
              <Button leftIcon={<CheckCircle2 size={15} />} onClick={() => setMode('approve')}>
                {t('registrations.approve')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setMode('view')}>
                {t('common.cancel')}
              </Button>
              {mode === 'approve' ? (
                <Button loading={approve.isPending} onClick={doApprove}>
                  {t('registrations.confirmApprove')}
                </Button>
              ) : (
                <Button variant="danger" loading={reject.isPending} onClick={doReject}>
                  {t('registrations.confirmReject')}
                </Button>
              )}
            </>
          )
        ) : (
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        )
      }
    >
      {mode === 'view' && (
        <div className="grid gap-5 sm:grid-cols-[132px_1fr]">
          <div>
            {row.photo_url ? (
              <img loading="lazy" decoding="async"
                src={row.photo_url}
                alt=""
                className="h-[168px] w-[132px] rounded-inner border border-line object-cover"
              />
            ) : (
              <div className="grid h-[168px] w-[132px] place-items-center rounded-inner border border-dashed border-line text-xs text-fg-subtle">
                {t('registrations.noPhoto')}
              </div>
            )}
          </div>
          <div>
            <Row label={t('register.username')} value={row.username} />
            <Row label={t('register.email')} value={row.email} />
            <Row label={t('register.phone')} value={row.phone_number} />
            <Row label={t('account.regFullName')} value={row.full_name} />
            <Row label={t('authx.userType')} value={row.user_type === 'individual' || !row.user_type ? t('authx.userTypeIndividual') : row.user_type} />
            <Row label={t('regAuth.label')} value={authLabel(row.auth_method)} />
            <Row label={t('register.birthDate')} value={fmtDate(row.birth_date)} />
            <Row
              label={t('register.gender')}
              value={row.gender === 1 ? t('register.male') : row.gender === 2 ? t('register.female') : null}
            />
            <Row label={t('register.pinfl')} value={row.pinfl} />
            <Row label={t('register.inn')} value={row.inn} />
            <Row label={t('register.passport')} value={row.passport_number} />
            <Row label={t('register.passportIssuedBy')} value={row.passport_issued_by} />
            <Row
              label={t('register.passportIssueDate')}
              value={fmtDate(row.passport_issue_date)}
            />
            <Row
              label={t('register.passportExpiryDate')}
              value={fmtDate(row.passport_expiry_date)}
            />
            <Row label={t('register.birthPlace')} value={row.birth_place} />
            <Row label={t('register.birthCountry')} value={row.birth_country_name} />
            <Row label={t('register.nationality')} value={row.nationality_name} />
            <Row label={t('register.citizenship')} value={row.citizenship_name} />
            <Row label={t('register.address')} value={row.address} />
            <Row
              label={t('registrations.colClaim')}
              value={
                row.is_uge_employee
                  ? [row.claimed_branch_name, row.claimed_department_name, row.claimed_job_position_name]
                      .filter(Boolean)
                      .join(' · ')
                  : t('registrations.guest')
              }
            />
            {row.reject_reason && (
              <Row label={t('registrations.rejectReason')} value={row.reject_reason} />
            )}
          </div>
        </div>
      )}

      {mode === 'approve' && (
        <div className="grid gap-4">
          <p className="text-sm text-fg-muted">{t('registrations.approveHint')}</p>
          <Field label={t('register.branch')} required>
            <Combobox
              value={branchId}
              onChange={(v) => {
                setBranchId(v)
                // Both lists are branch-scoped, so a leftover id from the
                // previous branch would fail server-side validation.
                setDepartmentId('')
                setPositionId('')
              }}
              options={toOptions(options.data?.branches ?? [])}
              placeholder={t('register.notSelected')}
            />
          </Field>
          <Field label={t('register.department')}>
            <Combobox
              value={departmentId}
              onChange={setDepartmentId}
              options={deptOptions}
              disabled={!branchId}
              placeholder={t('register.notSelected')}
            />
          </Field>
          <Field label={t('register.position')}>
            <Combobox
              value={positionId}
              onChange={setPositionId}
              options={posOptions}
              disabled={!branchId}
              placeholder={t('register.notSelected')}
            />
          </Field>
          <Field label={t('account.regRole')} hint={t('account.regRoleHint')}>
            <Combobox
              value={roleId}
              onChange={setRoleId}
              options={roleOptions}
              loading={roles.isLoading}
              placeholder={t('account.regRoleAuto')}
            />
          </Field>
          <FormError>{error}</FormError>
        </div>
      )}

      {mode === 'reject' && (
        <div className="grid gap-4">
          <Field label={t('registrations.rejectReason')} required hint={t('registrations.rejectHint')}>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <FormError>{error}</FormError>
        </div>
      )}
    </Modal>
  )
}
