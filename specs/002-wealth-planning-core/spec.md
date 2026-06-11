# Feature Specification: Wealth Planning Core (تخطيط تكوين الثروة)

**Feature Branch**: `002-wealth-planning-core`

**Created**: 2026-06-11

**Status**: Draft

**Input**: User description: "Wealth planning core: unified net worth tracker across all assets and liabilities with monthly history, financial goals with required-saving projection and progress tracking, and a real-return lens comparing growth against EGP inflation, USD, and gold."

## Summary

Tharwa today helps a signed-in consumer **watch** the market and **track** what they already own (stock portfolio from the trade journal, gold, watchlist) and compute **Zakat**. It does not yet help them **plan and build** wealth toward a goal, nor tell them whether their wealth is actually growing in real terms given Egyptian inflation and EGP devaluation.

This feature adds a **planning layer** for signed-in consumers, built on top of existing portfolio, metals, and FX data:

1. **Unified Net Worth** — one number that aggregates all of a user's assets (tracked equities, tracked gold, plus manually entered cash, savings certificates, real estate, and other assets) minus liabilities (loans, debts), with a monthly history curve.
2. **Financial Goals** — user-defined targets (amount + target date) with a transparent required-monthly-saving calculation and progress tracking against actual net worth.
3. **Real-Return Lens** — an informational view of whether net worth (or a contribution plan) is growing faster than EGP inflation, the US dollar, and gold over a chosen period.

All outputs are **informational and self-reported**: no brokerage, no order execution, no guaranteed returns, and no personalized investment advice (per constitution Principles VI and the Explicit Out of Scope section).

## Clarifications

### Session 2026-06-11

- Q: Should projections assume a market growth rate? → A: **No assumed growth by default.** The required-monthly-saving figure is computed as a simple contribution amount that does **not** assume any investment return. A user MAY optionally enter an illustrative annual growth rate; when they do, results MUST be labeled clearly as illustrative scenarios, never predictions or guarantees.
- Q: Are manually entered assets/liabilities in scope? → A: **Yes.** A net worth figure is meaningless without cash, certificates, real estate, and debts that Tharwa does not otherwise track. Manual entries are user-authored, self-reported records (same legal posture as the trade journal).
- Q: Does the practice/simulation portfolio count toward net worth? → A: **No.** The practice portfolio uses virtual cash and is explicitly excluded from net worth, goals, and real-return math.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See my total net worth in one place (Priority: P1)

As a **signed-in** consumer, I want to see all of my wealth combined into a single net worth figure — my tracked equities and gold plus the cash, savings certificates, real estate, and other assets I add manually, minus the debts I owe — so I understand my real financial position at a glance and watch it change over time.

**Why this priority**: Net worth is the foundational number the rest of the feature (goals, real return) depends on. On its own it converts Tharwa from a price/tracking app into a wealth overview, delivering immediate standalone value.

**Independent Test**: With a test consumer account that has at least one tracked position and one manual asset plus one liability, verify the net worth screen shows a correct total (assets − liabilities), a breakdown by category, and that the figure updates when manual entries change — without implementing goals or the real-return lens.

**Acceptance Scenarios**:

1. **Given** a signed-in consumer with tracked equity/gold positions and at least one manual asset and one liability, **When** they open the net worth screen, **Then** they see a single total net worth value in EGP plus a category breakdown (equities, gold, cash, certificates, real estate, other assets, liabilities).
2. **Given** the same consumer, **When** they add, edit, or delete a manual asset or liability, **Then** the net worth total and breakdown update to reflect the change.
3. **Given** a consumer who has used the app across more than one month, **When** they view the net worth history, **Then** they see a month-over-month curve of recorded net worth snapshots with the change versus the previous snapshot.
4. **Given** market data for a tracked instrument is stale or unavailable, **When** net worth is displayed, **Then** the affected portion shows a freshness/"as of" indicator and the total is never presented as a silent guaranteed-live figure.
5. **Given** an anonymous or signed-out user, **When** they attempt to open net worth, goals, or manual-asset flows, **Then** they are prompted to sign in or register before any personal data is shown or stored.
6. **Given** a consumer viewing net worth, **When** the screen renders, **Then** it shows copy stating the figure is a self-reported informational estimate, not a valuation, audited statement, or investment advice.

---

### User Story 2 — Plan toward a financial goal (Priority: P1)

As a **signed-in** consumer, I want to define a financial goal (e.g. "apartment down payment — 800,000 EGP by Dec 2028"), see how much I would need to set aside each month to reach it, and track my progress against my actual net worth, so I have a concrete plan and motivation to build wealth.

**Why this priority**: This is the core "planning" capability that gives the feature its name and differentiates Tharwa from a passive tracker. It is independently demonstrable once net worth exists.

**Independent Test**: With a test account, create a goal with a target amount and date, verify the required monthly contribution is computed transparently (target minus current allocated amount, divided by months remaining, with no assumed return), and verify progress percentage updates as net worth / linked contributions change.

**Acceptance Scenarios**:

1. **Given** a signed-in consumer, **When** they create a goal with a target amount and target date, **Then** the system stores it and shows a required monthly saving amount derived from the remaining amount and the number of months until the target date.
2. **Given** an existing goal, **When** the consumer views it, **Then** they see progress (current saved amount vs target), percentage complete, months remaining, and whether they are on track based on the required monthly saving.
3. **Given** a consumer who optionally enters an illustrative annual growth rate for a goal, **When** the projection is shown, **Then** results are explicitly labeled as an illustrative scenario (not a prediction or guarantee) and the no-growth required-saving figure remains available.
4. **Given** a goal with a target date in the past or zero/negative months remaining, **When** the consumer views it, **Then** the system shows a clear "past due" / "target date reached" state instead of dividing by zero or showing a misleading number.
5. **Given** a consumer with multiple goals, **When** they view their goals list, **Then** each goal shows its own progress and required monthly saving independently, and total required monthly saving across goals is available.
6. **Given** any goal screen, **When** it renders, **Then** copy states that projections are illustrative planning tools only and do not guarantee any outcome or constitute investment advice.

---

### User Story 3 — Know if my wealth is really growing (Priority: P2)

As a **signed-in** consumer, I want to see whether my net worth is growing faster than Egyptian inflation, the US dollar, and gold over a period I choose, so I understand whether my wealth is genuinely increasing in real terms or merely keeping up with (or losing to) the erosion of the Egyptian pound.

**Why this priority**: A high-impact differentiator for the Egyptian context, but it depends on net worth history (US1) and benchmark data, so it follows the foundational stories.

**Independent Test**: With a test account that has at least two net worth snapshots spanning a period, verify the real-return view shows nominal net worth change alongside inflation, USD, and gold changes for the same period, and a clear indicator of real (above/below) performance — without requiring goals.

**Acceptance Scenarios**:

1. **Given** a consumer with net worth history spanning a selectable period, **When** they open the real-return lens, **Then** they see their nominal net worth change for the period alongside the change in EGP inflation, USD/EGP, and gold for the same period.
2. **Given** the same view, **When** benchmarks are displayed, **Then** the consumer sees a clear visual indicator of whether their net worth grew faster (real gain) or slower (real erosion) than each benchmark.
3. **Given** inflation data is unavailable or stale for the selected period, **When** the view renders, **Then** the inflation comparison shows an explicit unavailable/"as of" state rather than a misleading zero.
4. **Given** insufficient history (fewer than two snapshots) for the selected period, **When** the consumer opens the lens, **Then** they see a clear empty/insufficient-data state explaining that more history is needed.
5. **Given** any real-return screen, **When** it renders, **Then** copy states the comparison is informational only, derived from self-reported data and indicative benchmarks, and is not investment advice.

---

### Edge Cases

- **Mixed-currency assets**: A manual asset entered in USD must be converted to EGP for the net worth total using a clearly dated FX rate; if FX is stale, the conversion shows an "as of" indicator.
- **Negative net worth**: Liabilities exceeding assets must display correctly (negative total) without errors or hidden fields.
- **Stale or missing quotes**: Tracked positions whose live/indicative price is unavailable fall back to last-known value with a freshness indicator; the net worth total clearly reflects which components are stale.
- **Sold-out / removed instruments**: A tracked position that nets to zero or whose instrument is no longer consumer-visible contributes zero and does not break the breakdown.
- **Goal with target date today / in the past**: Required monthly saving must not divide by zero; show "target date reached" or "past due".
- **Goal target already met**: Progress caps at 100% with an "achieved" state.
- **Snapshot timing**: Net worth history must define a consistent monthly snapshot point so the curve is comparable month to month; backfilling for users with no prior history starts from first use.
- **Illustrative growth rate misuse**: Extremely large user-entered growth rates must still be labeled illustrative and must never be presented as expected or guaranteed.
- **Practice portfolio**: Virtual practice holdings must never leak into net worth, goals, or real-return math.
- **Data deletion / sign-out**: Personal planning data (manual assets, liabilities, goals, snapshots) must follow the same gating and retention rules as other signed-in features; not visible after sign-out without re-auth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute a consumer's net worth as the sum of all asset components minus all liability components, expressed in EGP, for signed-in consumers only.
- **FR-002**: The system MUST include tracked equity positions and tracked gold/metal holdings (derived from existing portfolio/journal data) as asset components, valued using indicative/last-known market prices with freshness metadata.
- **FR-003**: The system MUST allow signed-in consumers to create, edit, and delete **manual** assets in defined categories (at minimum: cash, savings certificates / deposits, real estate, other) and **manual** liabilities (at minimum: loans/debts), each with an amount, currency, optional label, and optional note.
- **FR-004**: Manual assets/liabilities entered in a currency other than EGP MUST be converted to EGP for the total using a dated FX rate sourced from the backend, with a visible "as of" indicator when the rate is stale.
- **FR-005**: The system MUST present a net worth breakdown by category so the consumer can see how much each asset class and liabilities contribute to the total.
- **FR-006**: The system MUST record periodic (at least monthly) net worth snapshots and expose a history series so the consumer can view their net worth change over time.
- **FR-007**: The system MUST allow signed-in consumers to create, edit, and delete **financial goals**, each with a target amount (EGP), a target date, an optional label, and an optional linkage describing which saved amount counts toward it.
- **FR-008**: For each goal, the system MUST compute a **required monthly saving** as the remaining amount divided by the whole months until the target date, **without assuming any investment return**.
- **FR-009**: For each goal, the system MUST show progress: current saved amount, target amount, percentage complete, months remaining, and an on-track / behind indicator. Because Tharwa does not track per-month contributions, the indicator MUST be **pace-based**: a goal is "on track" when its percentage complete is at least the percentage of time elapsed between creation and the target date (or when it is achieved), and "behind" otherwise.
- **FR-010**: The system MUST allow an **optional** user-entered illustrative annual growth rate per goal; when provided, projected outcomes MUST be explicitly labeled as illustrative scenarios and MUST NOT be presented as predictions, expected values, or guarantees.
- **FR-011**: The system MUST handle goal edge cases safely: target date today/in the past shows a "past due"/"reached" state (no divide-by-zero), and a met target shows an "achieved" state capped at 100%.
- **FR-012**: The system MUST provide a **real-return lens** that, for a consumer-selected period, presents the consumer's nominal net worth change alongside the change in EGP inflation, USD/EGP, and gold for the same period, with a clear indicator of real (above/below benchmark) performance.
- **FR-013**: Inflation benchmark data MUST be sourced through the backend (administratively managed, not called directly by clients) and MUST show an explicit unavailable/stale state when data for the selected period is missing.
- **FR-014**: The real-return lens MUST show a clear insufficient-data state when fewer than two net worth snapshots exist for the selected period.
- **FR-015**: All net worth, goal, and real-return surfaces MUST display copy clarifying that figures are **self-reported, informational estimates** — not valuations, audited statements, guaranteed outcomes, or investment advice — in the active UI language (Arabic default, English when enabled).
- **FR-016**: The virtual **practice/simulation** portfolio MUST be excluded from all net worth, goal, and real-return calculations.
- **FR-017**: All planning data (manual assets, liabilities, goals, snapshots) MUST require a signed-in consumer account; anonymous/signed-out users MUST be prompted to authenticate before any such data is shown or stored, and MUST NOT see it after sign-out without re-auth.
- **FR-018**: Net worth and benchmark displays MUST carry freshness/"as of" semantics for any market-derived value and MUST NOT imply guaranteed real-time data unless that is true.
- **FR-019**: The system MUST allow the consumer to integrate existing tracked holdings into a goal's saved amount where applicable, so progress reflects real wealth rather than requiring duplicate manual entry. (Exact linkage model defined in planning.)

### Key Entities *(include if data involved)*

- **NetWorthComponent**: A single contributor to net worth for a consumer — either derived (a tracked equity/metal position valued at an indicative price) or manual (a user-authored asset or liability). Attributes: owner (consumer), kind (asset/liability), category, amount, currency, source (derived vs manual), valuation freshness/as-of, optional label/note.
- **NetWorthSnapshot**: A point-in-time recorded total net worth for a consumer (with category subtotals) used to build the history curve. Attributes: owner, snapshot date, total EGP, category breakdown, data-freshness summary.
- **FinancialGoal**: A user-defined wealth target. Attributes: owner, label, target amount (EGP), target date, current saved amount (or linkage rule), optional illustrative growth rate, status (active/achieved/past-due).
- **InflationBenchmark**: Administratively managed reference data describing EGP inflation over time, used for the real-return lens. Attributes: period, inflation rate/index value, source label, as-of date.
- **Benchmark comparison (derived, not stored)**: For a selected period, the computed nominal net worth change versus inflation, USD/EGP, and gold changes, with real-performance indicators.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in consumer with at least one tracked position and one manual entry can view a correct total net worth (assets − liabilities) and category breakdown within 5 seconds of opening the screen on a typical mobile connection in 95% of trials.
- **SC-002**: A consumer can create a financial goal and see a transparent required-monthly-saving figure in under 2 minutes end-to-end, with the figure verifiably equal to remaining amount divided by whole months remaining (no assumed return).
- **SC-003**: 100% of net worth, goal, and real-return screens display the self-reported / non-advisory informational disclaimer in the active UI language.
- **SC-004**: For any consumer with at least two monthly snapshots, the real-return lens correctly reports whether nominal net worth change exceeded or trailed each of inflation, USD, and gold for the selected period in 100% of verification cases with available benchmark data.
- **SC-005**: 100% of market-derived values shown in net worth and benchmarks carry a freshness/"as of" indicator when the underlying data is stale.
- **SC-006**: In 100% of negative-test cases, anonymous/signed-out users are blocked from viewing or storing planning data and are prompted to authenticate.
- **SC-007**: Goal edge cases (past/zero months remaining, target already met) produce a defined state with no calculation errors in 100% of tested cases.
- **SC-008**: The virtual practice portfolio contributes 0 to net worth, goals, and real-return outputs in 100% of verification cases.

## Assumptions

- **Identity**: This feature is signed-in only and reuses the existing consumer account, authentication, and gating model; no new auth method is introduced.
- **Data path**: All market-derived values (equity prices, metal prices, FX, inflation) are served by the existing backend; clients never call external providers directly (constitution Principle III).
- **Base currency**: Net worth, goals, and benchmarks are presented in EGP; non-EGP manual entries are converted using backend FX with dated semantics.
- **Snapshot cadence**: Net worth history is captured at least monthly; users with no prior history start accumulating from first use (no synthetic backfill of past wealth).
- **No assumed returns**: Required-saving math assumes no investment growth by default; any growth rate is user-entered and labeled illustrative only — consistent with the constitution's prohibition on implying guaranteed returns or personalized advice.
- **Self-reported posture**: Manual assets, liabilities, and goals are user-authored records analogous to the existing trade journal; Tharwa does not verify, value, or audit them and does not hold funds.
- **Inflation source**: A specific inflation data provider/source is selected during planning/implementation; this spec requires backend sourcing, admin manageability, labeling, and graceful degradation rather than naming a vendor.
- **Localization**: All new surfaces support Arabic (default, RTL) and English (when enabled), reusing existing i18n conventions.

## Out of Scope (this spec)

- Brokerage execution, linking live brokerage/bank accounts for automated balance import, or holding/custody of funds.
- Automated or personalized investment recommendations, robo-advisory allocation advice, or any guaranteed-return projection.
- Recurring-contribution automation/DCA backtesting, savings-product (certificate/T-bill) comparison, asset-allocation guidance, and dividend-income projection — these are planned as **subsequent** features (later phases) and are not part of this spec.
- Automatic bank/SMS transaction import or full budgeting/expense tracking.
- Tax computation beyond the existing separate Zakat feature.
