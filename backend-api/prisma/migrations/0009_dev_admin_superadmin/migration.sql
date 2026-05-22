-- Dev login admin@localhost.com should manage integrations (FCM) in local admin UI.
UPDATE "admin_users"
SET "role" = 'superadmin'
WHERE "email" IN ('admin@localhost', 'admin@localhost.com') AND "role" = 'operator';
