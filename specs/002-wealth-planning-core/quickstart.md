# Quickstart: Wealth Planning Core (backend-api + mobile-app)

**Feature**: `002-wealth-planning-core` | **Date**: 2026-06-11

This feature is **additive** to the running backend and mobile app. It introduces new
Prisma tables, new authenticated `/v1/` consumer routes, one admin route, a monthly
snapshot job, and new mobile screens. No external provider integration is added.

## Prerequisites

- Existing local backend stack running (PostgreSQL 16+, Redis 7+) per `backend-api/README.md`.
- A seeded **consumer account** (sign in to obtain a Bearer token) and an **admin account**
  (for the inflation benchmark route).
- Existing market data working (FX + metals quotes), since net worth valuation reuses them.

## Backend setup

1. **Apply schema changes** (after the new models are added to `prisma/schema.prisma`):

   ```bash
   cd backend-api
   npx prisma migrate dev --name wealth_planning_core
   npx prisma generate
   ```

2. **Seed an inflation benchmark** (needed for the real-return inflation comparison). Either
   call the admin route or insert a row directly:

   ```bash
   curl -X PUT http://localhost:3000/admin/v1/inflation-benchmarks \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{ "periodMonth": "2026-06-01", "indexValue": 100.0, "yoyRatePct": 28.5, "sourceLabel": "CAPMAS urban CPI" }'
   ```

3. **Run the backend** as usual; the new routes register under `/v1` and `/admin/v1`.

## Verify consumer flows (`$TOKEN` = consumer Bearer)

```bash
# 1) Add a manual asset (cash) and a liability (loan)
curl -X POST http://localhost:3000/v1/networth/components -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "kind": "asset", "category": "cash", "label": "Bank account", "amount": 50000, "currency": "EGP" }'

curl -X POST http://localhost:3000/v1/networth/components -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "kind": "liability", "category": "loan", "label": "Car loan", "amount": 20000, "currency": "EGP" }'

# 2) Read net worth (should be assets − liabilities, with breakdown + freshness)
curl http://localhost:3000/v1/networth -H "Authorization: Bearer $TOKEN"

# 3) Capture this month's snapshot, then list history
curl -X POST http://localhost:3000/v1/networth/snapshots -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/v1/networth/snapshots?months=24" -H "Authorization: Bearer $TOKEN"

# 4) Create a goal and read required monthly saving + progress
curl -X POST http://localhost:3000/v1/goals -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "label": "Apartment down payment", "targetAmountEgp": 800000, "targetDate": "2028-12-01", "savedSource": "net_worth" }'
curl http://localhost:3000/v1/goals -H "Authorization: Bearer $TOKEN"

# 5) Real-return lens (needs >= 2 snapshots in the period; otherwise hasSufficientData=false)
curl "http://localhost:3000/v1/networth/real-return?months=12" -H "Authorization: Bearer $TOKEN"

# 6) Negative-auth check (SC-006): every new route must return 401 without a valid token
for p in "/v1/networth" "/v1/networth/components" "/v1/networth/snapshots" "/v1/networth/real-return" "/v1/goals"; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"   # expect 401
done
```

### Expected results (acceptance mapping)

- **US1 / FR-001..FR-005**: `GET /v1/networth` returns `totalEgp = assetsEgp − liabilitiesEgp`, a category `breakdown`, and `freshness`; mutating components changes the total. Negative net worth renders correctly.
- **US2 / FR-008..FR-011**: `requiredMonthlyEgp` equals `max(0, target − currentSaved) / max(1, whole months remaining)` with **no assumed return**; past/zero months → `past_due`; met target → `achieved`, `progressPct` capped at 100.
- **US3 / FR-012..FR-014**: real-return reports `nominalChangePct` and per-benchmark `outcome` (`ahead`/`behind`/`flat`/`unavailable`); `<2` snapshots → `hasSufficientData=false`; missing inflation anchor → that benchmark `unavailable`.
- **FR-015**: every response carries a `disclaimer` (self-reported / informational / not advice).
- **FR-016 / SC-008**: practice/sim holdings never appear in any total.
- **FR-017**: requests without a valid consumer token return `401`.

## Monthly snapshot job

- `jobs/capture-networth-snapshots.ts` runs on a monthly schedule (cron/interval per existing
  job wiring) and upserts a `NetWorthSnapshot` per active consumer for the current month,
  freezing `usdEgpRate`, `goldGramEgp`, and `inflationIndex` anchors.
- For local testing, trigger the per-user `POST /v1/networth/snapshots` instead of waiting for
  the schedule. To exercise real-return locally, insert two snapshots in different months
  (or temporarily set distinct `periodMonth` values).

## Mobile verification

1. Run the app, sign in.
2. Open the **Net Worth** screen → confirm total, breakdown, history curve, freshness banner,
   and the disclaimer; add/edit/delete a manual asset and confirm the total updates.
3. Open **Goals** → create a goal → confirm required monthly saving, progress, and the
   illustrative-scenario labeling when an optional growth rate is entered.
4. Open the **Real-return** view → confirm benchmark comparison or the insufficient-data state.
5. Sign out → confirm planning screens require re-auth and show no cached personal data.

## Notes

- All money math uses `Prisma.Decimal`; totals are EGP. Non-EGP manual entries convert via the
  existing cached FX with an `asOf` indicator.
- No new secrets or third-party PII processors are introduced.
