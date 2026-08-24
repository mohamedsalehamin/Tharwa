# Data Model: Masar — Investor Profile (backend-api)

**Date**: 2026-06-29 | **ORM**: Prisma (PostgreSQL) | **Base currency**: EGP

Conventions follow the existing schema: UUID `id`, `@map` snake_case columns, `createdAt`/`updatedAt`, `Decimal` for money/index values, per-consumer rows cascade on `ConsumerUser` delete. Allocation percentages are stored as **integers** (whole percent, 5% steps, summing to 100).

## New enum

```prisma
enum MasarArchetype {
  conservative          // المحافِظ           default 20/55/25
  cautious_balanced     // المتوازن الحذِر    default 35/45/20
  balanced              // المتوازن           default 50/35/15
  growth_balanced       // النامي المتوازن    default 70/20/10
  aggressive_long_term  // الجريء طويل المدى  default 85/5/10
}
```

## 1. `MasarResult`

A signed-in consumer's saved Masar outcome. **Exactly one active row per consumer** — retake + save overwrites it (FR-021, keep-latest-only).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| consumerUserId | UUID | FK → ConsumerUser, cascade delete; **`@unique`** (one per consumer) |
| archetype | MasarArchetype | derived from the quiz answers |
| equityPct | Int | 0..100, multiple of 5 |
| fixedIncomePct | Int | 0..100, multiple of 5 |
| goldPct | Int | 0..100, multiple of 5 |
| shariaPreferred | Boolean | default `false`; affects framing only (FR-007) |
| answers | jsonb? | optional snapshot of submitted answers (audit/retake convenience); contains no PII beyond the choices |
| createdAt / updatedAt | timestamptz | |

**Indexes**: `@@unique([consumerUserId])`.

**Validation** (enforced in `services/masar-profile.ts` + Zod at the route): each pct in `0..100`, each `% 5 == 0`, and `equityPct + fixedIncomePct + goldPct == 100`. `archetype` ∈ enum. Persist is an **upsert on `consumerUserId`**.

## 2. `MasarBenchmarkPoint`

Administratively managed monthly index series used by the historical illustration (constitution III/VII — backend-served, no client external calls). Global (not per-consumer). One row per calendar month.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| periodMonth | date (`@db.Date`) | first day of month; **unique** |
| equityIndex | Decimal(18,6)? | EGP-denominated equity index value (e.g. EGX30 rebased); null if unavailable |
| fixedIncomeIndex | Decimal(18,6)? | EGP fixed-income/T-bill total-return index value; null if unavailable |
| goldEgpPerGram | Decimal(18,6)? | 24k gold per gram in EGP; also the gold **comparison** benchmark |
| usdEgp | Decimal(18,6)? | USD/EGP rate; used as the USD comparison benchmark |
| sourceLabel | string | shown to users for transparency (e.g. "EGX30 / CBE T-bill / local gold") |
| asOf | timestamptz? | provider/publish reference |
| createdAt / updatedAt | timestamptz | |

**Indexes**: `@@unique([periodMonth])`, `@@index([periodMonth(sort: Desc)])`.

**Validation**: at least one index column present per row; `sourceLabel` non-empty. Upsert on `periodMonth` (mirrors `InflationBenchmark`).

> Inflation is **not** duplicated here — the illustration reads inflation from the existing feature-002 `InflationBenchmark` table.

## Relationship (add to existing `ConsumerUser`)

```prisma
model ConsumerUser {
  // ... existing relations ...
  masarResult MasarResult?
}
```

`MasarBenchmarkPoint` is global (admin-managed); it has no per-consumer relation.

## Reference data (in code, NOT stored)

`services/masar-archetypes.ts` exports the catalog of 5 archetypes:

| archetype | default equity/fixedIncome/gold | name i18n key | description i18n key |
|-----------|-------------------------------|---------------|----------------------|
| conservative | 20 / 55 / 25 | `masar.archetype.conservative.name` | `...conservative.desc` |
| cautious_balanced | 35 / 45 / 20 | `...cautious_balanced.name` | `...cautious_balanced.desc` |
| balanced | 50 / 35 / 15 | `...balanced.name` | `...balanced.desc` |
| growth_balanced | 70 / 20 / 10 | `...growth_balanced.name` | `...growth_balanced.desc` |
| aggressive_long_term | 85 / 5 / 10 | `...aggressive_long_term.name` | `...aggressive_long_term.desc` |

## Derived (not stored)

- **Archetype (classify)** — pure function `classify(answers) → archetype` in `services/masar-classify.ts`: each answer maps to a risk weight; near-term-need answer applies a strong conservative pull; "not sure" → most conservative weight; final score bucketed into one of 5; **ties resolve to the more conservative archetype**. Deterministic, unit-tested (SC-002).
- **Model allocation (default + adjust)** — `services/masar-model.ts`: returns the archetype's default mix; validates user-adjusted mixes (5% steps, sum=100); `reset()` returns to default.
- **Historical illustration** — pure function in `services/masar-illustration.ts` over `MasarBenchmarkPoint` + `InflationBenchmark` for `[t0, t1]`:
  - `assetChangePct(class) = idx_t1 / idx_t0 − 1` for equity, fixed income, gold (using the on-or-before month lookup like `inflationIndexForMonth`).
  - `mixChangePct = Σ (weight_class × assetChangePct(class))` over equity/fixedIncome/gold.
  - Benchmarks: `inflationPct` (from `InflationBenchmark` index delta), `usdPct` (`usdEgp` delta), `goldPct` (`goldEgpPerGram` delta).
  - Per benchmark: `realDeltaPct = mixChangePct − benchmarkPct`, `outcome ∈ {ahead, behind, flat, unavailable}` (`unavailable` when a needed index is missing/stale). Mirrors `services/real-return.ts` output shape.
  - `hasSufficientData = false` when fewer than two months of points cover the selected period.

## State transitions

- **MasarResult**: created on first save; subsequent saves **upsert** the single row (overwrite). Deleted on explicit user delete or `ConsumerUser` cascade.
- **MasarBenchmarkPoint**: upserted by admin per month; never mutated by consumer flows.

## Validation rules (business)

- `equityPct + fixedIncomePct + goldPct == 100`; each a non-negative multiple of 5.
- One `MasarResult` per consumer (unique constraint enforces keep-latest-only).
- Practice/sim data (`SimAccount`/`SimTrade`) is never read or written by any Masar query (FR-018).
- The illustration is **backward-looking only**; no field stores or implies a forward/expected return (FR-009).

## Privacy / data inventory (constitution V)

| Data | Why | Retention |
|------|-----|-----------|
| `MasarResult` (archetype, chosen mix, Sharia flag, answer choices) | Persist the user's saved Masar profile + planning hand-offs | Until user deletes/retakes (overwrite) or account deleted (cascade) |
| `MasarBenchmarkPoint` | Backend-served benchmark series for the historical illustration | Operational reference; not personal data |
| Anonymous quiz answers | Compute a transient result only | **Not stored** (client-side only until explicit save) |

No new third-party PII processors introduced; all data stored in the existing PostgreSQL instance.
