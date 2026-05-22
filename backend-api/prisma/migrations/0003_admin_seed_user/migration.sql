-- Dev-only superadmin (password: ChangeMe!Admin123 — rotate in production).
INSERT INTO "admin_users" ("id", "email", "password_hash", "totp_secret", "totp_enabled", "role", "created_at")
VALUES (
  gen_random_uuid()::text,
  'admin@localhost.com',
  '$2b$10$doSAbM2Y1MX02FWFVv9l6eKGBwWwiwcb6KCsvl40WYUB.x6KJiczi',
  NULL,
  false,
  'superadmin',
  NOW()
)
ON CONFLICT ("email") DO NOTHING;
