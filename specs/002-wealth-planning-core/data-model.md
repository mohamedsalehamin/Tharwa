# Data Model: Wealth Planning Core (backend-api)

**Date**: 2026-06-11 | **ORM**: Prisma (PostgreSQL) | **Base currency**: EGP

Conventions follow the existing schema: UUID `id`, `@map` snake_case columns, `createdAt`/`updatedAt`, `Decimal` for money (`@db.Decimal(24, 4)`), per-consumer rows cascade on `ConsumerUser` delete.

## New enums

```prisma
enum NetWorthComponentKind {
  asset
  liability
}

enum NetWorthCategory {
  cash
  certificate      // bank savings certificates / deposits / T-bills (self-reported)
  real_estate
  other_asset
  loan
  other_liability
}

enum FinancialGoalStatus {
  active
  achieved
  past_due
}

enum GoalSavedSource {
  manual           // currentSaved is a user-entered figure
  net_worth        // currentSaved = current total net worth
  category         // currentSaved = subtotal of savedCategory
}
```

## 1. `ManualNetWorthComponent`

User-authored asset or liability that Tharwa does not otherwise track. Self-reported (legal posture identical to `TradeJournalEntry`).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| consumerUserId | UUID | FK → ConsumerUser, cascade delete |
| kind | NetWorthComponentKind | asset / liability |
| category | NetWorthCategory | drives breakdown + i18n label |
| label | string? | optional user label |
| amount | Decimal(24,4) | > 0; magnitude (sign implied by `kind`) |
| currency | string | default `EGP`; ISO-like code |
| note | text? | optional |
| createdAt / updatedAt | timestamptz | |

**Indexes**: `@@index([consumerUserId, kind])`. **Validation**: `amount > 0`; `currency` in supported set (EGP + the FX currencies the backend serves).

## 2. `NetWorthSnapshot`

Point-in-time recorded net worth with benchmark anchors for real-return math. One row per consumer per calendar month (idempotent capture).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| consumerUserId | UUID | FK → ConsumerUser, cascade delete |
| periodMonth | date (`@db.Date`) | first day of the snapshot month (uniqueness key) |
| capturedAt | timestamptz | actual capture instant |
| totalEgp | Decimal(24,4) | net worth (assets − liabilities), may be negative |
| breakdown | jsonb | category subtotals + derived/manual split |
| usdEgpRate | Decimal(18,6)? | benchmark anchor; null if FX unavailable at capture |
| goldGramEgp | Decimal(18,6)? | 24k gold per gram in EGP; null if metals unavailable |
| inflationIndex | Decimal(18,6)? | latest known inflation index at capture; null if unavailable |
| dataFreshness | jsonb? | which components were stale at capture (audit/UX) |

**Indexes**: `@@unique([consumerUserId, periodMonth])`, `@@index([consumerUserId, periodMonth(sort: Desc)])`.

## 3. `FinancialGoal`

User-defined wealth target.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| consumerUserId | UUID | FK → ConsumerUser, cascade delete |
| label | string | e.g. "Apartment down payment" |
| targetAmountEgp | Decimal(24,4) | > 0 |
| targetDate | date (`@db.Date`) | |
| savedSource | GoalSavedSource | default `manual` |
| manualSavedEgp | Decimal(24,4)? | required when savedSource=`manual` (≥ 0) |
| savedCategory | NetWorthCategory? | required when savedSource=`category` |
| illustrativeAnnualRatePct | Decimal(6,3)? | optional; drives illustrative scenario only |
| status | FinancialGoalStatus | derived/maintained: active/achieved/past_due |
| createdAt / updatedAt | timestamptz | |

**Indexes**: `@@index([consumerUserId, status])`. **Validation**: `targetAmountEgp > 0`; `manualSavedEgp ≥ 0` when manual; `savedCategory` set when category; `illustrativeAnnualRatePct` within a sane bound (e.g. −100..1000) and always treated as illustrative.

## 4. `InflationBenchmark`

Administratively managed EGP inflation reference (constitution III/VII — backend-served, no client external calls).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| periodMonth | date (`@db.Date`) | first day of month; unique |
| indexValue | Decimal(18,6)? | CPI index value (for index-delta math) |
| yoyRatePct | Decimal(8,4)? | optional year-over-year rate (display) |
| sourceLabel | string | e.g. "CAPMAS urban CPI" (shown to users) |
| asOf | timestamptz | provider/publish reference |
| createdAt / updatedAt | timestamptz | |

**Indexes**: `@@unique([periodMonth])`, `@@index([periodMonth(sort: Desc)])`. **Validation**: at least one of `indexValue` / `yoyRatePct` present; `sourceLabel` non-empty.

## Relationships (add to existing `ConsumerUser`)

```prisma
model ConsumerUser {
  // ... existing relations ...
  netWorthComponents ManualNetWorthComponent[]
  netWorthSnapshots  NetWorthSnapshot[]
  financialGoals     FinancialGoal[]
}
```

`InflationBenchmark` is global (not per-consumer); managed by admins only.

## Derived (not stored)

- **Net worth total + breakdown (live)**: computed by `services/net-worth.ts` = portfolio-derived positions (equities + metals, valued via existing cached quotes) + manual components (converted to EGP) − liabilities. Carries per-component freshness.
- **Breakdown presentation categories (response-only, NOT the stored enum)**: The `breakdown` array exposes a **superset** of `NetWorthCategory`. The two derived categories — `equities` and `gold` — are **presentation-only** labels for portfolio-derived holdings and are never persisted in `ManualNetWorthComponent.category` (which only stores the manual set). The full response category union is: `equities`, `gold` (derived assets) + `cash`, `certificate`, `real_estate`, `other_asset` (manual assets) + `loan`, `other_liability` (manual liabilities). Each subtotal carries `kind` (`asset`|`liability`). This intentional superset is reflected in the `NetWorthCategorySubtotal.category` enum in the OpenAPI contract.
- **Goal projection**: `requiredMonthlyEgp = max(0, target − currentSaved) / max(1, wholeMonthsUntil(targetDate))`; `progressPct`, `monthsRemaining`, `onTrack`. `onTrack` is **pace-based** (no contribution log): with `totalMonths = wholeMonths(createdAt → targetDate)`, `elapsedMonths = wholeMonths(createdAt → today)` (clamped `≥ 0`), and `expectedProgressPct = totalMonths == 0 ? 100 : min(100, elapsedMonths/totalMonths × 100)`, then `onTrack = (status == achieved) || (progressPct ≥ expectedProgressPct)`; a `past_due` unmet goal is `false`. Optional `illustrativeScenario` only when `illustrativeAnnualRatePct` set.
- **Real-return result**: from two `NetWorthSnapshot` rows in the selected period → nominal %Δ vs inflation/USD/gold %Δ, each with `outcome` (`ahead`/`behind`/`flat`/`unavailable`).

## State transitions

- **FinancialGoal.status**: `active` → `achieved` when current saved ≥ target; `active` → `past_due` when `targetDate` < today and not achieved. Recomputed on read and on goal/networth change.
- **NetWorthSnapshot**: created by monthly job or idempotent "capture now"; never mutated after capture (benchmark anchors are intentionally frozen). Re-capture within the same month updates the existing row (upsert on `[consumerUserId, periodMonth]`).

## Validation rules (business)

- Manual `amount` strictly positive; `kind` determines its effect on the total (assets add, liabilities subtract).
- Snapshot uniqueness per consumer per month prevents duplicate history points.
- Practice/sim data (`SimAccount`/`SimTrade`) is never read by any net-worth/goal/real-return query (FR-016).
- All money math uses `Prisma.Decimal`; EGP conversion uses backend FX with `asOf`.

## Privacy / data inventory (constitution V)

| Data | Why | Retention |
|------|-----|-----------|
| Manual assets/liabilities (amounts, labels, notes) | Compute net worth | Until user deletes or account deleted (cascade) |
| Net worth snapshots | History + real-return | Until account deleted (cascade); user-triggered clear optional |
| Financial goals | Planning + progress | Until user deletes or account deleted (cascade) |
| Inflation benchmark | Real-return benchmark | Operational reference; not personal data |

No new third-party PII processors introduced; all data stored in the existing PostgreSQL instance.
