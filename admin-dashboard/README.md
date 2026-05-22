# Tharwa admin dashboard

Internal administration UI for the Tharwa platform, based on [shadcn-admin](https://github.com/satnaing/shadcn-admin) (Vite + React + Shadcn UI + TanStack Router).

## Stack

- **UI:** Shadcn UI, Tailwind CSS v4
- **Routing:** TanStack Router (file-based)
- **Auth:** `POST /admin/v1/auth/login` → JWT bearer; roles `superadmin` | `operator`
- **API:** `backend-api` at `/admin/v1/*` (see OpenAPI in `specs/001-tharwa-platform-mvp/contracts/openapi.yaml`)

## Run locally

From the **sarwa** repo root (starts API + admin together):

```bash
npm install
npm run dev
```

Or two terminals:

```bash
npm run dev --prefix backend-api    # port 3000
npm run dev --prefix admin-dashboard # port 3001
```

Dev sign-in: **`admin@localhost.com`** / **`ChangeMe!Admin123`** (see `backend-api` README).

## Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE` | Production/preview: browser calls this API origin |
| `VITE_BACKEND_PROXY_TARGET` | Dev: Vite proxies `/__tharwa_api` here (default `http://127.0.0.1:3000`) |
| `VITE_SENTRY_DSN` | Optional Sentry DSN — captures React errors and failed admin API calls |

Create a separate Sentry project (e.g. `tharwa-admin`) from the API and mobile apps.

## Routes

| Path | Access |
|------|--------|
| `/sign-in` | Public |
| `/` | Upstream health + cache recovery |
| `/instruments` | Equities, FX pairs, metals + karat rules |
| `/users` | Consumer accounts (read-only) |
| `/activity` | Admin audit log (read-only, filterable) |
| `/push` | FCM broadcast |
| `/settings/integrations` | **superadmin** — FCM credentials |

## Roles

| Role | Capabilities |
|------|----------------|
| **operator** | View data; patch instruments; toggle upstream `enabled` |
| **superadmin** | All operator actions + upstream create/delete, FCM integrations |

Backend enforces the same rules (`403` when insufficient).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite on port **3001** with API proxy |
| `npm run build` | Typecheck + production bundle |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |
