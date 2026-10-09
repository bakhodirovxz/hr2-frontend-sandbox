/**
 * Client-side mirror of the sandbox backend's single password policy
 * (`UserService._validate_password_strength`) — the SAME rules the server
 * enforces, so the checklist under the field never promises something the
 * save will then refuse. The server stays the authority (it also rejects a
 * password equal to the current one, which the client cannot know).
 *
 *   • at least 8 characters                       → 400 `weak_password`
 *   • at least one letter AND one digit           → 400 `password_letters_digits`
 *   • does not contain the login (3+ characters)  → 400 `password_contains_username`
 *
 * Levels (the meter):
 *   weak   — at least one mandatory rule broken (the server will reject it)
 *   medium — every mandatory rule met
 *   strong — mandatory rules met AND (12+ characters OR a special character)
 */

export type PasswordRuleKey = 'length' | 'letter' | 'digit' | 'contains_username'
export type PasswordLevel = 'weak' | 'medium' | 'strong'

export const PASSWORD_MIN_LENGTH = 8

const LETTER = /\p{L}/u
const DIGIT = /\d/
const SPECIAL = /[^\p{L}\d]/u

export interface PasswordCheck {
  level: PasswordLevel
  /** 0–4 filled segments for the meter. */
  score: number
  /** Every mandatory rule, true = satisfied. */
  rules: Record<'length' | 'letter' | 'digit', boolean>
  /** Mandatory rules that are broken — empty means the server will accept it. */
  failed: PasswordRuleKey[]
  /** Optional extras that lift medium → strong. */
  long: boolean
  special: boolean
}

export function checkPassword(password: string, username?: string | null): PasswordCheck {
  const pw = password || ''
  const rules = {
    length: pw.trim().length >= PASSWORD_MIN_LENGTH,
    letter: LETTER.test(pw),
    digit: DIGIT.test(pw),
  }
  const failed: PasswordRuleKey[] = (Object.keys(rules) as (keyof typeof rules)[]).filter((k) => !rules[k])

  const login = (username ?? '').trim().toLowerCase()
  if (login.length >= 3 && pw.toLowerCase().includes(login)) failed.push('contains_username')

  const long = pw.length >= 12
  const special = SPECIAL.test(pw)
  let level: PasswordLevel = 'weak'
  if (failed.length === 0) level = long || special ? 'strong' : 'medium'

  // Meter: one segment per satisfied mandatory rule while weak, all four at
  // medium/strong — so it visibly fills as the person types.
  const satisfied = Object.values(rules).filter(Boolean).length
  const score = pw.length === 0 ? 0 : level === 'weak' ? Math.min(2, Math.max(1, satisfied - 1)) : level === 'medium' ? 3 : 4

  return { level, score, rules, failed, long, special }
}
