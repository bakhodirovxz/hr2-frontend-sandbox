import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { checkPassword, type PasswordCheck } from '@/lib/passwordStrength'

/**
 * Live strength meter + rule checklist under a new-password field.
 *
 * Reads the same rules the server enforces (`lib/passwordStrength`), so a
 * password shown as "medium" or "strong" here is one the save will accept;
 * "weak" always names the rule that is still missing. Renders nothing until
 * the person starts typing — an empty field does not need a red meter.
 */
export function PasswordStrength({
  value,
  username,
  className,
}: {
  value: string
  username?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const check: PasswordCheck = useMemo(() => checkPassword(value, username), [value, username])
  if (!value) return null

  const tone =
    check.level === 'strong' ? 'bg-success' : check.level === 'medium' ? 'bg-warning' : 'bg-danger'
  const toneText =
    check.level === 'strong' ? 'text-success' : check.level === 'medium' ? 'text-warning' : 'text-danger'

  const rows: { key: string; ok: boolean; label: string }[] = [
    { key: 'length', ok: check.rules.length, label: t('password.ruleLength') },
    { key: 'letter', ok: check.rules.letter, label: t('password.ruleLetter') },
    { key: 'digit', ok: check.rules.digit, label: t('password.ruleDigit') },
  ]
  if (check.failed.includes('contains_username')) rows.push({ key: 'u', ok: false, label: t('password.ruleNoLogin') })

  return (
    <div className={cn('mt-2', className)} aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={check.score} aria-label={t('password.strength')}>
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={cn('h-1.5 flex-1 rounded-full transition-colors', n <= check.score ? tone : 'bg-line')}
            />
          ))}
        </div>
        <span className={cn('text-[12px] font-semibold', toneText)}>
          {t(`password.level_${check.level}` as never)}
        </span>
      </div>
      <ul className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key} className={cn('flex items-center gap-1.5 text-[12px]', r.ok ? 'text-fg-muted' : 'text-fg')}>
            {r.ok ? <Check size={13} className="shrink-0 text-success" /> : <X size={13} className="shrink-0 text-danger" />}
            <span className={cn(r.ok && 'line-through decoration-fg-subtle/60')}>{r.label}</span>
          </li>
        ))}
      </ul>
      {check.level === 'medium' && (
        <p className="mt-1 text-[11px] text-fg-subtle">{t('password.strongHint')}</p>
      )}
    </div>
  )
}
