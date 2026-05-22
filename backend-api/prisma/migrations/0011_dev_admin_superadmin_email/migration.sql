-- admin@localhost.com retained operator after email rename (0010); ensure dev login is superadmin.
UPDATE "admin_users"
SET "role" = 'superadmin'
WHERE "email" = 'admin@localhost.com';
