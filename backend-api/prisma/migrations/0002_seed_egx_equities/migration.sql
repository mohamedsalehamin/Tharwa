-- Demo curated EGX symbols (admin will replace in production).
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'equity', 'COMI', 'البنك التجاري الدولي', 'Commercial International Bank (CIB)', true, 10, '{"tvSymbol":"EGX:COMI"}', NOW(), NOW()),
  (gen_random_uuid()::text, 'equity', 'TMGH', 'طلعت مصطفى', 'T M G Holding', true, 20, '{"tvSymbol":"EGX:TMGH"}', NOW(), NOW()),
  (gen_random_uuid()::text, 'equity', 'SWDY', 'السويدي إليكتريك', 'El Sewedy Electric', true, 30, '{"tvSymbol":"EGX:SWDY"}', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
