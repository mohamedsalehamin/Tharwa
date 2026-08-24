-- CreateEnum
CREATE TYPE "MasarArchetype" AS ENUM ('conservative', 'cautious_balanced', 'balanced', 'growth_balanced', 'aggressive_long_term');

-- CreateTable
CREATE TABLE "masar_results" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "archetype" "MasarArchetype" NOT NULL,
    "equity_pct" INTEGER NOT NULL,
    "fixed_income_pct" INTEGER NOT NULL,
    "gold_pct" INTEGER NOT NULL,
    "sharia_preferred" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "masar_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masar_benchmark_points" (
    "id" TEXT NOT NULL,
    "period_month" DATE NOT NULL,
    "equity_index" DECIMAL(18,6),
    "fixed_income_index" DECIMAL(18,6),
    "gold_egp_per_gram" DECIMAL(18,6),
    "usd_egp" DECIMAL(18,6),
    "source_label" TEXT NOT NULL,
    "as_of" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "masar_benchmark_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "masar_results_consumer_user_id_key" ON "masar_results"("consumer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "masar_benchmark_points_period_month_key" ON "masar_benchmark_points"("period_month");

-- CreateIndex
CREATE INDEX "masar_benchmark_points_period_month_idx" ON "masar_benchmark_points"("period_month" DESC);

-- AddForeignKey
ALTER TABLE "masar_results" ADD CONSTRAINT "masar_results_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
