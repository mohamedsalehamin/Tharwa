-- Default upstream rows for admin health tracking (poller updates last_success_at by type).
INSERT INTO "upstream_connections" ("id", "name", "type", "enabled", "config", "created_at", "updated_at")
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'fx-primary', 'fx', true, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d0000000-0000-4000-8000-000000000002', 'metals-primary', 'metals', true, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d0000000-0000-4000-8000-000000000003', 'egx-equities', 'equities', true, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
