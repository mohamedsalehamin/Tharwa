-- CreateEnum
CREATE TYPE "CorporateCalendarEventKind" AS ENUM ('dividend', 'agm', 'egm', 'general', 'other');

-- CreateEnum
CREATE TYPE "CorporateCalendarDividendSubKind" AS ENUM ('entitlement', 'payment', 'unspecified');

-- CreateTable
CREATE TABLE "corporate_calendar_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mubasher',
    "source_key" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_id" TEXT,
    "event_date" DATE NOT NULL,
    "event_date_end" DATE,
    "kind" "CorporateCalendarEventKind" NOT NULL,
    "dividend_sub_kind" "CorporateCalendarDividendSubKind",
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "agenda_ar" TEXT,
    "agenda_en" TEXT,
    "host_name_ar" TEXT,
    "host_name_en" TEXT,
    "place_ar" TEXT,
    "place_en" TEXT,
    "event_time" TEXT,
    "raw" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_calendar_sync_runs" (
    "id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "events_upserted" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "finished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_calendar_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corporate_calendar_events_source_source_key_key" ON "corporate_calendar_events"("source", "source_key");

-- CreateIndex
CREATE INDEX "corporate_calendar_events_event_date_idx" ON "corporate_calendar_events"("event_date");

-- CreateIndex
CREATE INDEX "corporate_calendar_events_symbol_event_date_idx" ON "corporate_calendar_events"("symbol", "event_date");

-- CreateIndex
CREATE INDEX "corporate_calendar_sync_runs_finished_at_idx" ON "corporate_calendar_sync_runs"("finished_at" DESC);

-- AddForeignKey
ALTER TABLE "corporate_calendar_events" ADD CONSTRAINT "corporate_calendar_events_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
