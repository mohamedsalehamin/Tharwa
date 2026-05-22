# Tharwa backend-api — Quickstart

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contract**: [contracts/openapi.yaml](./contracts/openapi.yaml)

This quickstart targets the **`backend-api/`** app inside the **`sarwa`** workspace (monorepo: specs, contracts, backend, admin). OpenAPI lives at `specs/001-tharwa-platform-mvp/contracts/openapi.yaml`; the running server also exposes **`GET /v1/openapi.yaml`** and **`GET /v1/openapi.json`** (see `backend-api/README.md`).

## Prerequisites

- Node.js 22+
- Docker (for local Postgres + Redis) or cloud equivalents

## Environment variables (`.env.example` template)

Copy to `.env` and fill values (never commit `.env`):

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://tharwa:tharwa@localhost:5432/tharwa
REDIS_URL=redis://localhost:6379
# Upstream (examples — use real provider names from research)
FX_UPSTREAM_API_KEY=
METALS_UPSTREAM_API_KEY=
EGX_UPSTREAM_API_KEY=
# Admin bootstrap (rotate after first login)
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
# Optional
ADMIN_ALLOWED_CIDRS=
```

## Local infrastructure

```bash
docker run -d --name tharwa-pg -e POSTGRES_USER=tharwa -e POSTGRES_PASSWORD=tharwa -e POSTGRES_DB=tharwa -p 5432:5432 postgres:16-alpine
docker run -d --name tharwa-redis -p 6379:6379 redis:7-alpine
```

## First implementation steps (when repo exists)

1. `npm init` / `pnpm init` with TypeScript + Fastify + Prisma.
2. `prisma migrate dev` from [data-model.md](./data-model.md) schema (generate Prisma schema in that repo).
3. Implement `GET /health` and `GET /v1/fx/rates` returning mock fixtures validated against OpenAPI; replace with real connectors.
4. Run contract check: validate HTTP responses against `contracts/openapi.yaml` in CI.

## Verify against spec

- **P1**: Anonymous `GET` for FX + metals + market summary — no auth header required.
- **FR-013**: Response `quoteCategory` never implies parallel EGP in MVP.
- **SC-002 / research**: Expose `isStale` + `asOf` when cache older than policy.

## Related products

- **`admin-dashboard/`** (in this workspace): consumes `/admin/v1/*` with admin credentials; local dev often uses root `npm run dev` (see root `package.json`).
- **`mobile-app`**: separate repository when created; consumes only `/v1/*` from deployed backend URL.
