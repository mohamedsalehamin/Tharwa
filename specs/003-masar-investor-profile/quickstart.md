# Quickstart: Masar — Investor Profile (backend-api + mobile-app)

**Feature**: `003-masar-investor-profile` | **Date**: 2026-06-29

This feature is **additive**. It introduces two Prisma tables (`MasarResult`, `MasarBenchmarkPoint`)
and one enum (`MasarArchetype`), new **public** quiz/result/illustration routes, authenticated
**profile** routes, one **admin** benchmark route, and new mobile screens. No external provider
integration is added; the historical illustration is served from admin-managed monthly data plus
the existing feature-002 `InflationBenchmark`.

## Prerequisites

- Existing local backend stack running (PostgreSQL 16+, Redis 7+) per `backend-api/README.md`.
- A seeded **consumer account** (Bearer token) and an **admin account** (for the benchmark route).
- Feature 002 (`InflationBenchmark`) present — the illustration reads inflation from it.

## Backend setup

1. **Apply schema changes** (after the new models/enum are added to `prisma/schema.prisma`):

   ```bash
   cd backend-api
   npx prisma migrate dev --name masar_investor_profile
   npx prisma generate
   ```

2. **Seed benchmark data** (needed for the historical illustration). Seed at least two months
   so a period has endpoints; seed an inflation row too (feature 002 route):

   ```bash
   # Masar asset-class + USD/gold series (this feature)
   curl -X PUT http://localhost:3000/admin/v1/masar-benchmarks \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{ "periodMonth": "2021-06-01", "equityIndex": 100, "fixedIncomeIndex": 100, "goldEgpPerGram": 1000, "usdEgp": 15.7, "sourceLabel": "EGX30 / CBE T-bill / local gold" }'

   curl -X PUT http://localhost:3000/admin/v1/masar-benchmarks \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{ "periodMonth": "2026-06-01", "equityIndex": 230, "fixedIncomeIndex": 190, "goldEgpPerGram": 4600, "usdEgp": 49.5, "sourceLabel": "EGX30 / CBE T-bill / local gold" }'

   # Inflation (feature 002 route) for the same endpoints
   curl -X PUT http://localhost:3000/admin/v1/inflation-benchmarks \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{ "periodMonth": "2021-06-01", "indexValue": 100.0, "sourceLabel": "CAPMAS urban CPI" }'
   curl -X PUT http://localhost:3000/admin/v1/inflation-benchmarks \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{ "periodMonth": "2026-06-01", "indexValue": 235.0, "sourceLabel": "CAPMAS urban CPI" }'
   ```

3. **Run the backend** as usual; the new routes register under `/v1/masar` and `/admin/v1`.

## Verify public flows (no token required)

```bash
# 1) Archetype catalog (5 archetypes + default allocations)
curl http://localhost:3000/v1/masar/archetypes

# 2) Compute an archetype from quiz answers (deterministic) — expect e.g. growth_balanced
curl -X POST http://localhost:3000/v1/masar/result -H "Content-Type: application/json" \
  -d '{ "goal": "grow_long_term", "volatilityComfort": "comfortable", "nearTermNeed": "no", "shariaPreferred": false }'

# 2b) Determinism: same answers => same archetype (run twice, compare)
# 2c) Conservative pull: near-term need flips toward conservative even with growth goal
curl -X POST http://localhost:3000/v1/masar/result -H "Content-Type: application/json" \
  -d '{ "goal": "grow_long_term", "volatilityComfort": "comfortable", "nearTermNeed": "yes", "shariaPreferred": false }'

# 3) Historical illustration for a mix over 60 months
curl -X POST http://localhost:3000/v1/masar/illustration -H "Content-Type: application/json" \
  -d '{ "allocation": { "equityPct": 70, "fixedIncomePct": 20, "goldPct": 10 }, "months": 60 }'
```

## Verify authenticated profile flows (`$TOKEN` = consumer Bearer)

```bash
# Save (overwrite) the profile — keep latest only
curl -X PUT http://localhost:3000/v1/masar/profile -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "archetype": "growth_balanced", "allocation": { "equityPct": 70, "fixedIncomePct": 20, "goldPct": 10 }, "shariaPreferred": false }'

# Read it back
curl http://localhost:3000/v1/masar/profile -H "Authorization: Bearer $TOKEN"

# Retake + save again => the single row is overwritten (no second row)
curl -X PUT http://localhost:3000/v1/masar/profile -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "archetype": "balanced", "allocation": { "equityPct": 50, "fixedIncomePct": 35, "goldPct": 15 }, "shariaPreferred": true }'

# Delete
curl -X DELETE http://localhost:3000/v1/masar/profile -H "Authorization: Bearer $TOKEN"

# Negative-auth check (SC-006): profile routes must be 401 without a token
for m in GET PUT DELETE; do
  echo -n "$m /v1/masar/profile -> "; curl -s -o /dev/null -w "%{http_code}\n" -X $m "http://localhost:3000/v1/masar/profile"   # expect 401
done

# Public routes must NOT require auth (expect 200/400, never 401)
echo -n "POST /v1/masar/result (no token) -> "; curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3000/v1/masar/result -H "Content-Type: application/json" \
  -d '{ "goal":"not_sure","volatilityComfort":"uncomfortable","nearTermNeed":"not_sure","shariaPreferred":false }'
```

### Expected results (acceptance mapping)

- **US1 / FR-001..FR-004**: `POST /v1/masar/result` returns exactly one `archetype` deterministically; same answers → same archetype; ambiguous/"not sure" → a defined (conservative-leaning) archetype.
- **US2 / FR-005..FR-007**: response `defaultAllocation` sums to 100 across **only** equity/fixedIncome/gold; no instrument is ever named; Sharia flag changes framing copy, not percentages.
- **US3 / FR-008..FR-010**: `POST /v1/masar/illustration` returns `mixChangePct` and per-benchmark `outcome` (`ahead`/`behind`/`flat`/`unavailable`); `<2` benchmark months → `hasSufficientData=false`; missing index → that benchmark `unavailable`; `sourceLabel`/`asOf` present.
- **US4 / FR-012..FR-014, FR-021..FR-022**: profile routes require a token (401 otherwise); saving overwrites the single row (keep-latest); the mobile "turn into a goal" hand-off uses the existing `/v1/goals` flow (no new return math).
- **FR-016**: no endpoint exposes a buy/execute/invest-now action.
- **FR-017**: every response carries a `disclaimer` string for subtle, non-banner display.
- **FR-018 / SC-008**: practice/sim data is never read or written.

## Mobile verification

1. Run the app (signed out). Open **Masar** ("ابدأ مسارك") → complete the 4-step quiz → see the
   archetype + donut (70/20/10 etc.) + adjust in 5% steps + the backward-looking illustration.
2. Try **Save** while signed out → prompted to sign in/register (FR-012). After auth, the
   transient result is carried over and offered to save (FR-022).
3. Signed in: **Save**, reopen Masar → saved profile loads. **Turn into a goal** → existing Goal
   flow opens pre-filled. **Add to watchlist** / **Learn more** → route to existing surfaces.
4. Switch language → archetype names/descriptions + copy re-render correctly with RTL for Arabic.
5. Sign out → saved profile not visible without re-auth.

## Notes

- Allocation percentages are integers in 5% steps summing to 100; illustration math uses index
  ratios over monthly points (pure, unit-tested).
- No new secrets or third-party PII processors are introduced; anonymous quiz answers are never stored.
