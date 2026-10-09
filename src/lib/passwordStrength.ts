/**
 * Client-side mirror of `core/password_policy.py` — the SAME rules the server
 * enforces, so the checklist under the field never promises something the
 * save will then refuse. The server stays the authority; this only lets the
 * person see what is missing before pressing the button.
 *
 * Levels (the meter):
 *   weak   — at least one MANDATORY rule broken (the server will reject it)
 *   medium — every mandatory rule met
 *   strong — mandatory rules met AND (12+ characters OR a special character)
 */

export type PasswordRuleKey = 'length' | 'uppercase' | 'lowercase' | 'digit' | 'contains_username' | 'common'
export type PasswordLevel = 'weak' | 'medium' | 'strong'

export const PASSWORD_MIN_LENGTH = 8

const UPPER = /[A-ZА-ЯЁЎҚҒҲ]/
const LOWER = /[a-zа-яёўқғҳ]/
const DIGIT = /\d/
const SPECIAL = /[^A-Za-z0-9А-Яа-яЁёЎўҚқҒғҲҳ]/
const TRAILING_JUNK = /[\d\W_]+$/

/** The head of every dictionary attack — kept in step with the server list. */
const COMMON = new Set([
  'password', 'passw0rd', 'parol', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl',
  'zxcvbn', 'zxcvbnm', '12345678', '123456789', '1234567890', '87654321',
  '11111111', '00000000', 'abcd1234', 'abc12345', 'admin', 'administrator',
  'welcome', 'letmein', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball',
  'master', 'sunshine', 'princess', 'shadow', 'superman', 'michael', 'jennifer',
  'trustno1', 'changeme', 'default', 'secret', 'login', 'user', 'test', 'guest',
  'uzgidro', 'hrm', 'hruzgidro', 'uzbekistan', 'toshkent', 'tashkent', 'samarkand',
  'salom', 'salomdunyo', 'ozbekiston', "o'zbekiston",
])

export interface PasswordCheck {
  level: PasswordLevel
  /** 0–4 filled segments for the meter. */
  score: number
  /** Every mandatory rule, true = satisfied. */
  rules: Record<'length' | 'uppercase' | 'lowercase' | 'digit', boolean>
  /** Mandatory rules that are broken — empty means the server will accept it. */
  failed: PasswordRuleKey[]
  /** Optional extras that lift medium → strong. */
  long: boolean
  special: boolean
}

export function checkPassword(password: string, username?: string | null): PasswordCheck {
  const pw = password || ''
  const rules = {
    length: pw.length >= PASSWORD_MIN_LENGTH,
    uppercase: UPPER.test(pw),
    lowercase: LOWER.test(pw),
    digit: DIGIT.test(pw),
  }
  const failed: PasswordRuleKey[] = (Object.keys(rules) as (keyof typeof rules)[]).filter((k) => !rules[k])

  const low = pw.toLowerCase()
  if (username) {
    const u = username.trim().toLowerCase()
    const local = u.split('@')[0]
    for (const piece of new Set([u, local])) {
      if (piece.length >= 4 && low.includes(piece)) {
        failed.push('contains_username')
        break
      }
    }
  }
  const stripped = low.replace(TRAILING_JUNK, '')
  if (pw && (COMMON.has(low) || (stripped && COMMON.has(stripped)))) failed.push('common')

  const long = pw.length >= 12
  const special = SPECIAL.test(pw)
  let level: PasswordLevel = 'weak'
  if (failed.length === 0) level = long || special ? 'strong' : 'medium'

  // Meter: one segment per satisfied mandatory rule while weak, all four at
  // medium/strong — so it visibly fills as the person types.
  const satisfied = Object.values(rules).filter(Boolean).length
  const score = pw.length === 0 ? 0 : level === 'weak' ? Math.min(2, Math.max(1, Math.ceil(satisfied / 2))) : level === 'medium' ? 3 : 4

  return { level, score, rules, failed, long, special }
}
