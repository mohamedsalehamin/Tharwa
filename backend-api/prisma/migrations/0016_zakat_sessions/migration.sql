-- Saved zakat calculation sessions (signed-in consumers)
CREATE TABLE "zakat_sessions" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT NOT NULL,
    "label" TEXT,
    "year_type" TEXT NOT NULL,
    "nisab_attainment_date" DATE,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "zakat_due_egp" DECIMAL(24,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zakat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zakat_sessions_consumer_user_id_created_at_idx" ON "zakat_sessions"("consumer_user_id", "created_at" DESC);

ALTER TABLE "zakat_sessions" ADD CONSTRAINT "zakat_sessions_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
