import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Cake } from 'lucide-react'
import { apiGet, apiPost } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useAuthStore } from '@/store/authStore'

interface Greeting {
  show?: boolean
  full_name?: string | null
  birth_date?: string | null
  photo_path?: string | null
}

/**
 * THE BIRTHDAY GREETING, shown once a year to the person whose birthday it is.
 *
 * The server owns the whole decision — whether today is the day and whether
 * this person has already been greeted this year — because the answer must be
 * the same on every device and must not repeat after a refresh. The client
 * only draws it and reports that it was seen.
 *
 * ⚠️ `seen` is posted when the dialog CLOSES, not when it opens: a greeting
 * that flashed past during a redirect would otherwise be marked as seen and
 * never shown again that year.
 */
export function BirthdayGreetingModal() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['birthday-greeting'],
    queryFn: () => apiGet<Greeting>(`${EMPLOYEES_LIST}/me/birthday-greeting`),
    enabled: isAuthenticated,
    staleTime: 6 * 60 * 60_000,
  })

  useEffect(() => {
    if (data?.show) setOpen(true)
  }, [data?.show])

  const close = () => {
    setOpen(false)
    void apiPost(`${EMPLOYEES_LIST}/me/birthday-greeting/seen`, {}).catch(() => {
      /* best effort: worst case the greeting appears once more */
    })
  }

  if (!data?.show) return null

  return (
    <Modal open={open} onClose={close} size="sm" title="">
      <div className="flex flex-col items-center gap-4 px-2 py-4 text-center">
        <div className="relative">
          <Avatar src={data.photo_path ?? undefined} name={data.full_name ?? ''} size={92} />
          <span className="absolute -right-1 -top-1 grid h-9 w-9 place-items-center rounded-full bg-brand text-fg-on-brand shadow-md">
            <Cake size={18} />
          </span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-fg">{t('birthday.title')}</h2>
          <p className="mt-1 text-[15px] font-semibold text-brand-strong">{data.full_name}</p>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t('birthday.message')}</p>
        </div>
        <Button onClick={close}>{t('birthday.thanks')}</Button>
      </div>
    </Modal>
  )
}
