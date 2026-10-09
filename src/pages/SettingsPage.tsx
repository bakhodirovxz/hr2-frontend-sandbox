import { useMemo, useState, type ReactNode } from 'react'
import { queryClient } from '@/api/queryClient'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Boxes, CalendarClock, Eye, EyeOff, KeyRound, Moon, ShieldCheck, SlidersHorizontal, Sun } from 'lucide-react'
import { apiPatch } from '@/api/http'
import { AUTH_ME_PASSWORD } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button, Card, CardBody, CardHeader, Field, Input, useToast } from '@/components/ui'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { checkPassword } from '@/lib/passwordStrength'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { SearchInput } from '@/components/data/SearchInput'
import { ProfileSessions } from '@/features/employees/profile/ProfileSessions'
import { useTheme } from '@/theme/ThemeProvider'
import { cn } from '@/lib/cn'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { SystemSettingsPanel } from '@/features/settings/SystemSettingsPanel'

/**
 * SOZLAMALAR — what belongs to the ACCOUNT rather than to the person.
 *
 * A profile answers "who am I in this organisation"; these three answer "how do
 * I get in and what does it look like". They used to sit at the bottom of the
 * profile page, where a password field lived next to a passport number and the
 * page had two unrelated jobs. Splitting them also means the profile can be
 * shown as-is to anyone allowed to view it, with no credential controls on it.
 */
type SectionKey = 'account' | 'appearance' | 'attendance' | 'security' | 'modules' | 'nav'

export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((st) => st.user)
  const isMaster = roles.isSiteMasterAdmin(user)
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  // The open section lives in the URL (`?s=security`): a reload used to drop
  // back to «Hisob», and a section could not be linked to.
  const [params, setParams] = useSearchParams()
  const active = (params.get('s') || 'account') as SectionKey
  const setActive = (k: SectionKey) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (k === 'account') n.delete('s')
      else n.set('s', k)
      return n
    }, { replace: true })
  const [search, setSearch] = useState('')

  const [current_, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [show, setShow] = useState(false)

  /**
   * ⚠️ NOT `employees/me/self-update`. That route is employee-scoped and 404s
   * for a login with no employee row, so the site master admin — the one
   * account that can never be reset by anyone else — could not change its own
   * password in v2 at all. `auth/me/password` works off the token's user and
   * enforces the same current-password check.
   */
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(AUTH_ME_PASSWORD, body),
    onSuccess: () => {
      toast.ok(t('settings.passwordChanged'))
      setCurrent('')
      setNext('')
      // The "password expires in N days" strip reads `auth/me`.
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e) => toast.error(errorMessage(e, t('settings.passwordFailed'))),
  })

  const submit = () => {
    // The server's rule set (8+, upper/lower/digit, no login, no dictionary
    // word) is mirrored in `lib/passwordStrength`; the meter under the field
    // already shows what is missing, this only stops a doomed request.
    if (checkPassword(next, user?.username).failed.length) return toast.error(t('password.notStrongEnough'))
    // The server demands the CURRENT password too: changing it revokes every
    // session, so a stolen token could otherwise lock the real owner out.
    if (!current_.trim()) return toast.error(t('profile.currentPasswordRequired'))
    save.mutate({ password: next.trim(), current_password: current_.trim() })
  }

  /**
   * SECTIONS, not one long scroll.
   *
   * The page used to stack everything: a password field, a theme picker, and
   * then a 43-row × 13-role permission matrix — the matrix being the first
   * thing the eye landed on, with the ordinary system values hidden behind a
   * tab inside it. That is the layout every large admin tool moved away from:
   * a left rail of sections with one focused panel beside it, and a search box
   * that finds a setting when you do not know which section owns it.
   */
  const sections = useMemo(() => {
    const list: { key: SectionKey; icon: ReactNode; master?: boolean }[] = [
      { key: 'account', icon: <KeyRound size={15} /> },
      { key: 'appearance', icon: <Sun size={15} /> },
      { key: 'attendance', icon: <CalendarClock size={15} />, master: true },
      { key: 'security', icon: <ShieldCheck size={15} />, master: true },
      { key: 'modules', icon: <Boxes size={15} />, master: true },
      { key: 'nav', icon: <SlidersHorizontal size={15} />, master: true },
    ]
    return list.filter((s) => !s.master || isMaster)
  }, [isMaster])

  // Search matches a section by its own name AND by the names of the settings
  // inside it, so "kech" finds Davomat even though the word is not its title.
  const q = search.trim().toLowerCase()
  const shown = useMemo(
    () =>
      !q
        ? sections
        : sections.filter((s) => {
            // `t()` is typed on literal keys; a computed one needs the cast,
            // and the result is `never` unless we widen it back to a string.
            const title = String(t(`settings.sec_${s.key}` as never)).toLowerCase()
            const hint = String(t(`settings.secHint_${s.key}` as never)).toLowerCase()
            return title.includes(q) || hint.includes(q)
          }),
    [sections, q, t],
  )
  const current = shown.some((s) => s.key === active) ? active : shown[0]?.key

  return (
    <PageContainer>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-[248px_1fr]">
        {/* ── Left rail ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
          <SearchInput value={search} onChange={setSearch} placeholder={t('settings.searchPlaceholder')} />
          <nav className="flex flex-col gap-0.5" aria-label={t('settings.title')}>
            {shown.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={current === s.key ? 'page' : undefined}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                  current === s.key
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-fg-muted hover:bg-fg/[0.05] hover:text-fg',
                )}
              >
                <span className="mt-0.5 shrink-0">{s.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">
                    {t(`settings.sec_${s.key}` as never)}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-subtle">
                    {t(`settings.secHint_${s.key}` as never)}
                  </span>
                </span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-fg-subtle">
                {t('list.noResultsFiltered')}
              </p>
            )}
          </nav>
        </div>

        {/* ── Panel ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {current === 'account' && (
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader title={t('settings.sectionSecurity')} icon={<ShieldCheck size={16} />} />
                {/* A password is ~12 characters: a 1100px field reads as
                    broken. Capped to a comfortable form width. */}
                <CardBody className="flex max-w-xl flex-col gap-4">
                  <Field label={t('settings.currentPassword')}>
                    <Input type="password" value={current_} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
                  </Field>
                  <Field label={t('settings.newPassword')} hint={next ? undefined : t('settings.passwordHint')}>
                    <Input
                      type={show ? 'text' : 'password'}
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                      autoComplete="new-password"
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => setShow((v) => !v)}
                          aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
                        >
                          {show ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      }
                    />
                  </Field>
                  <PasswordStrength value={next} username={user?.username} className="-mt-2" />
                  <div className="flex">
                    <Button onClick={submit} loading={save.isPending}>{t('settings.changePassword')}</Button>
                  </div>
                </CardBody>
              </Card>
              <ProfileSessions />
            </div>
          )}

          {current === 'appearance' && (
            <Card>
              <CardHeader title={t('settings.sectionAppearance')} icon={<Sun size={16} />} />
              <CardBody>
                <p className="mb-3 text-xs text-fg-muted">{t('settings.appearanceHint')}</p>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTheme(v)}
                      aria-pressed={theme === v}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-semibold transition-colors',
                        theme === v ? 'bg-brand text-fg-on-brand' : 'bg-fg/[0.06] text-fg-muted hover:bg-fg/[0.12] hover:text-fg',
                      )}
                    >
                      {v === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                      {t(v === 'dark' ? 'header.darkMode' : 'header.lightMode')}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {isMaster && (current === 'attendance' || current === 'security' || current === 'modules') && (
            <Card>
              <CardHeader
                title={t(`settings.sec_${current}` as never)}
                subtitle={t(`settings.secHint_${current}` as never)}
              />
              <SystemSettingsPanel only="values" group={current} chrome={false} />
            </Card>
          )}

          {isMaster && current === 'nav' && (
            <Card>
              <CardHeader title={t('settings.sec_nav')} subtitle={t('settings.secHint_nav')} />
              <SystemSettingsPanel only="modules" chrome={false} />
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
