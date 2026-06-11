# Implementation Plan: Wealth Planning Core (تخطيط تكوين الثروة)

**Branch**: `002-wealth-planning-core` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-wealth-planning-core/spec.md`

## Summary

Add a **planning layer** for signed-in consumers on top of the existing `backend-api` market/portfolio services and the `mobile-app` client. Three capabilities:

1. **Unified Net Worth** — aggregate derived holdings (equities + metals, reusing `services/portfolio.ts` valuation) with new user-authored **manual assets/liabilities**, converted to EGP via existing FX, into one total with a category breakdown.
2. **Net Worth History + Real-Return Lens** — capture **monthly snapshots** that also anchor benchmark values (USD/EGP, gold-per-gram, inflation index) so the real-return comparison is computed deterministically from stored snapshots.
3. **Financial Goals** — target amount + date with a transparent **no-assumed-return** required-monthly-saving calculation and progress tracking, plus an optional clearly-labeled illustrative growth scenario.

The backend exposes new authenticated `/v1/` consumer routes and a new admin route to manage the inflation benchmark series. The mobile app adds new screens. **No external provider is called from clients**; inflation data is admin-managed and backend-served. Everything is informational/self-reported — no brokerage, no guaranteed returns, no personalized advice (constitution VI + Out of Scope).

## Technical Context

**Language/Version**: Node.js **22 LTS** + **TypeScript 5.x** (strict) — backend; React Native (Expo) + TypeScript — mobile. Matches existing stack.

**Primary Dependencies**: Backend — **Fastify**, **Prisma**, **Zod**, **ioredis**, **Prisma.Decimal** for money math. Mobile — React Navigation, react-i18next, existing API client + `fetchWithLastKnown`/`lastKnownCache` for resilience.

**Storage**: **PostgreSQL 16+** (new tables: manual net-worth components, net-worth snapshots, financial goals, inflation benchmark). **Redis 7+** reused for the existing quote cache that net-worth valuation depends on (no new hot-cache keys required for MVP of this feature).

**Testing**: **Vitest** (unit for money/projection/real-return math) + Fastify inject for new routes. Math-heavy pure functions (required-saving, real-return deltas, EGP conversion) MUST have unit tests; not gated by CI beyond existing lint+build.

**Target Platform**: Linux containers (backend) on existing deployment; iOS/Android via existing mobile build.

**Project Type**: Mobile + API — work spans `backend-api/` and `mobile-app/` only (two of the three constitutional products). `admin-dashboard/` gains one small inflation-benchmark management screen (optional in this feature; backend admin route is the source of truth).

**Performance Goals**: `GET /v1/networth` p95 **< 500 ms** when quote cache is warm (it fans out to the same cached FX/metals/equity quotes the portfolio summary already uses). Goal and snapshot reads are simple indexed DB queries, p95 **< 150 ms**.

**Constraints**: All money in EGP for totals; non-EGP manual entries converted with dated FX and `asOf`. No assumed investment return in required-saving math. Practice/sim portfolio excluded. All new surfaces carry the non-advisory disclaimer. Arabic-default + RTL, English secondary.

**Scale/Scope**: Per-user data volumes are small (tens of manual components, a handful of goals, ≤ ~120 monthly snapshots over 10 years). No horizontal-scale concerns beyond existing deployment.

## Constitution Check

*GATE: Passed for planning. Re-verified after Phase 1 artifacts below.*

- [x] **Specification first**: `spec.md` + Clarifications define WHAT, acceptance scenarios, and constraints before tasks.
- [x] **Three repositories**: Work is confined to `backend-api`, `mobile-app`, and an optional small `admin-dashboard` screen; **no monorepo introduced**.
- [x] **API contract**: New paths added to the canonical OpenAPI (fragment in `contracts/openapi.wealth.yaml`, to be merged into `specs/.../contracts/openapi.yaml`); `/v1/` prefix; additive, non-breaking → no version bump.
- [x] **Data path**: Inflation benchmark is **admin-managed and backend-served**; clients never call external providers. Market values reuse existing backend connectors.
- [x] **Admin & secrets**: Inflation-benchmark writes use the existing admin JWT + audit log; no new secrets. No consumer access to admin routes.
- [x] **Privacy & transparency**: New PII-adjacent data (manual assets, liabilities, goals) is signed-in only, documented in data-model inventory; market-derived values carry `asOf`/freshness.
- [x] **Dependencies & resilience**: Inflation feed risk documented in `research.md`; net worth degrades gracefully (stale quotes → last-known with freshness flag; missing inflation → explicit unavailable state).
- [x] **Performance**: Reuses existing Redis-backed quote caches; new reads are indexed; rate limiting via existing plugin scope.
- [x] **i18n**: All new mobile copy added to `ar.json`/`en.json` with RTL; API stays locale-neutral.
- [x] **Quality gates**: Unit tests for math; optional security-review hook after plan/tasks; acceptance tied to spec scenarios.
- [x] **Out of scope**: No brokerage, no guaranteed returns (no-assumed-return default + illustrative-only labeling), no personalized advice; DCA/certificates/allocation/dividends explicitly deferred.

## Post-Phase-1 Constitution Check

- [x] **Data model** separates derived (computed from existing tables) vs manual user-authored components; goals and snapshots are per-consumer and cascade on user delete.
- [x] **Contracts** expose only backend surfaces; inflation source label is shown but provider internals are not leaked.
- [x] **Quickstart** documents new migration, the monthly snapshot job, and seeding an inflation benchmark for local verification.

## Project Structure

### Documentation (this feature)

```text
specs/002-wealth-planning-core/
├── plan.md              # this file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities (Prisma)
├── quickstart.md        # Phase 1 local dev + verification
├── contracts/
│   └── openapi.wealth.yaml   # additive OpenAPI fragment (merge into canonical contract)
├── spec.md
├── checklists/
│   └── requirements.md
└── tasks.md             # created later by /speckit-tasks
```

### Source code — `backend-api/` (additive)

```text
backend-api/
├── prisma/
│   ├── schema.prisma         # + ManualNetWorthComponent, NetWorthSnapshot, FinancialGoal, InflationBenchmark (+ enums)
│   └── migrations/           # new migration
└── src/
    ├── services/
    │   ├── net-worth.ts            # aggregate derived + manual → total + breakdown (EGP)
    │   ├── net-worth-components.ts # CRUD for manual assets/liabilities
    │   ├── net-worth-snapshots.ts  # capture + list monthly snapshots (with benchmark anchors)
    │   ├── financial-goals.ts      # CRUD + required-saving + progress + illustrative projection
    │   ├── real-return.ts          # period deltas vs inflation/USD/gold (pure, unit-tested)
    │   └── inflation-benchmark.ts  # read latest/index series; admin upserts
    ├── routes/
    │   ├── v1/
    │   │   ├── net-worth.ts        # GET /v1/networth, snapshots, components CRUD
    │   │   └── goals.ts            # /v1/goals CRUD + projection
    │   └── admin/
    │       └── inflation-benchmark.ts  # /admin/v1/inflation-benchmarks CRUD (audited)
    └── jobs/
        └── capture-networth-snapshots.ts  # monthly per-consumer snapshot capture
```

### Source code — `mobile-app/` (additive)

```text
mobile-app/src/
├── api/
│   ├── networth.ts        # client for networth + components + snapshots + real-return
│   └── goals.ts           # client for goals
├── screens/
│   ├── NetWorthScreen.tsx
│   ├── ManualAssetFormScreen.tsx
│   ├── GoalsScreen.tsx
│   ├── GoalFormScreen.tsx
│   └── RealReturnScreen.tsx
├── components/            # NetWorthBreakdown, NetWorthHistoryChart, GoalProgress, RealReturnRow (reuse Card/ChangeBadge/PriceSparkline)
└── i18n/locales/          # + "networth", "goals", "realReturn" keys in ar.json + en.json
```

**Structure Decision**: Extend the two existing products additively. Net worth becomes a new entry in the mobile navigation (proposed: a "Wealth" / "ثروتي" section reachable from the Portfolio area or the More menu — finalized in tasks). The canonical OpenAPI contract under `specs/001-tharwa-platform-mvp/contracts/openapi.yaml` is extended (additive paths); the fragment here is the staging source. Optional admin screen mirrors the audited backend inflation route.

## Phase 0 & Phase 1 artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Research | [research.md](./research.md) | Net-worth aggregation, snapshot/benchmark anchoring, projection & real-return math, inflation source |
| Data model | [data-model.md](./data-model.md) | New PostgreSQL entities + relationships + validation |
| API contract | [contracts/openapi.wealth.yaml](./contracts/openapi.wealth.yaml) | Additive consumer + admin endpoints |
| Quickstart | [quickstart.md](./quickstart.md) | Migration, snapshot job, inflation seed, local verification |

## Backend delivery order (for `/speckit-tasks`)

1. **Data layer**: Prisma models + enums + migration; relations on `ConsumerUser`.
2. **Manual components CRUD** (`/v1/networth/components`) + validation (Zod).
3. **Net worth aggregation** (`GET /v1/networth`): reuse portfolio valuation + metals/FX cache; EGP conversion with `asOf`.
4. **Snapshots**: capture service + monthly job + `GET /v1/networth/snapshots`.
5. **Financial goals** (`/v1/goals` CRUD + required-saving/progress + illustrative projection); pure math unit-tested.
6. **Real-return lens** (`GET /v1/networth/real-return`) from snapshot anchors; pure math unit-tested.
7. **Admin inflation benchmark** (`/admin/v1/inflation-benchmarks`) + audit log + optional admin screen.
8. **Mobile**: API clients → NetWorth screen → manual asset form → Goals → Real-return; i18n AR/EN; disclaimers; freshness/empty states.

## Complexity Tracking

No constitution violations requiring justification. All work is additive within two existing products; no new architectural patterns introduced.
