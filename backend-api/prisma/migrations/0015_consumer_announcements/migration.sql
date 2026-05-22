-- CreateEnum
CREATE TYPE "AnnouncementVariant" AS ENUM ('info', 'warning', 'maintenance');

-- CreateTable
CREATE TABLE "consumer_announcements" (
    "id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "variant" "AnnouncementVariant" NOT NULL DEFAULT 'info',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "link_url" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumer_announcements_is_enabled_starts_at_ends_at_sort_order_idx" ON "consumer_announcements"("is_enabled", "starts_at", "ends_at", "sort_order");

-- AddForeignKey
ALTER TABLE "consumer_announcements" ADD CONSTRAINT "consumer_announcements_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
