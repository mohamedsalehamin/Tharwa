-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "consumer_user_id" TEXT,
    "install_id" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_fcm_token_key" ON "push_devices"("fcm_token");

-- CreateIndex
CREATE INDEX "push_devices_consumer_user_id_idx" ON "push_devices"("consumer_user_id");

-- CreateIndex
CREATE INDEX "push_devices_platform_disabled_at_idx" ON "push_devices"("platform", "disabled_at");

-- CreateIndex
CREATE INDEX "push_devices_install_id_idx" ON "push_devices"("install_id");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
