import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { apiPost } from '@/api/http'
import { EMPLOYEE_VALIDATE_PHOTO } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'

/** Bigger than this and the base64 payload starts timing out the validator. */
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
 * The employee portrait — picked, CHECKED, then held until the form is saved.
 *
 * The check is not cosmetic: this image is what the turnstile matches faces
 * against, so a picture the reader cannot use would quietly cost the person
 * their access without anyone noticing until they are standing at the gate.
 * That is why a rejected photo is never attached — the form would otherwise
 * save something that looks fine on screen and fails in the lobby.
 *
 * The picked image is kept as base64 in the PARENT's state and written by the
 * same PATCH/POST as the rest of the card; nothing is uploaded on selection.
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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onError?.(t('employees.photoWrongType'))
      return
    }
    if (file.size > MAX_BYTES) {
      onError?.(t('employees.photoTooBig'))
      return
    }
    setBusy(true)
    try {
      const base64 = await toBase64(file)
      await apiPost(EMPLOYEE_VALIDATE_PHOTO, { photo_base64: base64 })
      onChange(base64)
      onError?.('')
    } catch (e) {
      onError?.(errorMessage(e, t('employees.photoRejected')))
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
          accept="image/jpeg,image/png,image/webp"
          // Hidden behind a visible button, but still a control a screen reader
          // reaches — without a name it is announced as a bare "file upload".
          aria-label={t('employees.changePhoto')}
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
          aria-label={t('employees.changePhoto')}
          title={t('employees.changePhoto')}
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-pill bg-brand text-fg-on-brand shadow-md transition-transform hover:scale-105 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        </button>
      </div>

      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{t('employees.photoTitle')}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{t('employees.photoHint')}</p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            >
              {t('employees.photoUndo')}
            </button>
          )}
          {onRemove && !value && (currentUrl || currentFallbackUrl) && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs text-danger underline-offset-2 hover:underline"
            >
              <Trash2 size={12} /> {t('employees.photoRemove')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
