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
| `npm start` | Same as preview on **0.0.0.0:3001** (aaPanel Node start command after `npm run build`) |

## Production (aaPanel)

The admin is a static Vite SPA. Choose one deployment style:

### Option A — nginx serves `dist/` (recommended)

No Node process on port 3001. Build once, nginx serves files:

```bash
cd admin-dashboard
cp .env.example .env   # set VITE_API_BASE=https://api.thrwa.co before build
npm install
npm run build
```

Nginx site config (replace the `proxy_pass` block):

```nginx
root /www/wwwroot/7aduta.com/Tharwa/admin-dashboard/dist;
index index.html;

location / {
    try_files $uri $uri/ /index.html;
}
```

Rebuild after changing any `VITE_*` variable (values are baked into the bundle at build time).

### Option B — aaPanel Node project on port 3001

Keep your existing nginx `proxy_pass http://127.0.0.1:3001`, but the Node app must be running:

1. **Start command:** `npm start` (runs `vite preview` on port **3001** — not the default 4173).
2. **Run after every deploy:** `npm install && npm run build &&` restart the Node project.
3. Ensure `.env` exists in the project root with `VITE_API_BASE=https://api.thrwa.co` **before** `npm run build`.

If you still see **502**, the process is not listening on 3001 — check aaPanel Node logs and run on the server:

```bash
curl -I http://127.0.0.1:3001/
```
