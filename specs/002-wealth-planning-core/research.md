# Research & Decisions: Wealth Planning Core

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

## 1. Net worth aggregation strategy

- **Decision**: Net worth = **derived components** (computed live from existing `buildPortfolioSummary` positions: equities + metals valued at indicative/last-known EGP prices) **+ manual components** (new user-authored assets/liabilities) − liabilities, all normalized to EGP.
- **Rationale**: Reuses the already-tested portfolio valuation (`services/portfolio.ts`, `portfolio-quotes.ts`) and the Redis-cached FX/metals quotes; avoids duplicating market math (constitution III, single source of truth).
- **Alternatives considered**: Snapshot-only net worth (rejected — would not reflect live holdings between snapshots); fully manual net worth ignoring tracked holdings (rejected — forces double entry, contradicts FR-002/FR-019).

## 2. Manual assets/liabilities model

- **Decision**: One table `ManualNetWorthComponent` with `kind` (`asset`|`liability`), `category` enum (`cash`, `certificate`, `real_estate`, `other_asset`, `loan`, `other_liability`), `amount` Decimal, `currency` (default `EGP`), optional `label`/`note`. User-authored, self-reported (same legal posture as `TradeJournalEntry`).
- **Rationale**: A single typed table keeps CRUD and aggregation simple while supporting the required categories (FR-003); enum keeps category breakdown deterministic.
- **Alternatives considered**: Separate asset/liability tables (more code, no benefit); free-text categories (breaks deterministic breakdown + i18n labeling).

## 3. Currency conversion for manual entries

- **Decision**: Convert non-EGP manual amounts to EGP at read time using `getFxRatesCached` (existing). Store the original `amount`+`currency`; never store a frozen EGP value for manual entries except inside snapshots. Surface `asOf` and an `isStale` flag on the converted value.
- **Rationale**: FX moves; storing original preserves user intent and lets totals re-value as rates change (FR-004, FR-018). Snapshots freeze values intentionally (see §4).
- **Alternatives considered**: Store EGP at entry time only (rejected — net worth would drift from reality as EGP devalues, defeating the Egyptian-context purpose).

## 4. Net worth snapshots + benchmark anchoring

- **Decision**: `NetWorthSnapshot` stores, per consumer per period: `totalEgp`, a `breakdown` JSON (category subtotals), and **benchmark anchors** captured at the same instant — `usdEgpRate`, `goldGramEgp`, and `inflationIndex` (nullable if unavailable). A monthly job captures snapshots; an authenticated "capture now" is also allowed (idempotent per calendar month).
- **Rationale**: Anchoring benchmarks inside the snapshot makes the **real-return** computation a pure subtraction between two snapshots — no fragile historical re-fetch of USD/gold/inflation for arbitrary past dates. Matches existing job patterns (`jobs/send-daily-briefs.ts`).
- **Alternatives considered**: Reconstruct benchmarks from `OhlcvBar`/`QuoteSnapshot` history on demand (rejected — gaps, missing inflation history, heavier queries); daily snapshots (rejected — excessive rows; monthly matches FR-006 cadence and the wealth-planning horizon).

## 5. Required-monthly-saving math (no assumed return)

- **Decision**: `requiredMonthly = max(0, (targetAmount − currentSaved)) / max(1, wholeMonthsUntil(targetDate))`. No investment return assumed (constitution VI). `currentSaved` resolved from the goal's `savedSource`: `manual` (a user-entered figure), `networth` (current total net worth), or `category:<cat>` (a category subtotal).
- **`onTrack` rule (time-elapsed pace, no contribution log)**: Tharwa does not record per-month contributions, so "behind" is derived from **pace vs elapsed time**, not from actual deposits. Let `totalMonths = wholeMonths(createdAt → targetDate)` and `elapsedMonths = wholeMonths(createdAt → today)`, both clamped to `≥ 0`. Define `expectedProgressPct = totalMonths == 0 ? 100 : min(100, (elapsedMonths / totalMonths) × 100)`. Then `onTrack = (status == achieved) || (progressPct ≥ expectedProgressPct)`. A `past_due` unmet goal is `onTrack = false`. This makes the indicator deterministic and unit-testable (FR-009).
- **Rationale**: Transparent, verifiable, and legally safe (SC-002, FR-008). Linking to net worth (FR-019) avoids duplicate entry. The pace-based `onTrack` avoids implying a contribution-tracking capability that is out of scope.
- **Alternatives considered**: Annuity/future-value formula requiring a return rate (rejected as default — implies expected returns); compounding by default (rejected — guaranteed-return risk); deriving `onTrack` from a monthly contribution log (rejected — no such log exists in scope).

## 6. Optional illustrative growth scenario

- **Decision**: If the user enters an optional annual growth rate `r`, compute an **illustrative** future value using standard monthly-contribution future-value math, returned in a clearly separated, explicitly-labeled field (`illustrativeScenario`). The no-growth `requiredMonthly` is always returned alongside.
- **Rationale**: Some users want a "what if" view; FR-010 permits it only when unmistakably labeled as illustrative (not a prediction/guarantee).
- **Alternatives considered**: Omit growth entirely (less useful); show growth by default (constitution violation).

## 7. Real-return computation

- **Decision**: For a selected period [start snapshot, end snapshot], compute nominal net worth % change, then compare against benchmark % changes derived from the snapshots' anchors: inflation (from `inflationIndex` delta), USD (from `usdEgpRate` delta), gold (from `goldGramEgp` delta). Output per-benchmark `realDeltaPct` and an `outcome` enum (`ahead`/`behind`/`flat`). Pure function, unit-tested.
- **Rationale**: Deterministic, testable (SC-004), resilient (missing anchor → that benchmark reports `unavailable`, FR-013).
- **Alternatives considered**: Time-weighted return / money-weighted IRR (rejected for MVP — net worth includes contributions, and IRR needs cash-flow timestamps; out of scope and risks implying performance attribution/advice).

## 8. Inflation benchmark data source

- **Decision**: Admin-managed `InflationBenchmark` rows (one per month): `periodMonth` (date, first of month), `indexValue` and/or `yoyRatePct`, `sourceLabel` (e.g. "CAPMAS urban CPI"), `asOf`. Backend serves the latest/index series; clients never fetch externally. Admin updates monthly via `/admin/v1/inflation-benchmarks` (audited).
- **Rationale**: Constitution III + VII — official inflation (CAPMAS/CBE) is published monthly and low-volume; manual admin entry is operationally simple and avoids an external feed dependency. `sourceLabel` satisfies transparency (constitution VI).
- **Alternatives considered**: Automated CAPMAS/CBE scraping connector (heavier, brittle, deferrable); per-client inflation input (rejected — inconsistent, not authoritative).

## 9. Practice/sim portfolio exclusion

- **Decision**: Net worth/goals/real-return read only from `TradeJournalEntry`-derived positions, metals, and manual components. `SimAccount`/`SimTrade` are never queried.
- **Rationale**: FR-016/SC-008 — virtual cash must not inflate real net worth.

## 10. Authentication, resilience & i18n

- **Decision**: All consumer endpoints use the existing `consumerBearerPreHandler` guard; admin endpoint uses the existing admin JWT + `AdminAuditLog`. Mobile reuses `fetchWithLastKnown`/`lastKnownCache` for net worth resilience and existing disclaimer/freshness components. All copy added to `ar.json`/`en.json` with RTL.
- **Rationale**: Matches established patterns (`routes/v1/portfolio.ts`, `zakat.ts`); FR-017, FR-015, constitution IX.
