-- Courses within learn sections + optional course grouping for lessons

CREATE TABLE "learn_courses" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "youtube_playlist_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learn_courses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "learn_course_lessons" ADD COLUMN "course_id" TEXT;

CREATE INDEX "learn_courses_category_id_sort_order_idx" ON "learn_courses"("category_id", "sort_order");
CREATE INDEX "learn_course_lessons_course_id_sort_order_idx" ON "learn_course_lessons"("course_id", "sort_order");

ALTER TABLE "learn_courses" ADD CONSTRAINT "learn_courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "learn_course_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learn_course_lessons" ADD CONSTRAINT "learn_course_lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "learn_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
