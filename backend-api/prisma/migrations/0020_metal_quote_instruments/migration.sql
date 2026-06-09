-- Per-quotable-row metal instruments for QuoteSnapshot history, alerts, portfolio, and zakat.
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  (
    'd0000000-0000-4000-8000-000000000001',
    'metal',
    'GOLD_24K_GRAM_EGP',
    'ذهب عيار 24 (جرام)',
    'Gold 24K (gram)',
    false,
    11,
    '{"metal":"gold","karat":24,"unit":"gram","parentCode":"GOLD_EGP"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'metal',
    'GOLD_21K_GRAM_EGP',
    'ذهب عيار 21 (جرام)',
    'Gold 21K (gram)',
    false,
    12,
    '{"metal":"gold","karat":21,"unit":"gram","parentCode":"GOLD_EGP"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    'metal',
    'GOLD_18K_GRAM_EGP',
    'ذهب عيار 18 (جرام)',
    'Gold 18K (gram)',
    false,
    13,
    '{"metal":"gold","karat":18,"unit":"gram","parentCode":"GOLD_EGP"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'd0000000-0000-4000-8000-000000000004',
    'metal',
    'GOLD_TROY_OZ_EGP',
    'ذهب (أونصة)',
    'Gold (troy oz)',
    false,
    14,
    '{"metal":"gold","unit":"troy_ounce","parentCode":"GOLD_EGP"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO NOTHING;
