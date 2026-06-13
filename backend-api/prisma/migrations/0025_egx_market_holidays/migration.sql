-- EGX market holidays (CalendarLabs sync + admin ad-hoc closures)

CREATE TYPE "EgxHolidaySource" AS ENUM ('calendarlabs', 'admin');

CREATE TABLE "egx_market_holidays" (
    "id" TEXT NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "source" "EgxHolidaySource" NOT NULL DEFAULT 'calendarlabs',
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "egx_market_holidays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egx_holiday_sync_runs" (
    "id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "years" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "holidays_upserted" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "finished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "egx_holiday_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "egx_market_holidays_holiday_date_key" ON "egx_market_holidays"("holiday_date");
CREATE INDEX "egx_market_holidays_holiday_date_idx" ON "egx_market_holidays"("holiday_date");
CREATE INDEX "egx_market_holidays_source_idx" ON "egx_market_holidays"("source");
CREATE INDEX "egx_holiday_sync_runs_finished_at_idx" ON "egx_holiday_sync_runs"("finished_at" DESC);

ALTER TABLE "egx_market_holidays" ADD CONSTRAINT "egx_market_holidays_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed bundled holidays (migrated from egx-holidays.json)
INSERT INTO "egx_market_holidays" ("id", "holiday_date", "name_en", "source", "updated_at") VALUES
  (gen_random_uuid(), '2025-01-01', 'Bank Holiday', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-01-07', 'Coptic Christmas', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-03-30', 'Eid Al-Fitr', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-03-31', 'Eid Al-Fitr', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-04-21', 'Sham El Nessim', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-05-01', 'Labor Day', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-06-08', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-06-09', 'Eid al-Adha Day 2', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-06-26', 'Muharram', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-06-30', 'Revolution Day', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-07-23', 'Revolution Day January 25', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-09-04', 'Mawlid An-Nabi', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2025-10-06', 'Armed Forces Day', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-01-07', 'Coptic Christmas', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-01-25', 'Revolution Day January 25', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-03-19', 'Eid-ul-Fitr', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-03-20', 'Eid-ul-Fitr', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-04-13', 'Sham El Nessim', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-04-25', 'Liberation Day', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-26', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-27', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-28', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-29', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-30', 'Eid al-Adha', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-06-16', 'Muharram', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-07-23', 'Revolution Day', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-08-25', 'Mawlid An-Nabi', 'calendarlabs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-10-06', 'Armed Forces Day', 'calendarlabs', CURRENT_TIMESTAMP);
