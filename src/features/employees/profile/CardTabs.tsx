import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Award,
  Briefcase,
  CalendarRange,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileBadge,
  FileText,
  GraduationCap,
  History,
  IdCard,
  Landmark,
  Languages,
  MapPin,
  Route,
  ThumbsDown,
  ThumbsUp,
  User,
  Users,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { cn } from '@/lib/cn'
import type { EmployeeFull } from '../types'
import { DocumentsSlot } from '../t2/DocumentsSlot'
import { EducationTab, ExperienceTab } from '../t2/EducationExperienceTabs'
import { GeneralTab } from '../t2/GeneralTab'
import { AwardsTab, ElectiveTab, LanguagesTab, MeritsTab, RelativesTab, VacationTab } from '../t2/ListTabs'
import { AddressTab, PassportTab, PhotoTab } from '../t2/PassportAddressTabs'
import { useT2Card } from '../t2/useT2'
import { T2BasisContext } from '../t2/T2Ui'
import { EditConflictProvider } from '../editConflict'
import { EMPTY_BASIS, type EditBasis } from '../types'
import { AsOfTab, CareerTab, OrdersTab } from './CardPanels'

export const CARD_TABS = [
  'photo',
  'general',
  'passport',
  'address',
  'education',
  'experience',
  'languages',
  'awards',
  'elective',
  'incentives',
  'penalties',
  'vacation',
  'relatives',
  'certificates',
  'orders',
  'asof',
  'career',
] as const
export type CardTab = (typeof CARD_TABS)[number]

const ICON: Record<CardTab, ReactNode> = {
  photo: <Camera size={14} />,
  general: <User size={14} />,
  passport: <IdCard size={14} />,
  address: <MapPin size={14} />,
  education: <GraduationCap size={14} />,
  experience: <Briefcase size={14} />,
  languages: <Languages size={14} />,
  awards: <Award size={14} />,
  elective: <Landmark size={14} />,
  incentives: <ThumbsUp size={14} />,
  penalties: <ThumbsDown size={14} />,
  vacation: <CalendarRange size={14} />,
  relatives: <Users size={14} />,
  certificates: <FileBadge size={14} />,
  orders: <FileText size={14} />,
  asof: <History size={14} />,
  career: <Route size={14} />,
}

/** Tabs that do not read the T-2 card. */
const NO_T2: CardTab[] = ['orders', 'asof', 'career', 'photo', 'certificates']

/**
 * The T-2 tab strip (TZ 4.2.7 · 2067: «в виде вкладок», «‹ ›» when the tabs
 * do not fit). WAI-ARIA tabs: ←/→/Home/End move between tabs.
 */
function TabBar({ tabs, active, onChange }: { tabs: readonly CardTab[]; active: CardTab; onChange: (t: CardTab) => void }) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Partial<Record<CardTab, HTMLButtonElement | null>>>({})
  const [edges, setEdges] = useState({ left: false, right: false })

  const updateEdges = useCallback(() => {
    const l = listRef.current
    if (!l) return
    const left = l.scrollLeft > 4
    const right = l.scrollLeft + l.clientWidth < l.scrollWidth - 4
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])
  useEffect(() => {
    updateEdges()
    const l = listRef.current
    if (!l) return
    l.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      l.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [updateEdges])
  useEffect(() => {
    const l = listRef.current
    const el = refs.current[active]
    if (!l || !el) return
    const left = el.offsetLeft - l.offsetLeft
    const right = left + el.offsetWidth
    if (left < l.scrollLeft) l.scrollLeft = Math.max(0, left - 16)
    else if (right > l.scrollLeft + l.clientWidth) l.scrollLeft = right - l.clientWidth + 16
  }, [active])

  const onKey = (e: KeyboardEvent, idx: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next === null) return
    e.preventDefault()
    onChange(tabs[next])
    requestAnimationFrame(() => refs.current[tabs[next!]]?.focus())
  }
  const scrollBy = (dir: number) => {
    const l = listRef.current
    if (l) l.scrollLeft += dir * Math.max(160, l.clientWidth * 0.6)
  }

  return (
    <div className="relative rounded-card border border-line bg-surface">
      <div ref={listRef} role="tablist" aria-label={t('personnel.card.tabsLabel')} className="flex items-center gap-0.5 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none]">
        {tabs.map((tab, idx) => {
          const on = tab === active
          return (
            <button
              key={tab}
              ref={(el) => {
                refs.current[tab] = el
              }}
              type="button"
              role="tab"
              id={`emp-card-tab-${tab}`}
              aria-selected={on}
              aria-controls="emp-card-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(tab)}
              onKeyDown={(e) => onKey(e, idx)}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-inner px-3 text-[12.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'bg-brand-soft text-brand-strong' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {ICON[tab]}
              {t(`personnel.tabs.${tab}`)}
            </button>
          )
        })}
      </div>
      {edges.left && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('personnel.card.prevTabs')}
          onClick={() => scrollBy(-1)}
          className="absolute inset-y-0 left-0 flex w-9 items-center justify-start rounded-l-card bg-gradient-to-r from-surface via-surface/90 to-transparent pl-1 text-brand"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('personnel.card.nextTabs')}
          onClick={() => scrollBy(1)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-end rounded-r-card bg-gradient-to-l from-surface via-surface/90 to-transparent pr-1 text-brand"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}

/** Tab strip + the active tab's panel, for one employee card. */
export function CardTabs({
  employee,
  active,
  onChange,
  canEdit,
  onEditEmployee,
  tabs = CARD_TABS,
}: {
  employee: EmployeeFull
  active: CardTab
  onChange: (t: CardTab) => void
  canEdit: boolean
  onEditEmployee?: () => void
  tabs?: readonly CardTab[]
}) {
  const { t } = useTranslation()
  const t2 = useT2Card(employee.id)
  // TZ C3: one basis document for the whole editing session of this card.
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  useEffect(() => setBasis(EMPTY_BASIS), [employee.id])
  const needsT2 = !NO_T2.includes(active)
  const card = t2.data

  const body = (): ReactNode => {
    if (active === 'photo') return <PhotoTab employee={employee} card={card!} canEdit={canEdit} onEditEmployee={onEditEmployee} />
    if (active === 'certificates')
      return <DocumentsSlot employeeId={employee.id} kind="certificate" alsoShow={['other', 'military']} title={t('personnel.docs.certificates')} canEdit={canEdit} />
    if (active === 'orders') return <OrdersTab employeeId={employee.id} />
    if (active === 'asof') return <AsOfTab employeeId={employee.id} />
    if (active === 'career') return <CareerTab employee={employee} />
    if (t2.isLoading) return <Skeleton className="h-48 w-full rounded-card" />
    if (t2.isError || !card) return <LoadError error={t2.error} onRetry={() => void t2.refetch()} />
    const p = { employee, card, canEdit, onEditEmployee }
    switch (active) {
      case 'general':
        return <GeneralTab {...p} />
      case 'passport':
        return <PassportTab {...p} />
      case 'address':
        return <AddressTab {...p} />
      case 'education':
        return <EducationTab {...p} />
      case 'experience':
        return <ExperienceTab {...p} />
      case 'languages':
        return <LanguagesTab {...p} />
      case 'awards':
        return <AwardsTab {...p} />
      case 'elective':
        return <ElectiveTab {...p} />
      case 'incentives':
        return <MeritsTab key="incentive" kind="incentive" {...p} />
      case 'penalties':
        return <MeritsTab key="penalty" kind="penalty" {...p} />
      case 'vacation':
        return <VacationTab employee={employee} card={card} />
      case 'relatives':
        return <RelativesTab {...p} />
      default:
        return null
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TabBar tabs={tabs} active={active} onChange={onChange} />
      <div role="tabpanel" id="emp-card-panel" aria-labelledby={`emp-card-tab-${active}`} tabIndex={0} className="min-w-0 outline-none" data-needs-t2={needsT2 || undefined}>
        <EditConflictProvider>
          <T2BasisContext.Provider value={canEdit ? { value: basis, onChange: setBasis } : null}>{body()}</T2BasisContext.Provider>
        </EditConflictProvider>
      </div>
    </div>
  )
}
