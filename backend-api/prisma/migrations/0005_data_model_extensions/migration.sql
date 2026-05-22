-- CreateEnum
CREATE TYPE "MetalUnit" AS ENUM ('gram', 'troy_ounce');

-- CreateEnum
CREATE TYPE "OhlcvResolution" AS ENUM ('d1', 'w1', 'm1', 'y1');

-- CreateEnum
CREATE TYPE "PriceAlertDirection" AS ENUM ('above', 'below');

-- AlterTable
ALTER TABLE "consumer_users" ADD COLUMN "email_verified_at" TIMESTAMP(3),
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "metal_karat_rules" (
    "id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "karat" INTEGER,
    "unit" "MetalUnit" NOT NULL DEFAULT 'gram',
    "price_numerator" INTEGER NOT NULL DEFAULT 21,
    "price_denominator" INTEGER NOT NULL DEFAULT 24,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metal_karat_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ohlcv_bars" (
    "id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "resolution" "OhlcvResolution" NOT NULL,
    "bar_time" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(24,8) NOT NULL,
    "high" DECIMAL(24,8) NOT NULL,
    "low" DECIMAL(24,8) NOT NULL,
    "close" DECIMAL(24,8) NOT NULL,
    "volume" BIGINT,
    "source" TEXT NOT NULL DEFAULT 'tradingview',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ohlcv_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_refresh_tokens" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "direction" "PriceAlertDirection" NOT NULL,
    "threshold" DECIMAL(24,8) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metal_karat_rules_instrument_id_karat_unit_key" ON "metal_karat_rules"("instrument_id", "karat", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "ohlcv_bars_instrument_id_resolution_bar_time_key" ON "ohlcv_bars"("instrument_id", "resolution", "bar_time");

-- CreateIndex
CREATE INDEX "ohlcv_bars_instrument_id_resolution_bar_time_idx" ON "ohlcv_bars"("instrument_id", "resolution", "bar_time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "consumer_refresh_tokens_token_hash_key" ON "consumer_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "consumer_refresh_tokens_consumer_user_id_expires_at_idx" ON "consumer_refresh_tokens"("consumer_user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_consumer_user_id_expires_at_idx" ON "password_reset_tokens"("consumer_user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications"("token_hash");

-- CreateIndex
CREATE INDEX "email_verifications_consumer_user_id_expires_at_idx" ON "email_verifications"("consumer_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "price_alerts_consumer_user_id_is_enabled_idx" ON "price_alerts"("consumer_user_id", "is_enabled");

-- CreateIndex
CREATE INDEX "price_alerts_instrument_id_is_enabled_idx" ON "price_alerts"("instrument_id", "is_enabled");

-- AddForeignKey
ALTER TABLE "metal_karat_rules" ADD CONSTRAINT "metal_karat_rules_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ohlcv_bars" ADD CONSTRAINT "ohlcv_bars_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_refresh_tokens" ADD CONSTRAINT "consumer_refresh_tokens_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed canonical gold instrument + default karat rules
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'metal',
  'GOLD_EGP',
  'ذهب (جنيه)',
  'Gold (EGP)',
  false,
  0,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "metal_karat_rules" ("id", "instrument_id", "karat", "unit", "price_numerator", "price_denominator", "sort_order", "is_active", "created_at", "updated_at")
SELECT v.id, i.id, v.karat, v.unit::"MetalUnit", v.num, v.den, v.ord, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "instruments" i
CROSS JOIN (
  VALUES
    ('b0000000-0000-4000-8000-000000000011', 24, 'gram', 24, 24, 0),
    ('b0000000-0000-4000-8000-000000000012', 21, 'gram', 21, 24, 1),
    ('b0000000-0000-4000-8000-000000000013', 18, 'gram', 18, 24, 2),
    ('b0000000-0000-4000-8000-000000000014', NULL, 'troy_ounce', 1, 1, 3)
) AS v(id, karat, unit, num, den, ord)
WHERE i.code = 'GOLD_EGP'
ON CONFLICT ("instrument_id", "karat", "unit") DO NOTHING;
