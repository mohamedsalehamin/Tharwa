# Tasks: Masar — Investor Profile & Illustrative Model (مسار)

**Input**: Design documents from `/specs/003-masar-investor-profile/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.masar.yaml](./contracts/openapi.masar.yaml), [quickstart.md](./quickstart.md)

**Tests**: Limited — the spec did not request full TDD, but [plan.md](./plan.md) requires **unit tests for `masar-classify` and `masar-illustration` pure functions**. Route inject tests are optional (add ad hoc).

**Organization**: Phases by dependency order. User-story phases use **[USn]** labels mapping to [spec.md](./spec.md). This feature is **additive** to two existing products — paths use `backend-api/` and `mobile-app/` per [plan.md](./plan.md). Reuses feature-002 `InflationBenchmark` and existing Goals / Watchlist / Learn surfaces.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallel-safe (different files, no ordering dependency within the checkpoint)
- **[USn]**: User Story *n* from [spec.md](./spec.md)

---

## Phase 1: Setup (shared, light — additive feature)

**Purpose**: Stage the contract and localization scaffolding the stories build on.

- [x] T001 Merge the additive paths, schemas, and parameters from `specs/003-masar-investor-profile/contracts/openapi.masar.yaml` into the canonical contract `specs/001-tharwa-platform-mvp/contracts/openapi.yaml`
- [x] T002 [P] Add empty i18n namespace `masar` (placeholder keys for archetypes, quiz, model, illustration, hand-offs) to `mobile-app/src/i18n/locales/ar.json` and `mobile-app/src/i18n/locales/en.json`

---

## Phase 2: Foundational (BLOCKING — must complete before any user story)

**Purpose**: Persistence layer and reference catalog all stories depend on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T003 Add enum `MasarArchetype` and models `MasarResult` (unique on `consumerUserId`) and `MasarBenchmarkPoint` plus the `masarResult` relation on `ConsumerUser` to `backend-api/prisma/schema.prisma` per [data-model.md](./data-model.md)
- [x] T004 Create and apply migration `masar_investor_profile` and regenerate the client (`npx prisma migrate dev --name masar_investor_profile && npx prisma generate`) in `backend-api/`
- [x] T005 [P] Implement the five-archetype reference catalog (ids, default allocations 20/55/25 … 85/5/10, i18n key refs, Sharia framing variant keys) in `backend-api/src/services/masar-archetypes.ts`
- [x] T006 [P] Define shared Zod schemas for `QuizAnswers`, `Allocation`, and `MasarProfileInput` in `backend-api/src/services/masar-validation.ts`

**Checkpoint**: Schema migrated; archetype catalog and validation schemas available.

---

## Phase 3: User Story 1 — Discover investor archetype from quiz (Priority: P1) 🎯 MVP

**Goal**: A 4-step quiz returns one deterministic named archetype with an educational description (public, no storage). Sharia preference changes framing copy only.

**Independent Test**: Call `POST /v1/masar/result` with a known answer set twice → identical `archetype`; near-term-need `"yes"` pulls toward a more conservative archetype; incomplete body → 400; mobile quiz completes and shows archetype name + description in AR/EN without donut/backtest/save.

### Implementation for User Story 1

- [x] T007 [P] [US1] Implement pure answer→archetype scoring with downward tie-breaking (including `"not_sure"` → conservative weight) in `backend-api/src/services/masar-classify.ts`
- [x] T008 [P] [US1] Unit tests for determinism, conservative pull on near-term need, ambiguous/"not sure" resolution, and all five archetype buckets in `backend-api/test/unit/masar-classify.test.ts`
- [x] T009 [US1] Implement result presenter (classify + attach default allocation + localized name/description labels + educational disclaimer string + Sharia framing flag) in `backend-api/src/services/masar-result.ts` (depends on T005, T007)
- [x] T010 [US1] Implement public routes `GET /v1/masar/archetypes` and `POST /v1/masar/result` (no auth, stateless) with Zod validation in `backend-api/src/routes/v1/masar.ts`
- [x] T011 [US1] Register `v1MasarRoutes` under prefix `/v1` in `backend-api/src/app.ts`
- [x] T012 [P] [US1] Implement mobile API client methods `listArchetypes()` and `computeResult(answers)` in `mobile-app/src/api/masar.ts`
- [x] T013 [US1] Implement `mobile-app/src/screens/MasarIntroScreen.tsx` (entry CTA "ابدأ مسارك", educational framing microcopy, no heavy banner)
- [x] T014 [US1] Implement `mobile-app/src/screens/MasarQuizScreen.tsx` (4 steps: goal, volatility, near-term need, Sharia; progress dots; block submit until complete)
- [x] T015 [US1] Implement `mobile-app/src/screens/MasarArchetypeScreen.tsx` (archetype name + description + subtle disclaimer; Sharia-variant copy when selected) — merged into `MasarResultScreen.tsx` per T021
- [x] T016 [US1] Add `MasarIntro`, `MasarQuiz`, `MasarArchetype` to `mobile-app/src/navigation/types.ts` and `MainStackNavigator.tsx`; add a Home/Explore entry point; add US1 i18n copy (AR default/RTL + EN) in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Quiz → archetype works end-to-end (API + mobile) without model adjustment, illustration, or persistence.

---

## Phase 4: User Story 2 — Illustrative model mix with 5% adjustment (Priority: P1)

**Goal**: Show default equity/fixed-income/gold allocation for the archetype; user adjusts in 5% steps (sum must equal 100); reset to default; asset-class framing only (no instruments); Sharia changes labels not percentages.

**Independent Test**: `POST /v1/masar/result` returns `defaultAllocation` summing to 100 across three classes only; mobile donut + steppers block confirm when total ≠ 100; reset restores archetype default; Sharia flag swaps fixed-income label to sukuk form.

### Implementation for User Story 2

- [x] T017 [P] [US2] Implement allocation validation (5% steps, sum=100, non-negative) and `resetToDefault(archetype)` in `backend-api/src/services/masar-model.ts`
- [x] T018 [US2] Validate optional adjusted allocation on profile save input using `masar-model.ts` in `backend-api/src/services/masar-validation.ts` (depends on T017)
- [x] T019 [P] [US2] Implement `mobile-app/src/components/masar/AllocationDonut.tsx` (three-segment ring: equity / fixed income / gold with percentage labels)
- [x] T020 [P] [US2] Implement `mobile-app/src/components/masar/AllocationStepper.tsx` (±5% per class; disable confirm when total ≠ 100; reset button)
- [x] T021 [US2] Implement `mobile-app/src/screens/MasarResultScreen.tsx` composing archetype header + `AllocationDonut` + `AllocationStepper` + "نموذج توضيحي" framing microcopy (replace or follow `MasarArchetypeScreen` in the flow)
- [x] T022 [US2] Add US2 i18n for asset-class names (standard + Sharia/sukuk variants) in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Archetype + adjustable illustrative model works; still no backtest or save required.

---

## Phase 5: User Story 3 — Backward-looking historical illustration (Priority: P2)

**Goal**: For a chosen mix and period, show mix % change vs EGP inflation, USD/EGP, and gold with ahead/behind/unavailable outcomes, `hasSufficientData`, `sourceLabel`/`asOf`; never presented as a prediction.

**Independent Test**: Seed ≥2 `MasarBenchmarkPoint` months + inflation rows; `POST /v1/masar/illustration` returns `mixChangePct` and per-benchmark `outcome`; `<2` months → `hasSufficientData=false`; mobile section renders comparison or insufficient/unavailable states.

### Implementation for User Story 3

- [x] T023 [P] [US3] Implement `MasarBenchmarkPoint` admin service (list, upsert on `periodMonth`, on-or-before month lookup helpers) in `backend-api/src/services/masar-benchmark.ts`
- [x] T024 [US3] Implement admin routes `GET/PUT /admin/v1/masar-benchmarks` with admin JWT guard and audit log in `backend-api/src/routes/admin/masar-benchmark.ts` and register under `/admin/v1` in `backend-api/src/app.ts`
- [x] T025 [P] [US3] Implement pure historical-illustration math (weighted mix change + inflation/USD/gold benchmark deltas + `outcome`/`realDeltaPct`; reuse `inflationIndexForMonth` from `services/inflation-benchmark.ts`) in `backend-api/src/services/masar-illustration.ts`
- [x] T026 [P] [US3] Unit tests for mix change, ahead/behind/flat, `<2` months insufficient, missing index → `unavailable` in `backend-api/test/unit/masar-illustration.test.ts`
- [x] T027 [US3] Implement public route `POST /v1/masar/illustration` in `backend-api/src/routes/v1/masar.ts` (depends on T025, T023)
- [x] T028 [P] [US3] Extend mobile API client with `computeIllustration(allocation, months)` in `mobile-app/src/api/masar.ts`
- [x] T029 [US3] Implement `mobile-app/src/components/masar/IllustrationPanel.tsx` (period selector, benchmark rows with outcome indicators, backward-looking label, insufficient/unavailable + asOf states) and integrate into `MasarResultScreen.tsx`
- [x] T030 [US3] Add US3 i18n for illustration copy (backward-looking label, benchmark names, unavailable/insufficient states) in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Full quiz → model → historical illustration path works without profile persistence.

---

## Phase 6: User Story 4 — Save profile and planning hand-offs (Priority: P2)

**Goal**: Signed-in users save (overwrite keep-latest) their Masar result; anonymous users are gated; carry-over after sign-in with explicit save offer; hand-offs to Goals, Watchlist, and Learn — no invest/execute action.

**Independent Test**: `PUT/GET/DELETE /v1/masar/profile` with Bearer token; retake + save overwrites single row; unsigned → 401; mobile save prompts sign-in; after auth, transient result offered to save; "turn into goal" opens existing goals flow pre-filled; watchlist/learn routes with asset-class context.

### Implementation for User Story 4

- [x] T031 [P] [US4] Implement profile service (get nullable, upsert overwrite on `consumerUserId`, delete idempotent) persisting archetype + allocation + sharia + optional answers snapshot in `backend-api/src/services/masar-profile.ts`
- [x] T032 [US4] Implement authenticated routes `GET/PUT/DELETE /v1/masar/profile` behind `consumerBearerPreHandler` in `backend-api/src/routes/v1/masar.ts` (depends on T031, T018)
- [x] T033 [P] [US4] Extend mobile API client with `getProfile()`, `saveProfile()`, `deleteProfile()` in `mobile-app/src/api/masar.ts`
- [x] T034 [US4] Implement save flow on `MasarResultScreen.tsx` — auth gate for signed-out users; after sign-in/register carry transient result and show explicit "احفظ مسارك" offer (no auto-save)
- [x] T035 [US4] Implement "turn into goal" hand-off — navigate to existing `GoalsScreen` / goal-creation flow with Masar context pre-filled (label suggestion from archetype; reuse existing `/v1/goals` client, no new return math) in `MasarResultScreen.tsx` and `mobile-app/src/navigation/types.ts`
- [x] T036 [US4] Implement "add to watchlist" and "learn more" hand-offs — route to `WatchlistScreen` and relevant `LearnHomeScreen` / article routes with asset-class query context in `MasarResultScreen.tsx`
- [x] T037 [US4] Load saved profile on Masar entry when signed in (offer retake vs continue saved path) in `MasarIntroScreen.tsx`
- [x] T038 [US4] Add US4 i18n for save, carry-over, and hand-off CTAs in `mobile-app/src/i18n/locales/ar.json` and `en.json`

**Checkpoint**: Full Masar funnel including persistence and planning bridges; still no brokerage/execution affordance.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T039 [P] Verify every Masar response carries the educational `disclaimer` string and that illustration values expose `sourceLabel`/`asOf` — audit `masar-result.ts`, `masar-illustration.ts`, `masar-profile.ts`
- [x] T040 [P] Add an assertion/test confirming `SimAccount`/`SimTrade` are never referenced by any Masar query (FR-018) in `backend-api/test/unit/masar-sim-exclusion.test.ts`
- [x] T041 [P] Confirm zero Masar surface exposes buy/execute/"invest now" copy — audit mobile screens and API responses (FR-016)
- [ ] T042 Run the full [quickstart.md](./quickstart.md) verification (migration → seed benchmarks + inflation → public result/illustration → profile save/overwrite → 401 negative checks on profile routes, public routes must not 401)
- [x] T043 [P] Ensure the served OpenAPI doc reflects the merged contract; run backend lint + build and mobile typecheck
- [ ] T044 [P] (Optional) Add a `MasarBenchmarkPoint` management screen in `admin-dashboard/` consuming `GET/PUT /admin/v1/masar-benchmarks`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US1 (Phase 3)**: after Foundational. **MVP** — quiz → archetype only.
- **US2 (Phase 4)**: after US1 (needs archetype + default allocation from result flow).
- **US3 (Phase 5)**: after Foundational; functionally integrates with US2 (needs chosen allocation on result screen). Requires seeded `MasarBenchmarkPoint` + `InflationBenchmark` for meaningful output.
- **US4 (Phase 6)**: after US2 (needs complete result screen with allocation); uses existing Goals / Watchlist / Learn from feature 002.
- **Polish (Phase 7)**: after the desired stories.

### User story dependencies

| Story | Depends on | Independently testable when |
|-------|------------|----------------------------|
| US1 | Foundational | Quiz → archetype API + mobile screens |
| US2 | US1 | Result screen with donut + steppers |
| US3 | US2 (allocation UI) + benchmark seed | Illustration API + panel on result screen |
| US4 | US2 | Profile CRUD + hand-offs (Goals/Watchlist/Learn already exist) |

### Within each story

- Pure functions + unit tests before routes; routes before mobile screens.
- Disclaimers, insufficient/unavailable states, and Sharia framing are part of each story (not deferred to polish).

### Parallel opportunities

- **Phase 1**: T002 ∥ T001
- **Phase 2**: T005 ∥ T006 (after T003/T004)
- **US1**: T007 ∥ T008; T012 ∥ backend routes once T009 ready; T013 ∥ T014
- **US2**: T019 ∥ T020; T017 ∥ T019
- **US3**: T023 ∥ T025 ∥ T026; T028 ∥ T029 once T027 ready
- **US4**: T031 ∥ T033; T035 ∥ T036 once T034 ready
- **Polish**: T039 ∥ T040 ∥ T041 ∥ T043 ∥ T044

---

## Parallel Example: User Story 1

```bash
# After T005/T006, run in parallel:
# - T007 masar-classify.ts
# - T008 masar-classify.test.ts
# - T012 mobile-app/src/api/masar.ts
# - T013 MasarIntroScreen.tsx

# Then sequentially: T009 → T010 → T011 → wire mobile quiz (T014) → archetype screen (T015)
```

---

## Parallel Example: User Story 3

```bash
# After Foundational, run in parallel:
# - T023 masar-benchmark.ts (admin service)
# - T025 masar-illustration.ts
# - T026 masar-illustration.test.ts

# Then: T024 admin routes → T027 public illustration route → T028–T030 mobile panel
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Quiz → deterministic archetype (API + mobile)
5. Demo the personality discovery funnel

### Core experience (US1 + US2)

1. Setup + Foundational
2. US1 → US2
3. **VALIDATE**: Full quiz → archetype → adjustable donut model (Thndr Alpha–style core without backtest/save)

### Full feature (add US3 + US4)

1. US3 → historical illustration (seed benchmarks first)
2. US4 → save + Goals/Watchlist/Learn hand-offs
3. Polish → quickstart verification

### Suggested task counts

| Phase | Tasks | Story |
|-------|-------|-------|
| Setup | 2 | — |
| Foundational | 4 | — |
| US1 | 10 | P1 MVP |
| US2 | 6 | P1 |
| US3 | 8 | P2 |
| US4 | 8 | P2 |
| Polish | 6 | — |
| **Total** | **44** | |

---

## Notes

- Archetype catalog and scoring weights live in backend code (`masar-archetypes.ts`, `masar-classify.ts`) — tune copy via i18n, tune weights via code + unit tests.
- Anonymous quiz answers are **never stored server-side**; carry-over is client-side until explicit `PUT /v1/masar/profile`.
- Feature 002 (`InflationBenchmark`, Goals, Watchlist, Learn) is already implemented in `backend-api/` and partially in `mobile-app/` — US4 hand-offs integrate, they do not reimplement planning math.
- Stop at any checkpoint to validate the story independently before continuing.
