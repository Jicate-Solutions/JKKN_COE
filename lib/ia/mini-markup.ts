// A small tag-soup parser for markup WE produced.
//
// Two callers, both server-side, both fed machine-made input:
//   • the Word export walks sanitized question HTML (lib/ia/build-paper-pdf-html
//     sanitizeHtml — a fixed allowlist of tags, quoted attributes only);
//   • the LaTeX → Word-equation converter walks the MathML KaTeX emits.
// Neither needs a spec-complete HTML5 parser, and pulling jsdom / parse5 into a
// Vercel function is exactly the fragility the sanitizer was written to avoid.
// Not for arbitrary web content.

export interface MarkupElement {
	type: 'el'
	tag: string
	attrs: Record<string, string>
	children: MarkupNode[]
}

export interface MarkupText {
	type: 'text'
	text: string
}

export type MarkupNode = MarkupElement | MarkupText

const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'mspace', 'none', 'mprescripts'])

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: '\u00A0',
}

/** &amp; &lt; &#39; &#x2212; … → the characters they stand for. */
export function decodeMarkupEntities(s: string): string {
	if (!s.includes('&')) return s
	return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? whole
	})
}

export function escapeMarkupText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
	return escapeMarkupText(s).replace(/"/g, '&quot;')
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)|</g
const ATTR = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g

/**
 * Parse into a tree. Unmatched closing tags are ignored; unclosed ones close at
 * the end. HTML mode lowercases names and knows the void tags; `xml` keeps the
 * case of names (OMML is case-sensitive: m:oMath, m:naryPr) and has no void tags.
 */
export function parseMarkup(src: string, opts: { xml?: boolean } = {}): MarkupNode[] {
	const xml = !!opts.xml
	const root: MarkupElement = { type: 'el', tag: '#root', attrs: {}, children: [] }
	const stack: MarkupElement[] = [root]
	const top = () => stack[stack.length - 1]

	TOKEN.lastIndex = 0
	for (let m = TOKEN.exec(src || ''); m; m = TOKEN.exec(src)) {
		const [whole, slash, rawTag, rawAttrs, text] = m
		if (text !== undefined) {
			top().children.push({ type: 'text', text: decodeMarkupEntities(text) })
			continue
		}
		if (!rawTag) {
			// A comment, or a stray '<' that opens no tag: keep the latter as text.
			if (whole === '<') top().children.push({ type: 'text', text: '<' })
			continue
		}
		const tag = xml ? rawTag : rawTag.toLowerCase()
		if (slash) {
			const at = stack.map(e => e.tag).lastIndexOf(tag)
			if (at > 0) stack.length = at
			continue
		}
		const attrs: Record<string, string> = {}
		const body = (rawAttrs || '').replace(/\/\s*$/, '')
		ATTR.lastIndex = 0
		for (let a = ATTR.exec(body); a; a = ATTR.exec(body)) {
			attrs[xml ? a[1] : a[1].toLowerCase()] = decodeMarkupEntities(a[2] ?? a[3] ?? a[4] ?? '')
		}
		const el: MarkupElement = { type: 'el', tag, attrs, children: [] }
		top().children.push(el)
		const selfClosed = /\/\s*$/.test(rawAttrs || '')
		if (!selfClosed && (xml || !VOID_TAGS.has(tag))) stack.push(el)
	}
	return root.children
}

/**
 * Back to a string — used to hand transformed MathML on to the next converter.
 * In `xml` mode every childless element is written self-closed.
 */
export function serializeMarkup(nodes: MarkupNode[], opts: { xml?: boolean } = {}): string {
	return nodes
		.map(n => {
			if (n.type === 'text') return escapeMarkupText(n.text)
			const attrs = Object.entries(n.attrs)
				.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
				.join('')
			if (n.children.length === 0 && (opts.xml || VOID_TAGS.has(n.tag))) return `<${n.tag}${attrs}/>`
			return `<${n.tag}${attrs}>${serializeMarkup(n.children, opts)}</${n.tag}>`
		})
		.join('')
}

/** All text beneath a node, concatenated. */
export function markupText(node: MarkupNode): string {
	return node.type === 'text' ? node.text : node.children.map(markupText).join('')
}
