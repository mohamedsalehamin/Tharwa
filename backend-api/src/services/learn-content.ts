import type {
  GlossaryCategory,
  GlossaryTerm,
  LearnArticle,
  LearnCourse,
  LearnCourseCategory,
  LearnCourseLesson,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sanitizeLearnHtml, stripHtmlForText } from '../lib/rich-text.js';
import { assertValidSlug } from './site-pages.js';
import { fetchYoutubePlaylist } from './youtube-playlist.js';

const WORDS_PER_MINUTE = 200;

export function wordCount(text: string): number {
  const plain = text.includes('<') ? stripHtmlForText(text) : text;
  return plain.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimated reading time from the longer of the two locale bodies. */
export function computeReadingTimeMinutes(contentAr: string, contentEn: string): number {
  const words = Math.max(wordCount(contentAr), wordCount(contentEn));
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function parseYoutubeVideoId(raw: string): string {
  const t = raw.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) return m[1];
  }
  throw new Error('Invalid YouTube URL or 11-character video ID');
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// --- Glossary ---

export type GlossaryTermPublic = {
  id: string;
  categoryId: string;
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
};

export type GlossaryCategoryPublic = {
  id: string;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  terms: GlossaryTermPublic[];
};

export type GlossaryTermAdmin = GlossaryTermPublic & {
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GlossaryCategoryAdmin = {
  id: string;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  isPublished: boolean;
  terms: GlossaryTermAdmin[];
  createdAt: string;
  updatedAt: string;
};

function glossaryToPublic(row: GlossaryTerm): GlossaryTermPublic {
  return {
    id: row.id,
    categoryId: row.categoryId,
    termAr: row.termAr,
    termEn: row.termEn,
    definitionAr: row.definitionAr,
    definitionEn: row.definitionEn,
  };
}

function glossaryToAdmin(row: GlossaryTerm): GlossaryTermAdmin {
  return {
    ...glossaryToPublic(row),
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function glossaryCategoryToPublic(
  row: GlossaryCategory & { terms: GlossaryTerm[] },
): GlossaryCategoryPublic {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    sortOrder: row.sortOrder,
    terms: row.terms
      .filter((t) => t.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.termEn.localeCompare(b.termEn))
      .map(glossaryToPublic),
  };
}

function glossaryCategoryToAdmin(
  row: GlossaryCategory & { terms: GlossaryTerm[] },
): GlossaryCategoryAdmin {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    terms: row.terms
      .sort((a, b) => a.sortOrder - b.sortOrder || a.termEn.localeCompare(b.termEn))
      .map(glossaryToAdmin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const glossaryCategoryInclude = {
  terms: { orderBy: [{ sortOrder: 'asc' as const }, { termEn: 'asc' as const }] },
};

export async function listPublishedGlossaryCategories(): Promise<GlossaryCategoryPublic[]> {
  const rows = await prisma.glossaryCategory.findMany({
    where: { isPublished: true },
    include: glossaryCategoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
  });
  return rows.map(glossaryCategoryToPublic);
}

/** @deprecated Use listPublishedGlossaryCategories — flat list for legacy clients. */
export async function listPublishedGlossaryTerms(): Promise<GlossaryTermPublic[]> {
  const categories = await listPublishedGlossaryCategories();
  return categories.flatMap((c) => c.terms);
}

export async function listGlossaryCategoriesAdmin(): Promise<GlossaryCategoryAdmin[]> {
  const rows = await prisma.glossaryCategory.findMany({
    include: glossaryCategoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
  });
  return rows.map(glossaryCategoryToAdmin);
}

export type GlossaryCategoryInput = {
  titleAr: string;
  titleEn: string;
  sortOrder?: number;
  isPublished?: boolean;
};

export async function createGlossaryCategory(
  input: GlossaryCategoryInput,
): Promise<GlossaryCategoryAdmin> {
  const row = await prisma.glossaryCategory.create({
    data: {
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
    },
    include: glossaryCategoryInclude,
  });
  return glossaryCategoryToAdmin(row);
}

export async function updateGlossaryCategory(
  id: string,
  input: Partial<GlossaryCategoryInput>,
): Promise<GlossaryCategoryAdmin | null> {
  const existing = await prisma.glossaryCategory.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.glossaryCategory.update({
    where: { id },
    data: input,
    include: glossaryCategoryInclude,
  });
  return glossaryCategoryToAdmin(row);
}

export async function deleteGlossaryCategory(id: string): Promise<boolean> {
  const res = await prisma.glossaryCategory.deleteMany({ where: { id } });
  return res.count > 0;
}

export type GlossaryTermInput = {
  categoryId: string;
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
  sortOrder?: number;
  isPublished?: boolean;
};

export async function createGlossaryTerm(input: GlossaryTermInput): Promise<GlossaryTermAdmin> {
  const category = await prisma.glossaryCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error('Glossary category not found');

  const row = await prisma.glossaryTerm.create({
    data: {
      categoryId: input.categoryId,
      termAr: input.termAr,
      termEn: input.termEn,
      definitionAr: sanitizeLearnHtml(input.definitionAr),
      definitionEn: sanitizeLearnHtml(input.definitionEn),
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
    },
  });
  return glossaryToAdmin(row);
}

export async function updateGlossaryTerm(
  id: string,
  input: Partial<GlossaryTermInput>,
): Promise<GlossaryTermAdmin | null> {
  const existing = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (!existing) return null;
  if (input.categoryId) {
    const category = await prisma.glossaryCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new Error('Glossary category not found');
  }
  const patch = { ...input };
  if (patch.definitionAr != null) patch.definitionAr = sanitizeLearnHtml(patch.definitionAr);
  if (patch.definitionEn != null) patch.definitionEn = sanitizeLearnHtml(patch.definitionEn);
  const row = await prisma.glossaryTerm.update({
    where: { id },
    data: patch,
  });
  return glossaryToAdmin(row);
}

export async function deleteGlossaryTerm(id: string): Promise<boolean> {
  const res = await prisma.glossaryTerm.deleteMany({ where: { id } });
  return res.count > 0;
}

// --- Articles ---

export type LearnArticleSummaryPublic = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  excerptAr: string | null;
  excerptEn: string | null;
  readingTimeMin: number;
  publishedAt: string | null;
};

export type LearnArticlePublic = LearnArticleSummaryPublic & {
  contentAr: string;
  contentEn: string;
};

export type LearnArticleAdmin = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  excerptAr: string | null;
  excerptEn: string | null;
  contentAr: string;
  contentEn: string;
  readingTimeMin: number;
  sortOrder: number;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function articleReadingTime(row: LearnArticle): number {
  return computeReadingTimeMinutes(row.contentAr, row.contentEn);
}

function articleToSummary(row: LearnArticle): LearnArticleSummaryPublic {
  return {
    id: row.id,
    slug: row.slug,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    excerptAr: row.excerptAr,
    excerptEn: row.excerptEn,
    readingTimeMin: articleReadingTime(row),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function articleToPublic(row: LearnArticle): LearnArticlePublic {
  return {
    ...articleToSummary(row),
    contentAr: row.contentAr,
    contentEn: row.contentEn,
  };
}

function articleToAdmin(row: LearnArticle): LearnArticleAdmin {
  return {
    ...articleToPublic(row),
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listPublishedLearnArticles(): Promise<LearnArticleSummaryPublic[]> {
  const rows = await prisma.learnArticle.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(articleToSummary);
}

export async function getPublishedLearnArticle(slug: string): Promise<LearnArticlePublic | null> {
  const row = await prisma.learnArticle.findFirst({
    where: { slug, isPublished: true },
  });
  return row ? articleToPublic(row) : null;
}

export async function listLearnArticlesAdmin(): Promise<LearnArticleAdmin[]> {
  const rows = await prisma.learnArticle.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(articleToAdmin);
}

export type LearnArticleInput = {
  slug: string;
  titleAr: string;
  titleEn: string;
  excerptAr?: string | null;
  excerptEn?: string | null;
  contentAr: string;
  contentEn: string;
  sortOrder?: number;
  isPublished?: boolean;
  publishedAt?: Date | null;
  createdByAdminId?: string;
};

export async function createLearnArticle(input: LearnArticleInput): Promise<LearnArticleAdmin> {
  assertValidSlug(input.slug);
  const row = await prisma.learnArticle.create({
    data: {
      slug: input.slug,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      excerptAr: input.excerptAr ?? null,
      excerptEn: input.excerptEn ?? null,
      contentAr: sanitizeLearnHtml(input.contentAr),
      contentEn: sanitizeLearnHtml(input.contentEn),
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
      publishedAt: input.publishedAt ?? null,
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
  return articleToAdmin(row);
}

export async function updateLearnArticle(
  id: string,
  input: Partial<Omit<LearnArticleInput, 'createdByAdminId'>>,
): Promise<LearnArticleAdmin | null> {
  const existing = await prisma.learnArticle.findUnique({ where: { id } });
  if (!existing) return null;
  if (input.slug != null) assertValidSlug(input.slug);
  const patch = { ...input };
  if (patch.contentAr != null) patch.contentAr = sanitizeLearnHtml(patch.contentAr);
  if (patch.contentEn != null) patch.contentEn = sanitizeLearnHtml(patch.contentEn);
  const row = await prisma.learnArticle.update({
    where: { id },
    data: patch,
  });
  return articleToAdmin(row);
}

export async function deleteLearnArticle(id: string): Promise<boolean> {
  const res = await prisma.learnArticle.deleteMany({ where: { id } });
  return res.count > 0;
}

// --- Course categories & lessons ---

export type LearnCourseLessonPublic = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  youtubeVideoId: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  durationSec: number | null;
  sortOrder: number;
};

export type LearnCoursePublic = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  youtubePlaylistId: string | null;
  sortOrder: number;
  lessons: LearnCourseLessonPublic[];
};

export type LearnCourseCategoryPublic = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  /** Videos not grouped under a course. */
  standaloneLessons: LearnCourseLessonPublic[];
  courses: LearnCoursePublic[];
};

export type LearnCourseLessonAdmin = LearnCourseLessonPublic & {
  categoryId: string;
  courseId: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LearnCourseAdmin = {
  id: string;
  categoryId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  youtubePlaylistId: string | null;
  sortOrder: number;
  isPublished: boolean;
  lessons: LearnCourseLessonAdmin[];
  createdAt: string;
  updatedAt: string;
};

export type LearnCourseCategoryAdmin = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isPublished: boolean;
  standaloneLessons: LearnCourseLessonAdmin[];
  courses: LearnCourseAdmin[];
  createdAt: string;
  updatedAt: string;
};

function lessonToPublic(row: LearnCourseLesson): LearnCourseLessonPublic {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    youtubeVideoId: row.youtubeVideoId,
    youtubeUrl: youtubeWatchUrl(row.youtubeVideoId),
    thumbnailUrl: youtubeThumbnailUrl(row.youtubeVideoId),
    durationSec: row.durationSec,
    sortOrder: row.sortOrder,
  };
}

function lessonToAdmin(row: LearnCourseLesson): LearnCourseLessonAdmin {
  return {
    ...lessonToPublic(row),
    categoryId: row.categoryId,
    courseId: row.courseId,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function courseToPublic(
  row: LearnCourse & { lessons: LearnCourseLesson[] },
): LearnCoursePublic {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    youtubePlaylistId: row.youtubePlaylistId,
    sortOrder: row.sortOrder,
    lessons: row.lessons
      .filter((l) => l.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lessonToPublic),
  };
}

function courseToAdmin(row: LearnCourse & { lessons: LearnCourseLesson[] }): LearnCourseAdmin {
  return {
    id: row.id,
    categoryId: row.categoryId,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    youtubePlaylistId: row.youtubePlaylistId,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    lessons: row.lessons.sort((a, b) => a.sortOrder - b.sortOrder).map(lessonToAdmin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function categoryToPublic(
  row: LearnCourseCategory & {
    courses: (LearnCourse & { lessons: LearnCourseLesson[] })[];
    lessons: LearnCourseLesson[];
  },
): LearnCourseCategoryPublic {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    sortOrder: row.sortOrder,
    standaloneLessons: row.lessons
      .filter((l) => l.isPublished && l.courseId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lessonToPublic),
    courses: row.courses
      .filter((c) => c.isPublished)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(courseToPublic),
  };
}

function categoryToAdmin(
  row: LearnCourseCategory & {
    courses: (LearnCourse & { lessons: LearnCourseLesson[] })[];
    lessons: LearnCourseLesson[];
  },
): LearnCourseCategoryAdmin {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    standaloneLessons: row.lessons
      .filter((l) => l.courseId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(lessonToAdmin),
    courses: row.courses.sort((a, b) => a.sortOrder - b.sortOrder).map(courseToAdmin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const categoryInclude = {
  courses: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lessons: { orderBy: { sortOrder: 'asc' as const } } },
  },
  lessons: { orderBy: { sortOrder: 'asc' as const } },
};

export async function listPublishedLearnCourses(): Promise<LearnCourseCategoryPublic[]> {
  const rows = await prisma.learnCourseCategory.findMany({
    where: { isPublished: true },
    include: categoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
  });
  return rows.map(categoryToPublic);
}

export async function listLearnCourseCategoriesAdmin(): Promise<LearnCourseCategoryAdmin[]> {
  const rows = await prisma.learnCourseCategory.findMany({
    include: categoryInclude,
    orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
  });
  return rows.map(categoryToAdmin);
}

export type LearnCourseCategoryInput = {
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
};

export async function createLearnCourseCategory(
  input: LearnCourseCategoryInput,
): Promise<LearnCourseCategoryAdmin> {
  const row = await prisma.learnCourseCategory.create({
    data: {
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
    },
    include: categoryInclude,
  });
  return categoryToAdmin(row);
}

export async function updateLearnCourseCategory(
  id: string,
  input: Partial<LearnCourseCategoryInput>,
): Promise<LearnCourseCategoryAdmin | null> {
  const existing = await prisma.learnCourseCategory.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.learnCourseCategory.update({
    where: { id },
    data: input,
    include: categoryInclude,
  });
  return categoryToAdmin(row);
}

export async function deleteLearnCourseCategory(id: string): Promise<boolean> {
  const res = await prisma.learnCourseCategory.deleteMany({ where: { id } });
  return res.count > 0;
}

export type LearnCourseInput = {
  categoryId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  youtubePlaylistId?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
};

export async function createLearnCourse(input: LearnCourseInput): Promise<LearnCourseAdmin> {
  const category = await prisma.learnCourseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error('Category not found');

  const row = await prisma.learnCourse.create({
    data: {
      categoryId: input.categoryId,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      youtubePlaylistId: input.youtubePlaylistId ?? null,
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
    },
    include: { lessons: { orderBy: { sortOrder: 'asc' } } },
  });
  return courseToAdmin(row);
}

export async function updateLearnCourse(
  id: string,
  input: Partial<Omit<LearnCourseInput, 'categoryId'>>,
): Promise<LearnCourseAdmin | null> {
  const existing = await prisma.learnCourse.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.learnCourse.update({
    where: { id },
    data: input,
    include: { lessons: { orderBy: { sortOrder: 'asc' } } },
  });
  return courseToAdmin(row);
}

export async function deleteLearnCourse(id: string): Promise<boolean> {
  const res = await prisma.learnCourse.deleteMany({ where: { id } });
  return res.count > 0;
}

export type ImportYoutubePlaylistInput = {
  categoryId: string;
  playlistUrl: string;
  courseId?: string;
  titleAr?: string;
  titleEn?: string;
  isPublished?: boolean;
  replaceExisting?: boolean;
};

export async function importYoutubePlaylistToCourse(
  input: ImportYoutubePlaylistInput,
  youtubeApiKey?: string,
): Promise<{ course: LearnCourseAdmin; importedCount: number; skippedCount: number }> {
  const category = await prisma.learnCourseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Error('Category not found');

  const meta = await fetchYoutubePlaylist(input.playlistUrl, youtubeApiKey);
  const defaultTitle = meta.title ?? `Playlist ${meta.playlistId}`;
  const titleAr = input.titleAr?.trim() || defaultTitle;
  const titleEn = input.titleEn?.trim() || defaultTitle;

  let courseRow: LearnCourse & { lessons: LearnCourseLesson[] };

  if (input.courseId) {
    const existing = await prisma.learnCourse.findFirst({
      where: { id: input.courseId, categoryId: input.categoryId },
      include: { lessons: true },
    });
    if (!existing) throw new Error('Course not found in this section');
    if (input.replaceExisting) {
      await prisma.learnCourseLesson.deleteMany({ where: { courseId: existing.id } });
    }
    courseRow = await prisma.learnCourse.update({
      where: { id: existing.id },
      data: {
        youtubePlaylistId: meta.playlistId,
        titleAr: input.titleAr?.trim() || existing.titleAr,
        titleEn: input.titleEn?.trim() || existing.titleEn,
        isPublished: input.isPublished ?? existing.isPublished,
      },
      include: { lessons: { orderBy: { sortOrder: 'asc' } } },
    });
  } else {
    courseRow = await prisma.learnCourse.create({
      data: {
        categoryId: input.categoryId,
        titleAr,
        titleEn,
        youtubePlaylistId: meta.playlistId,
        sortOrder: 0,
        isPublished: input.isPublished ?? true,
      },
      include: { lessons: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  const existingVideoIds = new Set(
    (
      await prisma.learnCourseLesson.findMany({
        where: { courseId: courseRow.id },
        select: { youtubeVideoId: true },
      })
    ).map((l) => l.youtubeVideoId),
  );

  let importedCount = 0;
  let skippedCount = 0;
  const baseSort = courseRow.lessons.length;

  for (const [index, video] of meta.videos.entries()) {
    if (existingVideoIds.has(video.videoId)) {
      skippedCount += 1;
      continue;
    }
    await prisma.learnCourseLesson.create({
      data: {
        categoryId: input.categoryId,
        courseId: courseRow.id,
        titleAr: video.title,
        titleEn: video.title,
        youtubeVideoId: video.videoId,
        sortOrder: baseSort + index,
        isPublished: input.isPublished ?? true,
      },
    });
    importedCount += 1;
  }

  const refreshed = await prisma.learnCourse.findUniqueOrThrow({
    where: { id: courseRow.id },
    include: { lessons: { orderBy: { sortOrder: 'asc' } } },
  });

  return { course: courseToAdmin(refreshed), importedCount, skippedCount };
}

export type LearnCourseLessonInput = {
  categoryId: string;
  courseId?: string | null;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  youtubeVideoId: string;
  durationSec?: number | null;
  sortOrder?: number;
  isPublished?: boolean;
};

export async function createLearnCourseLesson(
  input: LearnCourseLessonInput,
): Promise<LearnCourseLessonAdmin> {
  const videoId = parseYoutubeVideoId(input.youtubeVideoId);

  if (input.courseId) {
    const course = await prisma.learnCourse.findFirst({
      where: { id: input.courseId, categoryId: input.categoryId },
    });
    if (!course) throw new Error('Course not found in this section');
  }

  const row = await prisma.learnCourseLesson.create({
    data: {
      categoryId: input.categoryId,
      courseId: input.courseId ?? null,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      youtubeVideoId: videoId,
      durationSec: input.durationSec ?? null,
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
    },
  });
  return lessonToAdmin(row);
}

export async function updateLearnCourseLesson(
  id: string,
  input: Partial<Omit<LearnCourseLessonInput, 'categoryId'>>,
): Promise<LearnCourseLessonAdmin | null> {
  const existing = await prisma.learnCourseLesson.findUnique({ where: { id } });
  if (!existing) return null;
  const data = { ...input };
  if (input.youtubeVideoId != null) {
    data.youtubeVideoId = parseYoutubeVideoId(input.youtubeVideoId);
  }
  const row = await prisma.learnCourseLesson.update({
    where: { id },
    data,
  });
  return lessonToAdmin(row);
}

export async function deleteLearnCourseLesson(id: string): Promise<boolean> {
  const res = await prisma.learnCourseLesson.deleteMany({ where: { id } });
  return res.count > 0;
}
