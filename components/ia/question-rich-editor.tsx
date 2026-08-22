'use client'

// Rich question editor: typeable box (bold/italic/underline, sub/superscript,
// inline math via KaTeX, tables) that emits sanitized HTML. The Tamil font is a
// paper-level default (set once in the paper header), not a per-question choice.
// Shares the storage contract with the PDF renderer (math = <span data-latex="…">;
// Tamil = style="font-family:…").

import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextStyle, FontFamily } from '@tiptap/extension-text-style'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
	Bold, Italic, Underline as UnderlineIcon, Subscript as SubIcon, Superscript as SupIcon,
	Sigma, Table as TableIcon, Rows3, Columns3, Trash2,
} from 'lucide-react'
import { MathInline } from './math-node'
import { EquationEditorDialog } from './equation-editor-dialog'

interface Props {
	value: string
	onChange: (html: string) => void
	onBlur?: () => void
	disabled?: boolean
	placeholder?: string
	className?: string
	/**
	 * Paper-wide default language/font, chosen once in the paper header. Applied
	 * as the editor body's base font so every question renders in it live —
	 * there is no per-question font picker. Font marks stored on older papers
	 * still render (the FontFamily extension stays loaded) and keep the
	 * on-screen look in step with the PDF, which reads the same paper default.
	 */
	defaultFontFamily?: string | null
	/**
	 * 'compact' is the MCQ-option flavour: same authoring contract as a question
	 * (bold/italic/underline, sub/superscript, inline equations) minus the table
	 * tools, on a single-line-height box.
	 */
	variant?: 'full' | 'compact'
}

// Empty-document HTML Tiptap emits — normalise to '' so an untouched question stays blank.
const EMPTY_HTML = new Set(['', '<p></p>', '<p><br></p>'])

export function QuestionRichEditor({ value, onChange, onBlur, disabled, placeholder, className, defaultFontFamily, variant = 'full' }: Props) {
	const [eqOpen, setEqOpen] = useState(false)
	const [eqInitial, setEqInitial] = useState('')
	const compact = variant === 'compact'

	const editor = useEditor({
		editable: !disabled,
		immediatelyRender: false,
		extensions: [
			StarterKit,
			Underline,
			Subscript,
			Superscript,
			TextStyle,
			FontFamily,
			TableKit.configure({ table: { resizable: false } }),
			MathInline,
			Placeholder.configure({ placeholder: placeholder || 'Enter the question…' }),
		],
		content: value || '',
		editorProps: {
			attributes: {
				class: cn(
					'prose prose-sm max-w-none focus:outline-none qp-rich-editor-body',
					compact ? 'min-h-[34px] px-2 py-1' : 'min-h-[70px] px-3 py-2'
				),
			},
		},
		onUpdate: ({ editor }) => {
			const html = editor.getHTML()
			onChange(EMPTY_HTML.has(html) ? '' : html)
		},
		onBlur: () => onBlur?.(),
	})

	// Keep the editor in step with external value changes (server reloads, rebuild)
	// WITHOUT re-emitting onUpdate (v3 signature: { emitUpdate: false }).
	useEffect(() => {
		if (!editor) return
		const current = editor.getHTML()
		const incoming = value || ''
		const norm = (h: string) => (EMPTY_HTML.has(h) ? '' : h)
		if (norm(current) !== norm(incoming)) {
			editor.commands.setContent(incoming, { emitUpdate: false })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, editor])

	useEffect(() => {
		editor?.setEditable(!disabled)
	}, [disabled, editor])

	// Open the equation dialog — pre-filled when the caret is on an existing formula.
	const openEquation = useCallback(() => {
		if (!editor) return
		const attrs = editor.getAttributes('mathInline')
		setEqInitial(editor.isActive('mathInline') ? attrs.latex || '' : '')
		setEqOpen(true)
	}, [editor])

	const onEquationInsert = (latex: string) => {
		if (!editor) return
		if (editor.isActive('mathInline')) editor.chain().focus().updateMath(latex).run()
		else editor.chain().focus().insertMath(latex).run()
	}

	if (!editor) return null

	const Btn = ({
		on, active, disabled: d, title, children,
	}: {
		on: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode
	}) => (
		<Button
			type="button"
			variant={active ? 'secondary' : 'ghost'}
			size="icon"
			className="h-7 w-7"
			title={title}
			disabled={d}
			onMouseDown={e => e.preventDefault()}
			onClick={on}
		>
			{children}
		</Button>
	)

	const inTable = editor.isActive('table')

	return (
		<div className={cn('rounded-md border bg-background qp-rich-editor-root', className)}>
			{!disabled && (
				<div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
					<Btn title="Bold" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}>
						<Bold className="h-4 w-4" />
					</Btn>
					<Btn title="Italic" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}>
						<Italic className="h-4 w-4" />
					</Btn>
					<Btn title="Underline" active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()}>
						<UnderlineIcon className="h-4 w-4" />
					</Btn>
					<Btn title="Subscript" active={editor.isActive('subscript')} on={() => editor.chain().focus().toggleSubscript().run()}>
						<SubIcon className="h-4 w-4" />
					</Btn>
					<Btn title="Superscript" active={editor.isActive('superscript')} on={() => editor.chain().focus().toggleSuperscript().run()}>
						<SupIcon className="h-4 w-4" />
					</Btn>
					<span className="mx-1 h-5 w-px bg-border" />
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 gap-1 px-2 text-xs"
						title="Insert / edit equation"
						onMouseDown={e => e.preventDefault()}
						onClick={openEquation}
					>
						<Sigma className="h-4 w-4" /> Equation
					</Button>
					{!compact && (
						<>
							<span className="mx-1 h-5 w-px bg-border" />
							<Btn
								title="Insert 2×2 table"
								on={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()}
							>
								<TableIcon className="h-4 w-4" />
							</Btn>
							<Btn title="Add row" disabled={!inTable} on={() => editor.chain().focus().addRowAfter().run()}>
								<Rows3 className="h-4 w-4" />
							</Btn>
							<Btn title="Add column" disabled={!inTable} on={() => editor.chain().focus().addColumnAfter().run()}>
								<Columns3 className="h-4 w-4" />
							</Btn>
							<Btn title="Delete row" disabled={!inTable} on={() => editor.chain().focus().deleteRow().run()}>
								<Rows3 className="h-4 w-4 text-destructive" />
							</Btn>
							<Btn title="Delete column" disabled={!inTable} on={() => editor.chain().focus().deleteColumn().run()}>
								<Columns3 className="h-4 w-4 text-destructive" />
							</Btn>
							<Btn title="Delete table" disabled={!inTable} on={() => editor.chain().focus().deleteTable().run()}>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Btn>
						</>
					)}
				</div>
			)}

			{/* Paper default cascades onto the content via --qp-editor-font; font
			    marks saved on older papers (inline spans) still override it. */}
			<div
				style={
					defaultFontFamily
						? ({ ['--qp-editor-font']: `'${defaultFontFamily}'` } as React.CSSProperties)
						: undefined
				}
			>
				<EditorContent editor={editor} className="qp-rich-editor" />
			</div>

			<EquationEditorDialog
				open={eqOpen}
				onOpenChange={setEqOpen}
				initialLatex={eqInitial}
				onInsert={onEquationInsert}
			/>
		</div>
	)
}

export default QuestionRichEditor
