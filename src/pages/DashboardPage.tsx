import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { isGuest, isPlainEmployee } from '@/auth/permissions'
import { HrDashboard } from '@/features/dashboard/nocturne/HrDashboard'
import { EmployeeDashboard } from '@/features/dashboard/nocturne/EmployeeDashboard'

/**
 * BOSH SAHIFA (TZ 4.2.4) — hr-frontend-sandbox `App.jsx` qoidasi bilan bir xil:
 * mehmon → vakansiyalar; oddiy xodim (bo'lim boshlig'i ham) → shaxsiy sahifa;
 * kadr, rahbariyat va administratorlar → HR doskasi. Doska bloklari faqat
 * foydalanuvchiga ochiq modullardan so'raladi.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  /**
   * Filial qarori `useBranchInit` EFFEKTIDA o'rnatiladi; doska bloklari
   * filialga bog'liq, shuning uchun undan oldin o'rnatilsa hammasi avval
   * filialsiz, keyin filial bilan — ikki marta — so'ralardi.
   */
  const branchReady = useBranchStore((s) => s.branchReady)

  if (isGuest(user)) return <Navigate to="/vacancies" replace />
  if (!branchReady) return <CenteredSpinner />
  return isPlainEmployee(user) ? <EmployeeDashboard /> : <HrDashboard />
}
