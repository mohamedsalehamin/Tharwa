# Tasks: Wealth Planning Core (تخطيط تكوين الثروة)

**Input**: Design documents from `/specs/002-wealth-planning-core/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.wealth.yaml](./contracts/openapi.wealth.yaml), [quickstart.md](./quickstart.md)

**Tests**: Limited — the spec did not request full TDD, but [plan.md](./plan.md) requires **unit tests for money/projection/real-return math**. Only those pure-function unit tests are included; route/integration tests are optional (add ad hoc).

**Organization**: Phases by dependency order. User-story phases use **[USn]** labels mapping to [spec.md](./spec.md). This feature is **additive** to two existing products — paths use `backend-api/` and `mobile-app/` per [plan.md](./plan.md). No monorepo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallel-safe (different files, no ordering dependency within the checkpoint)
- **[USn]**: User Story *n* from [spec.md](./spec.md)

---

## Phase 1: Setup (shared, light — additive feature)

**Purpose**: Stage the contract and localization scaffolding the stories build on.

- [x] T001 Merge the additive paths, schemas, `AdminAuth` security scheme, and parameters from `specs/002-wealth-planning-core/contracts/openapi.wealth.yaml` into the canonical contract `specs/001-tharwa-platform-mvp/contracts/openapi.yaml`
- [x] T002 [P] Add empty i18n namespaces `networth`, `goals`, `realReturn` (placeholder keys) to `mobile-app/src/i18n/locales/ar.json` and `mobile-app/src/i18n/locales/en.json`

---

## Phase 2: Foundational (BLOCKING — must complete before any user story)

**Purpose**: Persistence layer all three stories depend on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T003 Add enums `NetWorthComponentKind`, `NetWorthCategory`, `FinancialGoalStatus`, `GoalSavedSource` to `backend-api/prisma/schema.prisma` per [data-model.md](./data-model.md)
- [x] T004 Add models `ManualNetWorthComponent`, `NetWorthSnapshot`, `FinancialGoal`, `InflationBenchmark` and the new relations on `ConsumerUser` to `backend-api/prisma/schema.prisma`
- [x] T005 Create and apply migration `wealth_planning_core` and regenerate the client (`npx prisma migrate dev --name wealth_planning_core && npx prisma generate`) in `backend-api/`
- [x] T006 [P] Implement a shared EGP conversion helper (uses existing `getFxRatesCached`, returns value + `asOf` + `isStale`) in `backend-api/src/lib/egp-convert.ts`

**Checkpoint**: Schema migrated; client typed; EGP conversion helper available.

---

## Phase 3: User Story 1 — Unified net worth + history (Priority: P1) 🎯 MVP

**Goal**: One net worth total (derived holdings + manual components − liabilities), category breakdown, monthly history curve, freshness, and disclaimer.

**Independent Test**: With a consumer token, create one manual asset and one liability, call `GET /v1/networth` (total = assets − liabilities + breakdown + freshness), `POST` then `GET /v1/networth/snapshots`, and confirm the mobile Net Worth screen renders total, breakdown, history, and disclaimer.

### Implementation for User Story 1

- [x] T007 [P] [US1] Define Zod validation for manual-component create/update in `backend-api/src/services/net-worth-components.ts`
- [x] T008 [US1] Implement manual-components CRUD service (list/create/update/delete, ownership-scoped, EGP conversion per item) in `backend-api/src/services/net-worth-components.ts` (depends on T006)
- [x] T009 [US1] Implement net-worth aggregation service — combine `buildPortfolioSummary` derived positions (equities + metals) with manual components, subtract liabilities, return total/assets/liabilities/breakdown/freshness/disclaimer; **never query SimAccount/SimTrade** — in `backend-api/src/services/net-worth.ts` (depends on T008, reuse `services/portfolio.ts`, `quotes.ts`)
- [x] T010 [US1] Implement snapshots service — idempotent monthly upsert on `[consumerUserId, periodMonth]` freezing `usdEgpRate`/`goldGramEgp`/`inflationIndex` anchors, plus list with `changeFromPrevPct` — in `backend-api/src/services/net-worth-snapshots.ts` (depends on T009)
- [x] T011 [US1] Implement the monthly snapshot job (iterate active consumers, capture current month) in `backend-api/src/jobs/capture-networth-snapshots.ts` and wire it into the existing job scheduler
- [x] T012 [US1] Implement consumer routes (`GET /v1/networth`; `GET/POST/PUT/DELETE /v1/networth/components`; `GET/POST /v1/networth/snapshots`) behind `consumerBearerPreHandler` in `backend-api/src/routes/v1/net-worth.ts`
- [x] T013 [US1] Register `v1NetWorthRoutes` under prefix `/v1` in `backend-api/src/app.ts`
- [x] T014 [P] [US1] Unit tests for EGP conversion, aggregation (assets − liabilities, negative net worth), and `changeFromPrevPct` in `backend-api/tests/net-worth.test.ts`
- [x] T015 [P] [US1] Implement mobile API client (networth summary, components CRUD, snapshots) in `mobile-app/src/api/networth.ts`
- [x] T016 [P] [US1] Implement presentational components `NetWorthBreakdown` and `NetWorthHistoryChart` (reuse `Card`, `ChangeBadge`, `PriceSparkline`) in `mobile-app/src/components/`
- [x] T017 [US1] Implement `mobile-app/src/screens/NetWorthScreen.tsx` (total, breakdown, history curve, `DataFreshnessBanner`, disclaimer, sign-in gate via `fetchWithLastKnown`)
- [x] T018 [US1] Implement `mobile-app/src/screens/ManualAssetFormScreen.tsx` (create/edit/delete manual asset or liability with category + currency)
- [x] T019 [US1] Add navigation entries (`MainStackNavigator.tsx` + a "Wealth/ثروتي" entry from Portfolio area or More) and net-worth i18n copy (AR default/RTL + EN) in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Net worth + history fully functional and independently testable.

---

## Phase 4: User Story 2 — Financial goals (Priority: P1)

**Goal**: Create goals with a transparent no-assumed-return required monthly saving, progress tracking, edge-case states, and an optional clearly-labeled illustrative scenario.

**Independent Test**: With a consumer token, create a goal (target + date); confirm `requiredMonthlyEgp = max(0, target − currentSaved) / max(1, whole months remaining)`, progress/percent, past-due and achieved states, and that the mobile Goals screens render these with disclaimers.

### Implementation for User Story 2

- [x] T020 [P] [US2] Implement goal pure math (required monthly, progress %, months remaining, status `active/achieved/past_due`, **pace-based `onTrack`** per data-model.md, optional `illustrativeScenario`) in `backend-api/src/services/financial-goals.ts`
- [x] T021 [US2] Implement goals CRUD service resolving `currentSaved` by `savedSource` (`manual` / `net_worth` / `category`, reusing `services/net-worth.ts`) in `backend-api/src/services/financial-goals.ts` (depends on T020, and on T009 for net_worth/category sources)
- [x] T022 [US2] Implement consumer routes (`GET/POST /v1/goals`, `PUT/DELETE /v1/goals/{id}`, with `totalRequiredMonthlyEgp`) behind `consumerBearerPreHandler` in `backend-api/src/routes/v1/goals.ts` and register in `backend-api/src/app.ts`
- [x] T023 [P] [US2] Unit tests for required-saving (no assumed return), divide-by-zero/past-due, achieved cap at 100%, **pace-based `onTrack` (ahead/behind/achieved)**, and illustrative-scenario labeling in `backend-api/tests/financial-goals.test.ts`
- [x] T024 [P] [US2] Implement mobile API client for goals in `mobile-app/src/api/goals.ts`
- [x] T025 [US2] Implement `mobile-app/src/screens/GoalsScreen.tsx` (list with progress, months remaining, on-track indicator, total required monthly, disclaimer)
- [x] T026 [US2] Implement `mobile-app/src/screens/GoalFormScreen.tsx` (create/edit; optional illustrative rate rendered with explicit "illustrative — not a guarantee" labeling)
- [x] T027 [US2] Add navigation entries and goals i18n copy (AR/RTL + EN) including disclaimers in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Goals work independently (manual saved source needs no other story; net_worth/category source integrates with US1).

---

## Phase 5: User Story 3 — Real-return lens (Priority: P2)

**Goal**: For a selected period, compare nominal net worth change against inflation, USD, and gold with clear ahead/behind/unavailable indicators and an insufficient-data state.

**Independent Test**: With ≥ 2 monthly snapshots and a seeded inflation benchmark, call `GET /v1/networth/real-return?months=12`; confirm `nominalChangePct`, per-benchmark `outcome`, `hasSufficientData`, and that the mobile screen renders comparison or the insufficient-data state.

### Implementation for User Story 3

- [x] T028 [P] [US3] Implement inflation-benchmark service (read latest/series; admin upsert on `[periodMonth]`) in `backend-api/src/services/inflation-benchmark.ts`
- [x] T029 [US3] Implement admin routes (`GET/PUT /admin/v1/inflation-benchmarks`) with admin JWT guard and `AdminAuditLog` write in `backend-api/src/routes/admin/inflation-benchmark.ts` and register under `/admin/v1` in `backend-api/src/app.ts`
- [x] T030 [P] [US3] Implement real-return pure math (period [start,end] from snapshots → nominal %Δ vs inflation/USD/gold %Δ; `realDeltaPct`; `outcome` ahead/behind/flat/unavailable; `hasSufficientData`) in `backend-api/src/services/real-return.ts`
- [x] T031 [US3] Implement consumer route `GET /v1/networth/real-return` (reads snapshots from T010) in `backend-api/src/routes/v1/net-worth.ts`
- [x] T032 [P] [US3] Unit tests for real-return math: ahead/behind/flat, `<2` snapshots → insufficient, missing inflation anchor → `unavailable`, in `backend-api/tests/real-return.test.ts`
- [x] T033 [P] [US3] Extend mobile API client with real-return in `mobile-app/src/api/networth.ts`
- [x] T034 [US3] Implement `mobile-app/src/screens/RealReturnScreen.tsx` (benchmark rows with outcome indicators, period selector, insufficient/unavailable states, disclaimer)
- [x] T035 [US3] Add navigation entry and realReturn i18n copy (AR/RTL + EN) in `mobile-app/src/i18n/locales/ar.json` and `en.json`
- [ ] T036 [P] [US3] (Optional) Add an inflation-benchmark management screen in `admin-dashboard/` consuming `GET/PUT /admin/v1/inflation-benchmarks`

**Checkpoint**: Real-return lens functional given US1 snapshots + a seeded inflation benchmark.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T037 [P] Verify every new consumer response carries the non-advisory/self-reported `disclaimer` and that market-derived values expose freshness (`asOf`/`isStale`) — audit `net-worth.ts`, `financial-goals.ts`, `real-return.ts`
- [x] T038 [P] Add an assertion/test confirming `SimAccount`/`SimTrade` are never referenced by any net-worth/goal/real-return query (FR-016 / SC-008) in `backend-api/tests/sim-exclusion.test.ts`
- [ ] T039 Run the full `quickstart.md` verification (migration → seed inflation → components → networth → snapshots → goals → real-return → sign-out gate), **including a negative-auth check that all new `/v1/networth*` and `/v1/goals*` routes return 401 without a valid consumer token** (SC-006)
- [x] T040 [P] Ensure the served OpenAPI doc reflects the merged contract and run backend lint + build and mobile typecheck

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US1 (Phase 3)**: after Foundational. MVP.
- **US2 (Phase 4)**: after Foundational. `manual` saved source is fully independent; `net_worth`/`category` sources depend on T009 (US1 aggregation).
- **US3 (Phase 5)**: after Foundational; functionally depends on **US1 snapshots (T010)** and a seeded inflation benchmark (T028/T029).
- **Polish (Phase 6)**: after the desired stories.

### Within each story

- Backend math/services before routes; routes before mobile screens.
- Models (Foundational) before all services.
- Disclaimers, freshness, empty/insufficient states are part of each story (not deferred to polish).

### Parallel opportunities

- T002 with T001; T006 within Foundational.
- US1: T014/T015/T016 parallel; T007 parallel to early backend work.
- US2: T020, T023, T024 parallel.
- US3: T028, T030, T032, T033, T036 parallel.
- With multiple developers, after Foundational: Dev A → US1, Dev B → US2 (manual source first), Dev C → US3 (starts once US1 snapshots land).

---

## Parallel Example: User Story 1

```bash
# After T009/T012 backend is in place, run in parallel:
Task: "Unit tests for conversion/aggregation in backend-api/tests/net-worth.test.ts"   # T014
Task: "Mobile API client in mobile-app/src/api/networth.ts"                            # T015
Task: "NetWorthBreakdown + NetWorthHistoryChart components"                            # T016
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** net worth + history independently → demo.

### Incremental delivery

1. Foundational ready → 2. US1 (net worth + history) = MVP → 3. US2 (goals) → 4. US3 (real-return). Each story ships value without breaking the previous.

---

## Notes

- [P] = different files, no ordering dependency. [USn] maps tasks to stories for traceability.
- All money math uses `Prisma.Decimal`; totals in EGP; non-EGP via dated FX.
- Constitution VI enforced in code: no assumed return by default (T020), illustrative-only labeling (T020/T026), disclaimers everywhere (T037).
- Commit after each task or logical group (only when the user asks to commit).
