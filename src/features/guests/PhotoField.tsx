import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Image as ImageIcon, Loader2, XCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { apiPost } from '@/api/http'
import { EMPLOYEE_VALIDATE_PHOTO } from '@/api/endpoints'
import { cn } from '@/lib/cn'

interface FaceCheck {
  accepted?: boolean | null
  message?: string | null
}

/** 4 MB — well under the backend's cap, and above any sane portrait. */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Portrait picker for a visitor.
 *
 * The photo is not decoration: HikCentral enrols it as the face template, so a
 * visitor with a usable photo walks through the turnstile on face recognition
 * and one without has to scan the QR code. That is why the picked file is sent
 * to the terminal's dry-run check (`employees/me/validate-photo`) before the
 * form is ever submitted — a photo the terminal rejects is worse than none,
 * because it looks enrolled but never opens the gate.
 *
 * `value` is a data-URL (what the API's `photo_base64` accepts); `preview` is
 * whatever should be shown, including an already-stored MinIO URL when editing.
 */
export function PhotoField({
  value,
  preview,
  name,
  onChange,
  disabled,
  onBusyChange,
}: {
  value: string
  preview: string
  name?: string
  onChange: (base64: string, preview: string) => void
  disabled?: boolean
  /** Blocks the form's Save while the terminal check is in flight. */
  onBusyChange?: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<FaceCheck | null>(null)
  const [error, setError] = useState('')

  const setBusy = (busy: boolean) => {
    setChecking(busy)
    onBusyChange?.(busy)
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    setError('')
    setCheck(null)
    if (file.size > MAX_BYTES) {
      setError(t('guests.photoTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? '')
      const raw = dataUrl.split(',')[1] ?? ''
      if (!raw) return
      onChange(dataUrl, dataUrl)
      setBusy(true)
      try {
        const res = await apiPost<FaceCheck>(EMPLOYEE_VALIDATE_PHOTO, { photo_base64: raw })
        setCheck(res)
        // Rejected by the terminal → drop it, so nobody saves a face that will
        // never match at the gate.
        if (res?.accepted === false) onChange('', '')
      } catch {
        // The check is advisory; a failing check must not block saving.
        setCheck(null)
      } finally {
        setBusy(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const ring =
    check?.accepted === true
      ? 'ring-2 ring-success'
      : check?.accepted === false
        ? 'ring-2 ring-danger'
        : ''

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar src={preview || null} name={name} size={72} className={cn(ring)} />
        {checking && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-fg/40">
            <Loader2 size={18} className="animate-spin text-bg" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<ImageIcon size={14} />}
          disabled={disabled || checking}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? t('guests.photoReplace') : t('guests.photoUpload')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : checking ? (
          <p className="text-xs text-fg-muted">{t('guests.photoChecking')}</p>
        ) : check?.accepted === true ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 size={13} /> {t('guests.photoAccepted')}
          </p>
        ) : check?.accepted === false ? (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <XCircle size={13} /> {check.message || t('guests.photoRejected')}
          </p>
        ) : (
          <p className="text-xs text-fg-subtle">{t('guests.photoHint')}</p>
        )}
        {value && !checking && <span className="sr-only">{t('guests.photoSelected')}</span>}
      </div>
    </div>
  )
}
