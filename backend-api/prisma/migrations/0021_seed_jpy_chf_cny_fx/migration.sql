-- JPY, CHF, and CNY FX instruments for admin visibility / quoteCategory (FR-009).
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  ('c0000000-0000-4000-8000-000000000007', 'fx', 'JPY', 'ين ياباني', 'Japanese Yen', true, 60, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000008', 'fx', 'CHF', 'فرنك سويسري', 'Swiss Franc', true, 70, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000009', 'fx', 'CNY', 'يوان صيني', 'Chinese Yuan', true, 80, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
