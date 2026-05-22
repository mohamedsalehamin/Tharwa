# Tasks: Tharwa — Platform MVP

**Input**: Design documents from `/specs/001-tharwa-platform-mvp/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Not requested in spec — no mandatory TDD tasks; add tests ad hoc in polish if desired.

**Organization**: Phases by dependency order; user-story phases use **[USn]** labels. Paths use **`backend-api/`** as the separate repository root per [plan.md](./plan.md). `mobile-app/` and `admin-dashboard/` tasks are deferred until backend public + admin APIs are stable unless noted.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallel-safe (different files, no ordering dependency within the same checkpoint)
- **[USn]**: User Story *n* from [spec.md](./spec.md)

---

## Phase 1: Setup (repository bootstrap)

**Purpose**: Create `backend-api` project skeleton aligned with [plan.md](./plan.md).

- [x] T001 Create Node project manifest with scripts (`dev`, `build`, `start`, `migrate`) in `backend-api/package.json`
- [x] T002 Add TypeScript compiler options (strict) in `backend-api/tsconfig.json`
- [x] T003 [P] Add ESLint configuration in `backend-api/eslint.config.mjs`
- [x] T004 [P] Add Prettier config in `backend-api/prettier.config.mjs`
- [x] T005 [P] Add container build file in `backend-api/Dockerfile`
- [x] T006 Copy environment variable template from [quickstart.md](./quickstart.md) into `backend-api/.env.example`

---

## Phase 2: Foundational (blocking all user stories)

**Purpose**: Runtime, persistence, and HTTP shell — **no user story work before this checkpoint**.

- [x] T007 Add Fastify, Prisma, Zod, ioredis, pino dependencies and lockfile in `backend-api/package.json`
- [x] T008 Define full Prisma schema (Instrument, QuoteSnapshot, UpstreamConnection, AdminUser, AdminAuditLog, ConsumerUser, WatchlistItem, TradeJournalEntry) in `backend-api/prisma/schema.prisma`
- [x] T009 Create initial SQL migration in `backend-api/prisma/migrations/0001_init/migration.sql`
- [x] T010 Implement Zod-validated environment loader in `backend-api/src/config/env.ts`
- [x] T011 [P] Implement structured logger setup in `backend-api/src/lib/logger.ts`
- [x] T012 [P] Implement Redis client factory in `backend-api/src/lib/redis.ts`
- [x] T013 [P] Implement shared error types + reply mapper in `backend-api/src/lib/errors.ts`
- [x] T014 Build Fastify instance registration (plugins, prefix `/v1`) in `backend-api/src/app.ts`
- [x] T015 Create HTTP entrypoint listening on `PORT` in `backend-api/src/server.ts`
- [x] T016 Implement `GET /health` with Postgres + Redis checks per OpenAPI in `backend-api/src/routes/health.ts`
- [x] T017 Add `@fastify/cors` (or manual CORS) configuration for known admin/mobile origins in `backend-api/src/plugins/cors.ts`

**Checkpoint**: `pnpm dev` (or npm) serves `GET /health` locally against Docker Postgres/Redis from [quickstart.md](./quickstart.md).

---

## Phase 3: User Story 1 — FX, metals, home summary (Priority: P1) — MVP

**Goal**: Anonymous read of official-category FX vs EGP, metals in EGP, compact market summary + quote metadata (`asOf`, `isStale`, `quoteCategory`, `sessionState`) + disclaimer payload.

**Independent Test**: Call `GET /v1/fx/rates`, `GET /v1/metals`, `GET /v1/market/summary` without auth; verify shapes match `specs/001-tharwa-platform-mvp/contracts/openapi.yaml` and FR-013/FR-014.

- [x] T018 [P] [US1] Implement FX upstream HTTP connector (institutional category only) in `backend-api/src/services/connectors/fx.ts`
- [x] T019 [P] [US1] Implement metals upstream HTTP connector in `backend-api/src/services/connectors/metals.ts`
- [x] T020 [US1] Implement cache + stale policy (90s target refresh, 300s stale flag) in `backend-api/src/services/quotes.ts`
- [x] T021 [US1] Implement `GET /v1/fx/rates` route handler in `backend-api/src/routes/v1/market.ts` (grouped v1 market routes)
- [x] T022 [US1] Implement `GET /v1/metals` route handler in `backend-api/src/routes/v1/market.ts`
- [x] T023 [US1] Implement `GET /v1/market/summary` route handler in `backend-api/src/routes/v1/market.ts`
- [x] T024 [US1] Add disclaimer string keys / constants for AR+EN responses in `backend-api/src/i18n/disclaimers.ts`
- [x] T025 [US1] Wire v1 routes into app registration in `backend-api/src/app.ts`

**Checkpoint**: US1 complete — mobile can integrate read-only prices for MVP demo.

---

## Phase 4: User Story 2 — Egyptian equities list, detail, history (Priority: P2)

**Goal**: Curated EGX symbols from DB; list, detail, daily history ranges; session semantics for market closed.

**Independent Test**: Seed `Instrument` rows (`kind=equity`); hit `GET /v1/stocks`, `GET /v1/stocks/{symbol}`, `GET /v1/stocks/{symbol}?range=1m` without auth.

- [x] T026 [P] [US2] Implement EGX session classifier helper in `backend-api/src/services/session-egx.ts`
- [x] T027 [US2] Implement equities upstream connector (isolated, feature-flagged) in `backend-api/src/services/connectors/equities.ts`
- [x] T028 [US2] Implement `GET /v1/stocks` curated list handler in `backend-api/src/routes/v1/stocks-curated.ts`
- [x] T029 [US2] Implement `GET /v1/stocks/:symbol` detail handler in `backend-api/src/routes/v1/stocks-curated.ts`
- [x] T030 [US2] Implement `GET /v1/stocks/:symbol/history` OHLCV handler in `backend-api/src/routes/v1/stocks-curated.ts`

**Checkpoint**: US2 complete — equities area can ship after US1 without breaking FX/metals.

---

## Phase 5: User Story 3 — Internal administration (Priority: P2)

**Goal**: Admin auth (JWT), audit logging, upstream + instrument management, connector status visibility.

**Independent Test**: Login as admin; mutate upstream + symbol visibility; verify `AdminAuditLog` rows and `GET /admin/v1/upstreams` reflects `lastSuccessAt`.

- [x] T031 [US3] Implement password verify + bcrypt hashing utilities in `backend-api/src/services/password.ts`
- [x] T032 [US3] Implement JWT access token issuance in `backend-api/src/services/admin-jwt.ts` (tasks referred to `admin-auth.ts`; refresh tokens optional / not implemented)
- [x] T033 [US3] Implement `POST /admin/v1/auth/login` in `backend-api/src/routes/admin/v1.ts`
- [x] T034 [US3] Implement audit log writer in `backend-api/src/services/admin-audit.ts` (invoked from admin routes; not a separate `plugins/audit.ts`)
- [x] T036 [US3] Instrument admin APIs in `backend-api/src/routes/admin/v1.ts` (`GET` + `PATCH /admin/v1/instruments`, `PATCH /admin/v1/instruments/:id`)
- [x] T037 [US3] `GET /admin/v1/upstreams` in `backend-api/src/routes/admin/v1.ts`
- [x] T038 [US3] Mount `/admin/v1` with bearer guard in `backend-api/src/app.ts` (`admin-bearer` + `adminV1Routes`)
- [x] T035 [US3] Upstream admin in `backend-api/src/routes/admin/v1.ts`: `GET/POST /admin/v1/upstreams`, `PATCH/DELETE /admin/v1/upstreams/:id` (`config` JSON + opaque `secretRef` for KMS/env key names — **do not** store raw API secrets in DB in production).

**Checkpoint**: US3 complete — operators can run product without redeploying mobile for list changes.

---

## Phase 6: User Story 4 — Watchlist (signed-in) (Priority: P3)

**Goal**: Persisted watchlist per `ConsumerUser`; anonymous receives 401/redirect hint per FR-015.

**Independent Test**: Register/login consumer; CRUD watchlist endpoints; anonymous denied.

- [x] T039 [US4] Consumer password signup/login in `backend-api/src/services/consumer-auth.ts` + `consumer-jwt.ts`
- [x] T040 [US4] `POST /v1/auth/register` and `POST /v1/auth/login` in `backend-api/src/routes/v1/auth.ts`
- [x] T041 [US4] Watchlist routes in `backend-api/src/routes/v1/watchlist.ts` (`GET/POST /v1/watchlist`, `DELETE /v1/watchlist/items/:id`, `PATCH /v1/watchlist/reorder`)
- [x] T042 [US4] Bearer guard in `backend-api/src/plugins/consumer-bearer.ts`

**Checkpoint**: US4 complete — signed-in mobile can sync watchlist.

---

## Phase 7: User Story 5 — Trade journal & portfolio (signed-in) (Priority: P3)

**Goal**: User-authored journal lines + derived portfolio summary; no broker execution endpoints.

**Independent Test**: POST journal lines; GET portfolio summary matches manual calculation for fixture data.

- [x] T043 [US5] Journal validators in `backend-api/src/services/journal-validation.ts`
- [x] T044 [US5] `POST/GET/PATCH/DELETE /v1/journal` in `backend-api/src/routes/v1/journal.ts`
- [x] T045 [US5] Portfolio aggregation in `backend-api/src/services/portfolio.ts`
- [x] T046 [US5] `GET /v1/portfolio/summary` in `backend-api/src/routes/v1/portfolio.ts`

**Checkpoint**: US5 complete — advanced tab authenticated flows backed.

---

## Phase 8: Polish & cross-cutting

**Purpose**: Jobs, limits, contract sync, OpenAPI discovery endpoints, docs.

- [x] T047 [P] Upstream poll placeholder in `backend-api/src/jobs/poll-upstreams.ts` (wire from worker/cron later)
- [x] T048 [P] MVP rate limit for `/v1/auth/*` in `backend-api/src/plugins/auth-rate-limit.ts` + `plugins/rate-limit.ts`
- [x] T049 [P] Placeholder `backend-api/src/plugins/openapi-validator.ts` — strict response validation not wired; enable when contract tests require it
- [x] T050 Sync `specs/001-tharwa-platform-mvp/contracts/openapi.yaml` with consumer, watchlist, journal, portfolio, admin upstream CRUD
- [x] T051 Operator + developer README updates in `backend-api/README.md`
- [x] T052 Manual validation template in `backend-api/docs/validation-notes.md`
- [x] T053 [P] Serve `GET /v1/openapi.yaml` + `GET /v1/openapi.json` from canonical spec path (`src/lib/openapi-spec-path.ts`, `src/routes/v1/openapi-doc.ts`); Docker copies spec from monorepo (`backend-api/Dockerfile`); document `OPENAPI_SPEC_PATH` in `.env.example`

---

## Dependencies & execution order

### Phase dependencies

| Phase | Depends on | Blocks |
|-------|----------------|--------|
| 1 Setup | — | Phase 2 |
| 2 Foundational | Phase 1 | All user stories |
| 3 US1 | Phase 2 | — |
| 4 US2 | Phase 2 (US1 optional for demo order) | — |
| 5 US3 | Phase 2 | — |
| 6 US4 | Phase 2 | — |
| 7 US5 | US4 (consumer accounts) | — |
| 8 Polish | Phases 3–7 as needed | release hardening |

### User story dependencies

- **US1**: After Phase 2 only.
- **US2**: After Phase 2; uses shared `quotes`/cache patterns from US1 — implement after T020–T025 for least rework, or stub cache interface first.
- **US3**: After Phase 2; independent of US1 read paths except shared DB.
- **US4**: After Phase 2; introduces consumer auth.
- **US5**: After US4 (needs `ConsumerUser`).

### Parallel opportunities

- T003–T006 (setup tooling) in parallel.
- T011–T013 (lib files) in parallel.
- T018–T019 (connectors US1) in parallel.
- T026 + later US2 work can start in parallel with US1 polish if staffing allows (watch for `quotes.ts` merge conflicts).
- T047–T049 (polish) in parallel after routes stable.
- T053 (OpenAPI doc routes) with any v1 route work; no extra deps on other polish tasks.

### Parallel example: User Story 1 connectors

```text
T018  backend-api/src/services/connectors/fx.ts
T019  backend-api/src/services/connectors/metals.ts
```

---

## Implementation strategy

### MVP first (US1 only)

1. Complete Phase 1–2.
2. Complete Phase 3 (US1).
3. Stop — validate anonymous FX/metals/summary vs [spec.md](./spec.md) SC-001/SC-002/SC-003 semantics and [contracts/openapi.yaml](./contracts/openapi.yaml).

### Incremental delivery

1. US1 → demo to stakeholders.
2. US2 → equities.
3. US3 → operations ready.
4. US4 → engagement.
5. US5 → power users.

### Task counts

| Story | Task IDs | Count |
|-------|-----------|-------|
| Setup | T001–T006 | 6 |
| Foundational | T007–T017 | 11 |
| US1 | T018–T025 | 8 |
| US2 | T026–T030 | 5 |
| US3 | T031–T038 | 8 |
| US4 | T039–T042 | 4 |
| US5 | T043–T046 | 4 |
| Polish | T047–T053 | 7 |
| **Total** | | **53** |

---

## Notes

- **OpenAPI** in `specs/001-tharwa-platform-mvp/contracts/openapi.yaml` is canonical; extend in **T050** when new routes ship.
- **EGX connector** risk: document failure modes in `backend-api/README.md` (constitution VII).
- **Mobile AdMob** (FR-016) is **not** backend work — track in `mobile-app/` tasks when that repo exists.
- Commit after each task or logical group; use feature branch `001-tharwa-platform-mvp` in `sarwa` for spec edits; backend and admin live in the same workspace as specs.
