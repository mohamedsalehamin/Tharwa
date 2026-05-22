-- Use a valid email for dev admin (Zod/browser validators reject admin@localhost).
UPDATE "admin_users"
SET "email" = 'admin@localhost.com'
WHERE "email" = 'admin@localhost';
