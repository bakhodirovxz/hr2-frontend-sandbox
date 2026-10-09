import { useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { canManageEmployee } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useEmployeeDetail } from '../useEmployees'
import { CardTabs, type CardTab } from '../profile/CardTabs'

/**
 * The T-2 personal card of one employee (all TZ 4.2.7 tabs), for screens
 * other than `/employees/:id` (own profile). Editable only for those who
 * manage the card.
 */
export function T2Card({ employeeId }: { employeeId: number }) {
  const user = useAuthStore((s) => s.user)
  const q = useEmployeeDetail(employeeId)
  const [tab, setTab] = useState<CardTab>('general')
  if (q.isLoading) return <Skeleton className="h-64 w-full rounded-card" />
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => void q.refetch()} />
  const employee = q.data
  const canEdit = !employee.is_archived && canManageEmployee(user, employee)
  return <CardTabs employee={employee} active={tab} onChange={setTab} canEdit={canEdit} />
}
