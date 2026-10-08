// Editable Word (.docx) copies of a question paper and its answer key.
//
// The PDF (lib/ia/build-paper-pdf-html.ts) is the document of record; this is the
// same paper for the office that has to open it in Word — to correct a typo the
// day before printing, or to paste it into the press's own template. It therefore
// mirrors the PDF's stylesheet value for value rather than inventing a layout:
//
//   page      A4 portrait, 8mm margins (answer key: 14mm foot + page footer)
//   type      Times New Roman 12pt; headings 13 / 12pt bold centred;
//             CO · K-Level · part instruction 10pt bold; marks 11pt bold
//             (the sizes are the PDF's own — PAPER_TYPE.single)
//   table     ONE fixed-layout table for the whole paper —
//             15mm | question | 12mm CO | 20mm K-Level   (key: 15mm | text | 16mm)
//             4px cell padding, 16pt minimum line, question text justified
//   content   the SAME sanitized HTML the PDF prints (prepareQuestionHtml), walked
//             into Word paragraphs, runs and tables
//
// Two things differ from the PDF by nature, not by choice:
//   • a formula is a native Word equation (lib/ia/latex-omml.ts), so it can be
//     edited — the PDF prints KaTeX glyphs;
//   • Word paginates for itself, so a CIA paper is not squeezed onto two sheets
//     and there is no 2-up layout.
//
// Tamil: Bamini / Suntommy / Noto Sans Tamil are EMBEDDED in the file when the
// paper uses them, so it opens correctly on a PC without those fonts installed.

import {
	AlignmentType,
	BorderStyle,
	Document,
	Footer,
	HeightRule,
	ImageRun,
	ImportedXmlComponent,
	LineRuleType,
	Packer,
	PageNumber,
	Paragraph,
	ShadingType,
	Tab,
	Table,
	TableCell,
	TableLayoutType,
	TableRow,
	TabStopType,
	TextRun,
	VerticalAlignTable,
	WidthType,
} from 'docx'
import {
	formatDuration,
	loadPaperContext,
	PAPER_TYPE,
	prepareQuestionHtml,
	readSubQuestionsForPrint,
	type PaperContext,
	type PaperSource,
} from './build-paper-pdf-html'
import { latexToOmml } from './latex-omml'
import { parseMarkup, type MarkupElement, type MarkupNode } from './mini-markup'
import { readSubQuestions, readQuestionImage } from './sub-questions'
import { hasAnswerKey, hasOwnAnswerKey } from './validate-paper'
import { paperPdfFilename } from './paper-filename'
import { canonicalizeFontFamily, readTamilFontFile } from './tamil-fonts'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface BuildPaperDocxResult {
	buffer: Buffer
	filename: string
}

// ── Units ────────────────────────────────────────────────────────────────────
// Word measures in twips (1/20 pt). The PDF stylesheet is in mm, pt and CSS px.

const mm = (v: number) => Math.round((v * 1440) / 25.4)
const px = (v: number) => Math.round(v * 15) // 1 CSS px = 0.75pt = 15 twips
/** Font size: Word counts half-points. */
const pt = (v: number) => Math.round(v * 2)

const PAGE_W = 11906 // A4
const PAGE_H = 16838
const MARGIN = mm(8)
const TEXT_W = PAGE_W - 2 * MARGIN

const COL_QNO = mm(15)
const COL_CO = mm(12)
const COL_KL = mm(20)
const COL_BODY = TEXT_W - COL_QNO - COL_CO - COL_KL
const COL_MK = mm(16)
const COL_KEY_BODY = TEXT_W - COL_QNO - COL_MK

/** The full-sheet PDF's type sizes (points) — the Word copy prints the same. */
const T = PAPER_TYPE.single

const PAD = px(4)
/** The PDF's absolute `line-height` on every cell of the paper table, as a minimum. */
const ROW_LINE = T.line * 20

const LATIN = 'Times New Roman'
const TAMIL_UNICODE = 'Noto Sans Tamil'
/** On every Windows since 8; used when the Noto file is not on disk to embed. */
const TAMIL_FALLBACK = 'Nirmala UI'
/** TSCII faces: their LATIN codepoints carry Tamil glyphs, so the run must name them. */
const LEGACY_FACES = new Set(['Bamini', 'Suntommy'])
const BASE_FONT = { ascii: LATIN, hAnsi: LATIN, eastAsia: LATIN, cs: TAMIL_UNICODE }

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const NO_BORDERS = {
	top: NO_BORDER,
	bottom: NO_BORDER,
	left: NO_BORDER,
	right: NO_BORDER,
	insideHorizontal: NO_BORDER,
	insideVertical: NO_BORDER,
}
/** Border widths are eighths of a point. */
const rule = (points: number, color = '000000') => ({ style: BorderStyle.SINGLE, size: Math.max(2, Math.round(points * 8)), color })

type Align = 'left' | 'center' | 'right' | 'justify'
const ALIGN = {
	left: AlignmentType.LEFT,
	center: AlignmentType.CENTER,
	right: AlignmentType.RIGHT,
	justify: AlignmentType.JUSTIFIED,
} as const

// ── Build state ──────────────────────────────────────────────────────────────

interface Env {
	/** Tamil faces the paper actually uses — embedded at the end. */
	fonts: Set<string>
	/**
	 * The face Unicode Tamil is set in: Noto Sans Tamil (embedded, the PDF's own
	 * face) when its file is on disk, otherwise Windows' Nirmala UI.
	 */
	tamilFace: string
}

function newEnv(): Env {
	return { fonts: new Set(), tamilFace: readTamilFontFile(TAMIL_UNICODE) ? TAMIL_UNICODE : TAMIL_FALLBACK }
}

interface RunStyle {
	bold?: boolean
	italics?: boolean
	underline?: boolean
	strike?: boolean
	sub?: boolean
	sup?: boolean
	/** A legacy Tamil face chosen for this text, or null for the base serif. */
	font?: string | null
	/** Half-points. */
	size?: number
	color?: string
}

/** Tamil block, plus the joiners that belong to the word they sit in. */
const isTamilChar = (code: number) => (code >= 0x0b80 && code <= 0x0bff) || code === 0x200c || code === 0x200d

/** "2004ஆம் ஆண்டு" → ["2004", "ஆம்", " ", "ஆண்டு"]: stretches of Tamil and of everything else. */
function splitTamil(text: string): Array<{ text: string; tamil: boolean }> {
	const parts: Array<{ text: string; tamil: boolean }> = []
	for (const ch of text) {
		const tamil = isTamilChar(ch.codePointAt(0) || 0)
		const last = parts[parts.length - 1]
		if (last && last.tamil === tamil) last.text += ch
		else parts.push({ text: ch, tamil })
	}
	return parts
}

const allSlots = (face: string) => ({ ascii: face, hAnsi: face, cs: face, eastAsia: face })

/**
 * Text as Word runs. Unicode Tamil goes into runs of its own that name the
 * Tamil face on EVERY font slot: Word does not reach for the complex-script
 * slot on its own here, and set the text in Times — which has no Tamil — as a
 * row of empty boxes. Everything else stays in the base serif, exactly as the
 * PDF's unicode-range rule arranges it.
 */
function runs(text: string, st: RunStyle, env: Env): TextRun[] {
	const legacy = st.font && LEGACY_FACES.has(st.font) ? st.font : null
	if (legacy) env.fonts.add(legacy)
	return splitTamil(text).map(part => {
		if (part.tamil && env.tamilFace === TAMIL_UNICODE) env.fonts.add(TAMIL_UNICODE)
		const face = part.tamil ? env.tamilFace : legacy
		return new TextRun({
			text: part.text,
			bold: st.bold,
			italics: st.italics,
			underline: st.underline ? {} : undefined,
			strike: st.strike,
			subScript: st.sub,
			superScript: st.sup,
			size: st.size,
			color: st.color,
			font: face ? allSlots(face) : undefined,
		})
	})
}

/** One formula as a native Word equation; its LaTeX in italics if it cannot be typeset. */
function mathInline(latex: string, st: RunStyle, env: Env): any[] {
	const omml = latexToOmml(latex)
	if (omml) {
		try {
			const imported: any = ImportedXmlComponent.fromXmlString(omml)
			const math = imported?.root?.[0]
			if (math) return [math]
		} catch (e) {
			console.warn('[QP DOCX] equation import failed:', (e as Error)?.message)
		}
	}
	return runs(latex, { ...st, italics: true, font: null }, env)
}

// ── Sanitized HTML → blocks ──────────────────────────────────────────────────

interface PBlock {
	kind: 'p'
	children: any[]
	/** An alignment the setter chose explicitly; wins over the cell's default. */
	align?: Align
	indent?: number
	hanging?: number
	before?: number
	after?: number
	/** What the line being written holds so far — see sealLine(). */
	lineText?: boolean
	lineMath?: boolean
}

interface TBlock {
	kind: 't'
	table: Table
}

type Block = PBlock | TBlock

function alignOf(el: MarkupElement): Align | undefined {
	const m = /text-align\s*:\s*(left|right|center|justify)/i.exec(el.attrs.style || '')
	return m ? (m[1].toLowerCase() as Align) : undefined
}

function fontOf(el: MarkupElement): string | null {
	const m = /font-family\s*:\s*([^;]+)/i.exec(el.attrs.style || '')
	return m ? canonicalizeFontFamily(m[1]) : null
}

const LIST_INDENT = mm(6)
const LIST_HANG = mm(4.5)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

/**
 * Close the line being written. An equation ALONE on a line — a whole
 * paragraph, or the stretch after a line break — is a display equation to
 * Word: centred, enlarged, and outside the paragraph's alignment and its
 * answer-key frame. The PDF sets every formula inline, so a zero-width space is
 * put beside a lone equation and Word keeps it inline too.
 */
function sealLine(p: PBlock): void {
	if (p.lineMath && !p.lineText) p.children.push(new TextRun(ZERO_WIDTH_SPACE))
	p.lineMath = false
	p.lineText = false
}

/**
 * Sanitized question HTML → paragraphs and tables. `avail` is the width of the
 * column the content sits in (twips), which an author-drawn table needs to
 * size its own columns.
 */
function nodesToBlocks(nodes: MarkupNode[], base: RunStyle, env: Env, avail: number): Block[] {
	const out: Block[] = []
	let cur: PBlock | null = null
	const open = (align?: Align): PBlock => {
		if (!cur) cur = { kind: 'p', children: [], align }
		return cur
	}
	const flush = () => {
		const p = cur as PBlock | null
		if (p && p.children.length > 0) {
			sealLine(p)
			out.push(p)
		}
		cur = null
	}

	const walk = (list: MarkupNode[], st: RunStyle) => {
		for (const n of list) {
			if (n.type === 'text') {
				// HTML whitespace: runs collapse, and a paragraph does not open on a space.
				let text = n.text.replace(/[ \t\r\n\f]+/g, ' ')
				if (!cur || (cur as PBlock).children.length === 0) text = text.replace(/^ /, '')
				if (text) {
					const p = open()
					p.children.push(...runs(text, st, env))
					if (text.trim()) p.lineText = true
				}
				continue
			}
			switch (n.tag) {
				case 'br': {
					const p = open()
					sealLine(p)
					p.children.push(new TextRun({ break: 1 }))
					break
				}
				case 'p':
				case 'div':
				case 'li':
					flush()
					open(alignOf(n))
					walk(n.children, st)
					flush()
					break
				case 'ul':
				case 'ol': {
					flush()
					let index = 0
					for (const li of n.children) {
						if (li.type !== 'el' || li.tag !== 'li') continue
						index++
						const marker = n.tag === 'ol' ? `${index}. ` : '• '
						let first = true
						for (const b of nodesToBlocks(li.children, st, env, avail - LIST_INDENT)) {
							if (b.kind === 'p') {
								b.indent = (b.indent || 0) + LIST_INDENT
								if (first) {
									b.children.unshift(...runs(marker, st, env))
									b.hanging = LIST_HANG
									first = false
								}
							}
							out.push(b)
						}
					}
					break
				}
				case 'table': {
					flush()
					const table = innerTable(n, st, env, avail)
					if (table) out.push({ kind: 't', table })
					break
				}
				case 'strong':
				case 'b':
					walk(n.children, { ...st, bold: true })
					break
				case 'em':
				case 'i':
					walk(n.children, { ...st, italics: true })
					break
				case 'u':
					walk(n.children, { ...st, underline: true })
					break
				case 's':
					walk(n.children, { ...st, strike: true })
					break
				case 'sub':
					walk(n.children, { ...st, sub: true, sup: false })
					break
				case 'sup':
					walk(n.children, { ...st, sup: true, sub: false })
					break
				case 'span': {
					if (Object.prototype.hasOwnProperty.call(n.attrs, 'data-latex')) {
						const p = open()
						p.children.push(...mathInline(n.attrs['data-latex'], st, env))
						p.lineMath = true
						break
					}
					const face = fontOf(n)
					walk(n.children, face ? { ...st, font: face } : st)
					break
				}
				default:
					walk(n.children, st)
			}
		}
	}

	walk(nodes, base)
	flush()
	return out
}

const htmlToBlocks = (rawHtml: string, base: RunStyle, env: Env, avail: number): Block[] =>
	nodesToBlocks(parseMarkup(prepareQuestionHtml(rawHtml || '')), base, env, avail)

// ── Author-drawn tables ──────────────────────────────────────────────────────
// A table inside a question carries no widths: the browser sizes its columns to
// their content. Word will not do that for a table nested in a fixed-layout cell
// — left without widths it gave every column the 5pt default and set the text
// one letter per line. So each column is given the width its content asks for,
// estimated from the text, and the set is scaled down when it would overflow.

/** Average advance of a 12pt Times character, with a little slack. */
const CHAR_TWIPS = 136
const INNER_PAD = px(4)
const MIN_COLUMN = mm(6)
/** A cell of running prose asks for no more than this many characters a line. */
const MAX_LINE_CHARS = 46

function tableRowsOf(el: MarkupElement): MarkupElement[] {
	const trs: MarkupElement[] = []
	const collect = (nodes: MarkupNode[]) => {
		for (const n of nodes) {
			if (n.type !== 'el') continue
			if (n.tag === 'tr') trs.push(n)
			else if (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') collect(n.children)
		}
	}
	collect(el.children)
	return trs
}

const cellsOf = (tr: MarkupElement): MarkupElement[] =>
	tr.children.filter((c): c is MarkupElement => c.type === 'el' && (c.tag === 'td' || c.tag === 'th'))

const spanOf = (v: string | undefined): number => {
	const n = Number(v)
	return Number.isInteger(n) && n > 1 ? n : 1
}

/** The width a cell would like: its longest line of text, or the table it wraps. */
function naturalCellWidth(cell: MarkupElement): number {
	let nested = 0
	let longest = 0
	let line = 0
	const endLine = () => {
		longest = Math.max(longest, line)
		line = 0
	}
	const visit = (nodes: MarkupNode[]) => {
		for (const n of nodes) {
			if (n.type === 'text') {
				line += n.text.replace(/\s+/g, ' ').length
				continue
			}
			if (n.tag === 'table') {
				endLine()
				nested = Math.max(nested, naturalColumns(n).reduce((a, b) => a + b, 0))
				continue
			}
			if (n.tag === 'br') {
				endLine()
				continue
			}
			if (Object.prototype.hasOwnProperty.call(n.attrs, 'data-latex')) {
				// LaTeX source is longer than what it prints (\frac, braces, carets).
				line += Math.ceil(String(n.attrs['data-latex']).length * 0.6)
				continue
			}
			const isBlock = n.tag === 'p' || n.tag === 'li' || n.tag === 'div'
			if (isBlock) endLine()
			visit(n.children)
			if (isBlock) endLine()
		}
	}
	visit(cell.children)
	endLine()
	return Math.max(nested, Math.min(longest, MAX_LINE_CHARS) * CHAR_TWIPS) + 2 * INNER_PAD
}

function naturalColumns(el: MarkupElement): number[] {
	const widths: number[] = []
	for (const tr of tableRowsOf(el)) {
		let col = 0
		for (const c of cellsOf(tr)) {
			const span = spanOf(c.attrs.colspan)
			for (let i = col; i < col + span; i++) if (widths[i] === undefined) widths[i] = MIN_COLUMN
			if (span === 1) widths[col] = Math.max(widths[col], naturalCellWidth(c))
			col += span
		}
	}
	return widths
}

/**
 * An author-drawn table inside a question. Borderless and tight, exactly as the
 * PDF prints it (`.qbody table`), no wider than the column it sits in.
 */
function innerTable(el: MarkupElement, st: RunStyle, env: Env, avail: number): Table | null {
	const natural = naturalColumns(el)
	const total = natural.reduce((a, b) => a + b, 0)
	if (natural.length === 0 || total <= 0) return null
	const scale = total > avail ? avail / total : 1
	const widths = natural.map(w => Math.max(MIN_COLUMN, Math.floor(w * scale)))

	const rows: TableRow[] = []
	for (const tr of tableRowsOf(el)) {
		const cells = cellsOf(tr)
		if (cells.length === 0) continue
		let col = 0
		const built = cells.map(c => {
			const span = spanOf(c.attrs.colspan)
			const width = widths.slice(col, col + span).reduce((a, b) => a + b, 0) || MIN_COLUMN
			col += span
			const blocks = nodesToBlocks(c.children, c.tag === 'th' ? { ...st, bold: true } : st, env, width - 2 * INNER_PAD)
			return { c, span, width, blocks }
		})
		rows.push(
			new TableRow({
				// A row is kept whole — unless it wraps another table (a Word paste
				// often arrives as a one-column shell around the real grid), which
				// must be free to run on to the next page.
				cantSplit: !built.some(b => b.blocks.some(block => block.kind === 't')),
				children: built.map(
					({ c, span, width, blocks }) =>
						new TableCell({
							children: endWithParagraph(materialize(blocks, { align: 'left', line: 324, lineRule: 'auto', gap: 0 })),
							width: { size: width, type: WidthType.DXA },
							columnSpan: span > 1 ? span : undefined,
							rowSpan: spanOf(c.attrs.rowspan) > 1 ? spanOf(c.attrs.rowspan) : undefined,
							margins: { marginUnitType: WidthType.DXA, top: px(1), bottom: px(1), left: INNER_PAD, right: INNER_PAD },
						})
				),
			})
		)
	}
	if (rows.length === 0) return null
	return new Table({
		rows,
		borders: NO_BORDERS,
		layout: TableLayoutType.AUTOFIT,
		columnWidths: widths,
		width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
	})
}

// ── Blocks → Word paragraphs ─────────────────────────────────────────────────

interface ParaStyle {
	align: Align
	/** Line height in twips, and how Word should treat it. */
	line?: number
	lineRule?: 'atLeast' | 'auto'
	/** Space between consecutive paragraphs (`.qbody p { margin: 0 0 2px }`). */
	gap?: number
	/** Space before the first paragraph. */
	before?: number
	indent?: number
	keepNext?: boolean
	/** Tinted, left-ruled frame of an answer-key block. */
	frame?: { fill?: string; color: string }
}

/** A near-zero-height paragraph: Word needs one between two tables and to close a cell. */
const sliver = () =>
	new Paragraph({
		spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
		children: [new TextRun({ text: '', size: 2 })],
	})

function materialize(blocks: Block[], ps: ParaStyle): Array<Paragraph | Table> {
	const out: Array<Paragraph | Table> = []
	blocks.forEach((b, i) => {
		if (b.kind === 't') {
			if (out[out.length - 1] instanceof Table) out.push(sliver())
			out.push(b.table)
			return
		}
		const isFirst = i === 0
		const isLast = i === blocks.length - 1
		out.push(
			new Paragraph({
				alignment: ALIGN[b.align || ps.align],
				spacing: {
					before: b.before ?? (isFirst ? ps.before ?? 0 : 0),
					after: b.after ?? (isLast ? 0 : ps.gap ?? 0),
					...(ps.line
						? { line: ps.line, lineRule: ps.lineRule === 'auto' ? LineRuleType.AUTO : LineRuleType.AT_LEAST }
						: {}),
				},
				indent:
					ps.indent || b.indent
						? { left: (ps.indent || 0) + (b.indent || 0), hanging: b.hanging }
						: undefined,
				keepNext: ps.keepNext,
				...(ps.frame
					? {
							shading: ps.frame.fill ? { type: ShadingType.CLEAR, fill: ps.frame.fill, color: 'auto' } : undefined,
							border: { left: { style: BorderStyle.SINGLE, size: 16, color: ps.frame.color, space: 4 } },
						}
					: {}),
				children: b.children,
			})
		)
	})
	return out
}

/** A table cell must end with a paragraph, and may not be empty. */
function endWithParagraph(children: Array<Paragraph | Table>): Array<Paragraph | Table> {
	if (children.length === 0) return [new Paragraph({ children: [] })]
	return children[children.length - 1] instanceof Table ? [...children, sliver()] : children
}

/** `display: inline` on a sub-division's paragraphs: they read as ONE run of text. */
function inlineParagraphs(blocks: Block[], st: RunStyle, env: Env): Block[] {
	const out: Block[] = []
	for (const b of blocks) {
		const prev = out[out.length - 1]
		if (b.kind === 'p' && prev?.kind === 'p' && !b.hanging && !prev.hanging) {
			prev.children.push(...runs(' ', st, env), ...b.children)
		} else {
			out.push(b)
		}
	}
	return out
}

function firstParagraph(blocks: Block[]): PBlock {
	const first = blocks[0]
	if (first?.kind === 'p') return first
	const made: PBlock = { kind: 'p', children: [] }
	blocks.unshift(made)
	return made
}

function lastParagraph(blocks: Block[]): PBlock {
	const last = blocks[blocks.length - 1]
	if (last?.kind === 'p') return last
	const made: PBlock = { kind: 'p', children: [] }
	blocks.push(made)
	return made
}

// ── Figures ──────────────────────────────────────────────────────────────────

interface Bitmap {
	data: Buffer
	type: 'png' | 'jpg' | 'gif' | 'bmp'
	width: number
	height: number
}

/** Type and pixel size from the file's own header. */
function sniff(buf: Buffer): Omit<Bitmap, 'data'> | null {
	if (buf.length < 26) return null
	if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
		return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
	}
	if (buf.toString('latin1', 0, 3) === 'GIF') {
		return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
	}
	if (buf.toString('latin1', 0, 2) === 'BM') {
		return { type: 'bmp', width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) }
	}
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) {
				i++
				continue
			}
			const marker = buf[i + 1]
			if (marker === 0xff) {
				i++
				continue
			}
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2
				continue
			}
			// Start-of-frame carries the size; C4 / C8 / CC are tables, not frames.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { type: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
			}
			i += 2 + buf.readUInt16BE(i + 2)
		}
	}
	return null
}

/** Word cannot place WebP; anything it cannot read natively is re-encoded as PNG. */
async function toBitmap(buf: Buffer): Promise<Bitmap | null> {
	const known = sniff(buf)
	if (known && known.width > 0 && known.height > 0) return { data: buf, ...known }
	try {
		const sharp = (await import('sharp')).default
		const png = await sharp(buf).png().toBuffer()
		const meta = sniff(png)
		return meta && meta.width > 0 && meta.height > 0 ? { data: png, ...meta } : null
	} catch (e) {
		console.warn('[QP DOCX] figure could not be converted for Word:', (e as Error)?.message)
		return null
	}
}

function dataUriBytes(uri: string): Buffer | null {
	const m = /^data:[^;,]+;base64,(.+)$/i.exec(uri)
	return m ? Buffer.from(m[1], 'base64') : null
}

async function figureBytes(image: any): Promise<Buffer | null> {
	// A Drive-backed figure was already fetched onto inline_src by loadPaperContext.
	if (typeof image?.inline_src === 'string') {
		const inline = dataUriBytes(image.inline_src)
		if (inline) return inline
	}
	const ref = readQuestionImage(image)
	if (!ref || !/^https?:\/\//i.test(ref.url)) return null
	try {
		const res = await fetch(ref.url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
		return res.ok ? Buffer.from(await res.arrayBuffer()) : null
	} catch {
		return null
	}
}

/**
 * The figure attached to a question, centred at the author's chosen share of
 * the text column and never taller than 85mm — the PDF's `.q-img` rule.
 */
async function figureBlock(image: any, columnTwips: number, env: Env): Promise<PBlock | null> {
	const ref = readQuestionImage(image)
	if (!ref) return null
	const bytes = await figureBytes(image)
	const bmp = bytes ? await toBitmap(bytes) : null
	if (!bmp) {
		return {
			kind: 'p',
			align: 'center',
			before: px(3),
			after: px(3),
			children: [...runs('[Figure — see the PDF copy of this paper]', { italics: true, color: '777777' }, env)],
		}
	}
	const share = Math.min(100, Math.max(10, Number(ref.width_pct) || 60)) / 100
	const columnPx = (columnTwips - 2 * PAD) / 15
	let width = columnPx * share
	let height = (width * bmp.height) / bmp.width
	const maxHeight = (85 / 25.4) * 96
	if (height > maxHeight) {
		width = (width * maxHeight) / height
		height = maxHeight
	}
	return {
		kind: 'p',
		align: 'center',
		before: px(3),
		after: px(3),
		children: [
			new ImageRun({
				type: bmp.type,
				data: bmp.data,
				transformation: { width: Math.round(width), height: Math.round(height) },
			}),
		],
	}
}

// ── Pieces of a question ─────────────────────────────────────────────────────

/** The run of text inside a block list, for content that must stay on one line. */
function inlineChildren(blocks: Block[], st: RunStyle, env: Env): any[] {
	const out: any[] = []
	for (const b of blocks) {
		if (b.kind !== 'p') continue
		if (out.length > 0) out.push(...runs(' ', st, env))
		out.push(...b.children)
	}
	return out
}

/** MCQ options on one line: "a) …   b) …   c) …   d) …". */
function optionsBlock(opts: any, optionFont: string | null | undefined, env: Env, avail: number): PBlock | null {
	if (!Array.isArray(opts) || opts.length === 0) return null
	const st: RunStyle = { font: optionFont ? canonicalizeFontFamily(optionFont) : null }
	const children: any[] = []
	opts.forEach((o: any, i: number) => {
		if (i > 0) children.push(...runs('    ', {}, env))
		children.push(...runs(`${String(o?.key ?? '')}) `, st, env))
		const rich = typeof o?.text_html === 'string' ? o.text_html.trim() : ''
		const plain = String(o?.text ?? '').trim()
		if (rich) children.push(...inlineChildren(htmlToBlocks(rich, st, env, avail), st, env))
		else children.push(...runs(plain || '____', st, env))
	})
	return { kind: 'p', align: 'left', before: px(2), children }
}

/** Stem, then its figure, then its options — the order the PDF prints them. */
async function stemBlocks(q: any, defaultFont: string | null, columnTwips: number, env: Env): Promise<Block[]> {
	const st: RunStyle = { font: defaultFont }
	const avail = columnTwips - 2 * PAD
	const blocks = htmlToBlocks(q?.question_text || '', st, env, avail)
	const figure = await figureBlock(q?.image, columnTwips, env)
	if (figure) blocks.push(figure)
	const options = optionsBlock(q?.options, q?.option_font ?? defaultFont, env, avail)
	if (options) blocks.push(options)
	return blocks
}

/** "i. <text> (8)" with its figure beneath, as one sub-division. */
async function subBlocks(sb: any, defaultFont: string | null, columnTwips: number, env: Env): Promise<Block[]> {
	const st: RunStyle = { font: defaultFont }
	const blocks = inlineParagraphs(htmlToBlocks(sb?.question_text || '', st, env, columnTwips - 2 * PAD), st, env)
	const lead = firstParagraph(blocks)
	lead.children.unshift(...runs(`${sb.label}. `, { bold: true }, env))
	if (sb.marks != null) lastParagraph(blocks).children.push(...runs(` (${sb.marks})`, { bold: true }, env))
	const figure = await figureBlock(sb?.image, columnTwips, env)
	if (figure) blocks.push(figure)
	return blocks
}

// ── Cells and plain paragraphs ───────────────────────────────────────────────

interface CellOpts {
	width: number
	span?: number
	valign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable]
	margins?: { top?: number; bottom?: number; left?: number; right?: number }
	borders?: Record<string, any>
}

function cell(children: Array<Paragraph | Table>, o: CellOpts): TableCell {
	return new TableCell({
		children: endWithParagraph(children),
		width: { size: o.width, type: WidthType.DXA },
		columnSpan: o.span,
		verticalAlign: o.valign ?? VerticalAlignTable.TOP,
		margins: { marginUnitType: WidthType.DXA, top: PAD, bottom: PAD, left: PAD, right: PAD, ...o.margins },
		borders: o.borders,
	})
}

interface TextOpts {
	bold?: boolean
	italics?: boolean
	underline?: boolean
	/** Points. */
	size?: number
	color?: string
	align?: Align
	before?: number
	after?: number
	keepNext?: boolean
	/** Set on text inside the paper table, so every cell opens on the same line. */
	rowLine?: boolean
}

function textPara(text: string, o: TextOpts, env: Env): Paragraph {
	return new Paragraph({
		alignment: ALIGN[o.align || 'left'],
		keepNext: o.keepNext,
		spacing: {
			before: o.before ?? 0,
			after: o.after ?? 0,
			...(o.rowLine ? { line: ROW_LINE, lineRule: LineRuleType.AT_LEAST } : {}),
		},
		children: runs(
			text,
			{ bold: o.bold, italics: o.italics, underline: o.underline, size: o.size ? pt(o.size) : undefined, color: o.color },
			env
		),
	})
}

/** "left ……… right" on one line: a right tab stop at the text edge. */
function splitLine(left: string, right: string, env: Env, o: { before?: number; size?: number; color?: string } = {}): Paragraph {
	const st: RunStyle = { size: o.size ? pt(o.size) : undefined, color: o.color }
	return new Paragraph({
		tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
		spacing: { before: o.before ?? 0, after: 0 },
		children: [
			...runs(left, st, env),
			...(right ? [new TextRun({ children: [new Tab()] }), ...runs(right, st, env)] : []),
		],
	})
}

// ── Letterhead and headings ──────────────────────────────────────────────────

/** Colour and size of each line of the boxed letterhead — the PDF's .lh-* rules. */
const LETTERHEAD_LINE: Record<string, TextOpts> = {
	'lh-name': { bold: true, size: 13.5, color: '1A7A3C' },
	'lh-trust': { bold: true, size: 9.5, color: 'E6007E' },
	'lh-approve': { bold: true, size: 8.5 },
	'lh-naac': { bold: true, size: 8.5, color: 'E6007E' },
	'lh-addr': { bold: true, size: 8.5 },
	'lh-web': { size: 8, color: '1A4FD6', underline: true },
}

async function letterheadBlocks(ctx: PaperContext, env: Env): Promise<Array<Paragraph | Table>> {
	const { letterhead, logoDataUri, institutionName, address } = ctx
	const boxed = letterhead?.style === 'boxed' && (letterhead?.lines?.length || 0) > 0
	if (!boxed) {
		return [
			textPara(institutionName.toUpperCase(), { bold: true, size: T.name, align: 'center' }, env),
			...(address ? [textPara(address, { size: T.addr, align: 'center', before: px(2) }, env)] : []),
		]
	}

	const lines = letterhead!.lines!.map(l =>
		textPara(l.text, { align: 'center', ...(LETTERHEAD_LINE[l.cls] || {}) }, env)
	)
	const frame = rule(0.8)
	const cellMargins = { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(2) }

	const logoBytes = logoDataUri ? dataUriBytes(logoDataUri) : null
	const logo = logoBytes ? await toBitmap(logoBytes) : null
	if (!logo) {
		return [
			new Table({
				width: { size: TEXT_W, type: WidthType.DXA },
				columnWidths: [TEXT_W],
				layout: TableLayoutType.FIXED,
				borders: { ...NO_BORDERS, top: frame, bottom: frame, left: frame, right: frame },
				rows: [new TableRow({ children: [cell(lines, { width: TEXT_W, margins: cellMargins, valign: VerticalAlignTable.CENTER })] })],
			}),
		]
	}

	// Logo 16mm tall at the left, its width following the artwork's own proportions.
	const logoH = (16 / 25.4) * 96
	const logoW = (logoH * logo.width) / logo.height
	const logoCol = Math.round(logoW * 15) + mm(2) + mm(3)
	return [
		new Table({
			width: { size: TEXT_W, type: WidthType.DXA },
			columnWidths: [logoCol, TEXT_W - logoCol],
			layout: TableLayoutType.FIXED,
			borders: { ...NO_BORDERS, top: frame, bottom: frame, left: frame, right: frame },
			rows: [
				new TableRow({
					children: [
						cell(
							[
								new Paragraph({
									alignment: AlignmentType.CENTER,
									children: [
										new ImageRun({
											type: logo.type,
											data: logo.data,
											transformation: { width: Math.round(logoW), height: Math.round(logoH) },
										}),
									],
								}),
							],
							{ width: logoCol, margins: { ...cellMargins, right: 0 }, valign: VerticalAlignTable.CENTER }
						),
						cell(lines, { width: TEXT_W - logoCol, margins: cellMargins, valign: VerticalAlignTable.CENTER }),
					],
				}),
			],
		}),
	]
}

/** "Register Number" with its row of empty digit boxes, right-aligned above the letterhead. */
function registerGrid(cells: number, env: Env): Array<Paragraph | Table> {
	if (cells <= 0) return []
	const box = mm(6.5)
	const label = mm(34)
	const line = rule(0.7)
	return [
		new Table({
			alignment: AlignmentType.RIGHT,
			width: { size: label + box * cells, type: WidthType.DXA },
			columnWidths: [label, ...Array.from({ length: cells }, () => box)],
			layout: TableLayoutType.FIXED,
			borders: NO_BORDERS,
			rows: [
				new TableRow({
					height: { value: box, rule: HeightRule.EXACT },
					children: [
						cell([textPara('Register Number', { bold: true, size: T.register, align: 'right' }, env)], {
							width: label,
							valign: VerticalAlignTable.CENTER,
							margins: { top: 0, bottom: 0, left: 0, right: mm(3) },
						}),
						...Array.from({ length: cells }, () =>
							cell([new Paragraph({ children: [] })], {
								width: box,
								margins: { top: 0, bottom: 0, left: 0, right: 0 },
								borders: { top: line, bottom: line, left: line, right: line },
							})
						),
					],
				}),
			],
		}),
		// Two tables in a row would fuse into one; this also gives the 2mm gap.
		new Paragraph({ spacing: { before: 0, after: 0, line: mm(2), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] }),
	]
}

function examHeadings(ctx: PaperContext, env: Env): Paragraph[] {
	const boxed = ctx.letterhead?.style === 'boxed' && (ctx.letterhead?.lines?.length || 0) > 0
	return [
		textPara(ctx.examHeading, { bold: true, size: T.exam, align: 'center', before: boxed ? mm(3) : px(4) }, env),
		textPara(ctx.examLine, { bold: true, size: T.sub, align: 'center', before: px(2) }, env),
		...(ctx.semesterText ? [textPara(ctx.semesterText, { bold: true, size: T.sub, align: 'center', before: px(2) }, env)] : []),
	]
}

function partHeading(label: string, qs: any[], part: any): { heading: string; marksEach: any } {
	const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
	const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
	// "Answer any N": only num_to_answer questions count toward marks.
	const answerCount = Number(part?.num_to_answer) > 0 ? Number(part.num_to_answer) : Number(count)
	const total = Number(marksEach) * answerCount
	return { heading: `PART ${label} – (${answerCount} x ${marksEach} = ${total})`, marksEach }
}

const questionPrefix = (q: any) => (q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`)

// ── Document shell ───────────────────────────────────────────────────────────

async function pack(
	ctx: PaperContext,
	env: Env,
	children: Array<Paragraph | Table>,
	o: { title: string; bottomMargin: number; footer?: Footer }
): Promise<Buffer> {
	const fonts = [...env.fonts]
		.map(name => ({ name, data: readTamilFontFile(name) }))
		.filter((f): f is { name: string; data: Buffer } => !!f.data)
	if (fonts.length < env.fonts.size) {
		console.warn('[QP DOCX] Tamil face(s) not found on disk, not embedded:', [...env.fonts].filter(n => !fonts.some(f => f.name === n)).join(', '))
	}

	const doc = new Document({
		creator: 'JKKN COE',
		title: o.title,
		description: `${ctx.paper?.course_code || ''} ${ctx.paper?.subject_title || ''}`.trim(),
		...(fonts.length > 0 ? { fonts } : {}),
		// A justified line that ends in a manual line break must not be stretched
		// across the column — Word does that by default.
		compatibility: { doNotExpandShiftReturn: true },
		styles: {
			default: {
				document: {
					run: { font: BASE_FONT, size: pt(T.body) },
					paragraph: { spacing: { before: 0, after: 0 } },
				},
			},
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: PAGE_W, height: PAGE_H },
						margin: { top: MARGIN, right: MARGIN, bottom: o.bottomMargin, left: MARGIN, header: mm(4), footer: mm(5), gutter: 0 },
					},
				},
				...(o.footer ? { footers: { default: o.footer } } : {}),
				children,
			},
		],
	})
	return Buffer.from(await Packer.toBuffer(doc))
}

// ── Question paper ───────────────────────────────────────────────────────────

/**
 * The question paper as a Word document. Null when the paper isn't found.
 * `hideSet` keeps the set out of the file name (examiner portal).
 */
export async function buildPaperDocx(
	supabase: any,
	id: string,
	source: PaperSource = 'ia',
	hideSet = false
): Promise<BuildPaperDocxResult | null> {
	const ctx = await loadPaperContext(supabase, id, source)
	if (!ctx) return null
	const { paper, grouped, partByLabel, defaultFont } = ctx
	const env = newEnv()

	const small = { bold: true, size: T.small, align: 'center' as Align, rowLine: true }
	const rows: TableRow[] = []
	let partIndex = 0
	for (const [label, qs] of grouped.entries()) {
		const part = partByLabel.get(label)
		const { heading } = partHeading(label, qs, part)
		const headMargins = { top: partIndex === 0 ? px(2) : px(16), bottom: px(4) }
		rows.push(
			new TableRow({
				cantSplit: true,
				children: [
					cell(
						[
							textPara(heading, { bold: true, align: 'center', keepNext: true, rowLine: true }, env),
							...(part?.instruction
								? [textPara(String(part.instruction), { bold: true, size: T.small, align: 'center', before: px(2), keepNext: true, rowLine: true }, env)]
								: []),
						],
						{ width: COL_QNO + COL_BODY, span: 2, margins: headMargins }
					),
					cell([textPara('CO', { ...small, keepNext: true }, env)], { width: COL_CO, margins: headMargins }),
					cell([textPara('K-Level(s)', { ...small, keepNext: true }, env)], { width: COL_KL, margins: { ...headMargins, left: 0, right: 0 } }),
				],
			})
		)
		partIndex++

		for (const q of qs) {
			// One question = its (OR) marker, its stem and every sub-division. All
			// but the last row are chained to the next so the group stays on a page.
			const group: Array<(keep: boolean) => TableRow> = []
			if (q.is_choice_alternative) {
				group.push(
					keep =>
						new TableRow({
							cantSplit: true,
							children: [
								cell([textPara('(OR)', { bold: true, align: 'center', keepNext: keep, rowLine: true }, env)], {
									width: TEXT_W,
									span: 4,
									margins: { top: px(6), bottom: px(3) },
								}),
							],
						})
				)
			}

			const prefix = questionPrefix(q)
			const body = await stemBlocks(q, defaultFont, COL_BODY, env)
			const bodyRow = (qno: string, blocks: Block[], co: string, kl: string, indent?: number) => (keep: boolean) =>
				new TableRow({
					cantSplit: true,
					children: [
						cell([textPara(qno, { bold: true, keepNext: keep, rowLine: true }, env)], { width: COL_QNO }),
						cell(materialize(blocks, { align: 'justify', line: ROW_LINE, gap: px(2), indent, keepNext: keep }), { width: COL_BODY }),
						cell([textPara(co, { ...small, keepNext: keep }, env)], { width: COL_CO }),
						cell([textPara(kl, { ...small, keepNext: keep }, env)], { width: COL_KL }),
					],
				})

			const subs = readSubQuestionsForPrint(q)
			if (subs.length > 0) {
				// Marks and CO / K move to the sub-divisions; with no stem the question
				// number rides the first sub-division's row, as on a printed paper.
				const hasStem = String(q.question_text || '').replace(/<[^>]*>/g, '').trim() !== ''
				if (hasStem) group.push(bodyRow(prefix, body, '', ''))
				for (let i = 0; i < subs.length; i++) {
					const sb = subs[i]
					const blocks = await subBlocks(sb, defaultFont, COL_BODY - mm(5), env)
					group.push(bodyRow(!hasStem && i === 0 ? prefix : '', blocks, sb.co_code || '', sb.k_level || '', mm(5)))
				}
			} else {
				group.push(bodyRow(prefix, body, q.co_code || '', q.k_level || ''))
			}
			group.forEach((make, i) => rows.push(make(i < group.length - 1)))
		}
	}

	const children: Array<Paragraph | Table> = [
		...registerGrid(Number(ctx.letterhead?.registerCells) || 0, env),
		...(await letterheadBlocks(ctx, env)),
		...examHeadings(ctx, env),
		textPara(`Subject Code: ${paper.course_code || ''}`, { before: px(6) }, env),
		textPara(`Subject Title: ${paper.subject_title || ''}`, { bold: true }, env),
		splitLine(`Time: ${formatDuration(paper.duration_minutes)}`, `Maximum: ${Number(paper.max_marks) || 0} Marks`, env),
		new Paragraph({ spacing: { before: 0, after: 0, line: px(10), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] }),
	]
	if (rows.length > 0) {
		children.push(
			new Table({
				width: { size: TEXT_W, type: WidthType.DXA },
				columnWidths: [COL_QNO, COL_BODY, COL_CO, COL_KL],
				layout: TableLayoutType.FIXED,
				borders: NO_BORDERS,
				rows,
			}),
			// Word closes a document that ends in a table with an empty paragraph of
			// its own, a full line tall — on a paper that fills its sheet that line
			// alone tips over into a blank extra page. A sliver takes its place.
			sliver()
		)
	}

	const buffer = await pack(ctx, env, children, {
		title: `Question Paper – ${paper.course_code || ''}`,
		bottomMargin: MARGIN,
	})
	return { buffer, filename: paperPdfFilename(paper, { hideSet, ext: 'docx' }) }
}

// ── Answer key / scheme of valuation ─────────────────────────────────────────

const KEY_INDENT = px(8)

/** The tinted, left-ruled key block under a question (or one of its sub-divisions). */
function keyBlock(label: string, body: Block[], o: { missing: boolean; indent?: number }, env: Env): Array<Paragraph | Table> {
	const frame = o.missing ? { color: 'BB0000' } : { fill: 'F4F6F8', color: '333333' }
	const indent = (o.indent || 0) + KEY_INDENT
	const head: PBlock = {
		kind: 'p',
		align: 'left',
		before: px(4),
		children: [...runs(label.toUpperCase(), { bold: true, size: pt(T.small - 0.5), color: '333333' }, env)],
	}
	const content: Block[] = o.missing
		? [{ kind: 'p', align: 'left', children: [...runs('Not entered', { italics: true, color: 'BB0000' }, env)] }]
		: body
	return materialize([head, ...content], { align: 'justify', gap: px(2), indent, frame })
}

/** Key under the whole question. Empty when the question is keyed per sub-division. */
async function questionKey(q: any, columnTwips: number, env: Env): Promise<Array<Paragraph | Table>> {
	// An MCQ's key is its correct option; the written key (if any) explains it.
	const correct = String(q?.correct_option || '').trim()
	const hasCorrect = !!correct && Array.isArray(q?.options) && q.options.length > 0
	if (!hasCorrect && !hasOwnAnswerKey(q)) {
		if (readSubQuestions(q).length > 0) return []
		return keyBlock('Answer key', [], { missing: true }, env)
	}
	const body: Block[] = []
	if (hasCorrect) {
		body.push({ kind: 'p', align: 'left', children: [...runs('Correct option: ', {}, env), ...runs(correct, { bold: true }, env)] })
	}
	body.push(...htmlToBlocks(q?.answer_key || '', {}, env, columnTwips - 2 * PAD - KEY_INDENT))
	const figure = await figureBlock(q?.answer_key_image, columnTwips - KEY_INDENT, env)
	if (figure) body.push(figure)
	return keyBlock('Answer key / Scheme of valuation', body, { missing: false }, env)
}

/** Key under one sub-division. Empty when the question is keyed as a whole (older papers). */
async function subKey(q: any, sb: any, columnTwips: number, env: Env): Promise<Array<Paragraph | Table>> {
	if (hasOwnAnswerKey(q)) return []
	const label = `Answer key (${sb.label})`
	if (!hasOwnAnswerKey(sb)) return keyBlock(label, [], { missing: true, indent: mm(5) }, env)
	const body = htmlToBlocks(sb?.answer_key || '', {}, env, columnTwips - 2 * PAD - mm(5) - KEY_INDENT)
	const figure = await figureBlock(sb?.answer_key_image, columnTwips - mm(5) - KEY_INDENT, env)
	if (figure) body.push(figure)
	return keyBlock(label, body, { missing: false, indent: mm(5) }, env)
}

/**
 * The answer key / scheme of valuation as a Word document. Null when the paper
 * isn't found. `hideSet` keeps the set out of the name, heading and footer.
 */
export async function buildAnswerKeyDocx(
	supabase: any,
	id: string,
	source: PaperSource = 'ese',
	hideSet = false
): Promise<BuildPaperDocxResult | null> {
	const ctx = await loadPaperContext(supabase, id, source)
	if (!ctx) return null
	const { paper, grouped, partByLabel, defaultFont } = ctx
	const env = newEnv()

	const rows: TableRow[] = []
	let partIndex = 0
	for (const [label, qs] of grouped.entries()) {
		const part = partByLabel.get(label)
		const { heading, marksEach } = partHeading(label, qs, part)
		const headMargins = { top: partIndex === 0 ? px(4) : px(14), bottom: px(4) }
		const headRule = { bottom: rule(0.9) }
		rows.push(
			new TableRow({
				cantSplit: true,
				children: [
					cell(
						[
							textPara(heading, { bold: true, align: 'center', keepNext: true, rowLine: true }, env),
							...(part?.instruction
								? [textPara(String(part.instruction), { bold: true, size: T.small, align: 'center', before: px(2), keepNext: true, rowLine: true }, env)]
								: []),
						],
						{ width: COL_QNO + COL_KEY_BODY, span: 2, margins: headMargins, borders: headRule }
					),
					cell([textPara('Marks', { bold: true, size: T.small, align: 'center', keepNext: true, rowLine: true }, env)], {
						width: COL_MK,
						margins: headMargins,
						borders: headRule,
					}),
				],
			})
		)
		partIndex++

		for (const q of qs) {
			if (q.is_choice_alternative) {
				rows.push(
					new TableRow({
						cantSplit: true,
						children: [
							cell([textPara('(OR)', { bold: true, align: 'center', keepNext: true, rowLine: true }, env)], {
								width: TEXT_W,
								span: 3,
								margins: { top: px(6), bottom: px(3) },
							}),
						],
					})
				)
			}

			// Stem, then each sub-division with its own marks and its own key (each is
			// valued separately), then the key of the question as a whole.
			const content: Array<Paragraph | Table> = materialize(await stemBlocks(q, defaultFont, COL_KEY_BODY, env), {
				align: 'justify',
				line: ROW_LINE,
				gap: px(2),
			})
			for (const sb of readSubQuestionsForPrint(q)) {
				content.push(
					...materialize(await subBlocks(sb, defaultFont, COL_KEY_BODY - mm(5), env), {
						align: 'justify',
						line: ROW_LINE,
						gap: px(2),
						indent: mm(5),
					}),
					...(await subKey(q, sb, COL_KEY_BODY, env))
				)
			}
			content.push(...(await questionKey(q, COL_KEY_BODY, env)))

			// Every question is ruled off from the next, so a long key never reads
			// into the following question.
			const marks = q.marks ?? marksEach
			const ruled = { bottom: rule(0.5, '888888') }
			rows.push(
				new TableRow({
					children: [
						cell([textPara(questionPrefix(q), { bold: true, rowLine: true }, env)], { width: COL_QNO, borders: ruled }),
						cell(content, { width: COL_KEY_BODY, borders: ruled }),
						cell(
							[textPara(marks == null || marks === '' ? '' : String(marks), { bold: true, size: T.small + 1, align: 'center', rowLine: true }, env)],
							{ width: COL_MK, borders: ruled }
						),
					],
				})
			)
		}
	}

	const allQuestions = [...grouped.values()].flat()
	const keyed = allQuestions.filter(hasAnswerKey).length
	const setLabel = hideSet ? '' : String(paper.set_label || '').trim()
	const band = rule(1.2)

	const children: Array<Paragraph | Table> = [
		...(await letterheadBlocks(ctx, env)),
		...examHeadings(ctx, env),
		// The document's own title: a ruled band so a valuer never mistakes it for the paper.
		new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { before: px(6), after: 0 },
			border: { top: { ...band, space: 2 }, bottom: { ...band, space: 2 } },
			children: [new TextRun({ text: 'ANSWER KEY & SCHEME OF VALUATION', bold: true, size: pt(T.exam + 0.5), characterSpacing: 8 })],
		}),
		textPara('Confidential – for valuation use only. Not to be issued to learners.', { italics: true, size: T.small, align: 'center', before: px(4) }, env),
		splitLine(`Subject Code: ${paper.course_code || ''}`, setLabel ? `Set: ${setLabel}` : '', env, { before: px(6) }),
		textPara(`Subject Title: ${paper.subject_title || ''}`, { bold: true }, env),
		splitLine(`Time: ${formatDuration(paper.duration_minutes)}`, `Maximum: ${Number(paper.max_marks) || 0} Marks`, env),
		new Paragraph({ spacing: { before: 0, after: 0, line: px(8), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] }),
	]
	if (rows.length > 0) {
		children.push(
			new Table({
				width: { size: TEXT_W, type: WidthType.DXA },
				columnWidths: [COL_QNO, COL_KEY_BODY, COL_MK],
				layout: TableLayoutType.FIXED,
				borders: NO_BORDERS,
				rows,
			})
		)
	}

	// Setter's signature at the foot of the last sheet.
	const signW = mm(64)
	children.push(
		new Paragraph({ spacing: { before: mm(14), after: 0 }, keepNext: true, children: [] }),
		new Table({
			width: { size: TEXT_W, type: WidthType.DXA },
			columnWidths: [TEXT_W - signW, signW],
			layout: TableLayoutType.FIXED,
			borders: NO_BORDERS,
			rows: [
				new TableRow({
					cantSplit: true,
					children: [
						cell([textPara(`Answer key entered for ${keyed} of ${allQuestions.length} questions.`, { size: T.small, color: '333333' }, env)], {
							width: TEXT_W - signW,
							valign: VerticalAlignTable.BOTTOM,
							margins: { left: 0 },
						}),
						cell(
							[
								new Paragraph({
									alignment: AlignmentType.CENTER,
									border: { top: { ...rule(0.7), space: 2 } },
									children: [new TextRun({ text: 'Signature of the Question Paper Setter', size: pt(T.small + 1) })],
								}),
							],
							{ width: signW, valign: VerticalAlignTable.BOTTOM, margins: { left: 0, right: 0 } }
						),
					],
				}),
			],
		}),
		// As on the question paper: no full-height closing paragraph after the table.
		sliver()
	)

	const footerLabel = ['Answer Key', paper.course_code, hideSet ? '' : paper.set_label ? `Set ${paper.set_label}` : '']
		.filter(Boolean)
		.join(' – ')
	const footer = new Footer({
		children: [
			new Paragraph({
				tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
				children: [
					new TextRun({ text: footerLabel, size: pt(8), color: '333333' }),
					new TextRun({
						children: [new Tab(), 'Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
						size: pt(8),
						color: '333333',
					}),
				],
			}),
		],
	})

	const buffer = await pack(ctx, env, children, {
		title: `Answer Key – ${paper.course_code || ''}`,
		bottomMargin: mm(14),
		footer,
	})
	return { buffer, filename: paperPdfFilename(paper, { hideSet, prefix: 'AK', ext: 'docx' }) }
}
