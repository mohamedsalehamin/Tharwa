-- Consumer profile: display name + optional phone

ALTER TABLE "consumer_users" ADD COLUMN "display_name" TEXT;
ALTER TABLE "consumer_users" ADD COLUMN "phone" TEXT;
