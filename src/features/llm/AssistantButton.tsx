import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { useAuthStore } from '@/store/authStore'
import { canUseAssistant } from './useLlm'

/**
 * ⚠️ PANEL FAQAT OCHILGANDA YUKLANADI. U `react-markdown` ni tortadi, va
 * chatni umuman ochmagan odam uni ham yuklab olishi kerak emas (v1 da aynan
 * shu muammo bo'lgan va `ChatbotSidebar` lazy qilingan).
 */
const AssistantPanel = lazy(() =>
  import('./AssistantPanel').then((m) => ({ default: m.AssistantPanel })),
)

export function AssistantButton() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)

  // Server 18 ta marshrutning hammasida 403 beradi — tugmani ko'rsatish
  // faqat umidni buzardi.
  if (!canUseAssistant(user)) return null

  return (
    <>
      <IconButton label={t('assistant.open')} onClick={() => setOpen(true)}>
        <Bot size={19} />
      </IconButton>
      {open && (
        <Suspense fallback={null}>
          <AssistantPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
