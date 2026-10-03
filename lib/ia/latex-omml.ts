// LaTeX → OMML, the equation markup Microsoft Word edits natively.
//
// A formula in a question is stored as LaTeX (<span data-latex="…">). The PDF
// typesets it through KaTeX; the Word export must hand Word a REAL equation, so
// the CoE can click into it and correct a subscript without retyping the paper.
//
//   LaTeX ──KaTeX──▶ MathML ──(tidy)──▶ mathml2omml ──(repair)──▶ OMML
//
// The two hand-written steps exist because the stock conversion is not quite
// what Word accepts or what a printed paper needs (each was seen in Word):
//   tidy    KaTeX wraps the tree in <semantics>/<annotation>, adds <mstyle> and
//           invisible function-application operators, and marks \left…\right and
//           matrix brackets as <mo fence="true">. The converter has no notion of
//           a stretchy fence, so a 3-row matrix came out between two text-height
//           brackets. Fences are swapped for numbered sentinels here. It also
//           trims the spaces out of \text{…} and writes '<' into the output
//           unescaped; both are carried across as sentinels too.
//   repair  Sentinel pairs become Word delimiters (<m:d>) that grow with their
//           content. An integral or a sum arrives with an EMPTY operand, which
//           Word prints as a gap after the sign — the term that follows is moved
//           into it. And three things Word's schema is strict about are put
//           right: <w:rPr> placed before <m:rPr>, <m:nor/> beside <m:sty/>, and
//           a literal m:val="undefined".
//
// Returns null when the LaTeX cannot be typeset — the caller then prints the
// source text rather than dropping the formula.

import katex from 'katex'
import { mml2omml } from 'mathml2omml'
import { parseMarkup, serializeMarkup, markupText, type MarkupElement, type MarkupNode } from './mini-markup'

// Private-use sentinels: never typed by a person, never whitespace (so the
// converter's trim() leaves them alone), unmistakable in the output string.
const OPEN_A = '\uE010'
const OPEN_B = '\uE011'
const CLOSE_A = '\uE012'
const CLOSE_B = '\uE013'
/** Stands for a thin space until the converter has run (see CARRIED). */
const THIN = '\uE021'
const SENTINEL = /\uE010(\d+)\uE011|\uE012(\d+)\uE013/g

/** Characters that must survive the converter verbatim, and what they come back as. */
const CARRIED: Array<[RegExp, string, string]> = [
	[/[\u2005\u2006\u2009\u200A]/g, '\uE021', '\u2009'], // thin spaces (\,)
	[/[ \u00A0\u2002\u2003\u2004\u2007\u2008]/g, '\uE020', ' '],
	[/</g, '\uE022', '&lt;'],
	[/>/g, '\uE023', '&gt;'],
	[/&/g, '\uE024', '&amp;'],
]

/** Operators KaTeX inserts for semantics only; Word would print them as boxes. */
const INVISIBLE_OPERATORS = new Set(['\u2061', '\u2062', '\u2063', '\u2064'])

/** Wrappers the converter either ignores or mishandles; their content is kept. */
const UNWRAP = new Set(['semantics', 'mstyle', 'mpadded'])
const DROP = new Set(['annotation', 'annotation-xml', 'mphantom'])
const TEXT_TAGS = new Set(['mi', 'mn', 'mo', 'mtext', 'ms'])

interface Fence {
	open: string
	close: string
}

function isEl(n: MarkupNode | undefined, tag?: string): n is MarkupElement {
	return !!n && n.type === 'el' && (!tag || n.tag === tag)
}

const isFence = (n: MarkupNode | undefined): n is MarkupElement => isEl(n, 'mo') && n.attrs.fence === 'true'

const textEl = (tag: string, text: string, attrs: Record<string, string> = {}): MarkupElement => ({
	type: 'el',
	tag,
	attrs,
	children: [{ type: 'text', text }],
})

function carry(text: string, spaces: boolean): string {
	let out = text
	for (const [re, sentinel] of CARRIED.slice(spaces ? 0 : 2)) out = out.replace(re, sentinel)
	return out
}

/** Tidy KaTeX's MathML for the converter; records each stretchy fence pair. */
function tidy(nodes: MarkupNode[], fences: Fence[] | null): MarkupNode[] {
	const out: MarkupNode[] = []
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i]
		if (n.type === 'text') {
			// Whitespace between elements is formatting, not content.
			if (n.text.trim()) out.push(n)
			continue
		}
		if (DROP.has(n.tag)) continue
		if (n.tag === 'mo' && INVISIBLE_OPERATORS.has(markupText(n).trim())) {
			// "sin" + function application + "x": the operator is dropped, but the
			// thin space it stood for is kept, or the paper reads "sinx". No space
			// before a bracket ("sin(x)") or when nothing follows ("lim" under a limit).
			const prev = out[out.length - 1]
			const next = nodes.slice(i + 1).find(x => x.type === 'el')
			const bracketNext = isEl(next, 'mo') && /^[([{]/.test(markupText(next).trim())
			if (isEl(prev, 'mi') && next && !bracketNext) {
				prev.children = [{ type: 'text', text: markupText(prev) + THIN }]
			}
			continue
		}

		if (TEXT_TAGS.has(n.tag)) {
			// Only \text{…} keeps its spaces; an operator's are incidental.
			const text = markupText(n)
			// A multi-letter identifier is a function name (sin, lim, log) and is set
			// upright; Word would otherwise italicise it letter by letter.
			const upright = n.tag === 'mi' && [...text.trim()].length > 1 && !n.attrs.mathvariant
			out.push(textEl(n.tag, carry(text, n.tag === 'mtext'), upright ? { ...n.attrs, mathvariant: 'normal' } : n.attrs))
			continue
		}

		const children = tidy(n.children, fences)
		if (UNWRAP.has(n.tag)) {
			out.push(...children)
			continue
		}
		if (n.tag === 'mrow' && fences && children.length > 0) {
			const first = children[0]
			const last = children[children.length - 1]
			const hasOpen = isFence(first)
			const hasClose = children.length > 1 && isFence(last)
			if (hasOpen || hasClose) {
				const id = fences.length
				fences.push({
					open: hasOpen ? markupText(first).trim() : '',
					close: hasClose ? markupText(last).trim() : '',
				})
				const inner = children.slice(hasOpen ? 1 : 0, hasClose ? -1 : undefined)
				out.push({
					...n,
					children: [
						textEl('mtext', `${OPEN_A}${id}${OPEN_B}`),
						...inner,
						textEl('mtext', `${CLOSE_A}${id}${CLOSE_B}`),
					],
				})
				continue
			}
		}
		out.push({ ...n, children })
	}
	return out
}

const xmlAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Every tag in the string opens and closes in order — cheap well-formedness check. */
function isBalanced(xml: string): boolean {
	const stack: string[] = []
	const re = /<(\/?)([A-Za-z][\w:.-]*)(?:"[^"]*"|[^>"])*?(\/?)>/g
	for (let m = re.exec(xml); m; m = re.exec(xml)) {
		if (m[3]) continue
		if (m[1]) {
			if (stack.pop() !== m[2]) return false
		} else {
			stack.push(m[2])
		}
	}
	return stack.length === 0
}

/**
 * Give every integral / sum / product its operand. The converter leaves
 * <m:e/> empty and the integrand as the next sibling; Word then prints a gap
 * after the sign. Walked right-to-left so "∑ ∫ f" nests as it reads.
 */
function fillNaryOperands(nodes: MarkupNode[]): void {
	for (const n of nodes) if (n.type === 'el') fillNaryOperands(n.children)
	for (let i = nodes.length - 2; i >= 0; i--) {
		const n = nodes[i]
		if (!isEl(n, 'm:nary')) continue
		const operand = n.children.find(c => isEl(c, 'm:e')) as MarkupElement | undefined
		if (!operand || operand.children.length > 0) continue
		const next = nodes[i + 1]
		if (!isEl(next)) continue
		operand.children.push(next)
		nodes.splice(i + 1, 1)
	}
}

/** Make the converter's output something Word opens without complaint. */
function repair(omml: string, fences: Fence[]): string | null {
	let s = omml
		// The document root already declares both namespaces.
		.replace(/^<m:oMath\b[^>]*>/, '<m:oMath>')
		.replace(/<w:rPr\s*\/>/g, '')
		// mathvariant="normal" (∠, ∞, Ω, sin…): an UPRIGHT MATHS run. Left as
		// <m:nor/> it becomes ordinary text in the body font, and Times New Roman
		// has no ∠ — Word printed an empty box.
		.replace(/<m:nor\s*\/><m:sty m:val="undefined"\s*\/>/g, '<m:sty m:val="p"/>')
		.replace(/<m:sty m:val="undefined"\s*\/>/g, '')
		// Schema: a run is EITHER normal text OR styled maths, never both.
		.replace(/<m:nor\s*\/>(<m:sty\b[^>]*\/>)/g, '$1')
		// Schema: the maths run properties come before the Word run properties.
		.replace(/<m:r>(<w:rPr>[\s\S]*?<\/w:rPr>)(<m:rPr>[\s\S]*?<\/m:rPr>)/g, '<m:r>$2$1')
		// <mstyle> twice over one cell used to yield two <m:argPr>; one is the limit.
		.replace(/(<m:argPr>[\s\S]*?<\/m:argPr>)(?:\1)+/g, '$1')

	// Lift every fence sentinel out of the text run that carries it, keeping the
	// run's own properties on whatever real text shared the run.
	s = s.replace(
		/<m:r>((?:<m:rPr>[\s\S]*?<\/m:rPr>)?(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<m:t[^>]*>([^<]*)<\/m:t><\/m:r>/g,
		(whole, props: string, text: string) => {
			SENTINEL.lastIndex = 0
			if (!SENTINEL.test(text)) return whole
			SENTINEL.lastIndex = 0
			let out = ''
			let last = 0
			const run = (t: string) => (t ? `<m:r>${props}<m:t xml:space="preserve">${t}</m:t></m:r>` : '')
			for (let m = SENTINEL.exec(text); m; m = SENTINEL.exec(text)) {
				out += run(text.slice(last, m.index)) + m[0]
				last = m.index + m[0].length
			}
			return out + run(text.slice(last))
		}
	)

	s = s.replace(SENTINEL, (_whole, openId?: string) => {
		if (openId === undefined) return '</m:e></m:d>'
		const f = fences[Number(openId)] || { open: '', close: '' }
		return `<m:d><m:dPr><m:begChr m:val="${xmlAttr(f.open)}"/><m:endChr m:val="${xmlAttr(f.close)}"/></m:dPr><m:e>`
	})

	for (const [, sentinel, restored] of CARRIED) s = s.split(sentinel).join(restored)
	if (!isBalanced(s)) return null

	const tree = parseMarkup(s, { xml: true })
	fillNaryOperands(tree)
	return serializeMarkup(tree, { xml: true })
}

function convert(latex: string, withFences: boolean): string | null {
	const html = katex.renderToString(latex, {
		output: 'mathml',
		throwOnError: false,
		displayMode: false,
		strict: false,
	})
	const found = /<math\b[\s\S]*<\/math>/.exec(html)
	if (!found) return null

	const fences: Fence[] = []
	const tree = tidy(parseMarkup(found[0]), withFences ? fences : null)
	const omml = mml2omml(serializeMarkup(tree))
	if (!omml || !/^<m:oMath\b/.test(omml)) return null
	return repair(omml, fences)
}

/**
 * One formula as an `<m:oMath>` element string, or null when it cannot be
 * typeset. A fence pair the converter moved apart (so the delimiter would not
 * close where it opened) falls back to plain brackets rather than a broken file.
 */
export function latexToOmml(latex: string): string | null {
	const src = (latex || '').trim()
	if (!src) return null
	try {
		return convert(src, true) ?? convert(src, false)
	} catch (e) {
		console.warn('[QP DOCX] formula not converted:', (e as Error)?.message, '—', src.slice(0, 80))
		return null
	}
}
