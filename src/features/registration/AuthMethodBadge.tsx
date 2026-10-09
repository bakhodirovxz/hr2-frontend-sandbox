import { useTranslation } from 'react-i18next'
import { KeyRound, QrCode } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

/** TZ 4.2.2 · 1894 — name of the sign-in method chosen at registration. */
export function useAuthMethodLabel() {
  const { t } = useTranslation()
  return (method?: string | null) => (method === 'qr' ? t('regAuth.qr') : t('regAuth.password'))
}

export function AuthMethodBadge({ method }: { method?: string | null }) {
  const label = useAuthMethodLabel()
  const qr = method === 'qr'
  return (
    <Badge tone={qr ? 'brand' : 'neutral'}>
      {qr ? <QrCode size={11} aria-hidden="true" /> : <KeyRound size={11} aria-hidden="true" />} {label(method)}
    </Badge>
  )
}
