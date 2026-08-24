# Research & Decisions: Masar — Investor Profile & Illustrative Model

**Date**: 2026-06-29 | **Plan**: [plan.md](./plan.md)

## 1. Archetype set & deterministic mapping

- **Decision**: Five archetypes on an equity-ascending ladder, each with a fixed **default** illustrative allocation (equity/fixed-income/gold): المحافِظ `20/55/25`, المتوازن الحذِر `35/45/20`, المتوازن `50/35/15`, النامي المتوازن `70/20/10`, الجريء طويل المدى `85/5/10`. The answer→archetype mapping is a **pure scoring function**: each answer contributes to a risk score; the near-term-need answer applies a strong conservative pull; "not sure" answers contribute the most conservative weight; ties resolve **downward** (toward the more conservative archetype). Implemented in `services/masar-classify.ts`, fully unit-tested.
- **Rationale**: Determinism is a hard requirement (FR-003, SC-002). A scoring function with documented weights and downward tie-breaking is transparent, testable, and easy for product to tune without schema changes. Five buckets match the clarified scope and give meaningful differentiation without an unwieldy mapping table.
- **Alternatives considered**: A hand-written lookup table for every answer combination (rejected — combinatorial, brittle to tune, easy to leave gaps that yield an undefined archetype); an ML/“personality” model (rejected — non-deterministic, opaque, overkill, and would blur the non-advisory line).

## 2. Where the archetype catalog lives (code vs DB)

- **Decision**: The archetype catalog (identifiers, default allocations, i18n keys for name/description, Sharia-variant framing) is **reference data in code** (`services/masar-archetypes.ts`), not a DB table. Only the per-consumer `MasarResult` is persisted.
- **Rationale**: The catalog is small, versioned with the app, and tightly coupled to the classification weights and copy; storing it in code keeps the mapping function and its outputs consistent and unit-testable, and avoids an admin CRUD surface that isn't needed for MVP. i18n strings live in `ar.json`/`en.json` per constitution IX.
- **Alternatives considered**: DB-backed catalog with admin editing (deferred — adds surface area and migration churn for data that changes rarely and must stay in lockstep with the scoring weights).

## 3. Historical-illustration data source

- **Decision**: Introduce one admin-managed monthly table `MasarBenchmarkPoint(periodMonth, equityIndex, fixedIncomeIndex, goldEgpPerGram, usdEgp, sourceLabel, asOf)`. **Inflation** reuses the existing feature-002 `InflationBenchmark` series. The illustration for a period `[t0, t1]` computes the mix's nominal change as the weighted sum of each asset class's index change, then compares it against benchmark changes — inflation (from `InflationBenchmark`), USD (`usdEgp` delta), gold (`goldEgpPerGram` delta) — emitting a per-benchmark `outcome` (`ahead`/`behind`/`flat`/`unavailable`), reusing the real-return outcome shape from feature 002.
- **Rationale**: Keeps the illustration a **pure deterministic function over stored monthly indices** (testable per SC-005) and fully backend-served with a visible `sourceLabel` (constitution III/VI/VII). Gold serves double duty — it is both an asset class in the mix and a comparison benchmark — so a single gold series avoids divergence. Admin entry is low-volume and mirrors the proven `InflationBenchmark` pattern.
- **Alternatives considered**:
  - Reconstruct asset-class history from heterogeneous existing sources (metals snapshots for gold, FX history for USD, an EGX index scrape for equity, a T-bill proxy for fixed income) — rejected for MVP: mixed cadences/gaps, brittle, hard to unit-test as one pure function.
  - Reuse per-user `NetWorthSnapshot` anchors — rejected: those are per-consumer and sparse; the illustration must work for an anonymous user with no snapshots.
  - Live forward simulation — rejected outright: would imply expected/guaranteed returns (constitution VI).
- **Note (future)**: gold could later be unified with the existing metals series, and equity/fixed-income could be backfilled from an automated connector; the table shape is forward-compatible.

## 4. Open quiz vs gated persistence & anonymous carry-over

- **Decision**: `POST /v1/masar/result`, `POST /v1/masar/illustration`, and `GET /v1/masar/archetypes` are **public** (no auth, no storage). Persisting (`PUT /v1/masar/profile`), reading the saved profile (`GET`), and deleting it require `consumerBearerPreHandler`. Carry-over is **client-side**: the app keeps the transient result in memory/local state and, after sign-in/registration, offers to `PUT` it (FR-022) — no server-side anonymous record is created.
- **Rationale**: Lowest friction funnel (FR-011) with zero anonymous PII, while persistence and hand-offs stay behind the same gate as the rest of the planning layer (FR-012). Client-side carry-over avoids a temporary anonymous-storage mechanism and its cleanup/retention complexity.
- **Alternatives considered**: Optional-auth on the public endpoints that auto-persists when a token is present (rejected — violates "explicit save", FR-013/FR-022); server-side anonymous draft keyed by device id (rejected — introduces anonymous PII + retention burden the constitution discourages).

## 5. Retake retention (keep latest only)

- **Decision**: `MasarResult` is **one active row per consumer**; saving after a retake **upserts/overwrites** (unique on `consumerUserId`). No version history (FR-021).
- **Rationale**: Matches the clarified decision, minimizes stored personal data (constitution V), and removes any ambiguity about which profile is "active".
- **Alternatives considered**: Full history or last-N (rejected per clarification — more data, no MVP value).

## 6. Sharia preference handling

- **Decision**: The Sharia flag is stored on `MasarResult` and changes **presentation only**: archetype description + asset-class framing (fixed income shown in its sukuk/Sharia-compliant form) + Learn routing. **Allocation percentages are unchanged** (FR-007). Masar never certifies a specific instrument's compliance.
- **Rationale**: Honors the clarified scope; keeps the model math identical and avoids implying a certified compliant product (which would edge toward advice/execution).
- **Alternatives considered**: Distinct Sharia allocations or a compliance certification step (rejected per clarification + constitution VI).

## 7. Non-advisory framing without an intrusive banner

- **Decision**: Convey the educational/illustrative/non-advisory nature through **naming and concise microcopy** — outputs labeled "نموذج توضيحي" / "شخصية المستثمر", illustration labeled backward-looking, and a lightweight optional "اعرف يعني إيه" info affordance — instead of a persistent legal banner (FR-017). API responses still include a machine-readable `disclaimer` string (consistent with feature 002) that the client renders subtly.
- **Rationale**: Satisfies the transparency obligation (constitution VI) and the product's explicit UX preference against heavy banners, while keeping a single source of truth for the disclaimer text.
- **Alternatives considered**: Full-width persistent disclaimer banner on every screen (rejected by product for aesthetics); no disclaimer at all (rejected — constitution VI).

## 8. Auth, resilience, i18n, practice exclusion

- **Decision**: Authenticated routes reuse `consumerBearerPreHandler`; the admin benchmark route reuses the existing admin JWT + `AdminAuditLog`. Mobile reads use `fetchWithLastKnown`/`lastKnownCache` for the illustration; copy added to `ar.json`/`en.json` with RTL. Masar never reads or writes `SimAccount`/`SimTrade` (FR-018).
- **Rationale**: Matches established patterns (`routes/v1/goals.ts`, `routes/admin/inflation-benchmark.ts`); satisfies FR-008/FR-012/FR-018/FR-019 and constitution IX.
