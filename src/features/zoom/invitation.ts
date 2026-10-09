import type { TFunction } from 'i18next'
import { inTashkent } from '@/lib/format'
import type { ZoomMeeting } from './useZoom'

/** 98498148442 -> "984 9814 8442", the way Zoom itself prints a meeting id. */
export function formatMeetingId(id?: number | string | null): string {
  const s = String(id ?? '')
  return s.length === 11 ? `${s.slice(0, 3)} ${s.slice(3, 7)} ${s.slice(7)}` : s
}

/**
 * The text people actually forward — Zoom's own "Copy Meeting Invitation"
 * block: topic, time, join link, meeting id and passcode. Assembled here
 * because the server already returns every field; asking Zoom for its
 * invitation text would need one more scope for nothing.
 *
 * The join link embeds the passcode, but it is repeated as a line on purpose:
 * dial-in and room-system users are asked for it separately.
 */
export function buildInvitation(m: ZoomMeeting, t: TFunction): string {
  const when = m.start_at ? inTashkent(m.start_at).format('DD.MM.YYYY HH:mm') : ''
  const lines = [
    t('zoom.invHeader'),
    '',
    `${t('zoom.invTopic')}: ${m.topic || ''}`,
    `${t('zoom.invTime')}: ${when}`,
    '',
    `${t('zoom.invJoin')}:`,
    m.join_url || '',
    '',
    `${t('zoom.invId')}: ${formatMeetingId(m.zoom_meeting_id)}`,
  ]
  if (m.passcode) lines.push(`${t('zoom.invPasscode')}: ${m.passcode}`)
  return lines.join('\n')
}
