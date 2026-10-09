/**
 * INPUT MASKS for the identity fields.
 *
 * These documents have fixed shapes, and a `maxLength` alone does not enforce
 * them: a passport SERIES took digits, a passport NUMBER took letters and more
 * than seven characters, and the PINFL took letters — all of which the server
 * then stored, because its schema only types them as strings.
 *
 * The mask is applied WHILE TYPING rather than checked on submit, so a wrong
 * character never lands in the field in the first place. Paste goes through the
 * same path (it is an input event), which is where most bad values came from.
 */
export type MaskKind =
  | 'passportSeries'
  | 'passportNumber'
  | 'pinfl'
  | 'inn'
  | 'inps'
  | 'phone'
  | 'internalPhone'
  | 'digits'

const digits = (v: string, max: number) => v.replace(/\D+/g, '').slice(0, max)

export function maskValue(kind: MaskKind, raw: string): string {
  switch (kind) {
    // Two Latin letters, upper case. Cyrillic homoglyphs (А, В, Е…) are
    // stripped on purpose: they look identical and break every later search.
    case 'passportSeries':
      return raw.replace(/[^a-zA-Z]+/g, '').slice(0, 2).toUpperCase()
    case 'passportNumber':
      return digits(raw, 7)
    case 'pinfl':
      return digits(raw, 14)
    case 'inn':
      return digits(raw, 9)
    case 'inps':
      return digits(raw, 14)
    // A leading + is kept if it is the FIRST character; everything else is
    // digits. Spaces and dashes are dropped so the stored value is comparable.
    case 'phone':
      return (raw.startsWith('+') ? '+' : '') + raw.replace(/\D+/g, '').slice(0, 12)
    case 'internalPhone':
      return digits(raw, 6)
    default:
      return raw
  }
}

/** Field key → mask. One table, so the form and the bulk grid cannot disagree. */
export const FIELD_MASKS: Record<string, MaskKind> = {
  pasport_series: 'passportSeries',
  pasport_number: 'passportNumber',
  personal_identification_number: 'pinfl',
  taxpayer_identification_number: 'inn',
  individual_accumulative_pension_account_number: 'inps',
  phone_number: 'phone',
  internal_phone_number: 'internalPhone',
}
