'use client'

// Word-style equation editor: Structures + Symbols category ribbons → token grid
// → LaTeX field + live KaTeX preview. Emits the LaTeX source (insert or update).

import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
	Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { STRUCTURE_GROUPS, SYMBOL_GROUPS, type MathCategory } from '@/lib/ia/math-catalog'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialLatex?: string // set → edit an existing formula; empty → insert new
	onInsert: (latex: string) => void
}

const ALL_CATEGORIES: MathCategory[] = [...STRUCTURE_GROUPS, ...SYMBOL_GROUPS]

function KatexButton({ latex, title, onClick }: { latex: string; title?: string; onClick: () => void }) {
	const html = useMemo(() => {
		try {
			return katex.renderToString(latex, { throwOnError: false })
		} catch {
			return latex
		}
	}, [latex])
	return (
		<button
			type="button"
			title={title || latex}
			onClick={onClick}
			className="flex h-10 min-w-11 items-center justify-center rounded border bg-background px-2 text-base hover:bg-muted"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}

function RibbonTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'rounded px-2.5 py-1 text-xs font-medium',
				active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'
			)}
		>
			{label}
		</button>
	)
}

export function EquationEditorDialog({ open, onOpenChange, initialLatex, onInsert }: Props) {
	const [latex, setLatex] = useState('')
	const [category, setCategory] = useState(STRUCTURE_GROUPS[0]?.name || '')
	const taRef = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		if (open) {
			setLatex(initialLatex || '')
			setCategory(STRUCTURE_GROUPS[0]?.name || '')
		}
	}, [open, initialLatex])

	const insertToken = (token: string) => {
		const ta = taRef.current
		if (!ta) {
			setLatex(prev => prev + token)
			return
		}
		const start = ta.selectionStart ?? latex.length
		const end = ta.selectionEnd ?? latex.length
		setLatex(latex.slice(0, start) + token + latex.slice(end))
		requestAnimationFrame(() => {
			ta.focus()
			const pos = start + token.length
			ta.setSelectionRange(pos, pos)
		})
	}

	const previewHtml = useMemo(() => {
		if (!latex.trim()) return ''
		try {
			return katex.renderToString(latex, { throwOnError: false, displayMode: true })
		} catch (e: any) {
			return `<span style="color:#b91c1c">${e?.message || 'Invalid LaTeX'}</span>`
		}
	}, [latex])

	const activeCategory = ALL_CATEGORIES.find(c => c.name === category) || STRUCTURE_GROUPS[0]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Equation editor</DialogTitle>
				</DialogHeader>

				{/* Structures ribbon */}
				<div className="flex flex-wrap items-center gap-1">
					<span className="mr-1 w-16 shrink-0 text-xs font-semibold text-muted-foreground">Structures</span>
					{STRUCTURE_GROUPS.map(g => (
						<RibbonTab key={g.name} label={g.name} active={category === g.name} onClick={() => setCategory(g.name)} />
					))}
				</div>

				{/* Symbols ribbon */}
				<div className="flex flex-wrap items-center gap-1">
					<span className="mr-1 w-16 shrink-0 text-xs font-semibold text-muted-foreground">Symbols</span>
					{SYMBOL_GROUPS.map(g => (
						<RibbonTab key={g.name} label={g.name} active={category === g.name} onClick={() => setCategory(g.name)} />
					))}
				</div>

				{/* Token grid for the active category */}
				<div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded border bg-muted/30 p-2">
					{activeCategory?.tokens.map(t => (
						<KatexButton key={t.latex + t.label} latex={t.label} title={t.title} onClick={() => insertToken(t.latex)} />
					))}
				</div>

				{/* LaTeX field + live preview, side by side */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<div className="mb-1 text-xs font-semibold text-muted-foreground">LaTeX</div>
						<Textarea
							ref={taRef}
							rows={4}
							value={latex}
							onChange={e => setLatex(e.target.value)}
							placeholder="e.g.  x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
							className="font-mono text-sm"
						/>
					</div>
					<div>
						<div className="mb-1 text-xs font-semibold text-muted-foreground">Preview</div>
						<div className="flex min-h-[92px] items-center justify-center rounded border bg-background p-3">
							{latex.trim() ? (
								<span dangerouslySetInnerHTML={{ __html: previewHtml }} />
							) : (
								<span className="text-xs text-muted-foreground">Preview appears here</span>
							)}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							const v = latex.trim()
							if (v) onInsert(v)
							onOpenChange(false)
						}}
						disabled={!latex.trim()}
					>
						{initialLatex ? 'Update' : 'Insert'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default EquationEditorDialog
