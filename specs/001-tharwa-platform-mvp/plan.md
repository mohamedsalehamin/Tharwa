# Implementation Plan: Tharwa — Platform MVP

**Branch**: `001-tharwa-platform-mvp` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tharwa-platform-mvp/spec.md`

## Summary

Deliver **Tharwa** as three coordinated products (`backend-api`, `mobile-app`, `admin-dashboard`) with **versioned HTTP APIs** (OpenAPI in `contracts/`) and optional WebSockets later. The **backend** ingests FX (official / central bank / agreed institutional only — no parallel EGP in MVP), precious metals, and curated EGX equities; caches and normalizes; serves **anonymous read** paths for market data; reserves authenticated routes for watchlist, trade journal, and portfolio. **AdMob** is client-only (mobile), not backend. First implementation focus: **`backend-api`** health + public read endpoints + ingestion workers + Postgres/Redis; then admin auth + config APIs; then consumer auth for gated features. See [research.md](./research.md) for technology and upstream decisions.

## Technical Context

**Language/Version**: Node.js **22 LTS** + **TypeScript 5.x** (strict mode)

**Primary Dependencies**: **Fastify** (HTTP), **Prisma** (ORM), **Zod** (runtime validation aligned with OpenAPI), **ioredis** (Redis), optional **@fastify/websocket** when real-time is scheduled; job polling via **fastify** plugins + DB-backed or BullMQ+Redis when outbox needed

**Storage**: **PostgreSQL 16+** (config, users, audit, curated symbols, optional quote history); **Redis 7+** (short-TTL quote cache, rate-limit counters, optional session store for admin)

**Testing**: **Vitest** (unit) + **supertest** / Fastify inject (HTTP integration) + contract tests against **OpenAPI** (e.g. `@apidevtools/swagger-parser` or schemathesis) — **not mandatory in MVP tasks** ([tasks.md](./tasks.md)); add when product requires automated regression. **CI** (`.github/workflows/ci.yml`) runs **lint + build** for `backend-api` and `admin-dashboard` on push/PR.

**Target Platform**: Linux containers (Docker) on cloud VPS or managed container service; CI on GitHub Actions

**Project type**: **Monorepo workspace** (`sarwa`) containing **`specs/`** (source of truth for this feature), **`contracts/openapi.yaml`**, **`backend-api/`**, **`admin-dashboard/`**, and root tooling. **`mobile-app/`** remains a separate product/repository when started; it is not in this workspace yet.

**Performance goals**: Public read `GET` p95 **< 300 ms** when served from cache warm; cold upstream within SLA of spec SC-001 (5 s end-to-end is primarily client + network — backend target p95 **< 800 ms** when cache miss triggers single upstream fan-out)

**Constraints**: No secrets in git; MVP **no parallel EGP** (FR-013); rate limits on public endpoints; all upstream calls only from backend; Arabic/English copy lives in clients — API returns **machine-oriented** fields + stable `quoteCategory` / `sessionState` enums for UI labeling

**Scale/scope**: MVP thousands of DAU acceptable; horizontal scale deferred behind single-region deployment + Redis + connection pooling

## Constitution Check

*GATE: Passed for planning. Re-verified after Phase 1 artifacts below.*

- [x] **Specification first**: `spec.md` + clarifications define WHAT and acceptance paths.
- [x] **Three products**: Backend, admin UI, and mobile are separate versioned products; this workspace hosts **backend-api**, **admin-dashboard**, and **feature specs/contracts**; mobile is out of tree until its repo exists.
- [x] **API contract**: OpenAPI 3 in `contracts/openapi.yaml` (canonical under `specs/001-tharwa-platform-mvp/`); served at runtime as **`GET /v1/openapi.yaml`** and **`GET /v1/openapi.json`** from `backend-api`; URL prefix **`/v1/`** for public API; breaking changes bump major version.
- [x] **Data path**: Mobile and admin consume only backend; connectors encapsulate upstreams (see `research.md`).
- [x] **Admin & secrets**: Admin JWT + audit logging in MVP; **TOTP/2FA** recommended for production admin deployments — **post-MVP** unless tasks explicitly add it; credentials in secret manager / env injection; audit log table (see data-model).
- [x] **Privacy & transparency**: PII only on consumer/admin auth paths; market responses include `asOf`, `quoteCategory`, `sessionState` for UI disclosure.
- [x] **Dependencies & resilience**: Documented risks in `research.md`; stale cache + errors per spec edge cases.
- [x] **Performance**: Redis cache + rate limiting in plan; `/health` + connector last-success metadata for ops.
- [x] **i18n**: API locale-neutral; clients handle AR/EN/RTL per constitution.
- [x] **Quality gates**: Align tests to user stories P1–P3 when automated tests are added; use repo hooks for security-review after plan/tasks when enabled; CI enforces lint + build.
- [x] **Out of scope**: No brokerage execution; journal/portfolio are self-reported records only.

## Post-Phase-1 Constitution Check

- [x] **Data model** separates admin vs consumer vs market config (`data-model.md`).
- [x] **Contracts** expose only backend surfaces; no external provider URLs to clients.
- [x] **Quickstart** documents env secrets and local Docker for Postgres/Redis.

## Project structure

### Documentation (this feature)

```text
specs/001-tharwa-platform-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── spec.md
├── checklists/
│   └── requirements.md
└── tasks.md              # dependency-ordered implementation tasks (/speckit-tasks)
```

### Source code — `backend-api/` (in this workspace)

```text
backend-api/
├── package.json
├── tsconfig.json
├── Dockerfile            # build context: monorepo root (see backend-api/README.md)
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── contracts/            # populated in Docker image; optional locally
│   └── openapi.yaml
├── src/
│   ├── app.ts
│   ├── config/
│   │   └── env.ts
│   ├── routes/
│   │   ├── health.ts
│   │   ├── v1/
│   │   │   ├── market.ts
│   │   │   ├── stocks-*.ts
│   │   │   ├── auth.ts
│   │   │   ├── watchlist.ts
│   │   │   ├── journal.ts
│   │   │   ├── portfolio.ts
│   │   │   └── openapi-doc.ts   # GET /v1/openapi.{yaml,json}
│   │   └── admin/
│   ├── services/
│   ├── lib/
│   └── jobs/
└── tests/                  # optional; not gated in MVP tasks
```

### Source code — `admin-dashboard/` (in this workspace)

- **admin-dashboard**: Next.js; proxies dev API; consumes **`/admin/v1/*`** with bearer auth; TOTP/OIDC per deployment can follow constitution recommendations.

### Source code — `mobile-app/` (not in workspace yet)

- **mobile-app**: React Native (Expo optional per constitution); consumes `GET /v1/*` and contract at `/v1/openapi.json`; AdMob in client; no upstream keys.

**Structure decision**: **`sarwa`** is the **specification and contract source of truth** plus **backend** and **admin** implementations. **Mobile** ships from its own repo when created. Generated clients may be published from `openapi.yaml` later (optional npm package).

## Phase 0 & Phase 1 artifacts

| Artifact | Path | Purpose |
|-----------|------|---------|
| Research | [research.md](./research.md) | Resolved technology and upstream choices |
| Data model | [data-model.md](./data-model.md) | PostgreSQL entities and relationships |
| API contract | [contracts/openapi.yaml](./contracts/openapi.yaml) | Public + initial admin surfaces |
| Quickstart | [quickstart.md](./quickstart.md) | Local backend dev and verification |

## Backend delivery order (for `/speckit-tasks`)

1. **Bootstrap** `backend-api`: Fastify, config, logging, `/health`, **`GET /v1/openapi.yaml`** + **`GET /v1/openapi.json`** (YAML source: `specs/.../contracts/openapi.yaml` or `OPENAPI_SPEC_PATH`).
2. **Data layer**: Prisma schema from `data-model.md`; migrations; Redis wiring.
3. **Public read API**: Implement `contracts/openapi.yaml` paths for FX + metals + market summary (P1).
4. **Connectors**: FX institutional connector + metals connector with tests mocked (when tests are added).
5. **EGX curated list + quote + history** (P2) behind same version prefix.
6. **Admin APIs**: auth, CRUD symbols, toggles, upstream encrypted config, health read model.
7. **Consumer auth** (MVP: email + password per [tasks.md](./tasks.md)) + watchlist + journal tables.
8. **WebSocket** (optional milestone): subscribe by instrument id after REST stable.

## Complexity tracking

No constitution violations requiring justification.
