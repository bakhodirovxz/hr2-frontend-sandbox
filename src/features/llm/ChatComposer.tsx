import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { control } from '@/components/ui/control'
import { cn } from '@/lib/cn'

/**
 * Yozish maydoni. Enter — yuborish, Shift+Enter — yangi qator (chat
 * konventsiyasi; savol ko'pincha bir qator bo'ladi).
 */
export function ChatComposer({
  onSend,
  onStop,
  busy,
  disabled,
}: {
  onSend: (text: string) => void
  onStop: () => void
  busy: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Matn o'sganda maydon ham o'sadi (ma'lum chegaragacha).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const send = () => {
    const v = text.trim()
    if (!v || busy) return
    setText('')
    onSend(v)
  }

  return (
    <div className="flex items-end gap-2 border-t border-line p-3">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder={t('assistant.placeholder')}
        aria-label={t('assistant.placeholder')}
        className={cn(control(), 'max-h-40 min-h-[2.5rem] flex-1 resize-none py-2')}
      />
      {busy ? (
        <IconButton label={t('assistant.stop')} onClick={onStop}>
          <Square size={16} />
        </IconButton>
      ) : (
        <IconButton label={t('assistant.send')} onClick={send} disabled={disabled || !text.trim()}>
          <Send size={16} />
        </IconButton>
      )}
    </div>
  )
}
