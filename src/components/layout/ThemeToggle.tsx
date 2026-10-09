import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@/components/ui/IconButton'
import { useTheme } from '@/theme/ThemeProvider'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <IconButton label={isDark ? t('header.lightMode') : t('header.darkMode')} onClick={toggle}>
      {isDark ? <Sun size={19} /> : <Moon size={18} />}
    </IconButton>
  )
}
