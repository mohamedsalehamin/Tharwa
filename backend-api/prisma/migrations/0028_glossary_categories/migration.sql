-- Glossary categories (tabs) + assign existing terms to a default section

CREATE TABLE "glossary_categories" (
    "id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "glossary_categories" ("id", "title_ar", "title_en", "sort_order", "is_published", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', 'عام', 'General', 0, true, CURRENT_TIMESTAMP);

ALTER TABLE "glossary_terms" ADD COLUMN "category_id" TEXT;

UPDATE "glossary_terms"
SET "category_id" = '00000000-0000-4000-8000-000000000001'
WHERE "category_id" IS NULL;

ALTER TABLE "glossary_terms" ALTER COLUMN "category_id" SET NOT NULL;

CREATE INDEX "glossary_categories_is_published_sort_order_idx" ON "glossary_categories"("is_published", "sort_order");
CREATE INDEX "glossary_terms_category_id_sort_order_idx" ON "glossary_terms"("category_id", "sort_order");

ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "glossary_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "glossary_categories" ("id", "title_ar", "title_en", "sort_order", "is_published", "updated_at") VALUES
  (gen_random_uuid(), 'السوق والتداول', 'Market & trading', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'التحليل المالي', 'Financial analysis', 2, true, CURRENT_TIMESTAMP);
