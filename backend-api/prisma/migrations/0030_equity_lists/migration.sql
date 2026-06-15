-- Curated EGX equity lists (sectors + thematic screens)

CREATE TYPE "EquityListKind" AS ENUM ('sector', 'thematic', 'market_rule');
CREATE TYPE "EquityListMemberSource" AS ENUM ('import', 'admin', 'sync');

CREATE TABLE "equity_lists" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "kind" "EquityListKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "tv_aliases" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equity_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equity_lists_code_key" ON "equity_lists"("code");
CREATE INDEX "equity_lists_is_published_sort_order_idx" ON "equity_lists"("is_published", "sort_order");

CREATE TABLE "equity_list_members" (
    "list_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "source" "EquityListMemberSource" NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equity_list_members_pkey" PRIMARY KEY ("list_id","symbol")
);

CREATE INDEX "equity_list_members_symbol_idx" ON "equity_list_members"("symbol");

ALTER TABLE "equity_list_members" ADD CONSTRAINT "equity_list_members_list_id_fkey"
    FOREIGN KEY ("list_id") REFERENCES "equity_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sector lists (bootstrap via `npm run import:equity-sectors`)
INSERT INTO "equity_lists" ("id", "code", "title_ar", "title_en", "kind", "sort_order", "is_published", "tv_aliases", "updated_at") VALUES
  ('00000000-0000-4000-8000-000000000101', 'banks', 'البنوك والمالية', 'Banks & financials', 'sector', 10, true, '["Financial Services","Financials","Finance","Banks"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000102', 'real_estate', 'العقارات', 'Real estate', 'sector', 20, true, '["Real Estate"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000103', 'telecom', 'الاتصالات', 'Telecom', 'sector', 30, true, '["Telecommunication Services","Communications","Communication Services"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000104', 'industrials', 'الصناعة', 'Industrials', 'sector', 40, true, '["Industrials","Industrial"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000105', 'consumer', 'السلع الاستهلاكية', 'Consumer', 'sector', 50, true, '["Consumer Cyclical","Consumer Defensive","Consumer Non-Cyclicals","Consumer Staples","Consumer Discretionary"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000106', 'energy', 'الطاقة', 'Energy', 'sector', 60, true, '["Energy"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000107', 'healthcare', 'الرعاية الصحية', 'Healthcare', 'sector', 70, true, '["Healthcare","Health Care"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000108', 'materials', 'المواد الأساسية', 'Materials', 'sector', 80, true, '["Basic Materials","Materials"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000109', 'technology', 'التكنولوجيا', 'Technology', 'sector', 90, true, '["Technology","Electronic Technology"]', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000110', 'utilities', 'المرافق', 'Utilities', 'sector', 100, true, '["Utilities"]', CURRENT_TIMESTAMP);
