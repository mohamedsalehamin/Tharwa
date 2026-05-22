# Secrets contract (`secretRef`)

Tharwa stores **references** to secrets in PostgreSQL (`upstream_connections.secret_ref`), never the secret value itself.

## Backend choice (MVP): `env` only

| Setting | Value |
|---------|--------|
| `SECRETS_BACKEND` | `env` (only supported value) |

Resolution: `secretRef` → environment variable name on the API process → `process.env[NAME]`.

Optional explicit prefix: `env:TELEGRAM_METALS_BOT_TOKEN` (same as `TELEGRAM_METALS_BOT_TOKEN` when backend is `env`).

### Why env-only for MVP

- Matches current deployment (Docker/K8s inject env from Secret objects, `.env` in dev).
- No extra cloud vendor lock-in or SDK in the hot path.
- `secretRef` stays an opaque **name** admins can rotate by redeploying env, not by editing the DB.

AWS Secrets Manager / Doppler / HashiCorp Vault can be added later behind the same `SecretResolver` interface in `src/lib/secrets/resolver.ts` without changing the admin API shape.

## `secretRef` rules

1. **Must** look like an env var name: `^[A-Z][A-Z0-9_]{0,126}$` (e.g. `TELEGRAM_METALS_BOT_TOKEN`).
2. **Must not** be the secret itself (no `123456:ABC…` bot tokens, no JSON blobs).
3. Validated on admin `POST/PATCH /admin/v1/upstreams` before save.
4. Never returned to clients; never logged.

## Where secrets are injected

| Secret | Typical `secretRef` | Non-secret `config` (JSON) |
|--------|---------------------|---------------------------|
| Telegram metals bot token | `TELEGRAM_METALS_BOT_TOKEN` | `{ "channelId": "@YourChannel", "peekPendingChannelUpdates": false }` |

Legacy fallback (no DB row): set `TELEGRAM_METALS_BOT_TOKEN` and `TELEGRAM_METALS_CHANNEL_ID` directly in env (see `.env.example`).

## Operations

### Local development

```env
SECRETS_BACKEND=env
TELEGRAM_METALS_BOT_TOKEN=your-bot-token
TELEGRAM_METALS_CHANNEL_ID=@yourchannel
```

Admin upstream example:

```json
POST /admin/v1/upstreams
{
  "name": "metals-telegram",
  "type": "metals",
  "enabled": true,
  "secretRef": "TELEGRAM_METALS_BOT_TOKEN",
  "config": { "channelId": "@yourchannel", "peekPendingChannelUpdates": false }
}
```

### Production

- Mount secrets as **environment variables** on the `backend-api` container (K8s `secretKeyRef`, ECS secrets, etc.).
- Store only the **variable name** in `secret_ref` in the database.
- Rotate: update the secret in your platform → rolling restart API pods (or platform-specific reload).
- Do **not** commit `.env` with real tokens; use your host’s secret manager to populate env at runtime.

### Multi-replica

Each replica reads the same env vars. No per-pod secret store is required for `env` backend.

## API surface (code)

- `getSecretsResolver(env).resolve(ref)` → `string | null`
- `getSecretsResolver(env).resolveRequired(ref)` → `string` or throws `SecretResolverError`
- `resolveMetalsTelegramCredentials(env)` — metals connector entry point

## Future backends (not implemented)

| `SECRETS_BACKEND` | `secretRef` example | Notes |
|-------------------|---------------------|--------|
| `aws` | `arn:aws:secretsmanager:…` or `tharwa/prod/metals-bot` | Would need IAM + caching |
| `doppler` | `doppler://project/config/KEY` | Would need `DOPPLER_TOKEN` service token |

Until then, setting `SECRETS_BACKEND` to anything other than `env` fails at startup when the resolver is first used.
