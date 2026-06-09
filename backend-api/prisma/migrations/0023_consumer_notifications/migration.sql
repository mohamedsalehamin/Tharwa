-- CreateTable
CREATE TABLE "consumer_notifications" (
    "id" TEXT NOT NULL,
    "consumer_user_id" TEXT,
    "install_id" TEXT,
    "type" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumer_notifications_install_id_locale_created_at_idx" ON "consumer_notifications"("install_id", "locale", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consumer_notifications_consumer_user_id_locale_created_at_idx" ON "consumer_notifications"("consumer_user_id", "locale", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "consumer_notifications" ADD CONSTRAINT "consumer_notifications_consumer_user_id_fkey" FOREIGN KEY ("consumer_user_id") REFERENCES "consumer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
