-- Extend social post runs for video publishing (Reels, Stories, YouTube).

ALTER TYPE "SocialPostChannel" ADD VALUE 'youtube';

CREATE TYPE "SocialPostFormat" AS ENUM ('photo', 'reel', 'story');

ALTER TABLE "social_post_runs" ADD COLUMN "format" "SocialPostFormat" NOT NULL DEFAULT 'photo';

DROP INDEX IF EXISTS "social_post_runs_cairo_date_key_template_channel_idx";

CREATE INDEX "social_post_runs_cairo_date_key_template_channel_format_idx"
  ON "social_post_runs"("cairo_date_key", "template", "channel", "format");
