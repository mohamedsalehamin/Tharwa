-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InstrumentKind" AS ENUM ('fx', 'metal', 'equity');

-- CreateEnum
CREATE TYPE "QuoteCategory" AS ENUM ('official', 'indicative', 'estimate');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('open', 'closed', 'pre', 'post', 'unknown');

-- CreateEnum
CREATE TYPE "JournalSide" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "UpstreamType" AS ENUM ('fx', 'metals', 'equities');

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "kind" "InstrumentKind" NOT NULL,
    "code" TEXT NOT NULL,
    "display_name_ar" TEXT NOT NULL,
    "display_name_en" TEXT NOT NULL,
    "is_consumer_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_snapshots" (
    "id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "bid" DECIMAL(24,8),
    "ask" DECIMAL(24,8),
    "last" DECIMAL(24,8),
    "change_pct" DECIMAL(12,6),
    "volume" BIGINT,
    "quote_category" "QuoteCategory" NOT NULL,
    "session_state" "SessionState" NOT NULL,
    "raw" JSONB,

    CONSTRAINT "quote_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upstream_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "UpstreamType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "secret_ref" TEXT,
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upstream_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "auth_subject" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_journal_entries" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "side" "JournalSide" NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "executed_at" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instruments_code_key" ON "instruments"("code");

-- CreateIndex
CREATE INDEX "quote_snapshots_instrument_id_as_of_idx" ON "quote_snapshots"("instrument_id", "as_of" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_user_id_created_at_idx" ON "admin_audit_logs"("admin_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "consumer_users_email_key" ON "consumer_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_consumer_user_id_instrument_id_key" ON "watchlist_items"("consumer_user_id", "instrument_id");

-- AddForeignKey
ALTER TABLE "quote_snapshots" ADD CONSTRAINT "quote_snapshots_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_journal_entries" ADD CONSTRAINT "trade_journal_entries_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_journal_entries" ADD CONSTRAINT "trade_journal_entries_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

