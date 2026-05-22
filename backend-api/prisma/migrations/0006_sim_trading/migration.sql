-- Practice / paper trading (isolated from trade_journal_entries)

CREATE TABLE "sim_accounts" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "starting_cash_egp" DECIMAL(24,4) NOT NULL,
    "cash_egp" DECIMAL(24,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sim_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sim_trades" (
    "id" TEXT NOT NULL,
    "sim_account_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "side" "JournalSide" NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "fill_price_egp" DECIMAL(24,8) NOT NULL,
    "quote_as_of" TIMESTAMP(3),
    "filled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_trades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sim_accounts_consumer_user_id_key" ON "sim_accounts"("consumer_user_id");

CREATE INDEX "sim_trades_sim_account_id_filled_at_idx" ON "sim_trades"("sim_account_id", "filled_at" DESC);

ALTER TABLE "sim_accounts" ADD CONSTRAINT "sim_accounts_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sim_trades" ADD CONSTRAINT "sim_trades_sim_account_id_fkey" FOREIGN KEY ("sim_account_id") REFERENCES "sim_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sim_trades" ADD CONSTRAINT "sim_trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
