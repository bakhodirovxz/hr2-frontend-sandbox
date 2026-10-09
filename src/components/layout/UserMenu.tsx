import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER } from '@/components/ui/control'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useAuthStore } from '@/store/authStore'
import { useLogout } from '@/hooks/useAuth'
import * as roles from '@/auth/roles'
import { cn } from '@/lib/cn'

export function UserMenu() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const onMenuKeyDown = useArrowNav(menuRef, { selector: '[role="menuitem"]' })
  // Opening a menu should land focus on its first item (keyboard + AT convention).
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()

  const name = roles.getDisplayName(user) ?? t('common.user')
  const roleLabel = t(`roles.${roles.getRoleKey(user)}`)
  const photo = user?.employee?.photo_thumb_path
  const photoFull = user?.employee?.photo_path

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
      >
        <Avatar src={photo} fallbackSrc={photoFull} name={name} size={34} />
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="max-w-[160px] truncate text-[13px] font-semibold leading-tight text-fg">
            {name}
          </span>
          <span className="max-w-[160px] truncate text-[11px] leading-tight text-fg-muted">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={cn('hidden text-fg-subtle transition-transform sm:block', open && 'rotate-180')}
        />
      </button>

      <AnchoredPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={POPOVER.userW}
        height={240}
        label={t('header.profile')}
        className="overflow-hidden py-1.5"
      >
        <div ref={menuRef} onKeyDown={onMenuKeyDown}>
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold text-fg">{name}</p>
            <p className="truncate text-xs text-fg-muted">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => go('/my-profile')}
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <UserIcon size={16} /> {t('header.profile')}
          </button>
          <button
            type="button"
            onClick={() => go('/sozlamalar')}
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Settings size={16} /> {t('header.settings')}
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut size={16} /> {t('header.logout')}
          </button>
        </div>
      </AnchoredPanel>
    </div>
  )
}
