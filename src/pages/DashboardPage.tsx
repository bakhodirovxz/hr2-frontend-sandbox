import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { CenteredSpinner } from '@/components/ui/Spinner'
import * as roles from '@/auth/roles'
import { useBoardPrime } from '@/features/dashboard/boardPrime'
import { HrDashboard } from '@/features/dashboard/nocturne/HrDashboard'
import { EmployeeDashboard } from '@/features/dashboard/nocturne/EmployeeDashboard'
import { Navigate } from 'react-router-dom'
import { RegistrationStatusPage } from '@/pages/RegistrationStatusPage'

/**
 * BOSH SAHIFA — one board per kind of reader.
 *
 * Replaces the PROPUSK gate board (2026-08-25) with the two NOCTURNE screens
 * the user commissioned in Claude Design (project afd32a12): "HR Dashboard v2"
 * and "Xodim Dashboard". A single generic home page serves nobody, so the
 * split the old board made with conditional sections is made here instead,
 * with two whole screens:
 *
 *   · the PERSONNEL APPARATUS — kadr, master admin, leadership, a supervisor,
 *     buxgalteriya — opens on the branch: the live register, what is late and
 *     whose it is, the roster's shape;
 *   · everyone else opens on THEIR OWN day, with the branch roster one tab
 *     away.
 *
 * The MONITORING OPERATOR now goes to the wall board — watching the branch IS
 * its job, and the personal board read empty for it. KPP still falls into the
 * KPP now opens on its own post board for the same reason.
 *
 * A GUEST (TZ 4.2.2 — registered, identity not yet confirmed) gets neither:
 * both boards read from an employee record they do not have, so every panel
 * would render empty. Their home is the status of their own application.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  /**
   * ⚠️ WAIT FOR THE BRANCH DECISION BEFORE MOUNTING A BOARD.
   *
   * `useBranchInit` settles the branch in an EFFECT, i.e. after the first
   * render. Every panel below is branch-scoped, so mounting them first sent
   * the whole board out unscoped and then again, scoped, a tick later.
   *
   * Measured with Playwright on this page: 70 requests / 3.31 MB, about half
   * of them the same call twice — and the unscoped `employees-by-category`
   * alone was 2.5 MB, the WHOLE organisation, thrown away on arrival.
   *
   * Gating here rather than on each query keeps it to one place and covers
   * panels added later.
   */
  const branchReady = useBranchStore((s) => s.branchReady)
  // The board's fifteen statistics arrive in ONE request and are written into
  // the panels' own query caches before the panels mount — see `boardPrime.ts`.
  // Gated the same way as `branchReady`, for the same reason: a panel that
  // mounts first fires its own request and the aggregate becomes a duplicate.
  const primed = useBoardPrime(branchReady && !roles.isGuest(user))

  if (roles.isGuest(user)) return <RegistrationStatusPage />
  if (!branchReady || !primed) return <CenteredSpinner />

  // DEVONXONA opens on the register, as in v1: the personal board reads from a
  // supervisor and a team they have neither of, so it rendered near-empty for
  // the one role that has a queue waiting for it.
  if (roles.isAnyChancellery(user) && !roles.isMasterAdmin(user)) {
    return <Navigate to="/orders" replace />
  }

  /**
   * ACCOUNTS WITH NO EMPLOYEE ROW GET A BOARD THEY CAN READ.
   *
   * Both screens below are built out of an employee record, so a login without
   * one rendered every panel empty — the branch AKT admin landed on a personal
   * board showing nothing at all. v1 sends it straight to Filiallar, which is
   * the only group of pages it is meant to use.
   *
   * The monitoring operator has the opposite problem: the wall board IS its
   * job, and the personal board tells it nothing.
   */
  if (roles.isBranchAdmin(user)) return <Navigate to="/filiallar" replace />
  /*
   * ⚠️ ACCOUNT TYPE, not just the multi-org role. `isMonitoringOperator` only
   * looks at `multi_org_employee_role`, so a KPP/monitoring KIOSK account — no
   * employee card at all — fell past every branch here and landed on the
   * PERSONAL employee board, which has nothing to draw for it. The post's own
   * watch screen is its home.
   */
  if (roles.isSeparateAccount(user))
    return <Navigate to={roles.getRoleKey(user) === 'kpp' ? '/kpp' : '/monitoring'} replace />
  if (roles.isMonitoringOperator(user)) return <Navigate to="/monitoring" replace />
  // KPP mehmonlar bilan ishlaydi, o'z davomati bilan emas — posti bosh sahifasi.
  if (roles.getRoleKey(user) === 'kpp') return <Navigate to="/kpp" replace />

  // KUZATUVCHI and NAZORATCHI watch other people's attendance — that IS their
  // job, so the personnel board is their home. Measured before this: the
  // dashboard-viewer landed on a personal board showing "— / Foydalanuvchi /
  // Lavozim kiritilmagan", i.e. nothing at all.
  const isApparatus =
    roles.hasDashboardHome(user) ||
    roles.isHR(user) ||
    roles.isMasterAdmin(user) ||
    roles.isLeadership(user) ||
    // A LINE MANAGER (someone reports to them) — `/me.is_line_manager`, the
    // server's own rule for the board's endpoints. It used to be
    // `hasSupervisor` (the person HAS a boss), i.e. every rank-and-file
    // employee with a supervisor got the HR board and its 403s (crawl
    // 2026-09-24: kpi-sheets / roster-composition).
    roles.canSeeTeam(user) ||
    roles.isDeputy(user) ||
    roles.isAccounting(user)

  // No branch map here — by the user's decision (2026-09-11). A map earns its
  // place only where a POSITION is the answer to a question: which gate an
  // employee walked through (attendance day detail, `TurnstileMap`) and where a
  // vehicle went (GPS track, `LazyRouteMap`). A pin per branch on the home
  // page answered nothing and cost 1.45 MB of maplibre to say so.
  return isApparatus ? <HrDashboard /> : <EmployeeDashboard />
}
