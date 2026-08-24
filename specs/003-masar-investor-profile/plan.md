# Implementation Plan: Masar — Investor Profile & Illustrative Model (مسار)

**Branch**: `003-masar-investor-profile` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-masar-investor-profile/spec.md`

## Summary

Add a guided, **non-advisory** on-ramp ("مسار / Masar") for consumers on top of the existing `backend-api` and `mobile-app`. The flow is: short quiz → deterministic **investor archetype** (1 of 5) → an **illustrative, asset-class-level model mix** (equity / fixed income / gold, adjustable in 5% steps) → a **backward-looking historical illustration** of that mix vs EGP inflation, USD, and gold → **planning hand-offs** into the already-built Goals / Watchlist / Learn surfaces (instead of any trade/execution action).

Key technical pillars:

1. **Backend owns the brain** — the answer→archetype mapping and the per-archetype default allocations are a pure, unit-tested function on the backend (single source of truth, FR-004). Clients render, they do not classify.
2. **Open quiz, gated persistence** — quiz/result/illustration endpoints are **public** (no PII stored); persisting a profile and the planning hand-offs reuse the existing `consumerBearerPreHandler` auth (FR-011/FR-012).
3. **Historical illustration reuses the planning data path** — inflation comes from the existing admin-managed `InflationBenchmark` (feature 002); equity / fixed-income / gold / USD monthly series come from a new admin-managed `MasarBenchmarkPoint` table (constitution III/VII — backend-served, no client external calls). The illustration is a pure deterministic function over stored monthly indices (mirrors `services/real-return.ts`).
4. **No execution, asset-class only** — no securities/funds named, no "invest now", no guaranteed/forward returns (constitution VI + Out of Scope). Educational framing via copy + i18n, not a heavy legal banner.

The mobile app adds a small set of screens and one API client; the backend adds new public + authenticated `/v1/masar/*` routes, one admin route for the benchmark series, two Prisma tables, and one enum. Everything is additive and non-breaking.

## Technical Context

**Language/Version**: Node.js **22 LTS** + **TypeScript 5.x** (strict) — backend; React Native (Expo) + TypeScript — mobile. Matches existing stack.

**Primary Dependencies**: Backend — **Fastify**, **Prisma**, **Zod**, **ioredis** (existing quote cache, reused indirectly), **Prisma.Decimal** for any money/percentage math. Mobile — React Navigation (`MainStackNavigator`), react-i18next, existing `api/client.ts`, `fetchWithLastKnown`/`lastKnownCache` for resilient reads, existing donut/disclaimer/freshness UI building blocks.

**Storage**: **PostgreSQL 16+** — two new tables (`MasarResult` per-consumer; `MasarBenchmarkPoint` global/admin) + one enum (`MasarArchetype`). Reuses existing `InflationBenchmark` (feature 002) for the inflation comparison. No new Redis keys required for MVP.

**Testing**: **Vitest** unit tests for the two pure functions that carry all the risk — the **answer→archetype mapping** (deterministic, including ambiguous/"not sure" tie-breaking) and the **historical-illustration math** (weighted mix change + per-benchmark outcome). Fastify `inject` tests for the new routes (incl. 401 gating on authenticated routes and 200/validation on public ones).

**Target Platform**: Linux containers (backend) on existing deployment; iOS/Android via existing Expo mobile build.

**Project Type**: Mobile + API — work spans `backend-api/` and `mobile-app/` only. `admin-dashboard/` optionally gains a small `MasarBenchmarkPoint` management screen; the backend admin route is the source of truth (the screen is not required for MVP).

**Performance Goals**: `POST /v1/masar/result` is pure CPU over a tiny input → p95 **< 50 ms**. `POST /v1/masar/illustration` is two indexed monthly-series reads + arithmetic → p95 **< 200 ms**. Profile reads/writes are single indexed row ops → p95 **< 120 ms**.

**Constraints**: Asset-class level only (no instruments). Model percentages are integers in 5% steps summing to 100. All comparison values carry `asOf`/freshness and degrade to `unavailable`/insufficient-data states. Arabic-default + RTL, English secondary. Practice/sim portfolio never read or written.

**Scale/Scope**: Per-user data is tiny (one active `MasarResult` row per consumer; retake overwrites). `MasarBenchmarkPoint` is low-volume (≤ ~120 rows/series over 10 years). No horizontal-scale concerns beyond existing deployment.

## Constitution Check

*GATE: Passed for planning. Re-verified after Phase 1 artifacts below.*

- [x] **Specification first**: `spec.md` + Clarifications (5 archetypes, carry-over, keep-latest, Sharia framing) define WHAT, acceptance scenarios, and constraints before tasks.
- [x] **Three repositories**: Work is confined to `backend-api`, `mobile-app`, and an optional small `admin-dashboard` screen; **no monorepo introduced**.
- [x] **API contract**: New paths added to the canonical OpenAPI (fragment in `contracts/openapi.masar.yaml`, merged into `specs/.../contracts/openapi.yaml`); `/v1/` + `/admin/v1/` prefixes; additive, non-breaking → no version bump.
- [x] **Data path**: Historical illustration is **admin-managed and backend-served** (`MasarBenchmarkPoint` + reused `InflationBenchmark`); clients never call external providers.
- [x] **Admin & secrets**: Benchmark writes use the existing admin JWT + audit log; no new secrets. No consumer access to admin routes.
- [x] **Privacy & transparency**: Anonymous quiz stores **nothing**; the only new PII-adjacent data is the per-consumer `MasarResult` (archetype + chosen mix + Sharia flag), documented in the data-model inventory; comparison values carry `asOf`.
- [x] **Dependencies & resilience**: No new external feed. Missing/stale benchmark or insufficient history → explicit `unavailable`/insufficient-data states (FR-010).
- [x] **Performance**: Pure-function endpoints; new reads are indexed; rate limiting via existing plugin scope; the public endpoints are computed, not feed-backed.
- [x] **i18n**: All new mobile copy + archetype names/descriptions added to `ar.json`/`en.json` with RTL; API stays locale-neutral (returns identifiers; client localizes, with optional localized labels for convenience).
- [x] **Quality gates**: Unit tests for the mapping + illustration math; route inject tests for gating; optional security-review hook after plan/tasks; acceptance tied to spec scenarios.
- [x] **Out of scope**: No brokerage/execution, no "invest now", no instruments named (asset-class only), no guaranteed/forward returns (illustration is backward-looking + labeled), no tailored advice. AI coach deferred.

## Post-Phase-1 Constitution Check

- [x] **Data model** separates global admin reference data (`MasarBenchmarkPoint`) from per-consumer data (`MasarResult`, cascade on `ConsumerUser` delete); archetype catalog + default allocations live in code (reference constants), not user data.
- [x] **Contracts** expose only backend surfaces; `sourceLabel` is shown for benchmark transparency but provider internals are not leaked; public vs `BearerAuth` vs `AdminAuth` clearly separated per path.
- [x] **Quickstart** documents the new migration, seeding the benchmark series + an inflation row, the public quiz/illustration calls, and the authenticated profile + 401 negative checks.

## Project Structure

### Documentation (this feature)

```text
specs/003-masar-investor-profile/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.masar.yaml   # Phase 1 output (additive fragment)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
backend-api/
├── prisma/
│   └── schema.prisma                      # + MasarArchetype enum, MasarResult, MasarBenchmarkPoint
├── src/
│   ├── services/
│   │   ├── masar-archetypes.ts            # reference catalog (5) + default allocations + i18n keys
│   │   ├── masar-classify.ts              # PURE: answers → archetype (+ tie-breaking)   [unit-tested]
│   │   ├── masar-model.ts                 # PURE: allocation validation (5% steps, sum=100), reset
│   │   ├── masar-illustration.ts          # PURE: weighted mix change vs inflation/USD/gold   [unit-tested]
│   │   ├── masar-benchmark.ts             # admin CRUD for MasarBenchmarkPoint (Zod + upsert)
│   │   └── masar-profile.ts               # per-consumer MasarResult get/upsert(keep-latest)/delete
│   ├── routes/
│   │   ├── v1/masar.ts                     # public: archetypes, result, illustration; authed: profile
│   │   └── admin/masar-benchmark.ts        # admin: list/upsert MasarBenchmarkPoint
│   └── app.ts                              # register v1MasarRoutes + adminMasarBenchmarkRoutes
└── test/unit/
    ├── masar-classify.test.ts
    └── masar-illustration.test.ts

mobile-app/
└── src/
    ├── api/masar.ts                        # client: result, illustration, profile get/save/delete
    ├── screens/
    │   ├── MasarIntroScreen.tsx            # entry ("ابدأ مسارك")
    │   ├── MasarQuizScreen.tsx             # 4-step quiz (reuses card/stepper patterns)
    │   └── MasarResultScreen.tsx           # archetype + donut + 5% adjust + backtest + hand-offs
    ├── navigation/MainStackNavigator.tsx   # register the 3 screens + route params
    └── i18n/locales/{ar,en}.json           # archetype names/descriptions + Masar copy (RTL)
```

**Structure Decision**: Mobile + API (Option 3). Reuses feature-002 building blocks (`InflationBenchmark`, real-return outcome pattern, donut/disclaimer/freshness components, `consumerBearerPreHandler`, `fetchWithLastKnown`) and the existing Goals / Watchlist / Learn destinations for hand-offs. Pure classification + illustration functions are isolated for deterministic unit testing.

## Complexity Tracking

No constitution violations. No entries required.

> One intentional addition worth noting (not a violation): a new admin-managed `MasarBenchmarkPoint` series is introduced rather than reconstructing asset-class history from disparate existing sources. Rationale and the rejected alternative are recorded in `research.md` §3.
