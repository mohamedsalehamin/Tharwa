import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, GraduationCap, GripVertical, Library, ListVideo, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { adminFetch } from '@/lib/admin-api'
import { useAuthStore } from '@/stores/auth-store'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor, RichTextPreview } from '@/components/rich-text-editor'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Tab = 'glossary' | 'articles' | 'courses'

type GlossaryTermItem = {
  id: string
  categoryId: string
  termAr: string
  termEn: string
  definitionAr: string
  definitionEn: string
  sortOrder: number
  isPublished: boolean
}

type GlossaryCategoryItem = {
  id: string
  titleAr: string
  titleEn: string
  sortOrder: number
  isPublished: boolean
  terms: GlossaryTermItem[]
}

type ArticleItem = {
  id: string
  slug: string
  titleAr: string
  titleEn: string
  excerptAr: string | null
  excerptEn: string | null
  contentAr: string
  contentEn: string
  readingTimeMin: number
  sortOrder: number
  isPublished: boolean
}

type LessonItem = {
  id: string
  categoryId: string
  courseId: string | null
  titleAr: string
  titleEn: string
  youtubeVideoId: string
  youtubeUrl: string
  sortOrder: number
  isPublished: boolean
}

type CourseItem = {
  id: string
  categoryId: string
  titleAr: string
  titleEn: string
  youtubePlaylistId: string | null
  sortOrder: number
  isPublished: boolean
  lessons: LessonItem[]
}

type CategoryItem = {
  id: string
  titleAr: string
  titleEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  sortOrder: number
  isPublished: boolean
  standaloneLessons: LessonItem[]
  courses: CourseItem[]
}

const EMPTY_GLOSSARY_CATEGORY = {
  titleAr: '',
  titleEn: '',
  sortOrder: '0',
  isPublished: true,
}

const EMPTY_GLOSSARY = {
  termAr: '',
  termEn: '',
  definitionAr: '',
  definitionEn: '',
  sortOrder: '0',
  isPublished: true,
}

const EMPTY_ARTICLE = {
  slug: '',
  titleAr: '',
  titleEn: '',
  excerptAr: '',
  excerptEn: '',
  contentAr: '',
  contentEn: '',
  sortOrder: '0',
  isPublished: false,
}

const EMPTY_CATEGORY = {
  titleAr: '',
  titleEn: '',
  descriptionAr: '',
  descriptionEn: '',
  sortOrder: '0',
  isPublished: true,
}

const EMPTY_COURSE = {
  titleAr: '',
  titleEn: '',
  sortOrder: '0',
  isPublished: true,
}

const EMPTY_PLAYLIST = {
  playlistUrl: '',
  titleAr: '',
  titleEn: '',
  replaceExisting: false,
  isPublished: true,
}

const EMPTY_LESSON = {
  titleAr: '',
  titleEn: '',
  youtubeVideoId: '',
  courseId: '',
  sortOrder: '0',
  isPublished: true,
}

const EMPTY_GLOSSARY_CATEGORIES: GlossaryCategoryItem[] = []

function sameIdOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function LearnContentPanel() {
  const token = useAuthStore((s) => s.auth.accessToken)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('glossary')
  const [glossaryCategoryForm, setGlossaryCategoryForm] = useState(EMPTY_GLOSSARY_CATEGORY)
  const [glossaryForm, setGlossaryForm] = useState(EMPTY_GLOSSARY)
  const [selectedGlossaryCategoryId, setSelectedGlossaryCategoryId] = useState<string | null>(null)
  const [articleForm, setArticleForm] = useState(EMPTY_ARTICLE)
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY)
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE)
  const [playlistForm, setPlaylistForm] = useState(EMPTY_PLAYLIST)
  const [lessonForm, setLessonForm] = useState(EMPTY_LESSON)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: string; id: string; label: string } | null>(null)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null)
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<string | null>(null)
  const [editingGlossaryCategoryId, setEditingGlossaryCategoryId] = useState<string | null>(null)
  const [editingGlossaryTermId, setEditingGlossaryTermId] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null)

  const glossaryQuery = useQuery({
    queryKey: ['admin', 'learn', 'glossary'],
    enabled: Boolean(token) && tab === 'glossary',
    queryFn: () => adminFetch<{ categories: GlossaryCategoryItem[] }>('/admin/v1/learn/glossary', token!),
  })

  const articlesQuery = useQuery({
    queryKey: ['admin', 'learn', 'articles'],
    enabled: Boolean(token) && tab === 'articles',
    queryFn: () => adminFetch<{ items: ArticleItem[] }>('/admin/v1/learn/articles', token!),
  })

  const coursesQuery = useQuery({
    queryKey: ['admin', 'learn', 'courses'],
    enabled: Boolean(token) && tab === 'courses',
    queryFn: () => adminFetch<{ items: CategoryItem[] }>('/admin/v1/learn/courses', token!),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'learn'] })
  }

  const createGlossaryCategory = useMutation({
    mutationFn: () =>
      adminFetch('/admin/v1/learn/glossary/categories', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...glossaryCategoryForm,
          sortOrder: Number(glossaryCategoryForm.sortOrder) || 0,
        }),
      }),
    onSuccess: () => {
      toast.success('Glossary category added')
      setGlossaryCategoryForm(EMPTY_GLOSSARY_CATEGORY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateGlossaryCategory = useMutation({
    mutationFn: () => {
      if (!editingGlossaryCategoryId) throw new Error('No category selected')
      return adminFetch(`/admin/v1/learn/glossary/categories/${editingGlossaryCategoryId}`, token!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleAr: glossaryCategoryForm.titleAr.trim(),
          titleEn: glossaryCategoryForm.titleEn.trim(),
          isPublished: glossaryCategoryForm.isPublished,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Glossary category updated')
      setEditingGlossaryCategoryId(null)
      setGlossaryCategoryForm(EMPTY_GLOSSARY_CATEGORY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createGlossary = useMutation({
    mutationFn: () => {
      if (!selectedGlossaryCategoryId) throw new Error('Select a category first')
      return adminFetch(`/admin/v1/learn/glossary/categories/${selectedGlossaryCategoryId}/terms`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...glossaryForm,
          sortOrder: Number(glossaryForm.sortOrder) || 0,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Term added')
      setGlossaryForm(EMPTY_GLOSSARY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateGlossary = useMutation({
    mutationFn: () => {
      if (!editingGlossaryTermId) throw new Error('No term selected')
      const categoryId = selectedGlossaryCategoryId ?? glossaryCategories[0]?.id
      if (!categoryId) throw new Error('Select a category first')
      return adminFetch(`/admin/v1/learn/glossary/${editingGlossaryTermId}`, token!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          termAr: glossaryForm.termAr.trim(),
          termEn: glossaryForm.termEn.trim(),
          definitionAr: glossaryForm.definitionAr.trim(),
          definitionEn: glossaryForm.definitionEn.trim(),
          isPublished: glossaryForm.isPublished,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Term updated')
      setEditingGlossaryTermId(null)
      setGlossaryForm(EMPTY_GLOSSARY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createArticle = useMutation({
    mutationFn: () =>
      adminFetch('/admin/v1/learn/articles', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...articleForm,
          sortOrder: Number(articleForm.sortOrder) || 0,
          excerptAr: articleForm.excerptAr || null,
          excerptEn: articleForm.excerptEn || null,
        }),
      }),
    onSuccess: () => {
      toast.success('Article created')
      setArticleForm(EMPTY_ARTICLE)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createCategory = useMutation({
    mutationFn: () =>
      adminFetch('/admin/v1/learn/courses/categories', token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...categoryForm,
          sortOrder: Number(categoryForm.sortOrder) || 0,
          descriptionAr: categoryForm.descriptionAr || null,
          descriptionEn: categoryForm.descriptionEn || null,
        }),
      }),
    onSuccess: () => {
      toast.success('Section created')
      setCategoryForm(EMPTY_CATEGORY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateCategory = useMutation({
    mutationFn: () => {
      if (!editingCategoryId) throw new Error('No section selected')
      return adminFetch(`/admin/v1/learn/courses/categories/${editingCategoryId}`, token!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleAr: categoryForm.titleAr.trim(),
          titleEn: categoryForm.titleEn.trim(),
          descriptionAr: categoryForm.descriptionAr.trim() || null,
          descriptionEn: categoryForm.descriptionEn.trim() || null,
          isPublished: categoryForm.isPublished,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Section updated')
      setEditingCategoryId(null)
      setCategoryForm(EMPTY_CATEGORY)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createCourse = useMutation({
    mutationFn: () => {
      if (!selectedCategoryId) throw new Error('Select a section first')
      return adminFetch(`/admin/v1/learn/courses/categories/${selectedCategoryId}/courses`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...courseForm,
          sortOrder: Number(courseForm.sortOrder) || 0,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Course created')
      setCourseForm(EMPTY_COURSE)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateCourse = useMutation({
    mutationFn: () => {
      if (!editingCourseId) throw new Error('No course selected')
      return adminFetch(`/admin/v1/learn/courses/courses/${editingCourseId}`, token!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleAr: courseForm.titleAr.trim(),
          titleEn: courseForm.titleEn.trim(),
          isPublished: courseForm.isPublished,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Course updated')
      setEditingCourseId(null)
      setCourseForm(EMPTY_COURSE)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const importPlaylist = useMutation({
    mutationFn: () => {
      if (!selectedCategoryId) throw new Error('Select a section first')
      return adminFetch<{ importedCount: number; skippedCount: number }>(
        `/admin/v1/learn/courses/categories/${selectedCategoryId}/import-playlist`,
        token!,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlistUrl: playlistForm.playlistUrl.trim(),
            titleAr: playlistForm.titleAr.trim() || undefined,
            titleEn: playlistForm.titleEn.trim() || undefined,
            replaceExisting: playlistForm.replaceExisting,
            isPublished: playlistForm.isPublished,
          }),
        },
      )
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.importedCount} videos (${data.skippedCount} skipped)`)
      setPlaylistForm(EMPTY_PLAYLIST)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createLesson = useMutation({
    mutationFn: () => {
      if (!selectedCategoryId) throw new Error('Select a section first')
      return adminFetch(`/admin/v1/learn/courses/categories/${selectedCategoryId}/lessons`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...lessonForm,
          courseId: lessonForm.courseId || null,
          sortOrder: Number(lessonForm.sortOrder) || 0,
        }),
      })
    },
    onSuccess: () => {
      toast.success('Video added')
      setLessonForm(EMPTY_LESSON)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const reorderGlossaryCategories = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          adminFetch(`/admin/v1/learn/glossary/categories/${id}`, token!, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: index }),
          }),
        ),
      )
    },
    onSuccess: () => {
      toast.success('Category order updated')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (target: { kind: string; id: string }) => {
      const paths: Record<string, string> = {
        glossary: `/admin/v1/learn/glossary/${target.id}`,
        glossaryCategory: `/admin/v1/learn/glossary/categories/${target.id}`,
        article: `/admin/v1/learn/articles/${target.id}`,
        category: `/admin/v1/learn/courses/categories/${target.id}`,
        course: `/admin/v1/learn/courses/courses/${target.id}`,
        lesson: `/admin/v1/learn/courses/lessons/${target.id}`,
      }
      await adminFetch(paths[target.kind]!, token!, { method: 'DELETE' })
    },
    onSuccess: (_data, target) => {
      toast.success('Deleted')
      setDeleteTarget(null)
      if (target.kind === 'glossaryCategory') {
        setEditingGlossaryCategoryId((prev) => {
          if (prev === target.id) {
            setGlossaryCategoryForm(EMPTY_GLOSSARY_CATEGORY)
            return null
          }
          return prev
        })
      }
      if (target.kind === 'glossary') {
        setEditingGlossaryTermId((prev) => {
          if (prev === target.id) {
            setGlossaryForm(EMPTY_GLOSSARY)
            return null
          }
          return prev
        })
      }
      if (target.kind === 'category') {
        setEditingCategoryId((prev) => {
          if (prev === target.id) {
            setCategoryForm(EMPTY_CATEGORY)
            return null
          }
          return prev
        })
      }
      if (target.kind === 'course') {
        setEditingCourseId((prev) => {
          if (prev === target.id) {
            setCourseForm(EMPTY_COURSE)
            return null
          }
          return prev
        })
      }
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const glossaryCategories = glossaryQuery.data?.categories ?? EMPTY_GLOSSARY_CATEGORIES
  const sortedGlossaryCategories = useMemo(
    () =>
      [...glossaryCategories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.titleEn.localeCompare(b.titleEn),
      ),
    [glossaryCategories],
  )

  useEffect(() => {
    const nextOrder = sortedGlossaryCategories.map((c) => c.id)
    setCategoryOrder((prev) => (sameIdOrder(prev, nextOrder) ? prev : nextOrder))
  }, [sortedGlossaryCategories])

  const orderedGlossaryCategories = useMemo(
    () =>
      categoryOrder
        .map((id) => sortedGlossaryCategories.find((c) => c.id === id))
        .filter((c): c is GlossaryCategoryItem => c != null),
    [categoryOrder, sortedGlossaryCategories],
  )

  const handleCategoryDragStart = (categoryId: string) => {
    setDraggingCategoryId(categoryId)
  }

  const handleCategoryDragOver = (event: React.DragEvent, categoryId: string) => {
    event.preventDefault()
    if (draggingCategoryId && draggingCategoryId !== categoryId) {
      setDropTargetCategoryId(categoryId)
    }
  }

  const handleCategoryDrop = (targetId: string) => {
    if (!draggingCategoryId || draggingCategoryId === targetId) {
      setDraggingCategoryId(null)
      setDropTargetCategoryId(null)
      return
    }

    const next = [...categoryOrder]
    const fromIdx = next.indexOf(draggingCategoryId)
    const toIdx = next.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) {
      setDraggingCategoryId(null)
      setDropTargetCategoryId(null)
      return
    }

    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, draggingCategoryId)
    setCategoryOrder(next)
    setDraggingCategoryId(null)
    setDropTargetCategoryId(null)
    reorderGlossaryCategories.mutate(next)
  }

  const startEditGlossaryCategory = (cat: GlossaryCategoryItem) => {
    setEditingGlossaryCategoryId(cat.id)
    setGlossaryCategoryForm({
      titleAr: cat.titleAr,
      titleEn: cat.titleEn,
      sortOrder: String(cat.sortOrder),
      isPublished: cat.isPublished,
    })
  }

  const cancelEditGlossaryCategory = () => {
    setEditingGlossaryCategoryId(null)
    setGlossaryCategoryForm(EMPTY_GLOSSARY_CATEGORY)
  }

  const startEditGlossaryTerm = (row: GlossaryTermItem) => {
    setEditingGlossaryTermId(row.id)
    setSelectedGlossaryCategoryId(row.categoryId)
    setGlossaryForm({
      termAr: row.termAr,
      termEn: row.termEn,
      definitionAr: row.definitionAr,
      definitionEn: row.definitionEn,
      sortOrder: String(row.sortOrder),
      isPublished: row.isPublished,
    })
  }

  const cancelEditGlossaryTerm = () => {
    setEditingGlossaryTermId(null)
    setGlossaryForm(EMPTY_GLOSSARY)
  }

  const startEditCategory = (cat: CategoryItem) => {
    setEditingCategoryId(cat.id)
    setCategoryForm({
      titleAr: cat.titleAr,
      titleEn: cat.titleEn,
      descriptionAr: cat.descriptionAr ?? '',
      descriptionEn: cat.descriptionEn ?? '',
      sortOrder: String(cat.sortOrder),
      isPublished: cat.isPublished,
    })
  }

  const cancelEditCategory = () => {
    setEditingCategoryId(null)
    setCategoryForm(EMPTY_CATEGORY)
  }

  const startEditCourse = (course: CourseItem) => {
    setEditingCourseId(course.id)
    setSelectedCategoryId(course.categoryId)
    setCourseForm({
      titleAr: course.titleAr,
      titleEn: course.titleEn,
      sortOrder: String(course.sortOrder),
      isPublished: course.isPublished,
    })
  }

  const cancelEditCourse = () => {
    setEditingCourseId(null)
    setCourseForm(EMPTY_COURSE)
  }

  const selectedGlossaryCategory = useMemo(
    () => glossaryCategories.find((c) => c.id === selectedGlossaryCategoryId) ?? glossaryCategories[0] ?? null,
    [glossaryCategories, selectedGlossaryCategoryId],
  )

  const glossaryFormValid =
    Boolean(selectedGlossaryCategory) &&
    glossaryForm.termAr.trim().length > 0 &&
    glossaryForm.termEn.trim().length > 0

  const glossaryCategorySelect = (
    <div>
      <Label>Category</Label>
      <select
        className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
        value={selectedGlossaryCategory?.id ?? ''}
        onChange={(e) => setSelectedGlossaryCategoryId(e.target.value)}
      >
        {glossaryCategories.length === 0 ? <option value=''>No categories yet</option> : null}
        {glossaryCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.titleEn}
          </option>
        ))}
      </select>
    </div>
  )

  const categories = coursesQuery.data?.items ?? []
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? categories[0] ?? null,
    [categories, selectedCategoryId],
  )

  const categoryFormValid =
    categoryForm.titleAr.trim().length > 0 && categoryForm.titleEn.trim().length > 0

  const courseFormValid =
    Boolean(selectedCategory) &&
    courseForm.titleAr.trim().length > 0 &&
    courseForm.titleEn.trim().length > 0

  const sectionSelect = (
    <div>
      <Label>Section</Label>
      <select
        className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
        value={selectedCategory?.id ?? ''}
        onChange={(e) => setSelectedCategoryId(e.target.value)}
      >
        {categories.length === 0 ? <option value=''>No sections yet</option> : null}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.titleEn}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <>
      <Header>
        <div className='flex flex-1 items-center justify-between gap-4'>
          <div>
            <h1 className='text-lg font-semibold'>Learn content</h1>
            <p className='text-sm text-muted-foreground'>
              Glossary, articles, and YouTube courses for the mobile app
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </div>
      </Header>

      <Main>
        <div className='mb-4 flex flex-wrap gap-2'>
          {(
            [
              ['glossary', 'Glossary', Library],
              ['articles', 'Articles', BookOpen],
              ['courses', 'Courses', GraduationCap],
            ] as const
          ).map(([key, label, Icon]) => (
            <Button
              key={key}
              variant={tab === key ? 'default' : 'outline'}
              size='sm'
              onClick={() => setTab(key)}
            >
              <Icon className='mr-2 size-4' />
              {label}
            </Button>
          ))}
          <Button variant='ghost' size='sm' onClick={() => invalidate()} className='ml-auto'>
            <RefreshCw className='mr-2 size-4' />
            Refresh
          </Button>
        </div>

        {tab === 'glossary' ? (
          <div className='space-y-4'>
            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {editingGlossaryCategoryId ? 'Edit category' : 'Add category'}
                  </CardTitle>
                  <CardDescription>Tabs shown in the mobile glossary screen.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div>
                      <Label>Title (AR)</Label>
                      <Input value={glossaryCategoryForm.titleAr} onChange={(e) => setGlossaryCategoryForm({ ...glossaryCategoryForm, titleAr: e.target.value })} />
                    </div>
                    <div>
                      <Label>Title (EN)</Label>
                      <Input value={glossaryCategoryForm.titleEn} onChange={(e) => setGlossaryCategoryForm({ ...glossaryCategoryForm, titleEn: e.target.value })} />
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Switch checked={glossaryCategoryForm.isPublished} onCheckedChange={(v) => setGlossaryCategoryForm({ ...glossaryCategoryForm, isPublished: v })} />
                    <Label>Published</Label>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {editingGlossaryCategoryId ? (
                      <Button
                        onClick={() => updateGlossaryCategory.mutate()}
                        disabled={updateGlossaryCategory.isPending || !glossaryCategoryForm.titleAr.trim() || !glossaryCategoryForm.titleEn.trim()}
                      >
                        Save changes
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createGlossaryCategory.mutate()}
                        disabled={createGlossaryCategory.isPending || !glossaryCategoryForm.titleAr.trim() || !glossaryCategoryForm.titleEn.trim()}
                      >
                        <Plus className='mr-2 size-4' /> Add category
                      </Button>
                    )}
                    {editingGlossaryCategoryId ? (
                      <Button variant='outline' onClick={cancelEditGlossaryCategory} disabled={updateGlossaryCategory.isPending}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
              <Card className={cn(editingGlossaryTermId && 'ring-2 ring-primary/60')}>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {editingGlossaryTermId ? 'Edit term' : 'Add term'}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {glossaryCategorySelect}
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div>
                      <Label>Term (AR)</Label>
                      <Input value={glossaryForm.termAr} onChange={(e) => setGlossaryForm({ ...glossaryForm, termAr: e.target.value })} />
                    </div>
                    <div>
                      <Label>Term (EN)</Label>
                      <Input value={glossaryForm.termEn} onChange={(e) => setGlossaryForm({ ...glossaryForm, termEn: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Definition (AR)</Label>
                    <RichTextEditor
                      value={glossaryForm.definitionAr}
                      onChange={(html) => setGlossaryForm({ ...glossaryForm, definitionAr: html })}
                      dir='rtl'
                      placeholder='اكتب التعريف…'
                    />
                  </div>
                  <div>
                    <Label>Definition (EN)</Label>
                    <RichTextEditor
                      value={glossaryForm.definitionEn}
                      onChange={(html) => setGlossaryForm({ ...glossaryForm, definitionEn: html })}
                      dir='ltr'
                      placeholder='Write the definition…'
                    />
                  </div>
                  <div className='flex items-center gap-2'>
                    <Switch checked={glossaryForm.isPublished} onCheckedChange={(v) => setGlossaryForm({ ...glossaryForm, isPublished: v })} />
                    <Label>Published</Label>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {editingGlossaryTermId ? (
                      <Button
                        onClick={() => updateGlossary.mutate()}
                        disabled={updateGlossary.isPending || !glossaryFormValid}
                      >
                        Save changes
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createGlossary.mutate()}
                        disabled={createGlossary.isPending || !glossaryFormValid}
                      >
                        <Plus className='mr-2 size-4' /> Add term
                      </Button>
                    )}
                    {editingGlossaryTermId ? (
                      <Button variant='outline' onClick={cancelEditGlossaryTerm} disabled={updateGlossary.isPending}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
            {orderedGlossaryCategories.length > 1 ? (
              <p className='text-sm text-muted-foreground'>
                Drag categories to change their order in the mobile glossary tabs.
              </p>
            ) : null}
            {orderedGlossaryCategories.map((cat) => (
              <Card
                key={cat.id}
                className={cn(
                  'transition-shadow',
                  draggingCategoryId === cat.id && 'opacity-50',
                  dropTargetCategoryId === cat.id && 'ring-2 ring-primary',
                  editingGlossaryCategoryId === cat.id && 'ring-2 ring-primary/60',
                )}
                onDragOver={(event) => handleCategoryDragOver(event, cat.id)}
                onDragLeave={() => {
                  if (dropTargetCategoryId === cat.id) setDropTargetCategoryId(null)
                }}
                onDrop={() => handleCategoryDrop(cat.id)}
              >
                <CardHeader className='flex flex-row items-start justify-between gap-4'>
                  <div className='flex min-w-0 flex-1 items-start gap-3'>
                    <button
                      type='button'
                      draggable
                      aria-label={`Reorder ${cat.titleEn}`}
                      className='mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing'
                      onDragStart={() => handleCategoryDragStart(cat.id)}
                      onDragEnd={() => {
                        setDraggingCategoryId(null)
                        setDropTargetCategoryId(null)
                      }}
                    >
                      <GripVertical className='size-4' />
                    </button>
                    <div className='min-w-0'>
                      <CardTitle className='text-base'>{cat.titleEn}</CardTitle>
                      <CardDescription dir='rtl'>{cat.titleAr}</CardDescription>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Badge variant={cat.isPublished ? 'secondary' : 'outline'}>
                      {cat.isPublished ? 'Live' : 'Draft'}
                    </Badge>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={`Edit ${cat.titleEn}`}
                      onClick={() => startEditGlossaryCategory(cat)}
                    >
                      <Pencil className='size-4' />
                    </Button>
                    <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'glossaryCategory', id: cat.id, label: cat.titleEn })}>
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Term</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cat.terms.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className='text-muted-foreground'>
                            No terms in this category.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {[...cat.terms]
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.termEn.localeCompare(b.termEn))
                        .map((row) => (
                          <TableRow
                            key={row.id}
                            className={cn(editingGlossaryTermId === row.id && 'bg-muted/40')}
                          >
                            <TableCell>
                              <div>{row.termEn}</div>
                              <div className='text-sm text-muted-foreground' dir='rtl'>{row.termAr}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.isPublished ? 'secondary' : 'outline'}>
                                {row.isPublished ? 'Live' : 'Draft'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className='flex justify-end gap-1'>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  aria-label={`Edit ${row.termEn}`}
                                  onClick={() => startEditGlossaryTerm(row)}
                                >
                                  <Pencil className='size-4' />
                                </Button>
                                <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'glossary', id: row.id, label: row.termEn })}>
                                  <Trash2 className='size-4' />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {tab === 'articles' ? (
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>New article</CardTitle>
                <CardDescription>Reading time is computed automatically from content length.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div>
                  <Label>Slug</Label>
                  <Input value={articleForm.slug} onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value })} placeholder='what-is-pe-ratio' />
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <Label>Title (AR)</Label>
                    <Input value={articleForm.titleAr} onChange={(e) => setArticleForm({ ...articleForm, titleAr: e.target.value })} />
                  </div>
                  <div>
                    <Label>Title (EN)</Label>
                    <Input value={articleForm.titleEn} onChange={(e) => setArticleForm({ ...articleForm, titleEn: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Content (AR)</Label>
                  <RichTextEditor
                    value={articleForm.contentAr}
                    onChange={(html) => setArticleForm({ ...articleForm, contentAr: html })}
                    dir='rtl'
                    placeholder='اكتب المقال…'
                  />
                </div>
                <div>
                  <Label>Content (EN)</Label>
                  <RichTextEditor
                    value={articleForm.contentEn}
                    onChange={(html) => setArticleForm({ ...articleForm, contentEn: html })}
                    dir='ltr'
                    placeholder='Write the article…'
                  />
                </div>
                {articleForm.contentAr ? (
                  <div>
                    <Label className='mb-2 block'>Preview (AR)</Label>
                    <RichTextPreview html={articleForm.contentAr} dir='rtl' />
                  </div>
                ) : null}
                <div className='flex items-center gap-2'>
                  <Switch checked={articleForm.isPublished} onCheckedChange={(v) => setArticleForm({ ...articleForm, isPublished: v })} />
                  <Label>Published</Label>
                </div>
                <Button onClick={() => createArticle.mutate()} disabled={createArticle.isPending}>
                  <Plus className='mr-2 size-4' /> Create article
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className='text-base'>Articles</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Read</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(articlesQuery.data?.items ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div>{row.titleEn}</div>
                          <div className='text-xs text-muted-foreground'>{row.slug}</div>
                        </TableCell>
                        <TableCell>{row.readingTimeMin} min</TableCell>
                        <TableCell>
                          <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'article', id: row.id, label: row.titleEn })}>
                            <Trash2 className='size-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === 'courses' ? (
          <div className='grid gap-4 lg:grid-cols-2'>
            <div className='space-y-4'>
              <Card className={cn(editingCategoryId && 'ring-2 ring-primary/60')}>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {editingCategoryId ? 'Edit section' : 'Add section'}
                  </CardTitle>
                  <CardDescription>Top-level grouping (e.g. For beginners, Technical analysis).</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div>
                      <Label>Title (AR)</Label>
                      <Input value={categoryForm.titleAr} onChange={(e) => setCategoryForm({ ...categoryForm, titleAr: e.target.value })} />
                    </div>
                    <div>
                      <Label>Title (EN)</Label>
                      <Input value={categoryForm.titleEn} onChange={(e) => setCategoryForm({ ...categoryForm, titleEn: e.target.value })} />
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Switch checked={categoryForm.isPublished} onCheckedChange={(v) => setCategoryForm({ ...categoryForm, isPublished: v })} />
                    <Label>Published</Label>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {editingCategoryId ? (
                      <Button
                        onClick={() => updateCategory.mutate()}
                        disabled={updateCategory.isPending || !categoryFormValid}
                      >
                        Save changes
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createCategory.mutate()}
                        disabled={createCategory.isPending || !categoryFormValid}
                      >
                        <Plus className='mr-2 size-4' /> Add section
                      </Button>
                    )}
                    {editingCategoryId ? (
                      <Button variant='outline' onClick={cancelEditCategory} disabled={updateCategory.isPending}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Import YouTube playlist</CardTitle>
                  <CardDescription>
                    Creates a course and pulls all public videos. Optional YOUTUBE_API_KEY on the API for large playlists.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {sectionSelect}
                  <Input
                    placeholder='Playlist URL (youtube.com/playlist?list=PL…)'
                    value={playlistForm.playlistUrl}
                    onChange={(e) => setPlaylistForm({ ...playlistForm, playlistUrl: e.target.value })}
                  />
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <Input placeholder='Course title AR (optional)' value={playlistForm.titleAr} onChange={(e) => setPlaylistForm({ ...playlistForm, titleAr: e.target.value })} />
                    <Input placeholder='Course title EN (optional)' value={playlistForm.titleEn} onChange={(e) => setPlaylistForm({ ...playlistForm, titleEn: e.target.value })} />
                  </div>
                  <div className='flex flex-wrap items-center gap-4'>
                    <div className='flex items-center gap-2'>
                      <Switch checked={playlistForm.isPublished} onCheckedChange={(v) => setPlaylistForm({ ...playlistForm, isPublished: v })} />
                      <Label>Published</Label>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Switch checked={playlistForm.replaceExisting} onCheckedChange={(v) => setPlaylistForm({ ...playlistForm, replaceExisting: v })} />
                      <Label>Replace when re-importing</Label>
                    </div>
                  </div>
                  <Button onClick={() => importPlaylist.mutate()} disabled={importPlaylist.isPending || !selectedCategory || !playlistForm.playlistUrl.trim()}>
                    <ListVideo className='mr-2 size-4' /> Import playlist
                  </Button>
                </CardContent>
              </Card>

              <Card className={cn(editingCourseId && 'ring-2 ring-primary/60')}>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {editingCourseId ? 'Edit course' : 'Manual course'}
                  </CardTitle>
                  <CardDescription>
                    {editingCourseId ? 'Update course title and visibility.' : 'Empty course — add videos one by one below.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {editingCourseId ? null : sectionSelect}
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div>
                      <Label>Title (AR)</Label>
                      <Input value={courseForm.titleAr} onChange={(e) => setCourseForm({ ...courseForm, titleAr: e.target.value })} />
                    </div>
                    <div>
                      <Label>Title (EN)</Label>
                      <Input value={courseForm.titleEn} onChange={(e) => setCourseForm({ ...courseForm, titleEn: e.target.value })} />
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Switch checked={courseForm.isPublished} onCheckedChange={(v) => setCourseForm({ ...courseForm, isPublished: v })} />
                    <Label>Published</Label>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {editingCourseId ? (
                      <Button
                        onClick={() => updateCourse.mutate()}
                        disabled={updateCourse.isPending || !courseFormValid}
                      >
                        Save changes
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createCourse.mutate()}
                        disabled={createCourse.isPending || !courseFormValid}
                      >
                        <Plus className='mr-2 size-4' /> Add course
                      </Button>
                    )}
                    {editingCourseId ? (
                      <Button variant='outline' onClick={cancelEditCourse} disabled={updateCourse.isPending}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Single video</CardTitle>
                  <CardDescription>Standalone in the section, or attach to a course.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {sectionSelect}
                  <div>
                    <Label>Course (optional — leave empty for standalone)</Label>
                    <select
                      className='mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
                      value={lessonForm.courseId}
                      onChange={(e) => setLessonForm({ ...lessonForm, courseId: e.target.value })}
                    >
                      <option value=''>Standalone video</option>
                      {(selectedCategory?.courses ?? []).map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.titleEn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <Input placeholder='Title AR' value={lessonForm.titleAr} onChange={(e) => setLessonForm({ ...lessonForm, titleAr: e.target.value })} />
                    <Input placeholder='Title EN' value={lessonForm.titleEn} onChange={(e) => setLessonForm({ ...lessonForm, titleEn: e.target.value })} />
                  </div>
                  <Input placeholder='YouTube URL or video ID' value={lessonForm.youtubeVideoId} onChange={(e) => setLessonForm({ ...lessonForm, youtubeVideoId: e.target.value })} />
                  <Button onClick={() => createLesson.mutate()} disabled={createLesson.isPending || !selectedCategory}>
                    <Plus className='mr-2 size-4' /> Add video
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className='text-base'>Sections, courses & videos</CardTitle></CardHeader>
              <CardContent className='space-y-4'>
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={cn(
                      'rounded-lg border p-3',
                      editingCategoryId === cat.id && 'ring-2 ring-primary/60',
                    )}
                  >
                    <div className='mb-2 flex items-center justify-between'>
                      <div>
                        <div className='font-medium'>{cat.titleEn}</div>
                        <div className='text-sm text-muted-foreground' dir='rtl'>{cat.titleAr}</div>
                      </div>
                      <div className='flex items-center gap-1'>
                        <Badge variant={cat.isPublished ? 'secondary' : 'outline'}>
                          {cat.isPublished ? 'Live' : 'Draft'}
                        </Badge>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={`Edit ${cat.titleEn}`}
                          onClick={() => startEditCategory(cat)}
                        >
                          <Pencil className='size-4' />
                        </Button>
                        <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'category', id: cat.id, label: cat.titleEn })}>
                          <Trash2 className='size-4' />
                        </Button>
                      </div>
                    </div>

                    {cat.standaloneLessons.length > 0 ? (
                      <div className='mb-3'>
                        <div className='mb-1 text-xs font-medium uppercase text-muted-foreground'>Standalone videos</div>
                        <ul className='space-y-1 text-sm'>
                          {cat.standaloneLessons.map((lesson) => (
                            <li key={lesson.id} className='flex items-center justify-between gap-2'>
                              <span>{lesson.titleEn}</span>
                              <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'lesson', id: lesson.id, label: lesson.titleEn })}>
                                <Trash2 className='size-3' />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {cat.courses.map((course) => (
                      <div
                        key={course.id}
                        className={cn(
                          'mb-3 rounded-md bg-muted/40 p-2',
                          editingCourseId === course.id && 'ring-2 ring-primary/60',
                        )}
                      >
                        <div className='mb-1 flex items-center justify-between gap-2'>
                          <div>
                            <div className='text-sm font-medium'>{course.titleEn}</div>
                            {course.youtubePlaylistId ? (
                              <div className='text-xs text-muted-foreground'>Playlist: {course.youtubePlaylistId}</div>
                            ) : null}
                          </div>
                          <div className='flex items-center gap-1'>
                            <Badge variant={course.isPublished ? 'secondary' : 'outline'}>
                              {course.isPublished ? 'Live' : 'Draft'}
                            </Badge>
                            <Button
                              variant='ghost'
                              size='icon'
                              aria-label={`Edit ${course.titleEn}`}
                              onClick={() => startEditCourse(course)}
                            >
                              <Pencil className='size-3' />
                            </Button>
                            <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'course', id: course.id, label: course.titleEn })}>
                              <Trash2 className='size-3' />
                            </Button>
                          </div>
                        </div>
                        <ul className='space-y-1 text-sm'>
                          {course.lessons.map((lesson) => (
                            <li key={lesson.id} className='flex items-center justify-between gap-2 pl-2'>
                              <span>{lesson.titleEn}</span>
                              <Button variant='ghost' size='icon' onClick={() => setDeleteTarget({ kind: 'lesson', id: lesson.id, label: lesson.titleEn })}>
                                <Trash2 className='size-3' />
                              </Button>
                            </li>
                          ))}
                          {course.lessons.length === 0 ? (
                            <li className='pl-2 text-muted-foreground'>No videos yet</li>
                          ) : null}
                        </ul>
                      </div>
                    ))}

                    {cat.standaloneLessons.length === 0 && cat.courses.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>No courses or videos yet</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </Main>

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title='Delete item?'
        desc={deleteTarget ? `Remove "${deleteTarget.label}"?` : ''}
        confirmText='Delete'
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget) }}
      />
    </>
  )
}
