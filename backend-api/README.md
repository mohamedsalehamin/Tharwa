# Tharwa `backend-api`

Node 22 + Fastify + Prisma + Redis. See repo specs: `specs/001-tharwa-platform-mvp/`.

## Commands

```bash
cp .env.example .env
# start Postgres + Redis (see ../specs/001-tharwa-platform-mvp/quickstart.md)
npm run migrate:dev   # apply Prisma migrations
npm run dev           # http://localhost:3000
npm test              # Vitest — unit + HTTP contract tests (no live Postgres/Redis for most cases)
```

## Tests

- **`npm test`** — [Vitest](https://vitest.dev/) in `test/`:
  - **Unit:** EGX session helper, secrets `secretRef` validation, sliding-window rate limit, opaque refresh tokens (mocked Prisma).
  - **Contract:** `app.inject` against public `/v1/fx/rates`, `/v1/metals`, `/v1/market/summary` with `FX_MOCK_JSON` / `METALS_MOCK_JSON`; OpenAPI 200 schema check (AJV + bundled spec); `POST /v1/auth/refresh` rotation.
- Uses **ioredis-mock** and Prisma mocks — CI does not need Docker services for the default suite.
- **`npm run test:watch`** — re-run on change.

## Admin (US3)

- `POST /admin/v1/auth/login` — JSON `{ "email", "password" }` → `{ accessToken, tokenType, expiresIn }`
- Dev seed (`0003_admin_seed_user`): **`admin@localhost.com`** / **`ChangeMe!Admin123`** (role **superadmin** — manages FCM in admin Integrations)
- Bearer: `GET/POST /admin/v1/upstreams` (includes `status` + summary), `PATCH/DELETE /admin/v1/upstreams/:id`, `POST /admin/v1/ops/invalidate-cache`, `GET /admin/v1/instruments` (`?kind=equity|fx|metal`), `POST /admin/v1/instruments` (equity create), `GET /admin/v1/instruments/egx-search?q=`, `PATCH /admin/v1/instruments/:id`, `GET/PUT /admin/v1/instruments/:id/karat-rules` (gold presentation), `GET /admin/v1/audit-logs` (paginated audit trail, FR-010)
- Public `GET /v1/fx/rates` and `GET /v1/metals` honor `instruments.is_consumer_visible` and FX `metadata.quoteCategory` (seed migration `0012_seed_fx_metals_presentation`)
- Upstream `config` is JSON (non-secret); `secretRef` is an **environment variable name** resolved at runtime (`SECRETS_BACKEND=env`). See [docs/secrets.md](./docs/secrets.md) — never store raw tokens in the database.
- Env: `ADMIN_JWT_SECRET` (≥16 chars; prefer 32+ in prod), `ADMIN_ACCESS_TOKEN_TTL_SEC` (default 3600)
- Put every browser origin in `CORS_ORIGINS` (website, admin UI, etc.). The API reflects **one** matching origin per request via `@fastify/cors`.
- `ADMIN_PUBLIC_ORIGIN` is always merged into the CORS allow-list (so admin OAuth/login works even if you omit it from `CORS_ORIGINS`).
- **Do not set `Access-Control-*` headers in nginx** (aaPanel site config) when proxying to this app — duplicate headers break CORS in the browser. Remove nginx `add_header Access-Control-*` and the `if ($request_method = OPTIONS)` shortcut; let Node handle preflight.
- After deploy, `GET /health` includes `corsOrigins` (count). If it is `4` in production, `CORS_ORIGINS` was not loaded — set it in aaPanel **or** ensure `.env` lives in the Node project root and restart after `npm run build`.
- In **`NODE_ENV=development`**, responses also allow browser `Origin` values on **private LAN** hosts (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) so you can open the admin UI at `http://<your-LAN-IP>:3001` without listing every IP in `CORS_ORIGINS`. Production still uses the explicit list only.
- **Push (FCM):** `GET /admin/v1/push/audiences`, `POST /admin/v1/push/broadcast` — audiences: `all`, `registered`, `ios`, `android`. Upload the Firebase service account in **Settings → Integrations** (`/settings`) or set optional env `FCM_SERVICE_ACCOUNT_JSON`.
- **Integrations:** `GET /admin/v1/settings/integrations`, `PUT/DELETE /admin/v1/settings/integrations/fcm` — stores FCM credentials in Postgres (private key never returned on read).

## Consumer (US4–US5)

- `POST /v1/auth/register` — `{ email, password }` → tokens + `refreshToken`; dev also returns `verificationToken`
- `POST /v1/auth/login` — same token bundle
- `POST /v1/auth/refresh` — `{ refreshToken }` → rotated access + refresh tokens
- `POST /v1/auth/logout` — `{ refreshToken }` (revokes)
- `POST /v1/auth/forgot-password` — `{ email }` → sends reset link via **Resend** when `RESEND_API_KEY` is set; dev without Resend may echo `resetToken` in JSON
- `POST /v1/auth/reset-password` — `{ resetToken, newPassword }`
- `PUT /v1/push/register` — `{ token, platform: "ios"|"android", installId? }` — optional `Authorization: Bearer` links the device to the account; `DELETE` with `{ token }` disables it
- `POST /v1/auth/verify-email` — `{ verificationToken }`
- Bearer (`Authorization: Bearer <consumer JWT>`):
  - Watchlist: `GET/POST /v1/watchlist`, `DELETE /v1/watchlist/items/:id`, `PATCH /v1/watchlist/reorder` (body `{ orderedItemIds }` = full permutation of item ids)
  - Journal: `GET/POST /v1/journal`, `PATCH/DELETE /v1/journal/:id` — sells cannot exceed recorded long quantity per instrument
  - Portfolio: `GET /v1/portfolio/summary` — derived from journal only; self-reported / non-custody disclaimer in payload
  - Price alerts: `GET/POST /v1/alerts`, `PATCH/DELETE /v1/alerts/:id`
- Env: `CONSUMER_JWT_SECRET` (≥16), `CONSUMER_ACCESS_TOKEN_TTL_SEC` (default 7d)
- Email (Resend): `RESEND_API_KEY`, `RESEND_FROM`, `CONSUMER_PASSWORD_RESET_URL` (default `tharwa://reset-password`), `CONSUMER_EMAIL_VERIFY_URL` (default `tharwa://verify-email`)
- Migration `0004_consumer_password_hash` adds nullable `password_hash` on `consumer_users` for password accounts.

## Curated equities (US2)

- `GET /v1/stocks`, `GET /v1/stocks/:symbol`, `GET /v1/stocks/:symbol/history?range=1d|1w|1m|1y`

## API contract

- `GET /v1/openapi.yaml` — OpenAPI 3 document (YAML; same semantics as `specs/001-tharwa-platform-mvp/contracts/openapi.yaml` when run from the monorepo)
- `GET /v1/openapi.json` — same document as JSON
- Optional env **`OPENAPI_SPEC_PATH`**: absolute path to the YAML file if neither `./contracts/openapi.yaml` nor the monorepo `specs/...` path is available

## MVP endpoints (US1)

- `GET /health` — Postgres + Redis checks  
- `GET /v1/fx/rates` — EGP vs major currencies (public API; label `quoteCategory: official`)  
- `GET /v1/metals` — gold karats + silver (`METALS_MOCK_JSON`, optional **Telegram** Egyptian channel, or placeholders)  
- `GET /v1/market/summary` — bundles FX + metals (not rate-limited; prefer cached FX/metals routes under load)

**Rate limits (MVP, in-memory per process):** `POST /v1/auth/*` — 40 req/min per IP per route; `GET /v1/fx/rates`, `/v1/metals`, `/v1/stocks*` — `PUBLIC_RATE_LIMIT_MAX_PER_MINUTE` (default **120**) shared per IP. Over limit → `429` with `Retry-After: 60`.

**HTTP caching (public GET):** `Cache-Control: public, max-age=…, s-maxage=…, stale-while-revalidate=…` on `/v1/fx/*`, `/v1/metals`, `/v1/market/summary`, `/v1/stocks*`. Tune via `PUBLIC_HTTP_*` env vars.

**Upstream single-flight:** Redis lock + in-process coalescing on cache miss so concurrent requests share one upstream fetch (see `src/lib/redis-cache.ts`). On upstream failure, serves Redis data up to **300s** old when available.

**Background polling:** When `UPSTREAM_POLL_ENABLED=true` (default), one leader replica (Redis lock) refreshes FX + metals every `UPSTREAM_POLL_INTERVAL_SEC` (default **90s**) and EGX caches during Cairo **pre/open/post** (`UPSTREAM_POLL_EGX_OPEN_SEC` / `UPSTREAM_POLL_EGX_OFFHOURS_SEC`). Disabled in `NODE_ENV=test`.

## Observability

- **Request IDs:** Every response includes `X-Request-Id` (honours inbound header when valid). Pino logs use `reqId`.
- **Prometheus:** `GET /metrics` — `tharwa_http_*` (latency + count) and `tharwa_connector_*` (upstream latency + success/error by connector).
- **Sentry (optional):** Set `SENTRY_DSN` — captures unhandled errors and API `5xx` responses.
- **OpenTelemetry (optional):** Set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. Jaeger/Tempo OTLP HTTP) for auto-instrumented traces.
- **Health:** `GET /health` includes `service` + `build` (`BUILD_SHA` env, default `dev`).

Set `FX_MOCK_JSON` / `METALS_MOCK_JSON` in `.env` for offline demos. **Do not set `METALS_MOCK_JSON` when using Telegram** — a mock like `gold24PerGramEgp: 3200` yields ~**2800** EGP for 21k (derived), which is easy to confuse with a “wrong Telegram” bug. For live Egyptian metals from a Telegram channel (pinned message + public `t.me/s/@username` preview, optional `TELEGRAM_METALS_PEEK_UPDATES` for `getUpdates` when nothing else polls that bot token), set **`TELEGRAM_METALS_BOT_TOKEN`** and **`TELEGRAM_METALS_CHANNEL_ID`** (`@PublicChannel` or `-100…`; add the bot as a channel admin so `getChat` can read the pin).

- **FX** (default `FX_PROVIDER=tradingview`): uses npm [`@mathieuc/tradingview`](https://github.com/Mathieu2301/TradingView-API). Override symbols with `FX_TV_SYMBOLS` JSON if defaults fail.
- **FX HTTP fallback**: set `FX_PROVIDER=http` — uses `FX_HTTP_URL` (default [open.er-api.com](https://open.er-api.com) USD latest, no API key).

## Build

```bash
npm run build
npm start
```

## Docker image

Build from the **monorepo root** so the OpenAPI file can be copied into the image:

```bash
docker build -f backend-api/Dockerfile -t tharwa-api .
```
