-- Password auth for consumer MVP (nullable for future OIDC-only users).
ALTER TABLE "consumer_users" ADD COLUMN "password_hash" TEXT;
