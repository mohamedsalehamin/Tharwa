-- Gulf FX instruments + Egyptian gold pound metal row (FR-009 / metals API).
INSERT INTO "instruments" ("id", "kind", "code", "display_name_ar", "display_name_en", "is_consumer_visible", "sort_order", "metadata", "created_at", "updated_at")
VALUES
  ('c0000000-0000-4000-8000-000000000010', 'fx', 'KWD', 'دينار كويتي', 'Kuwaiti Dinar', true, 55, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000011', 'fx', 'OMR', 'ريال عماني', 'Omani Rial', true, 56, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000012', 'fx', 'QAR', 'ريال قطري', 'Qatari Riyal', true, 57, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000013', 'fx', 'BHD', 'دينار بحريني', 'Bahraini Dinar', true, 58, '{"quoteCategory":"indicative"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (
    'd0000000-0000-4000-8000-000000000005',
    'metal',
    'GOLD_POUND_EGP',
    'جنيه الذهب',
    'Gold pound (8g 21k)',
    false,
    13,
    '{"metal":"gold","karat":21,"unit":"gold_pound","parentCode":"GOLD_EGP"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO NOTHING;
