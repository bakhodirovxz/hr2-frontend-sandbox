# features/dashboard

## Live code

- `nocturne/` — **the boards that ship** (2026-08-25). Two screens ported from
  the dashboard design mock-ups: `HrDashboard` ("HR Dashboard v2") and
  `EmployeeDashboard` ("Xodim Dashboard"). `pages/DashboardPage.tsx` picks one
  by role.
- `attendance.ts` — turnstile events + category lists → one row per employee,
  the counts, and the status badge. Shared by everything on both boards.
- `useDashboard.ts` — the branch's day (rows, counts, events, birthdays).
- `useKadrBlocks.ts` — the branch scope (`useDashboardBranchId`) and the
  lateness ranking (`useDiscipline`).

## Retired — PROPUSK board (2026-07 … 2026-08-25)

Deleted on 2026-09-08. These components belonged to the gate-board rendition
of this page and had not been mounted anywhere since the nocturne boards
landed; they were kept only because this directory was not under version
control at the time. It is now, so they live in git history instead:

`ArrivalFlowCard` · `AttendanceTable` · `AwayBlock` · `BirthdaysCard` ·
`ConsoleBand` · `DayDial` · `DayLane` · `DepartmentsCard` · `DisciplineBlock` ·
`GateBand` · `MyDepartmentCard` · `PassLog` · `ProjectsCard` · `QuickActions` ·
`RecentActivity` · `StaffingBlock` · `StatCard` · `StatusBadge` · `StatusBand` ·
`useDepartmentsAttendance.ts` · `useMyDepartmentRows.ts` · `useMyProjects.ts`
· `useKadrBlocks#useStaffing` · `useKadrBlocks#useAwayPlan`

Their i18n keys are still in `src/i18n/uz.ts` under `dashboard.*` and several
are reused by the new boards — do not sweep that section by "unused key".
