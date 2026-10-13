import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/Avatar'
import { CheckCircle2, Clock, LogOut, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LoadError } from '@/components/data/LoadError'
import { useLogout } from '@/hooks/useAuth'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import dayjs from 'dayjs'
import { inTashkent } from '@/lib/format'
import { useMyRegistration, type RegistrationRow } from '@/features/registration/useRegistration'
import { useAuthMethodLabel } from '@/features/registration/AuthMethodBadge'

/**
 * Arizachining O'Z arizasi va holati — TZ 4.2.2 / 4.2.12
 * («Система должна позволять вести мониторинг статуса своей заявки»).
 *
 * Bu sahifa «Mehmon» rolidagi foydalanuvchining asosiy ekrani: u boshqa hech
 * narsani ko'rmaydi, faqat arizasi qay bosqichda ekanini.
 */

const TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={26} />,
  approved: <CheckCircle2 size={26} />,
  rejected: <XCircle size={26} />,
}

export function RegistrationStatusPage() {
  const { t } = useTranslation()
  const authLabel = useAuthMethodLabel()
  const query = useMyRegistration()
  const logout = useLogout()
  const status = (query.error as { response?: { status?: number } } | null)?.response?.status

  if (query.isLoading) {
    return (
      <PageContainer>
        <CenteredSpinner />
      </PageContainer>
    )
  }

  // 404 — ariza yo'q (masalan administrator yaratgan hisob); boshqa xato — qayta urinish.
  if (query.isError && status !== 404) {
    return (
      <PageContainer>
        <PageHeader title={t('regStatus.title')} subtitle={t('regStatus.subtitle')} />
        <Card className="p-6">
          <LoadError error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      </PageContainer>
    )
  }

  const row = query.data as RegistrationRow | undefined

  if (!row) {
    return (
      <PageContainer>
        <PageHeader title={t('regStatus.title')} subtitle={t('regStatus.subtitle')} />
        <Card className="p-10">
          <EmptyState title={t('regStatus.none')} description={t('regStatus.noneHint')} />
        </Card>
      </PageContainer>
    )
  }

  /* TZ 4.2.2 · 1893: «UGE xodimiman» belgilanmagan foydalanuvchi — oddiy
     mehmon, tasdiq kerak emas; «ko'rib chiqilmoqda» matni faqat xodim
     sifatida ro'yxatdan o'tganlarga. */
  const plainGuest = !row.is_uge_employee && (row.status === 'pending' || !row.status)
  const tone = plainGuest || row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'
  const title = plainGuest ? t('account.regGuestTitle') : t(`registrations.status_${row.status}` as 'registrations.status_pending')
  const hint = plainGuest
    ? t('account.regGuestText')
    : row.status === 'approved'
      ? t('account.regApprovedText')
      : t(`regStatus.hint_${row.status}` as 'regStatus.hint_pending')

  return (
    <PageContainer>
      <PageHeader
        title={t('regStatus.title')}
        subtitle={t('regStatus.subtitle')}
        actions={
          <Button variant="outline" size="sm" leftIcon={<LogOut size={14} />} onClick={logout}>
            {t('header.logout')}
          </Button>
        }
      />

      <Card className="mb-4 flex items-start gap-4 p-5">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
          style={{
            backgroundColor: `rgb(var(--${tone}) / 0.14)`,
            color: `rgb(var(--${tone}))`,
          }}
        >
          {plainGuest ? ICON.approved : (ICON[row.status] ?? <Clock size={26} />)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {row.photo_url && <Avatar src={row.photo_url} name={row.full_name ?? '?'} size={32} />}
            <h2 className="text-lg font-semibold text-fg">{row.full_name || '—'}</h2>
            <Badge tone={plainGuest ? 'success' : (TONE[row.status] ?? 'neutral')}>{title}</Badge>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {hint}
          </p>
          {row.status === 'rejected' && row.reject_reason && (
            <div className="mt-3 rounded-inner border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-fg">
              <span className="font-semibold">{t('registrations.rejectReason')}: </span>
              {row.reject_reason}
            </div>
          )}
          {row.reviewed_at && (
            <p className="mt-2 text-xs text-fg-subtle">
              {t('registrations.colReviewed')}: {inTashkent(row.reviewed_at).format('DD.MM.YYYY HH:mm')}
              {row.reviewed_by_name ? ` · ${row.reviewed_by_name}` : ''}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('regStatus.submitted')} />
        <div className="grid gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Row label={t('register.username')} value={row.username} />
          <Row label={t('regAuth.label')} value={authLabel(row.auth_method)} />
          <Row label={t('register.email')} value={row.email} />
          <Row label={t('register.phone')} value={row.phone_number} />
          <Row label={t('register.birthDate')} value={row.birth_date ? dayjs(row.birth_date).format('DD.MM.YYYY') : null} />
          <Row label={t('register.pinfl')} value={row.pinfl} />
          <Row label={t('register.passport')} value={row.passport_number} />
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
        </div>
      </Card>
    </PageContainer>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="w-[44%] shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-fg">{value || '—'}</span>
    </div>
  )
}
