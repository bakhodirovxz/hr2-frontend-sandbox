import { ConfirmProvider } from '@/components/data/useConfirm'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/api/queryClient'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { Splash } from '@/components/Splash'
import { LoginPage } from '@/pages/LoginPage'

/**
 * Marshrutlar — TZ sandbox jadvali (hr-frontend-sandbox README «Marshrutlar»).
 * Yo'llar backend bildirishnoma / qidiruv / xatlarda yuboradigan havolalar bilan
 * bir xil (`/orders?open=`, `/staffing?open=`, `/qr-approve` …), shuning uchun
 * o'zgartirilmaydi. LoginPage — sovuq kirish ekrani, ataylab eager.
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const RegisterPage = page(() => import('@/pages/RegisterPage'), 'RegisterPage')
const ResetPasswordPage = page(() => import('@/pages/ResetPasswordPage'), 'ResetPasswordPage')
const RegistrationStatusPage = page(() => import('@/pages/RegistrationStatusPage'), 'RegistrationStatusPage')
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const MyProfilePage = page(() => import('@/pages/MyProfilePage'), 'MyProfilePage')
const MyAttendancePage = page(() => import('@/pages/MyAttendancePage'), 'MyAttendancePage')
const UsersPage = page(() => import('@/pages/UsersPage'), 'UsersPage')
const BranchesPage = page(() => import('@/pages/BranchesPage'), 'BranchesPage')
const RegistrationsPage = page(() => import('@/pages/RegistrationsPage'), 'RegistrationsPage')
const AuditLogPage = page(() => import('@/pages/AuditLogPage'), 'AuditLogPage')
const SystemHealthPage = page(() => import('@/pages/SystemHealthPage'), 'SystemHealthPage')
const BackupsPage = page(() => import('@/pages/BackupsPage'), 'BackupsPage')
const UiDictionaryPage = page(() => import('@/pages/UiDictionaryPage'), 'UiDictionaryPage')
const LmsPage = page(() => import('@/pages/LmsPage'), 'LmsPage')
const DictionariesPage = page(() => import('@/pages/DictionariesPage'), 'DictionariesPage')
const StructurePage = page(() => import('@/pages/StructurePage'), 'StructurePage')
const StaffPositionsPage = page(() => import('@/pages/StaffPositionsPage'), 'StaffPositionsPage')
const EmployeesPage = page(() => import('@/pages/EmployeesPage'), 'EmployeesPage')
const EmployeeProfilePage = page(() => import('@/pages/EmployeeProfilePage'), 'EmployeeProfilePage')
const HrQualityPage = page(() => import('@/pages/HrQualityPage'), 'HrQualityPage')
const KpiPage = page(() => import('@/pages/KpiPage'), 'KpiPage')
const WorkPlanPage = page(() => import('@/pages/WorkPlanPage'), 'WorkPlanPage')
const TrainingsPage = page(() => import('@/pages/TrainingsPage'), 'TrainingsPage')
const InspectionsPage = page(() => import('@/pages/InspectionsPage'), 'InspectionsPage')
const OrdersPage = page(() => import('@/pages/OrdersPage'), 'OrdersPage')
const OrderTypesPage = page(() => import('@/pages/OrderTypesPage'), 'OrderTypesPage')
const ServicesPage = page(() => import('@/pages/ServicesPage'), 'ServicesPage')
const AttendancePage = page(() => import('@/pages/AttendancePage'), 'AttendancePage')
const HolidaysPage = page(() => import('@/pages/HolidaysPage'), 'HolidaysPage')
const TabelSettingsPage = page(() => import('@/pages/TabelSettingsPage'), 'TabelSettingsPage')

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <Suspense fallback={<Splash />}>
                <Routes>
                  {/* TZ 4.2.3, U1, U3 */}
                  <Route path="/login" element={<LoginPage />} />
                  {/* TZ 4.2.2 — ochiq ro'yxatdan o'tish */}
                  <Route path="/register" element={<RegisterPage />} />
                  {/* U3 — xatdagi havola */}
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppShell />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="/registration-status" element={<RegistrationStatusPage />} />
                      <Route path="/my-profile" element={<MyProfilePage />} />
                      <Route path="/my-attendance" element={<MyAttendancePage />} />
                      {/* Tizim boshqaruvi — 4.2.1, A1–A4, E1–E3, LMS */}
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/branches" element={<BranchesPage />} />
                      <Route path="/registrations" element={<RegistrationsPage />} />
                      <Route path="/audit-logs" element={<AuditLogPage />} />
                      <Route path="/system-health" element={<SystemHealthPage />} />
                      <Route path="/system/backups" element={<BackupsPage />} />
                      <Route path="/system/dictionary" element={<UiDictionaryPage />} />
                      <Route path="/lms" element={<LmsPage />} />
                      {/* 4.2.5–4.2.7 */}
                      <Route path="/dictionaries" element={<DictionariesPage />} />
                      <Route path="/structure" element={<StructurePage />} />
                      <Route path="/staffing" element={<StaffPositionsPage />} />
                      <Route path="/employees" element={<EmployeesPage />} />
                      <Route path="/employees/:id" element={<EmployeeProfilePage />} />
                      <Route path="/hr-quality" element={<HrQualityPage />} />
                      {/* 4.2.8 — KPI, K2, K4, K5 */}
                      <Route path="/kpi" element={<KpiPage />} />
                      <Route path="/work-plans" element={<WorkPlanPage />} />
                      <Route path="/trainings" element={<TrainingsPage />} />
                      <Route path="/audits" element={<InspectionsPage />} />
                      {/* 4.2.9 */}
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/order-types" element={<OrderTypesPage />} />
                      {/* 4.2.12, I1, I2 */}
                      <Route path="/services" element={<ServicesPage />} />
                      <Route path="/employee-attendance" element={<AttendancePage />} />
                      <Route path="/holidays" element={<HolidaysPage />} />
                      <Route path="/timesheet-settings" element={<TabelSettingsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
