import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Bell, KeyRound, Pencil, Shield, User as UserIcon, UserCircle } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { LoadError } from '@/components/data/LoadError'
import { tabPill } from '@/components/ui/control'
import { useCurrentUser } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { AccountPanel } from '@/features/employees/profile/AccountPanel'
import { ChangePasswordModal } from '@/features/employees/profile/ChangePasswordModal'
import { MyEditForm } from '@/features/employees/profile/MyEditForm'
import { MyGeneralInfo } from '@/features/employees/profile/MyGeneralInfo'
import { ProfileSessions } from '@/features/employees/profile/ProfileSessions'
import { useMyEmployee } from '@/features/employees/profile/useMyAccount'
import { NotificationSettingsPanel } from '@/features/notifications/NotificationSettingsPanel'

type Tab = 'account' | 'general' | 'edit' | 'security' | 'notifications'
const ALL_TABS: { id: Tab; icon: React.ReactNode }[] = [
  { id: 'account', icon: <UserCircle size={15} /> },
  { id: 'general', icon: <UserIcon size={15} /> },
  { id: 'edit', icon: <Pencil size={15} /> },
  { id: 'security', icon: <Shield size={15} /> },
  { id: 'notifications', icon: <Bell size={15} /> },
]

/**
 * MENING PROFILIM — TZ 4.2.4 (shaxsiy kabinet), L1–L2, U1 · 763.
 *
 *   «Shaxsiy kabinet»     — har bir hisob: hisob ma'lumotlari, 2FA, so'rovlarim,
 *                            F.I.Sh./login/pochta/telefon/rasmni tahrirlash;
 *   «Umumiy ma'lumotlarim» — o'z xodim kartasi (faqat ko'rish);
 *   «Tahrirlash»           — `PATCH /employees/me/self-update`;
 *   «Xavfsizlik»           — yangi parol va faol sessiyalar;
 *   «Bildirishnomalar»     — qaysi turdagi bildirishnomalar kelishi (TZ L3 985).
 *
 * Xodim kartasiga bog'lanmagan hisoblar (administrator, mehmon) faqat kabinet
 * va «Xavfsizlik» ni ko'radi. `?tab=security` xavfsizlik tabini ochadi
 * (vaqtinchalik parol eslatmasidagi havola shu yerga olib keladi).
 */
export function MyProfilePage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const user = useAuthStore((s) => s.user)
  const employeeId = user?.employee?.id ?? null
  const hasEmployee = !!employeeId
  const employee = useMyEmployee(employeeId)
  const [pwOpen, setPwOpen] = useState(false)

  // Kabinet har ochilganda hisobning yangi holatini o'qiydi (oxirgi kirish,
  // 2FA, rol) — `auth/me` 5 daqiqa keshlanadi.
  useEffect(() => {
    void me.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = hasEmployee ? ALL_TABS : ALL_TABS.filter((x) => x.id === 'account' || x.id === 'security' || x.id === 'notifications')
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && tabs.some((x) => x.id === raw) ? raw : 'account'
  const setTab = (v: Tab) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (v === 'account') sp.delete('tab')
        else sp.set('tab', v)
        return sp
      },
      { replace: true },
    )

  const header = <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

  // TZ L1 · 939: profil yuklanmasa — xato va «Qayta urinish».
  if (me.isError && !me.data) {
    return (
      <PageContainer>
        {header}
        <Card className="p-6">
          <LoadError error={me.error} onRetry={() => void me.refetch()} />
        </Card>
      </PageContainer>
    )
  }
  if (!user) {
    return (
      <PageContainer>
        {header}
        <CenteredSpinner />
      </PageContainer>
    )
  }

  const needsCard = tab === 'general' || tab === 'edit'
  const cardBody = () => {
    if (employee.isError)
      return (
        <Card className="p-6">
          <LoadError error={employee.error} onRetry={() => void employee.refetch()} />
        </Card>
      )
    if (!employee.data) return <CenteredSpinner />
    return tab === 'general' ? (
      <MyGeneralInfo employee={employee.data} />
    ) : (
      <MyEditForm employee={employee.data} onCancel={() => setTab('general')} onSaved={() => setTab('general')} />
    )
  }

  return (
    <PageContainer>
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t('account.title')}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={tabPill(tab === x.id)}
          >
            <span className="inline-flex items-center gap-1.5">
              {x.icon}
              {t(`account.tab_${x.id}`)}
            </span>
          </button>
        ))}
        {tab === 'security' && (
          <Button size="sm" className="ml-auto" leftIcon={<KeyRound size={14} />} onClick={() => setPwOpen(true)}>
            {t('account.newPassword')}
          </Button>
        )}
      </div>

      {tab === 'account' && (
        <>
          {employee.isError && (
            <Card className="mb-4 p-4">
              <LoadError error={employee.error} onRetry={() => void employee.refetch()} />
            </Card>
          )}
          <AccountPanel employee={employee.data ?? null} />
        </>
      )}
      {needsCard && cardBody()}
      {tab === 'security' && <ProfileSessions />}
      {tab === 'notifications' && <NotificationSettingsPanel />}

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </PageContainer>
  )
}
