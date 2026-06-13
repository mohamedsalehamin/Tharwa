-- Learn section: glossary, articles, YouTube course categories

CREATE TABLE "glossary_terms" (
    "id" TEXT NOT NULL,
    "term_ar" TEXT NOT NULL,
    "term_en" TEXT NOT NULL,
    "definition_ar" TEXT NOT NULL,
    "definition_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learn_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "excerpt_ar" TEXT,
    "excerpt_en" TEXT,
    "content_ar" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learn_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learn_course_categories" (
    "id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learn_course_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learn_course_lessons" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "youtube_video_id" TEXT NOT NULL,
    "duration_sec" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learn_course_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learn_articles_slug_key" ON "learn_articles"("slug");
CREATE INDEX "glossary_terms_is_published_sort_order_idx" ON "glossary_terms"("is_published", "sort_order");
CREATE INDEX "learn_articles_is_published_sort_order_idx" ON "learn_articles"("is_published", "sort_order");
CREATE INDEX "learn_course_categories_is_published_sort_order_idx" ON "learn_course_categories"("is_published", "sort_order");
CREATE INDEX "learn_course_lessons_category_id_sort_order_idx" ON "learn_course_lessons"("category_id", "sort_order");

ALTER TABLE "learn_articles" ADD CONSTRAINT "learn_articles_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learn_course_lessons" ADD CONSTRAINT "learn_course_lessons_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "learn_course_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "learn_course_categories" ("id", "title_ar", "title_en", "description_ar", "description_en", "sort_order", "is_published", "updated_at") VALUES
  (gen_random_uuid(), 'للمبتدئين', 'For beginners', 'مفاهيم أساسية للمستثمر المبتدئ في البورصة المصرية.', 'Core concepts for new investors on the Egyptian market.', 0, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'التحليل الفني', 'Technical analysis', 'دروس في قراءة الرسوم البيانية والمؤشرات.', 'Chart reading and indicator basics.', 1, true, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'التحليل المالي', 'Financial analysis', 'فهم القوائم المالية وتقييم الشركات.', 'Financial statements and company valuation basics.', 2, true, CURRENT_TIMESTAMP);
