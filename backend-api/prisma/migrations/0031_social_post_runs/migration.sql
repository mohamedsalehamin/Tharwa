-- CreateEnum
CREATE TYPE "SocialPostTemplate" AS ENUM ('gold_daily', 'gold_alert', 'egx_close');

-- CreateEnum
CREATE TYPE "SocialPostChannel" AS ENUM ('facebook', 'instagram');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('published', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "social_post_runs" (
    "id" TEXT NOT NULL,
    "template" "SocialPostTemplate" NOT NULL,
    "channel" "SocialPostChannel" NOT NULL,
    "status" "SocialPostStatus" NOT NULL,
    "caption" TEXT,
    "external_post_id" TEXT,
    "error_message" TEXT,
    "triggered_by" TEXT NOT NULL,
    "cairo_date_key" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_post_runs_cairo_date_key_template_channel_idx" ON "social_post_runs"("cairo_date_key", "template", "channel");

-- CreateIndex
CREATE INDEX "social_post_runs_created_at_idx" ON "social_post_runs"("created_at" DESC);
