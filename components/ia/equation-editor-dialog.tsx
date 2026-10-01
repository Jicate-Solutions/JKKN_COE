'use client'

// Word-style equation editor.
//
// Laid out like Microsoft Word's Equation Tools ribbon, because that is the
// editor every examiner already knows:
//
//   ┌ Symbols ─────────────────────────┐ ┌ Structures ───────────────────────┐
//   │ [set ▾]  ± ∞ = ≠ ~ × ÷ ! ∝ < ≪ … │ │ Fraction Script Radical Integral … │
//   │          ≤ ≥ ∓ ≅ ≈ ≡ ∀ ∁ ∂ √ …   │ │   each opens a gallery of shapes   │
//   └──────────────────────────────────┘ └────────────────────────────────────┘
//   ┌ Type equation here ──────────────────────────────────────────────────────┐
//   │                              (live preview)                              │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// A structure drops in with EMPTY BOXES (□) where the values go, exactly as
// Word does; the first box is selected so typing fills it, and Tab moves to
// the next. What is stored is plain LaTeX (the same contract as before), so the
// on-screen render and the printed paper are unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown, ChevronLeft, ChevronRight, Eraser } from 'lucide-react'
import { stripLatexDelimiters } from '@/lib/ia/latex-paste'
import { cn } from '@/lib/utils'
import { PLACEHOLDER, STRUCTURES, SYMBOL_SETS, type MathToken } from '@/lib/ia/math-catalog'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialLatex?: string // set → edit an existing formula; empty → insert new
	onInsert: (latex: string) => void
}

/** The placeholder, drawn grey so an empty box reads as "fill me", not as a symbol. */
const PH_RE = /\\square(?![a-zA-Z])/g
const paintPlaceholders = (latex: string) => latex.replace(PH_RE, '\\textcolor{#94a3b8}{\\square}')

function render(latex: string, display: boolean): string {
	try {
		return katex.renderToString(paintPlaceholders(latex), { throwOnError: false, displayMode: display })
	} catch {
		return latex
	}
}

/** One palette button: a symbol (small) or a structure tile (large). */
function MathButton({
	token,
	size,
	onPick,
}: {
	token: MathToken
	size: 'symbol' | 'tile'
	onPick: (latex: string) => void
}) {
	const html = useMemo(() => render(token.label ?? token.latex, size === 'tile'), [token.label, token.latex, size])
	return (
		<button
			type="button"
			title={token.title || token.latex}
			onMouseDown={e => e.preventDefault()}
			onClick={() => onPick(token.latex)}
			className={cn(
				'flex items-center justify-center rounded border bg-white transition-colors hover:border-blue-400 hover:bg-blue-50',
				size === 'symbol' ? 'h-8 min-w-8 px-1 text-sm' : 'h-16 px-2 text-base [&_.katex-display]:my-0 overflow-hidden'
			)}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}

/** How many empty boxes the equation still has. */
function countPlaceholders(latex: string): number {
	return (latex.match(PH_RE) || []).length
}

export function EquationEditorDialog({ open, onOpenChange, initialLatex, onInsert }: Props) {
	const [latex, setLatex] = useState('')
	const [symbolSet, setSymbolSet] = useState(SYMBOL_SETS[0].name)
	const [openGroup, setOpenGroup] = useState<string | null>(null)
	const taRef = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		if (open) {
			setLatex(initialLatex || '')
			setOpenGroup(null)
		}
	}, [open, initialLatex])

	/** Select [start, end) in the source box once React has painted the new value. */
	const selectLater = useCallback((start: number, end: number) => {
		requestAnimationFrame(() => {
			const ta = taRef.current
			if (!ta) return
			ta.focus()
			ta.setSelectionRange(start, end)
		})
	}, [])

	/** Move to the next / previous empty box, wrapping round. Returns false when there is none. */
	const jumpPlaceholder = useCallback(
		(dir: 1 | -1): boolean => {
			const ta = taRef.current
			const text = ta?.value ?? latex
			const boxes: number[] = []
			for (const m of text.matchAll(PH_RE)) boxes.push(m.index ?? 0)
			if (boxes.length === 0) return false
			const from = dir === 1 ? (ta?.selectionEnd ?? text.length) : (ta?.selectionStart ?? 0)
			let target: number | undefined
			if (dir === 1) target = boxes.find(i => i >= from) ?? boxes[0]
			else {
				const before = boxes.filter(i => i < from)
				target = before.length ? before[before.length - 1] : boxes[boxes.length - 1]
			}
			selectLater(target, target + PLACEHOLDER.length)
			return true
		},
		[latex, selectLater]
	)

	/**
	 * Insert at the caret (replacing any selection). A structure lands with its
	 * first box selected, so the next keystroke fills it — the Word behaviour.
	 */
	const insertToken = useCallback(
		(token: string) => {
			const ta = taRef.current
			// Before the source box has been focused there is no caret worth
			// honouring — append, so editing an old formula does not prepend.
			const focused = !!ta && document.activeElement === ta
			const start = focused ? ta.selectionStart : latex.length
			const end = focused ? ta.selectionEnd : latex.length
			const before = latex.slice(0, start)
			const after = latex.slice(end)
			// A breathing space so two symbols in a row do not fuse into one command.
			const needsSpace = /[a-zA-Z]$/.test(before) && token.startsWith('\\')
			const inserted = (needsSpace ? ' ' : '') + token
			setLatex(before + inserted + after)
			const firstBox = inserted.search(PH_RE)
			if (firstBox >= 0) selectLater(start + firstBox, start + firstBox + PLACEHOLDER.length)
			else selectLater(start + inserted.length, start + inserted.length)
			setOpenGroup(null)
		},
		[latex, selectLater]
	)

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Tab') {
			if (jumpPlaceholder(e.shiftKey ? -1 : 1)) e.preventDefault()
		}
	}

	const previewHtml = useMemo(() => (latex.trim() ? render(latex, true) : ''), [latex])
	const empties = useMemo(() => countPlaceholders(latex), [latex])
	const activeSet = SYMBOL_SETS.find(s => s.name === symbolSet) || SYMBOL_SETS[0]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl gap-0 p-0 overflow-hidden">
				<DialogHeader className="border-b px-5 pb-3 pt-4 text-left">
					<DialogTitle>Equation</DialogTitle>
					<DialogDescription>
						Pick a structure or a symbol, then type into each box. Tab moves to the next box.
					</DialogDescription>
				</DialogHeader>

				{/* ── The ribbon: Symbols on the left, Structures on the right ── */}
				<div className="grid grid-cols-1 gap-3 border-b bg-slate-50 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_auto]">
					<div className="min-w-0 rounded-md border bg-white">
						<div className="flex items-center gap-2 px-2 pt-1.5">
							<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Symbols</span>
							<Select value={symbolSet} onValueChange={setSymbolSet}>
								<SelectTrigger className="h-7 w-52 text-xs" aria-label="Symbol set">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SYMBOL_SETS.map(s => (
										<SelectItem key={s.name} value={s.name} className="text-xs">
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid max-h-[92px] grid-cols-[repeat(auto-fill,minmax(34px,1fr))] gap-0.5 overflow-y-auto p-2 [scrollbar-width:thin]">
							{activeSet.tokens.map((tok, i) => (
								<MathButton key={`${tok.latex}-${i}`} token={tok} size="symbol" onPick={insertToken} />
							))}
						</div>
					</div>

					<div className="rounded-md border bg-white px-2 pb-2 pt-1.5">
						<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Structures</span>
						<div className="mt-1 flex flex-wrap gap-0.5">
							{STRUCTURES.map(g => (
								<Popover key={g.key} open={openGroup === g.key} onOpenChange={o => setOpenGroup(o ? g.key : null)}>
									<PopoverTrigger asChild>
										<button
											type="button"
											onMouseDown={e => e.preventDefault()}
											className={cn(
												'flex w-[76px] flex-col items-center rounded px-1 pb-1 pt-1.5 transition-colors hover:bg-slate-100',
												openGroup === g.key && 'bg-slate-100'
											)}
										>
											<span
												className="flex h-8 items-center justify-center text-base [&_.katex]:text-[15px]"
												dangerouslySetInnerHTML={{ __html: render(g.icon, false) }}
											/>
											<span className="mt-0.5 flex items-center gap-0.5 text-[11px] leading-tight text-slate-700">
												{g.name}
												<ChevronDown className="h-3 w-3 text-slate-400" />
											</span>
										</button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-[440px] max-h-[70vh] overflow-y-auto p-0 [scrollbar-width:thin]">
										{g.sections.map(sec => (
											<div key={sec.name}>
												<div className="sticky top-0 border-b bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{sec.name}</div>
												<div className="grid grid-cols-4 gap-2 p-3">
													{sec.items.map((tok, i) => (
														<MathButton key={`${tok.latex}-${i}`} token={tok} size="tile" onPick={insertToken} />
													))}
												</div>
											</div>
										))}
									</PopoverContent>
								</Popover>
							))}
						</div>
					</div>
				</div>

				{/* ── The equation ── */}
				<div className="space-y-3 px-5 py-4">
					<div className="flex min-h-[110px] items-center justify-center rounded-md border bg-white p-4 text-lg [&_.katex-display]:my-0">
						{latex.trim() ? (
							<span dangerouslySetInnerHTML={{ __html: previewHtml }} />
						) : (
							<span className="rounded border border-dashed border-slate-300 px-3 py-1 text-sm text-slate-400">Type equation here</span>
						)}
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
						<span className={cn(empties > 0 ? 'text-amber-700' : 'text-muted-foreground')}>
							{empties > 0
								? `${empties} empty box${empties === 1 ? '' : 'es'} to fill — Tab jumps to the next one`
								: latex.trim()
									? 'No empty boxes left'
									: 'Nothing entered yet'}
						</span>
						<span className="flex items-center gap-1">
							<Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => jumpPlaceholder(-1)} disabled={empties === 0}>
								<ChevronLeft className="h-3.5 w-3.5" />
								Previous box
							</Button>
							<Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => jumpPlaceholder(1)} disabled={empties === 0}>
								Next box
								<ChevronRight className="h-3.5 w-3.5" />
							</Button>
							<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setLatex(''); selectLater(0, 0) }} disabled={!latex}>
								<Eraser className="h-3.5 w-3.5 mr-1" />
								Clear
							</Button>
						</span>
					</div>

					<div>
						<Textarea
							ref={taRef}
							rows={3}
							value={latex}
							onChange={e => setLatex(e.target.value)}
							onKeyDown={onKeyDown}
							placeholder="The equation appears here as you build it. You can also type LaTeX directly, e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
							className="font-mono text-sm"
							spellCheck={false}
						/>
						<p className="mt-1 text-[11px] text-muted-foreground">
							Each <span className="font-mono">\square</span> is an empty box. Paste from MathType or Overleaf works too.
						</p>
					</div>
				</div>

				<DialogFooter className="border-t px-5 py-3 sm:justify-between">
					<span className="text-xs text-muted-foreground self-center">
						{empties > 0 && 'Boxes left empty print as a small square.'}
					</span>
					<span className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								// MathType / Overleaf copies arrive wrapped in $…$ or […]; store bare LaTeX.
								const v = stripLatexDelimiters(latex)
								if (v) onInsert(v)
								onOpenChange(false)
							}}
							disabled={!latex.trim()}
						>
							{initialLatex ? 'Update equation' : 'Insert equation'}
						</Button>
					</span>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default EquationEditorDialog
