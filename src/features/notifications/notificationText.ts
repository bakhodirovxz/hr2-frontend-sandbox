import i18n from 'i18next'
import { localizedName } from '@/i18n/localized'
import { toCyrillic } from '@/i18n/translit'

/**
 * A server text stored as a code + params (`notifications.message`,
 * backend `core/notification_messages.py`). Params may nest another message
 * (the order reference «Nº12» / «Buyruq») or carry a catalogue name with its
 * Russian form (`{name, name_ru}`).
 */
export interface ServerMessage {
  code: string
  params?: Record<string, unknown>
}

function isMessage(v: unknown): v is ServerMessage {
  return !!v && typeof v === 'object' && typeof (v as ServerMessage).code === 'string'
}

function isNamed(v: unknown): v is { name: string; name_ru?: string | null } {
  return !!v && typeof v === 'object' && 'name' in (v as object)
}

/** Renders a server message in the current language, or `null` when its code is unknown. */
export function renderServerMessage(msg: unknown, lang: string = i18n.language): string | null {
  if (!isMessage(msg)) return null
  const key = `notifMsg.${msg.code}`
  if (!i18n.exists(key)) return null
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(msg.params ?? {})) {
    if (isMessage(v)) params[k] = renderServerMessage(v, lang) ?? ''
    else if (isNamed(v)) params[k] = localizedName(v, lang)
    // Plain values (people's names, numbers, typed text) — Latin script is
    // transliterated for a Cyrillic reader like the rest of the sentence.
    else params[k] = v == null ? '' : lang === 'uz_cyrl' ? toCyrillic(String(v)) : String(v)
  }
  return String((i18n.t as unknown as (k: string, o?: object) => string)(key, params))
}

/** Text of a notification row: the coded message, else the stored Uzbek sentence. */
export function notificationText(n: { message?: unknown; description?: string | null }): string {
  return renderServerMessage(n.message) ?? n.description ?? ''
}
