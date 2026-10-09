# Uzgidro HR — Frontend v2 (TypeScript)

A ground-up rewrite of the HR web app in **React + TypeScript + Vite + Tailwind**,
with a fully centralized, theme-aware design system (light + dark) and a
responsive shell (mobile / tablet / desktop).

> Runs alongside the existing `hrm-frontend` (v1). Nothing in v1 is touched.

## Stack

- **React 18 + TypeScript + Vite**
- **Tailwind CSS** mapped to CSS-variable design tokens (single source of truth)
- **TanStack Query** for server state, **Zustand** for local/session state
- **axios** client with automatic token refresh + branch-scope injection
- **recharts** for charts, **lucide-react** for icons

## The design system (one place to rule them all)

All colors, fonts, radii and shadows are CSS variables defined **once** in
[`src/styles/theme.css`](src/styles/theme.css) — for both light and dark. Tailwind
(`tailwind.config.js`) maps semantic utilities onto them:

```
bg-surface  text-fg  text-fg-muted  border-line  text-brand
bg-brand-soft  shadow-md  rounded-xl  font-sans  bg-success-soft …
```

Change a token in `theme.css` → the whole app (light **and** dark) re-themes.
**Components never hardcode a hex value.** The active theme is toggled by
`ThemeProvider` via the `data-theme` attribute on `<html>` (applied pre-paint in
`index.html` to avoid a flash).

## Structure

```
src/
  api/           axios client, endpoints, http helpers, query client, token storage
  auth/          roles (typed), branch helpers, ProtectedRoute
  components/
    ui/          design-system primitives (Card, Button, Badge, Avatar, …)
    layout/      AppShell, Sidebar, Header, BranchSelector, navConfig, …
  features/
    dashboard/   attendance normalization + dashboard widgets
  hooks/         auth, branches, notifications, media query, debounce, …
  pages/         LoginPage, DashboardPage, PlaceholderPage
  store/         auth / branch / ui (zustand)
  styles/        theme.css (tokens) + global.css
  theme/         ThemeProvider
  types/         domain + dashboard types
```

## Develop

```bash
npm install
npm run dev        # http://localhost:3001  (proxies /api → hr-api.uzgidro.uz)
```

## Build

```bash
npm run build      # tsc -b && vite build  → dist/
npm run typecheck  # types only
```

## Deploy (Docker + nginx, same pattern as v1)

```bash
docker compose build && docker compose up -d
```

The image bakes `VITE_BASE_URL` at build time (see `docker-compose.yml`).

## Migration status

Phase 1 (this pass): design system, responsive shell (sidebar + header +
branch selector), auth/API layer, **Login**, and the **Kadr dashboard** — the
old geographic map is removed and replaced by the employee attendance table;
branch selection now lives in the header. Remaining v1 pages render a
placeholder and are migrated in later phases.
