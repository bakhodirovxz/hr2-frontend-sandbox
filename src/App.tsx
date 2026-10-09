import { ConfirmProvider } from '@/components/data/useConfirm'
import { NotFound } from '@/components/layout/NotFound'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/api/queryClient'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { Splash } from '@/components/Splash'
import { LoginPage } from '@/pages/LoginPage'

/**
 * Route-level code splitting. These 26 pages used to be STATIC imports, which
 * baked all of them — including the 1153-line MedicalPage — into the entry
 * chunk, so every user downloaded every screen before seeing the first one.
 * LoginPage stays eager on purpose: it is the cold-entry landing screen and
 * splitting it would only add a round trip to the most common first paint.
 */
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
)
const NewsPage = lazy(() =>
  import('@/pages/NewsPage').then((m) => ({ default: m.NewsPage })),
)
const IjroPage = lazy(() =>
  import('@/pages/IjroPage').then((m) => ({ default: m.IjroPage })),
)
const WorkPlanPage = lazy(() =>
  import('@/pages/WorkPlanPage').then((m) => ({ default: m.WorkPlanPage })),
)
const MedicalPage = lazy(() =>
  import('@/pages/MedicalPage').then((m) => ({ default: m.MedicalPage })),
)
const HealthChecksPage = lazy(() =>
  import('@/pages/HealthChecksPage').then((m) => ({ default: m.HealthChecksPage })),
)
const ResponsiblesPage = lazy(() =>
  import('@/pages/ResponsiblesPage').then((m) => ({ default: m.ResponsiblesPage })),
)
const TempOrdersPage = lazy(() =>
  import('@/pages/TempOrdersPage').then((m) => ({ default: m.TempOrdersPage })),
)
const MobileCheckinsPage = lazy(() =>
  import('@/pages/MobileCheckinsPage').then((m) => ({ default: m.MobileCheckinsPage })),
)
const BranchesPage = lazy(() =>
  import('@/pages/BranchesPage').then((m) => ({ default: m.BranchesPage })),
)
const TurnstilesPage = lazy(() =>
  import('@/pages/TurnstilesPage').then((m) => ({ default: m.TurnstilesPage })),
)
const HikMonitoringPage = lazy(() =>
  import('@/pages/HikMonitoringPage').then((m) => ({ default: m.HikMonitoringPage })),
)
const CustomFieldsPage = lazy(() =>
  import('@/pages/CustomFieldsPage').then((m) => ({ default: m.CustomFieldsPage })),
)
const DesignSystemPage = lazy(() =>
  import('@/pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage })),
)
const SystemHealthPage = lazy(() =>
  import('@/pages/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })),
)
const HrQualityPage = lazy(() =>
  import('@/pages/HrQualityPage').then((m) => ({ default: m.HrQualityPage })),
)
const TrainingsPage = lazy(() =>
  import('@/pages/TrainingsPage').then((m) => ({ default: m.TrainingsPage })),
)
const InspectionsPage = lazy(() =>
  import('@/pages/InspectionsPage').then((m) => ({ default: m.InspectionsPage })),
)
const DocumentVerifyPage = lazy(() =>
  import('@/pages/DocumentVerifyPage').then((m) => ({ default: m.DocumentVerifyPage })),
)
const KpiReportVerifyPage = lazy(() =>
  import('@/pages/KpiReportVerifyPage').then((m) => ({ default: m.KpiReportVerifyPage })),
)
const KppPage = lazy(() =>
  import('@/pages/KppPage').then((m) => ({ default: m.KppPage })),
)
const TripMovementPage = lazy(() =>
  import('@/pages/TripMovementPage').then((m) => ({ default: m.TripMovementPage })),
)
const LetterReportRedirect = lazy(() =>
  import('@/pages/LetterReportRedirect').then((m) => ({ default: m.LetterReportRedirect })),
)
const SharedDocumentPage = lazy(() =>
  import('@/pages/SharedDocumentPage').then((m) => ({ default: m.SharedDocumentPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const SsoCallbackPage = lazy(() =>
  import('@/pages/SsoCallbackPage').then((m) => ({ default: m.SsoCallbackPage })),
)
const VehicleProfilePage = lazy(() =>
  import('@/pages/VehicleProfilePage').then((m) => ({ default: m.VehicleProfilePage })),
)
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const EmployeesPage = lazy(() =>
  import('@/pages/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
)
const GuestsPage = lazy(() =>
  import('@/pages/GuestsPage').then((m) => ({ default: m.GuestsPage })),
)
const OrderTypesPage = lazy(() =>
  import('@/pages/OrderTypesPage').then((m) => ({ default: m.OrderTypesPage })),
)
const HolidaysPage = lazy(() =>
  import('@/pages/HolidaysPage').then((m) => ({ default: m.HolidaysPage })),
)
const PhonePage = lazy(() => import('@/pages/PhonePage').then((m) => ({ default: m.PhonePage })))
const ZoomPage = lazy(() => import('@/pages/ZoomPage').then((m) => ({ default: m.ZoomPage })))
const VehiclesPage = lazy(() => import('@/pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const VideoGuidePage = lazy(() => import('@/pages/VideoGuidePage').then((m) => ({ default: m.VideoGuidePage })))
const StructurePage = lazy(() => import('@/pages/StructurePage').then((m) => ({ default: m.StructurePage })))
const AttendancePage = lazy(() => import('@/pages/AttendancePage').then((m) => ({ default: m.AttendancePage })))
const MyAttendancePage = lazy(() => import('@/pages/MyAttendancePage').then((m) => ({ default: m.MyAttendancePage })))
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const DocumentEditorPage = lazy(() => import('@/pages/DocumentEditorPage').then((m) => ({ default: m.DocumentEditorPage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const ReportRunPage = lazy(() => import('@/pages/ReportRunPage').then((m) => ({ default: m.ReportRunPage })))
const MyProfilePage = lazy(() => import('@/pages/MyProfilePage').then((m) => ({ default: m.MyProfilePage })))
const MyTeamPage = lazy(() => import('@/pages/MyTeamPage').then((m) => ({ default: m.MyTeamPage })))
const RequestPermissionPage = lazy(() => import('@/pages/RequestPermissionPage').then((m) => ({ default: m.RequestPermissionPage })))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })))
const SupportPage = lazy(() => import('@/pages/SupportPage').then((m) => ({ default: m.SupportPage })))
const ChairmanTasksPage = lazy(() => import('@/pages/ChairmanTasksPage').then((m) => ({ default: m.ChairmanTasksPage })))
const DutyPage = lazy(() => import('@/pages/DutyPage').then((m) => ({ default: m.DutyPage })))
const LettersPage = lazy(() => import('@/pages/LettersPage').then((m) => ({ default: m.LettersPage })))
const OrdersPage = lazy(() => import('@/pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const LearningPage = lazy(() =>
  import('@/pages/LearningPage').then((m) => ({ default: m.LearningPage })),
)
const TabelSettingsPage = lazy(() =>
  import('@/pages/TabelSettingsPage').then((m) => ({ default: m.TabelSettingsPage })),
)
const MonitoringPage = lazy(() =>
  import('@/pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })),
)
const KpiPage = lazy(() => import('@/pages/KpiPage').then((m) => ({ default: m.KpiPage })))

// ── TZ modullari (4.2.5 / 4.2.6+4.2.10 / 4.2.7 / 4.2.12) ──────────────────
const DictionariesPage = lazy(() =>
  import('@/pages/DictionariesPage').then((m) => ({ default: m.DictionariesPage })),
)
const StaffPositionsPage = lazy(() =>
  import('@/pages/StaffPositionsPage').then((m) => ({ default: m.StaffPositionsPage })),
)
const EmployeeProfilePage = lazy(() =>
  import('@/pages/EmployeeProfilePage').then((m) => ({ default: m.EmployeeProfilePage })),
)
const ServicesPage = lazy(() =>
  import('@/pages/ServicesPage').then((m) => ({ default: m.ServicesPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

// ── TZ 4.2.1 / 4.2.2 (foydalanuvchilar, ro'yxatdan o'tish) ────────────────
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const LmsPage = lazy(() => import('@/pages/LmsPage').then((m) => ({ default: m.LmsPage })))
const RegistrationsPage = lazy(() =>
  import('@/pages/RegistrationsPage').then((m) => ({ default: m.RegistrationsPage })),
)
const RegistrationStatusPage = lazy(() =>
  import('@/pages/RegistrationStatusPage').then((m) => ({ default: m.RegistrationStatusPage })),
)

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
        <ConfirmProvider>
        <BrowserRouter>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* TZ 4.2.2 — ochiq ro'yxatdan o'tish formasi. */}
              <Route path="/royxatdan-otish" element={<RegisterPage />} />
              {/* Public, login-free: the e-mail link lands here with a token. */}
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* OneID hands control back here with the session in the URL fragment. */}
              <Route path="/sso/callback" element={<SsoCallbackPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/guests" element={<GuestsPage />} />
                  <Route path="/order-types" element={<OrderTypesPage />} />
                  <Route path="/holidays" element={<HolidaysPage />} />
                  <Route path="/tabel" element={<PhonePage />} />
                  <Route path="/zoom" element={<ZoomPage />} />
                  <Route path="/vehicles" element={<VehiclesPage />} />
                  <Route path="/vehicles/:id" element={<VehicleProfilePage />} />
                  <Route path="/audit-logs" element={<AuditLogPage />} />
                  <Route path="/video-qollanma" element={<VideoGuidePage />} />
                  <Route path="/tuzilma" element={<StructurePage />} />
                  <Route path="/masullar" element={<ResponsiblesPage />} />
                  <Route path="/vaqtinchalik-buyruqlar" element={<TempOrdersPage />} />
                  <Route path="/mobil-belgilar" element={<MobileCheckinsPage />} />
                  <Route path="/filiallar" element={<BranchesPage />} />
                  <Route path="/turniketlar" element={<TurnstilesPage />} />
                  <Route path="/hik-monitoring" element={<HikMonitoringPage />} />
                  <Route path="/qoshimcha-maydonlar" element={<CustomFieldsPage />} />
                  <Route path="/tizim-holati" element={<SystemHealthPage />} />
                  <Route path="/dizayn-tizimi" element={<DesignSystemPage />} />
                  <Route path="/lms" element={<LmsPage />} />
                  <Route path="/kadr-nazorati" element={<HrQualityPage />} />
                  <Route path="/malaka-oshirish" element={<TrainingsPage />} />
                  <Route path="/auditlar" element={<InspectionsPage />} />
                  {/* Opened from the QR stamp on a printed document. Behind the
                      login like v1: the payload is minimal, but it is not public. */}
                  <Route path="/letters/verify/:id" element={<DocumentVerifyPage kind="letter" />} />
                  <Route path="/orders/verify/:id" element={<DocumentVerifyPage kind="order" />} />
                  {/* THREE ADDRESSES THE BACKEND ALREADY HANDS OUT. Each was
                      printed on paper or mailed out while v2 had no route for
                      it, so `*` swallowed them and the reader landed on the
                      dashboard. See `UNGOVERNED_PREFIXES` in navConfig — the
                      module matrix must not close them either. */}
                  <Route path="/kpi/reports/:id/verify" element={<KpiReportVerifyPage />} />
                  <Route path="/letters/:id/movements/:movementId" element={<TripMovementPage />} />
                  <Route path="/letters/report/:id" element={<LetterReportRedirect />} />
                  <Route path="/hujjat/:slug" element={<SharedDocumentPage />} />
                  <Route path="/employee-attendance" element={<AttendancePage />} />
                  <Route path="/my-attendance" element={<MyAttendancePage />} />
                  <Route path="/hujjatlar" element={<DocumentsPage />} />
                  <Route path="/hujjatlar/edit/:id" element={<DocumentEditorPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/reports/:code" element={<ReportRunPage />} />
                  <Route path="/my-profile" element={<MyProfilePage />} />
                  <Route path="/request-permission" element={<RequestPermissionPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/texnik-yordam" element={<SupportPage />} />
                  <Route path="/chairman-tasks" element={<ChairmanTasksPage />} />
                  <Route path="/navbatchilik" element={<DutyPage />} />
                  <Route path="/yangiliklar" element={<NewsPage />} />
                  <Route path="/ijro" element={<IjroPage />} />
                  <Route path="/ish-rejasi" element={<WorkPlanPage />} />
                  <Route path="/tibbiy-korik" element={<MedicalPage />} />
                  {/* Two DIFFERENT modules that were one page until 2026-09-07:
                      `/tibbiy-korik` is the clinic's periodic register for the
                      whole organisation, `/sogliq-korigi` the nurse's daily
                      pre-shift grading of the people who may drive. */}
                  <Route path="/sogliq-korigi" element={<HealthChecksPage />} />
                  <Route path="/work-schedule-days" element={<DutyPage />} />
                  <Route path="/letters" element={<LettersPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/tabel-sozlamalari" element={<TabelSettingsPage />} />
                  <Route path="/oquv-markazi" element={<LearningPage />} />
                  <Route path="/monitoring" element={<MonitoringPage />} />
                  <Route path="/kpp" element={<KppPage />} />
                  <Route path="/kpi" element={<KpiPage />} />
                  <Route path="/malumotnomalar" element={<DictionariesPage />} />
                  <Route path="/shtat" element={<StaffPositionsPage />} />
                  <Route path="/employees/:id" element={<EmployeeProfilePage />} />
                  {/* A manager's people: the same read-only card, governed by the
                      «team» module instead of the HR-only «employees» one. */}
                  <Route path="/mening-jamoam" element={<MyTeamPage />} />
                  <Route path="/mening-jamoam/:id" element={<EmployeeProfilePage />} />
                  <Route path="/interaktiv-xizmatlar" element={<ServicesPage />} />
                  <Route path="/sozlamalar" element={<SettingsPage />} />
                  <Route path="/foydalanuvchilar" element={<UsersPage />} />
                  <Route path="/registratsiyalar" element={<RegistrationsPage />} />
                  <Route path="/registratsiya-holati" element={<RegistrationStatusPage />} />
                  <Route path="*" element={<NotFound />} />
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
