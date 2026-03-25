'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import {
	Bold,
	Italic,
	Underline as UnderlineIcon,
	Strikethrough,
	AlignLeft,
	AlignCenter,
	AlignRight,
	AlignJustify,
	List,
	ListOrdered,
	Undo,
	Redo,
	Link as LinkIcon,
	Image as ImageIcon,
	Heading1,
	Heading2,
	Heading3,
	Palette,
	Eraser,
	Upload,
	Loader2,
} from 'lucide-react'
import { useToast } from '@/hooks/common/use-toast'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
	value: string
	onChange: (html: string) => void
	placeholder?: string
	className?: string
	minHeight?: string
	disabled?: boolean
	institutionCode?: string // For naming uploaded images
}

// Predefined colors for the color picker
const COLORS = [
	'#000000', '#1a365d', '#0b6d41', '#b91c1c', '#1e40af', '#7c3aed',
	'#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5',
	'#be185d', '#9333ea', '#475569', '#64748b', '#94a3b8', '#ffffff',
]

export function RichTextEditor({
	value,
	onChange,
	placeholder = 'Start typing...',
	className,
	minHeight = '200px',
	disabled = false,
	institutionCode = '',
}: RichTextEditorProps) {
	const [linkUrl, setLinkUrl] = useState('')
	const [imageUrl, setImageUrl] = useState('')
	const [uploading, setUploading] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { toast } = useToast()
	// Track whether the editor has been initialized — prevents onChange firing
	// during initial content load, which would strip inline styles from raw HTML
	const isInitialized = useRef(false)

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: {
					levels: [1, 2, 3],
				},
			}),
			Underline,
			TextStyle,
			Color,
			TextAlign.configure({
				types: ['heading', 'paragraph'],
			}),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: {
					class: 'text-blue-600 underline cursor-pointer',
				},
			}),
			Image.configure({
				HTMLAttributes: {
					class: 'max-w-full h-auto',
				},
			}),
			Placeholder.configure({
				placeholder,
			}),
		],
		content: value,
		editable: !disabled,
		immediatelyRender: false, // Prevent SSR hydration mismatch in Next.js
		onCreate: () => {
			// Mark initialized after TipTap finishes parsing initial content
			// Use setTimeout to skip the initial onUpdate that fires during creation
			setTimeout(() => {
				isInitialized.current = true
			}, 0)
		},
		onUpdate: ({ editor }) => {
			// Only propagate changes after initial load is complete
			// This prevents TipTap from stripping inline styles on first render
			if (isInitialized.current) {
				onChange(editor.getHTML())
			}
		},
		editorProps: {
			attributes: {
				class: cn(
					'prose prose-sm max-w-none focus:outline-none px-3 py-2',
					'[&_p]:my-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-2',
					'[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2',
					'[&_h3]:text-lg [&_h3]:font-medium [&_h3]:my-1',
					'[&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4',
					'[&_a]:text-blue-600 [&_a]:underline',
					'dark:prose-invert'
				),
				style: `min-height: ${minHeight}`,
			},
		},
	})

	// Sync external value changes (e.g., switching from HTML mode to visual mode)
	useEffect(() => {
		if (editor && value !== editor.getHTML()) {
			// Temporarily suppress onChange while setting external content
			isInitialized.current = false
			editor.commands.setContent(value, false)
			setTimeout(() => {
				isInitialized.current = true
			}, 0)
		}
	}, [value, editor])

	const addLink = useCallback(() => {
		if (linkUrl && editor) {
			editor
				.chain()
				.focus()
				.extendMarkRange('link')
				.setLink({ href: linkUrl })
				.run()
			setLinkUrl('')
		}
	}, [editor, linkUrl])

	const removeLink = useCallback(() => {
		if (editor) {
			editor.chain().focus().unsetLink().run()
		}
	}, [editor])

	const addImage = useCallback(() => {
		if (imageUrl && editor) {
			editor.chain().focus().setImage({ src: imageUrl }).run()
			setImageUrl('')
		}
	}, [editor, imageUrl])

	const handleFileUpload = useCallback(async (file: File) => {
		if (!file || !editor) return

		// Validate file type
		const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
		if (!allowedTypes.includes(file.type)) {
			toast({
				title: 'Invalid file type',
				description: 'Please upload a PNG, JPEG, GIF, WebP, or SVG image.',
				variant: 'destructive',
			})
			return
		}

		// Validate file size (5MB)
		if (file.size > 5 * 1024 * 1024) {
			toast({
				title: 'File too large',
				description: 'Maximum file size is 5MB.',
				variant: 'destructive',
			})
			return
		}

		setUploading(true)

		try {
			const formData = new FormData()
			formData.append('file', file)
			formData.append('institution_code', institutionCode)
			formData.append('logo_type', 'header_image')

			const response = await fetch('/api/upload/logo', {
				method: 'POST',
				body: formData,
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Upload failed')
			}

			const data = await response.json()
			editor.chain().focus().setImage({ src: data.url }).run()

			toast({
				title: 'Image uploaded',
				description: 'Image has been inserted into the editor.',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Upload error:', error)
			toast({
				title: 'Upload failed',
				description: error instanceof Error ? error.message : 'Failed to upload image',
				variant: 'destructive',
			})
		} finally {
			setUploading(false)
			if (fileInputRef.current) {
				fileInputRef.current.value = ''
			}
		}
	}, [editor, institutionCode, toast])

	const setColor = useCallback((color: string) => {
		if (editor) {
			editor.chain().focus().setColor(color).run()
		}
	}, [editor])

	const clearFormatting = useCallback(() => {
		if (editor) {
			editor.chain().focus().clearNodes().unsetAllMarks().run()
		}
	}, [editor])

	if (!editor) {
		return null
	}

	return (
		<div className={cn('border rounded-lg overflow-hidden bg-white dark:bg-slate-900', className)}>
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-slate-50 dark:bg-slate-800">
				{/* Undo/Redo */}
				<Toggle
					size="sm"
					pressed={false}
					onPressedChange={() => editor.chain().focus().undo().run()}
					disabled={!editor.can().undo() || disabled}
					title="Undo"
				>
					<Undo className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={false}
					onPressedChange={() => editor.chain().focus().redo().run()}
					disabled={!editor.can().redo() || disabled}
					title="Redo"
				>
					<Redo className="h-4 w-4" />
				</Toggle>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Headings */}
				<Toggle
					size="sm"
					pressed={editor.isActive('heading', { level: 1 })}
					onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
					disabled={disabled}
					title="Heading 1"
				>
					<Heading1 className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('heading', { level: 2 })}
					onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
					disabled={disabled}
					title="Heading 2"
				>
					<Heading2 className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('heading', { level: 3 })}
					onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
					disabled={disabled}
					title="Heading 3"
				>
					<Heading3 className="h-4 w-4" />
				</Toggle>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Text Formatting */}
				<Toggle
					size="sm"
					pressed={editor.isActive('bold')}
					onPressedChange={() => editor.chain().focus().toggleBold().run()}
					disabled={disabled}
					title="Bold"
				>
					<Bold className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('italic')}
					onPressedChange={() => editor.chain().focus().toggleItalic().run()}
					disabled={disabled}
					title="Italic"
				>
					<Italic className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('underline')}
					onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
					disabled={disabled}
					title="Underline"
				>
					<UnderlineIcon className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('strike')}
					onPressedChange={() => editor.chain().focus().toggleStrike().run()}
					disabled={disabled}
					title="Strikethrough"
				>
					<Strikethrough className="h-4 w-4" />
				</Toggle>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Text Color */}
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-8 px-2" disabled={disabled} title="Text Color">
							<Palette className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-2">
						<div className="grid grid-cols-6 gap-1">
							{COLORS.map((color) => (
								<button
									key={color}
									className="w-6 h-6 rounded border border-slate-200 hover:scale-110 transition-transform"
									style={{ backgroundColor: color }}
									onClick={() => setColor(color)}
									title={color}
								/>
							))}
						</div>
					</PopoverContent>
				</Popover>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Text Alignment */}
				<Toggle
					size="sm"
					pressed={editor.isActive({ textAlign: 'left' })}
					onPressedChange={() => editor.chain().focus().setTextAlign('left').run()}
					disabled={disabled}
					title="Align Left"
				>
					<AlignLeft className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive({ textAlign: 'center' })}
					onPressedChange={() => editor.chain().focus().setTextAlign('center').run()}
					disabled={disabled}
					title="Align Center"
				>
					<AlignCenter className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive({ textAlign: 'right' })}
					onPressedChange={() => editor.chain().focus().setTextAlign('right').run()}
					disabled={disabled}
					title="Align Right"
				>
					<AlignRight className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive({ textAlign: 'justify' })}
					onPressedChange={() => editor.chain().focus().setTextAlign('justify').run()}
					disabled={disabled}
					title="Justify"
				>
					<AlignJustify className="h-4 w-4" />
				</Toggle>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Lists */}
				<Toggle
					size="sm"
					pressed={editor.isActive('bulletList')}
					onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
					disabled={disabled}
					title="Bullet List"
				>
					<List className="h-4 w-4" />
				</Toggle>
				<Toggle
					size="sm"
					pressed={editor.isActive('orderedList')}
					onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
					disabled={disabled}
					title="Numbered List"
				>
					<ListOrdered className="h-4 w-4" />
				</Toggle>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Link */}
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={cn('h-8 px-2', editor.isActive('link') && 'bg-slate-200 dark:bg-slate-700')}
							disabled={disabled}
							title="Insert Link"
						>
							<LinkIcon className="h-4 w-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80">
						<div className="space-y-3">
							<Label>URL</Label>
							<Input
								value={linkUrl}
								onChange={(e) => setLinkUrl(e.target.value)}
								placeholder="https://example.com"
							/>
							<div className="flex gap-2">
								<Button size="sm" onClick={addLink} disabled={!linkUrl}>
									Add Link
								</Button>
								{editor.isActive('link') && (
									<Button size="sm" variant="outline" onClick={removeLink}>
										Remove
									</Button>
								)}
							</div>
						</div>
					</PopoverContent>
				</Popover>

				{/* Image */}
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="h-8 px-2" disabled={disabled || uploading} title="Insert Image">
							{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80">
						<div className="space-y-4">
							{/* Upload Section */}
							<div className="space-y-2">
								<Label className="text-sm font-medium">Upload Image</Label>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
									onChange={(e) => {
										const file = e.target.files?.[0]
										if (file) handleFileUpload(file)
									}}
									className="hidden"
								/>
								<Button
									size="sm"
									variant="outline"
									className="w-full border-dashed border-2 h-16 hover:border-[#0b6d41] hover:bg-[#0b6d41]/5"
									onClick={() => fileInputRef.current?.click()}
									disabled={uploading}
								>
									{uploading ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Uploading...
										</>
									) : (
										<>
											<Upload className="h-4 w-4 mr-2" />
											Click to upload image
										</>
									)}
								</Button>
								<p className="text-xs text-slate-500">PNG, JPEG, GIF, WebP, SVG (max 5MB)</p>
							</div>

							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-white px-2 text-slate-500">Or</span>
								</div>
							</div>

							{/* URL Section */}
							<div className="space-y-2">
								<Label className="text-sm font-medium">Image URL</Label>
								<Input
									value={imageUrl}
									onChange={(e) => setImageUrl(e.target.value)}
									placeholder="/jkkn_logo.png or https://..."
								/>
								<Button size="sm" onClick={addImage} disabled={!imageUrl} className="w-full bg-[#0b6d41] hover:bg-[#095a36]">
									Insert Image
								</Button>
							</div>
						</div>
					</PopoverContent>
				</Popover>

				<Separator orientation="vertical" className="mx-1 h-6" />

				{/* Clear Formatting */}
				<Toggle
					size="sm"
					pressed={false}
					onPressedChange={clearFormatting}
					disabled={disabled}
					title="Clear Formatting"
				>
					<Eraser className="h-4 w-4" />
				</Toggle>
			</div>

			{/* Editor Content */}
			<EditorContent
				editor={editor}
				className={cn(
					'overflow-auto',
					disabled && 'opacity-50 cursor-not-allowed'
				)}
			/>
		</div>
	)
}

export default RichTextEditor
