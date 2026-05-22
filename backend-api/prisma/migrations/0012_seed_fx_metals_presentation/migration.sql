-- FX pairs and silver instrument for admin visibility / quoteCategory (FR-009).
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'fx', 'USD', 'دولار أمريكي', 'US Dollar', true, 10, '{"quoteCategory":"official"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000002', 'fx', 'EUR', 'يورو', 'Euro', true, 20, '{"quoteCategory":"official"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000003', 'fx', 'GBP', 'جنيه إسترليني', 'British Pound', true, 30, '{"quoteCategory":"official"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000004', 'fx', 'SAR', 'ريال سعودي', 'Saudi Riyal', true, 40, '{"quoteCategory":"official"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000005', 'fx', 'AED', 'درهم إماراتي', 'UAE Dirham', true, 50, '{"quoteCategory":"official"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000006', 'metal', 'SILVER_EGP', 'فضة (جنيه)', 'Silver (EGP)', false, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
