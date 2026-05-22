# Research & Decisions: Tharwa Platform MVP

**Date**: 2026-05-12 | **Plan**: [plan.md](./plan.md)

## 1. Runtime & framework

- **Decision**: Node.js **22 LTS** + TypeScript strict + **Fastify**.
- **Rationale**: Constitution mandates Node backend; Fastify fits a read-heavy API with plugins and good TypeScript support.
- **Alternatives considered**: Express (simpler, slower defaults); NestJS (heavier for initial MVP slice).

## 2. Persistence

- **Decision**: **PostgreSQL 16+** with **Prisma** ORM; **Redis 7+** for short-TTL quote cache and rate limiting.
- **Rationale**: Relational model fits config, audit, curated symbols, and future user data; Redis matches constitution caching/throttling expectations.
- **Alternatives considered**: Drizzle (acceptable swap in tasks); MongoDB (weaker fit for audit + relational config).

## 3. EGP FX (MVP = official / institutional only)

- **Decision**: Pluggable **FX connector**; production configures **one** upstream the business classifies as *official / central bank / agreed institutional* (FR-013). Admin stores provider credentials as secrets; API responses expose `quoteCategory: official` and `asOf`. **No** parallel or “street” EGP in MVP.
- **Rationale**: Spec clarification B; connector swap without changing public API shapes.
- **Alternatives considered**: Admin-only manual daily rate; multiple competing FX streams (deferred).

## 4. Gold / silver

- **Decision**: Dedicated **metals connector**; backend returns per **gram**, per **troy ounce**, and **karat** rows (18/21/24) computed from spot + configurable rules in `Instrument.metadata`.
- **Rationale**: Single normalization; clients stay thin.
- **Alternatives considered**: Client-side karat math (rejected — duplicates rules).

## 5. Egyptian equities

- **Decision**: Backend wraps **one** equities integration (e.g. unofficial charting feed or licensed vendor). Document **operational/legal risk**; isolate in `services/connectors/equities`; admin feature-flag + cached last-good on failure.
- **Rationale**: Constitution VII; server-only outbound calls.
- **Alternatives considered**: Defer EGX to post-MVP; licensed EGX data vendor (preferred long-term).

## 6. Freshness & staleness (operationalizes SC-002)

- **Decision**: Target upstream poll **~90 s** for FX/metals; EGX polling windows tied to session config. If no successful refresh for **300 s**, responses may still return last cache but MUST set `isStale: true` and honest `asOf`.
- **Rationale**: Gives concrete numbers for implementation and tests; tunable later.
- **Alternatives considered**: 30 s poll (costlier); 15 min stale (poor UX).

## 7. Admin authentication

- **Decision**: Separate mount **`/admin/v1/`**; JWT access + refresh (hashed rotation in DB or Redis); **TOTP 2FA** before sensitive writes in production; optional `ADMIN_ALLOWED_CIDRS` middleware.
- **Rationale**: Constitution IV; API-first admin and future automation.
- **Alternatives considered**: Cookie-only sessions (harder for cross-origin admin SPA).

## 8. Consumer authentication (gated features)

- **Decision**: Ship **after** stable public read: magic link or OIDC (tasks choose); watchlist, journal, portfolio require `Authorization: Bearer`.
- **Rationale**: FR-014/FR-015; smaller attack surface for first backend milestone.

## 9. API documentation & versioning

- **Decision**: Canonical **OpenAPI 3.1** in `contracts/openapi.yaml`; HTTP prefix **`/v1/`** for public API; breaking changes → `/v2/`.
- **Rationale**: Constitution II — single contract source.

## 10. Observability

- **Decision**: **pino** JSON logs, **request-id** propagation, `/health` checks Postgres + Redis and returns build SHA; connector status surfaced to admin from `UpstreamConnection.lastSuccessAt` / errors.
- **Rationale**: Constitution VIII.
