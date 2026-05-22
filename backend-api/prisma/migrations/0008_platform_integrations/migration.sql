-- Third-party integration credentials (admin-managed; e.g. FCM service account JSON)

CREATE TABLE "platform_integrations" (
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_integrations_pkey" PRIMARY KEY ("slug")
);

ALTER TABLE "platform_integrations" ADD CONSTRAINT "platform_integrations_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
