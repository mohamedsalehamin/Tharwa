import { useEffect, type ReactNode } from 'react'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import '@/styles/rich-text-content.css'

type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  dir?: 'rtl' | 'ltr'
  className?: string
}

function ToolbarButton({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  label: string
}) {
  return (
    <Button
      type='button'
      size='icon'
      variant={active ? 'secondary' : 'ghost'}
      className='size-8'
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write content…',
  dir = 'ltr',
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '<p></p>',
    editorProps: {
      attributes: {
        class: 'tharwa-rich-text ProseMirror',
        dir,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const next = value || '<p></p>'
    if (current !== next) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [editor, value])

  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL (https://…)', prev ?? 'https://')
    if (url == null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className={cn('tharwa-rich-text-editor rounded-md border bg-background', className)}>
      <div className='flex flex-wrap gap-1 border-b p-1'>
        <ToolbarButton
          label='Bold'
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Italic'
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Underline'
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Strike'
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Heading 2'
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Heading 3'
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Bullet list'
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Numbered list'
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className='size-4' />
        </ToolbarButton>
        <ToolbarButton
          label='Quote'
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className='size-4' />
        </ToolbarButton>
        <ToolbarButton label='Link' active={editor.isActive('link')} onClick={setLink}>
          <Link2 className='size-4' />
        </ToolbarButton>
        <ToolbarButton label='Undo' onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className='size-4' />
        </ToolbarButton>
        <ToolbarButton label='Redo' onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className='size-4' />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

type RichTextPreviewProps = {
  html: string
  dir?: 'rtl' | 'ltr'
  className?: string
}

export function RichTextPreview({ html, dir = 'ltr', className }: RichTextPreviewProps) {
  if (!html.trim()) return null
  return (
    <div
      className={cn('tharwa-rich-text rounded-md border bg-muted/30 p-3', className)}
      dir={dir}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
