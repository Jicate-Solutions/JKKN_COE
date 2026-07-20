// Tiptap v3 inline atom node for a math formula.
//
// Persistence contract (shared with the PDF renderer lib/ia/build-paper-pdf-html.ts):
//   <span data-latex="LATEX_SOURCE" class="qp-math">…</span>
// We store ONLY the LaTeX source in data-latex. On screen a DOM NodeView renders
// it live via KaTeX (HTML output); the PDF re-renders LaTeX → MathML at print time.
// Never persist KaTeX HTML.

import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export interface MathOptions {
	HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		mathInline: {
			/** Insert a new formula at the caret. */
			insertMath: (latex: string) => ReturnType
			/** Replace the currently selected formula's LaTeX. */
			updateMath: (latex: string) => ReturnType
		}
	}
}

export const MathInline = Node.create<MathOptions>({
	name: 'mathInline',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addOptions() {
		return { HTMLAttributes: {} }
	},

	addAttributes() {
		return {
			latex: {
				default: '',
				parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') || '',
				renderHTML: (attrs: any) => ({ 'data-latex': attrs.latex }),
			},
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-latex]' }]
	},

	renderHTML({ HTMLAttributes, node }) {
		// Static string child keeps the persisted span human-readable; the PDF
		// renderer reads data-latex and ignores the inner content.
		return [
			'span',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'qp-math' }),
			node.attrs.latex || '',
		]
	},

	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('span')
			dom.className = 'qp-math'
			dom.setAttribute('data-latex', node.attrs.latex || '')
			const render = (latex: string) => {
				try {
					katex.render(latex || '\\;', dom, { throwOnError: false, displayMode: false })
				} catch {
					dom.textContent = latex
				}
			}
			render(node.attrs.latex || '')
			return {
				dom,
				// Re-render if the same node's latex changes in place.
				update: (updatedNode) => {
					if (updatedNode.type.name !== 'mathInline') return false
					dom.setAttribute('data-latex', updatedNode.attrs.latex || '')
					render(updatedNode.attrs.latex || '')
					return true
				},
			}
		}
	},

	addCommands() {
		return {
			insertMath:
				(latex: string) =>
				({ chain }) =>
					chain().insertContent({ type: this.name, attrs: { latex } }).run(),
			updateMath:
				(latex: string) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { latex }),
		}
	},
})

export default MathInline
