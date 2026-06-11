-- CreateEnum
CREATE TYPE "NetWorthComponentKind" AS ENUM ('asset', 'liability');

-- CreateEnum
CREATE TYPE "NetWorthCategory" AS ENUM ('cash', 'certificate', 'real_estate', 'other_asset', 'loan', 'other_liability');

-- CreateEnum
CREATE TYPE "FinancialGoalStatus" AS ENUM ('active', 'achieved', 'past_due');

-- CreateEnum
CREATE TYPE "GoalSavedSource" AS ENUM ('manual', 'net_worth', 'category');

-- CreateTable
CREATE TABLE "manual_net_worth_components" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "kind" "NetWorthComponentKind" NOT NULL,
    "category" "NetWorthCategory" NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(24,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_net_worth_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "net_worth_snapshots" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "period_month" DATE NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_egp" DECIMAL(24,4) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "usd_egp_rate" DECIMAL(18,6),
    "gold_gram_egp" DECIMAL(18,6),
    "inflation_index" DECIMAL(18,6),
    "data_freshness" JSONB,

    CONSTRAINT "net_worth_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goals" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target_amount_egp" DECIMAL(24,4) NOT NULL,
    "target_date" DATE NOT NULL,
    "saved_source" "GoalSavedSource" NOT NULL DEFAULT 'manual',
    "manual_saved_egp" DECIMAL(24,4),
    "saved_category" "NetWorthCategory",
    "illustrative_annual_rate_pct" DECIMAL(6,3),
    "status" "FinancialGoalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inflation_benchmarks" (
    "id" TEXT NOT NULL,
    "period_month" DATE NOT NULL,
    "index_value" DECIMAL(18,6),
    "yoy_rate_pct" DECIMAL(8,4),
    "source_label" TEXT NOT NULL,
    "as_of" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inflation_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_net_worth_components_consumer_user_id_kind_idx" ON "manual_net_worth_components"("consumer_user_id", "kind");

-- CreateIndex
CREATE INDEX "net_worth_snapshots_consumer_user_id_period_month_idx" ON "net_worth_snapshots"("consumer_user_id", "period_month" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "net_worth_snapshots_consumer_user_id_period_month_key" ON "net_worth_snapshots"("consumer_user_id", "period_month");

-- CreateIndex
CREATE INDEX "financial_goals_consumer_user_id_status_idx" ON "financial_goals"("consumer_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inflation_benchmarks_period_month_key" ON "inflation_benchmarks"("period_month");

-- CreateIndex
CREATE INDEX "inflation_benchmarks_period_month_idx" ON "inflation_benchmarks"("period_month" DESC);

-- AddForeignKey
ALTER TABLE "manual_net_worth_components" ADD CONSTRAINT "manual_net_worth_components_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
