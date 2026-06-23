import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:8081')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  FX_MOCK_JSON: z.string().optional(),
  METALS_MOCK_JSON: z.string().optional(),
  /** Bot token for Egyptian metals Telegram source (optional; use with TELEGRAM_METALS_CHANNEL_ID). */
  TELEGRAM_METALS_BOT_TOKEN: z.string().min(10).optional(),
  /** Public @username or numeric channel id (e.g. @GoldChannel, -100…). Bot should be channel admin for pinned message; t.me scrape works for public @ handles. */
  TELEGRAM_METALS_CHANNEL_ID: z.string().min(1).optional(),
  /**
   * When true, also read unparsed `getUpdates` channel posts for this bot (latest wins over pin in merge).
   * Only one process may long-poll per bot token (409 otherwise). Default off for multi-replica APIs.
   */
  TELEGRAM_METALS_PEEK_UPDATES: z
    .string()
    .optional()
    .transform((s) => (s ?? '').toLowerCase() === 'true' || (s ?? '').trim() === '1'),
  /** `tradingview` uses [@mathieuc/tradingview](https://github.com/Mathieu2301/TradingView-API); `http` uses open.er-api (USD base). */
  FX_PROVIDER: z.enum(['http', 'tradingview']).default('tradingview'),
  /** Optional JSON per base, e.g. `{"USD":"FX_IDC:USDEGP","AED":"SAXO:USDAED"}`. SAR/AED default to USD-cross unless overridden. */
  FX_TV_SYMBOLS: z.string().optional(),
  /** When `FX_PROVIDER=http`, full URL (default open.er-api USD latest). */
  FX_HTTP_URL: z
    .string()
    .url()
    .default('https://open.er-api.com/v6/latest/USD'),
  /** When false, curated equity endpoints omit live TradingView chart quotes. */
  EQUITIES_TV_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** HS256 secret for admin JWT (min 32 chars recommended; change in production). */
  ADMIN_JWT_SECRET: z.string().min(16).default('dev-admin-jwt-secret-change-me-32chars'),
  ADMIN_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(300).max(86400).default(3600),
  /** HS256 secret for consumer JWT (separate from admin). */
  CONSUMER_JWT_SECRET: z.string().min(16).default('dev-consumer-jwt-secret-change-32ch'),
  CONSUMER_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(300).max(7776000).default(604800),
  CONSUMER_REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().min(3600).max(7776000).default(2592000),
  PASSWORD_RESET_TOKEN_TTL_SEC: z.coerce.number().int().min(300).max(86400).default(3600),
  EMAIL_VERIFICATION_TOKEN_TTL_SEC: z.coerce.number().int().min(300).max(604800).default(86400),
  /** Resend API key — when unset, transactional emails are logged only (dev). */
  RESEND_API_KEY: z.string().min(10).optional(),
  /** Verified sender in Resend, e.g. `Tharwa <noreply@yourdomain.com>`. */
  RESEND_FROM: z.string().min(3).default('Tharwa <onboarding@resend.dev>'),
  /** Deep link or HTTPS URL base for password reset (token appended as `?token=`). */
  CONSUMER_PASSWORD_RESET_URL: z.string().min(8).default('tharwa://reset-password'),
  /** Deep link or HTTPS URL base for email verification. */
  CONSUMER_EMAIL_VERIFY_URL: z.string().min(8).default('tharwa://verify-email'),
  /** `Instrument.code` for gold karat rules (default `GOLD_EGP`). */
  METALS_GOLD_INSTRUMENT_CODE: z.string().min(1).default('GOLD_EGP'),
  /** Persist Telegram metal quotes to `quote_snapshots` on a fixed cadence. */
  METALS_SNAPSHOT_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** How often the leader ingests metal quotes into Postgres (seconds). */
  METALS_SNAPSHOT_INTERVAL_SEC: z.coerce.number().int().min(60).max(3600).default(300),
  /** Leader lock TTL for metal snapshot ingest ticks. */
  METALS_SNAPSHOT_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** When true, upsert equity chart bars into `ohlcv_bars` after upstream fetch. */
  OHLCV_PERSIST_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** Per-IP sliding window for GET `/v1/fx/rates`, `/v1/metals`, `/v1/stocks*`. */
  PUBLIC_RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(120),
  /** Browser `max-age` for public market GET responses. */
  PUBLIC_HTTP_MAX_AGE_SEC: z.coerce.number().int().min(0).max(3600).default(30),
  /** CDN `s-maxage` (aligns with ~90s upstream poll target). */
  PUBLIC_HTTP_S_MAXAGE_SEC: z.coerce.number().int().min(0).max(3600).default(90),
  /** CDN `stale-while-revalidate` (fresh + SWR ≈ 300s stale policy). */
  PUBLIC_HTTP_STALE_WHILE_REVALIDATE_SEC: z.coerce.number().int().min(0).max(86400).default(210),
  /** Directory for admin-uploaded public files (FX flags, etc.). */
  PUBLIC_UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
  /**
   * Public origin for uploaded files in API responses (e.g. `http://localhost:3000`).
   * When unset, built from request host in dev uploads.
   */
  PUBLIC_FILES_ORIGIN: z.string().url().optional(),
  /** Redis lock TTL while a single upstream fetch runs. */
  REDIS_CACHE_LOCK_TTL_SEC: z.coerce.number().int().min(5).max(300).default(45),
  /** Max wait for followers when another replica holds the upstream lock. */
  REDIS_CACHE_WAIT_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
  /** Background cache warming for FX/metals (and EGX when session allows). */
  UPSTREAM_POLL_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** FX + metals poll cadence (seconds). */
  UPSTREAM_POLL_INTERVAL_SEC: z.coerce.number().int().min(30).max(600).default(90),
  /** EGX poll cadence while cash session is open. */
  UPSTREAM_POLL_EGX_OPEN_SEC: z.coerce.number().int().min(30).max(600).default(90),
  /** EGX poll cadence during pre/post (still in Cairo trading week). */
  UPSTREAM_POLL_EGX_OFFHOURS_SEC: z.coerce.number().int().min(60).max(3600).default(300),
  /** Leader lock TTL — must exceed slow upstream ticks. */
  UPSTREAM_POLL_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** Mubasher AMR corporate calendar — daily sync (leader-elected). */
  CORPORATE_CALENDAR_SYNC_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** How often to check whether today’s sync still needs to run. */
  CORPORATE_CALENDAR_SYNC_CHECK_INTERVAL_SEC: z.coerce.number().int().min(300).max(86_400).default(3600),
  CORPORATE_CALENDAR_SYNC_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  CORPORATE_CALENDAR_SYNC_LEADER_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(600),
  /** Daily market + watchlist push briefs (leader-elected, Cairo timezone). */
  DAILY_BRIEF_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** How often to check whether today's briefs still need to run. */
  DAILY_BRIEF_CHECK_INTERVAL_SEC: z.coerce.number().int().min(30).max(3600).default(60),
  /** Cairo local hour (24h) to send daily briefs. */
  DAILY_BRIEF_HOUR: z.coerce.number().int().min(0).max(23).default(15),
  /** Cairo local minute to send daily briefs. */
  DAILY_BRIEF_MINUTE: z.coerce.number().int().min(0).max(59).default(15),
  DAILY_BRIEF_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** Monthly net worth snapshot capture job (feature 002). */
  NETWORTH_SNAPSHOT_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  /** How often to check whether this month's snapshots still need capturing. */
  NETWORTH_SNAPSHOT_CHECK_INTERVAL_SEC: z.coerce.number().int().min(60).max(86_400).default(3600),
  NETWORTH_SNAPSHOT_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** Max consumers processed per snapshot tick (protects DB/quotes under load). */
  NETWORTH_SNAPSHOT_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
  /** Background evaluation of consumer price alerts against live quotes. */
  PRICE_ALERT_EVAL_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  PRICE_ALERT_EVAL_INTERVAL_SEC: z.coerce.number().int().min(30).max(600).default(90),
  PRICE_ALERT_EVAL_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** Min seconds between repeat triggers for the same alert. */
  PRICE_ALERT_COOLDOWN_SEC: z.coerce.number().int().min(60).max(86_400).default(3600),
  SERVICE_NAME: z.string().min(1).default('tharwa-backend-api'),
  BUILD_SHA: z.string().min(1).default('dev'),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  /** e.g. `http://localhost:4318/v1/traces` — when set, enables OpenTelemetry export. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  /** How `upstream_connections.secret_ref` is resolved. MVP: `env` only — see `docs/secrets.md`. */
  SECRETS_BACKEND: z.enum(['env']).default('env'),
  /** Virtual EGP balance when a user starts practice trading. */
  SIM_STARTING_CASH_EGP: z.coerce.number().positive().max(1_000_000_000).default(100_000),
  /** Reject sim market fills when indicative quote is older than this (seconds). */
  SIM_MAX_QUOTE_AGE_SEC: z.coerce.number().int().min(60).max(86_400).default(300),
  /** Firebase service account JSON (stringified) for FCM — required to send push from admin. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().min(20).optional(),
  /** Meta (Facebook) app id for admin OAuth to connect Page + Instagram. */
  META_APP_ID: z.string().min(5).optional(),
  /** Meta app secret — server only. */
  META_APP_SECRET: z.string().min(8).optional(),
  /** OAuth redirect URI registered in Meta app (must hit backend API, not admin SPA). */
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  /** Optional comma-separated OAuth scopes override (defaults to Facebook Page scopes). */
  META_OAUTH_SCOPES: z.string().min(1).optional(),
  /** Admin dashboard origin for OAuth callback links (defaults to thrwa admin host). */
  ADMIN_PUBLIC_ORIGIN: z.string().url().default('https://admin.thrwa.co'),
  /** Directory containing social SVG templates (defaults to backend assets copy). */
  SOCIAL_TEMPLATES_DIR: z.string().min(1).default('./assets/social-templates'),
  /** Public origin for temporary social images (Instagram requires image_url). */
  SOCIAL_PUBLIC_FILES_ORIGIN: z.string().url().optional(),
  /** Default Android download link in captions. */
  SOCIAL_PLAY_STORE_URL: z.string().url().default('https://thrwa.co/download/android'),
  /** Default iOS download link in captions. */
  SOCIAL_APP_STORE_URL: z.string().url().default('https://thrwa.co/download/ios'),
  /** Automated Facebook / Instagram posting job. */
  SOCIAL_POST_ENABLED: z
    .string()
    .optional()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false' && s !== '0'),
  SOCIAL_POST_CHECK_INTERVAL_SEC: z.coerce.number().int().min(30).max(3600).default(60),
  SOCIAL_POST_LEADER_TTL_SEC: z.coerce.number().int().min(30).max(600).default(120),
  /** Cairo local hour/minute defaults when schedules are unset in DB integration config. */
  SOCIAL_GOLD_DAILY_HOUR: z.coerce.number().int().min(0).max(23).default(10),
  SOCIAL_GOLD_DAILY_MINUTE: z.coerce.number().int().min(0).max(59).default(0),
  SOCIAL_EGX_CLOSE_HOUR: z.coerce.number().int().min(0).max(23).default(15),
  SOCIAL_EGX_CLOSE_MINUTE: z.coerce.number().int().min(0).max(59).default(15),
  /** Gold alert when 21k drops this % from Cairo-day open (e.g. 10 = 10%). */
  SOCIAL_GOLD_ALERT_DROP_PCT: z.coerce.number().min(1).max(50).default(10),
  /** YouTube OAuth for automated Shorts upload (separate from consumer Google sign-in). */
  YOUTUBE_OAUTH_CLIENT_ID: z.string().min(5).optional(),
  YOUTUBE_OAUTH_CLIENT_SECRET: z.string().min(8).optional(),
  YOUTUBE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  /** TikTok OAuth for automated video posts (Content Posting API). */
  TIKTOK_OAUTH_CLIENT_KEY: z.string().min(5).optional(),
  TIKTOK_OAUTH_CLIENT_SECRET: z.string().min(8).optional(),
  TIKTOK_OAUTH_REDIRECT_URI: z.string().url().optional(),
  /** Comma-separated OAuth scopes — must match scopes added in TikTok Developer Portal. */
  TIKTOK_OAUTH_SCOPES: z.string().min(5).default('user.info.basic,video.upload'),
  /** `draft` uploads to TikTok inbox (video.upload); `direct` posts to profile (video.publish). */
  TIKTOK_POST_MODE: z.enum(['draft', 'direct']).default('draft'),
  /** Comma-separated Google OAuth client IDs (Web + iOS + Android) allowed as `aud` on ID tokens. */
  GOOGLE_OAUTH_CLIENT_IDS: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  /** Apple Sign In client IDs (bundle id / service id), comma-separated. Defaults to `com.tharwaapp`. */
  APPLE_SIGN_IN_CLIENT_IDS: z
    .string()
    .optional()
    .transform((s) => {
      const ids = (s ?? 'com.tharwaapp')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      return ids.length > 0 ? ids : ['com.tharwaapp'];
    }),
  /** Optional YouTube Data API key — enables full playlist import (RSS fallback when unset). */
  YOUTUBE_API_KEY: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
