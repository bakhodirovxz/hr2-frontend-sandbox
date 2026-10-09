import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

/** The server's upload limit for a portrait. */
const MAX_BYTES = 5 * 1024 * 1024

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

/**
 * The employee portrait (TZ 4.2.7 · 2152 «Загрузка фотографий из графических
 * файлов»): JPG or PNG up to 5 MB, held as base64 in the PARENT's state and
 * written by the same PATCH/POST as the rest of the card (`photo_base64`);
 * the server re-checks the image bytes.
 */
export function PhotoPicker({
  value,
  onChange,
  currentUrl,
  currentFallbackUrl,
  name,
  size = 96,
  onRemove,
  onError,
  className,
}: {
  /** Newly picked image, base64 without the data: prefix. */
  value: string | null
  onChange: (base64: string | null) => void
  /** Already-saved portrait, shown when nothing new is picked. */
  currentUrl?: string | null
  currentFallbackUrl?: string | null
  name?: string | null
  size?: number
  /** Offered only when the record already has a photo on the server. */
  onRemove?: () => void
  onError?: (message: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File) => {
    // `accept` is only a hint to the file dialog — «All files» or a drop
    // still hands over a PDF, which then went to the server as base64 just
    // to come back as a generic rejection.
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      onError?.(t('personnel.photo.wrongType'))
      return
    }
    if (file.size > MAX_BYTES) {
      onError?.(t('personnel.photo.tooBig'))
      return
    }
    setBusy(true)
    try {
      onChange(await toBase64(file))
      onError?.('')
    } catch {
      onError?.(t('personnel.photo.unreadable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative shrink-0">
        <Avatar
          src={value ? `data:image/jpeg;base64,${value}` : currentUrl}
          fallbackSrc={value ? undefined : currentFallbackUrl}
          name={name}
          size={size}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          // Hidden behind a visible button, but still a control a screen reader
          // reaches — without a name it is announced as a bare "file upload".
          aria-label={t('personnel.photo.change')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pick(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={t('personnel.photo.change')}
          title={t('personnel.photo.change')}
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-pill bg-brand text-fg-on-brand shadow-md transition-transform hover:scale-105 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        </button>
      </div>

      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{t('personnel.photo.title')}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{t('personnel.photo.hint')}</p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              {t('personnel.photo.undo')}
            </button>
          )}
          {onRemove && !value && (currentUrl || currentFallbackUrl) && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs text-danger underline-offset-2 hover:underline"
            >
              <Trash2 size={12} /> {t('personnel.photo.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
