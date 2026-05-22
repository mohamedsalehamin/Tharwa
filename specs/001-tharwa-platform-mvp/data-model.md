# Data Model: Tharwa Platform MVP (backend-api)

**Date**: 2026-05-12 | **ORM**: Prisma (PostgreSQL)

## Conventions

- Primary keys: UUID `id` (unless natural stable key documented).
- Timestamps: `createdAt`, `updatedAt` where mutable.
- Soft-delete: optional `deletedAt` for user-owned rows only where needed.

## Entities

### 1. `Instrument`

Represents something quotable or listable for consumers.

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| kind | enum | `fx`, `metal`, `equity` |
| code | string | Stable code, e.g. `USD`, `XAU`, `EGX:COMI` |
| displayNameAr | string | |
| displayNameEn | string | |
| isConsumerVisible | boolean | Admin toggle |
| sortOrder | int | For curated lists |
| metadata | jsonb | Equity: `{ "tvSymbol": "EGX:COMI" }` only. Gold karat math → `MetalKaratRule`. |

**Relationships**: many `QuoteSnapshot` (optional history table); many `WatchlistItem`; many `TradeJournalEntry` references.

### 2. `QuoteSnapshot` (optional history; MVP may use Redis-only hot cache + periodic insert)

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| instrumentId | UUID | FK → Instrument |
| asOf | timestamptz | Exchange / provider timestamp |
| bid | decimal? | nullable if not applicable |
| ask | decimal? | |
| last | decimal? | headline |
| changePct | decimal? | |
| volume | bigint? | equities |
| quoteCategory | enum | `official` (MVP FX), `indicative`, etc. |
| sessionState | enum | `open`, `closed`, `pre`, `post`, `unknown` |
| raw | jsonb? | debug-only; strip in prod or restrict to admin |

### 3. `UpstreamConnection`

Admin-managed integration config (secrets **not** plaintext in DB — store encrypted blob or KMS reference per deployment).

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| name | string | e.g. `fx-primary`, `metals`, `egx` |
| type | enum | `fx`, `metals`, `equities` |
| enabled | boolean | |
| config | jsonb | non-secret: URLs, poll interval |
| secretRef | string | env key name or vault path |
| lastSuccessAt | timestamptz? | |
| lastError | text? | |

### 4. `AdminUser`

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| email | citext | unique |
| passwordHash | string | if password auth used |
| totpSecret | string? | encrypted |
| totpEnabled | boolean | |
| role | enum | `superadmin`, `operator` |
| createdAt | timestamptz | |

### 5. `AdminAuditLog`

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| adminUserId | UUID | FK |
| action | string | e.g. `upstream.update`, `symbol.publish` |
| payload | jsonb | redact secrets |
| ip | inet? | |
| createdAt | timestamptz | |

### 6. `ConsumerUser` (phase: gated features)

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| email | citext | unique |
| authSubject | string? | OIDC sub if used |
| createdAt | timestamptz | |

### 7. `WatchlistItem`

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| consumerUserId | UUID | FK |
| instrumentId | UUID | FK |
| position | int | drag order |

### 8. `MetalKaratRule`

Typed gold pricing rows for a metal `Instrument` (anchor 24k gram × ratio).

| Field | Type | Notes |
|-------|------|--------|
| instrumentId | UUID | FK → metal instrument (e.g. `GOLD_EGP`) |
| karat | int? | 18 / 21 / 24; null for troy ounce row |
| unit | enum | `gram`, `troy_ounce` |
| priceNumerator / priceDenominator | int | e.g. 21/24 for 21k |

### 9. `OhlcvBar`

Persisted chart bars (optional behind `OHLCV_PERSIST_ENABLED`).

| Field | Type | Notes |
|-------|------|--------|
| instrumentId | UUID | FK |
| resolution | enum | `d1`, `w1`, `m1`, `y1` (maps API `1d`…`1y`) |
| barTime | timestamptz | period open |
| open/high/low/close | decimal | |
| volume | bigint? | |

### 10. `ConsumerRefreshToken` / `PasswordResetToken` / `EmailVerification`

Opaque token hashes (SHA-256), expiry, revoke/use timestamps. Refresh rotation on `/v1/auth/refresh`.

### 11. `PriceAlert`

| Field | Type | Notes |
|-------|------|--------|
| consumerUserId | UUID | FK |
| instrumentId | UUID | FK |
| direction | enum | `above`, `below` |
| threshold | decimal | EGP trigger |
| isEnabled | boolean | |

### 12. `TradeJournalEntry`

| Field | Type | Notes |
|-------|------|--------|
| id | UUID | PK |
| consumerUserId | UUID | FK |
| instrumentId | UUID | FK |
| side | enum | `buy`, `sell` |
| quantity | decimal | |
| price | decimal | user-reported |
| executedAt | date | user-reported trade date |
| note | text? | |

## State transitions

- **UpstreamConnection**: `enabled true → false` immediately stops polling job from enqueueing; in-flight completes or aborts with logged outcome.
- **Instrument `isConsumerVisible`**: toggling false hides from public list endpoints within one poll cycle; existing deep links return 404 or structured `gone` per API contract.

## Validation rules (business)

- Curated equity `code` must match connector’s expected namespace (validated on admin create/update).
- FX instruments for MVP: only pairs where **quote** is against EGP and `quoteCategory=official`.
- Journal entries: quantity > 0, price ≥ 0; no linkage to external order ids (not a broker).

## Redis keys (non-relational)

- `quote:{instrumentId}` → JSON blob + TTL 120s (align plan poll / stale policy).
- `ratelimit:{ip}:{route}` → counter + TTL window.
