-- CreateEnum
CREATE TYPE "SitePageKind" AS ENUM ('standard', 'contact');

-- CreateEnum
CREATE TYPE "SiteMenuPlacement" AS ENUM ('header', 'footer');

-- CreateEnum
CREATE TYPE "SiteMenuLinkType" AS ENUM ('page', 'external');

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "content_ar" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "kind" "SitePageKind" NOT NULL DEFAULT 'standard',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_menu_items" (
    "id" TEXT NOT NULL,
    "placement" "SiteMenuPlacement" NOT NULL,
    "label_ar" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "link_type" "SiteMenuLinkType" NOT NULL,
    "page_id" TEXT,
    "external_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_slug_key" ON "site_pages"("slug");

-- CreateIndex
CREATE INDEX "site_menu_items_placement_sort_order_idx" ON "site_menu_items"("placement", "sort_order");

-- AddForeignKey
ALTER TABLE "site_menu_items" ADD CONSTRAINT "site_menu_items_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "site_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default pages and navigation
INSERT INTO "site_pages" ("id", "slug", "title_ar", "title_en", "content_ar", "content_en", "kind", "is_published", "updated_at")
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'privacy',
    'سياسة الخصوصية',
    'Privacy Policy',
    'نحن نحترم خصوصيتك. تُستخدم البيانات التي تقدمها لتحسين تجربتك مع تطبيق ثروة فقط.',
    'We respect your privacy. Data you provide is used only to improve your experience with the Tharwa app.',
    'standard',
    true,
  NOW()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'contact',
    'اتصل بنا',
    'Contact Us',
    'لديك سؤال أو ملاحظة؟ أرسل لنا رسالة وسنرد في أقرب وقت.',
    'Have a question or feedback? Send us a message and we will get back to you soon.',
    'contact',
    true,
    NOW()
  );

INSERT INTO "site_menu_items" ("id", "placement", "label_ar", "label_en", "link_type", "page_id", "sort_order", "updated_at")
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'header',
    'اتصل بنا',
    'Contact',
    'page',
    '00000000-0000-4000-8000-000000000002',
    0,
    NOW()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'footer',
    'سياسة الخصوصية',
    'Privacy',
    'page',
    '00000000-0000-4000-8000-000000000001',
    0,
    NOW()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'footer',
    'اتصل بنا',
    'Contact',
    'page',
    '00000000-0000-4000-8000-000000000002',
    1,
    NOW()
  );
