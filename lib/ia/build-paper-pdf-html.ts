// Faithful A4 question-paper PDF via headless Chromium (HTML → PDF).
//
// Replaces the jsPDF renderer (build-paper-pdf.ts) so that rich question content
// authored in MyJKKN — inline math (KaTeX), tables, bold/italic/sub/superscript —
// prints EXACTLY as it appears in the editor. Both surfaces share one source of
// truth: sanitized HTML where each formula is a <span data-latex="…">. Here that
// LaTeX is expanded to MathML (Chromium renders it natively — no KaTeX fonts to
// bundle), and the HTML is printed through the same Chromium pattern used by
// lib/pdf/central-valuation-appointment-letter.ts.
//
// Tamil/Bamini/Suntommy: fonts under public/fonts/tamil/ are embedded as base64
// @font-face (see lib/ia/tamil-fonts.ts). Chromium shapes Tamil far more reliably
// than jsPDF ever did.

import katex from 'katex'
import {
	buildLatinSerifFontFaceCss,
	buildTamilFontFaceCss,
	canonicalizeFontFamily,
	listAvailableTamilFonts,
} from '@/lib/ia/tamil-fonts'
// puppeteer-core + @sparticuz/chromium are imported LAZILY inside the Vercel branch
// only — importing them at module top can fail on a local dev machine and take the
// whole route module (→ Next 404) with it. Local dev uses full `puppeteer`.

// Dependency-free HTML sanitizer (allowlist). Deliberately avoids DOMPurify/jsdom,
// which is fragile under Vercel output-file-tracing. Combined with JavaScript being
// disabled on the print page (page.setJavaScriptEnabled(false)), this is safe for
// server-side PDF rendering of our own Tiptap-authored content.
const ALLOWED_TAGS = new Set([
	'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
	'ul', 'ol', 'li', 'span',
	'table', 'thead', 'tbody', 'tr', 'td', 'th',
])
const ALLOWED_ATTR = new Set(['data-latex', 'class', 'colspan', 'rowspan'])

function sanitizeHtml(raw: string): string {
	if (!raw) return ''
	let html = raw
		// Strip dangerous elements entirely (open+close, and self-closing/void).
		.replace(/<(script|style|iframe|object|embed|link|meta|title|base)\b[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<(script|style|iframe|object|embed|link|meta|title|base)\b[^>]*\/?>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '')
	// Keep only allowlisted tags; keep only allowlisted attributes on those tags.
	return html.replace(
		/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g,
		(_m, slash: string, tag: string, attrs: string) => {
			const t = tag.toLowerCase()
			if (!ALLOWED_TAGS.has(t)) return '' // drop the tag, keep its inner text
			if (slash) return `</${t}>`
			const kept: string[] = []
			const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g
			let a: RegExpExecArray | null
			while ((a = attrRe.exec(attrs))) {
				const name = a[1].toLowerCase()
				const rawVal = a[3] ?? a[4] ?? ''
				// Preserve safe style declarations only: text-align + allowlisted
				// Tamil font-family (Unicode / Bamini / Suntommy).
				if (name === 'style') {
					const decls: string[] = []
					const align = /text-align\s*:\s*(left|right|center|justify)/i.exec(rawVal)
					if (align) decls.push(`text-align:${align[1].toLowerCase()}`)
					const ff = /font-family\s*:\s*([^;]+)/i.exec(rawVal)
					if (ff) {
						const canon = canonicalizeFontFamily(ff[1])
						if (canon) decls.push(`font-family:'${canon}'`)
					}
					if (decls.length) kept.push(`style="${decls.join(';')}"`)
					continue
				}
				if (!ALLOWED_ATTR.has(name)) continue
				const val = rawVal.replace(/"/g, '&quot;')
				kept.push(`${name}="${val}"`)
			}
			return `<${t}${kept.length ? ' ' + kept.join(' ') : ''}>`
		}
	)
}

export interface BuildPaperPdfResult {
	buffer: Buffer
	filename: string
}

/** Printed letterhead per COE institution_code (mirrors build-paper-pdf.ts). */
const LETTERHEAD: Record<string, { name: string; address: string }> = {
	CAS: {
		name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
		address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
	},
}

function formatDuration(mins?: number | null): string {
	if (!mins || mins <= 0) return '1 Hour'
	const h = mins / 60
	if (Number.isInteger(h)) return `${h} Hour${h > 1 ? 's' : ''}`
	const whole = Math.floor(h)
	if (Math.abs(h - whole - 0.5) < 0.001) {
		const label = whole === 0 ? '½' : `${whole}½`
		return `${label} Hour${whole >= 1 ? 's' : ''}`
	}
	return `${h.toFixed(1)} Hours`
}

/** Semester number → printed ordinal line, e.g. 5 → "FIFTH SEMESTER". */
function semesterLine(sem?: number | null): string {
	const words = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH']
	const n = Number(sem)
	if (!n || n < 1) return ''
	return `${words[n] || n + 'TH'} SEMESTER`
}

/** UG/PG from the program code (mirrors get_program_type_from_code()). */
function getProgramTypeFromCode(programCode?: string | null): 'UG' | 'PG' {
	if (!programCode) return 'UG'
	const c = programCode.toUpperCase()
	const pg = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
	if (pg.some((p) => c.startsWith(p))) return 'PG'
	if (/^[0-9]{2}P[A-Z]/.test(c)) return 'PG'
	if (/^P[A-Z]{2,3}$/.test(c)) return 'PG'
	return 'UG'
}

/** Decode the HTML entities Tiptap escapes into the data-latex attribute. */
function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
}

/** LaTeX → MathML (native Chromium rendering; degrade to plain text on error). */
function latexToMathml(latex: string): string {
	try {
		return katex.renderToString(decodeEntities(latex), {
			output: 'mathml',
			throwOnError: false,
			displayMode: false,
			strict: false,
		})
	} catch {
		return `<span>${escapeHtml(decodeEntities(latex))}</span>`
	}
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Turn stored question HTML into print-ready HTML:
 *   1. sanitize (allowlist — the content comes from users)
 *   2. expand every <span data-latex="…"> to rendered MathML
 * Plain-text (legacy) questions pass straight through as safe text.
 */
function renderQuestionHtml(raw: string): string {
	if (!raw) return ''
	const clean = sanitizeHtml(raw)
	// Replace the (atom) math spans with MathML.
	return clean.replace(
		/<span[^>]*\bdata-latex="([^"]*)"[^>]*>(?:.*?)<\/span>/g,
		(_m, latex) => `<span class="qp-math">${latexToMathml(latex)}</span>`
	)
}

/**
 * MCQ options are plain-text Inputs (not TipTap). Values like "<html>" / "<head>"
 * must be escaped — running them through sanitizeHtml drops the tag and prints blank.
 */
function optionLineHtml(opts: any, optionFont?: string | null): string {
	if (!Array.isArray(opts) || opts.length === 0) return ''
	const font = optionFont ? canonicalizeFontFamily(optionFont) : null
	const style = font ? ` style="font-family:'${font}'"` : ''
	const items = opts
		.map((o: any) => {
			const raw = String(o.text ?? '').trim()
			const text = raw ? escapeHtml(raw) : '____'
			return `<span class="opt"${style}>${escapeHtml(String(o.key))}) ${text}</span>`
		})
		.join('')
	return `<div class="options">${items}</div>`
}

/**
 * Tamil fonts are loaded dynamically from public/fonts/tamil/ (Unicode / Bamini /
 * Suntommy). See lib/ia/tamil-fonts.ts.
 */
export type PdfVariant = 'single' | '2up'

/**
 * Inheritable font stack for the whole paper — Latin serif faces + Unicode Tamil.
 * 'QP Serif' is the optional Times-metric TTF embedded from public/fonts/latin/
 * (see buildLatinSerifFontFaceCss); without it Chromium uses whatever serif the
 * host has ('Times New Roman' on Windows, Open Sans on Vercel).
 * Bamini/Suntommy are deliberately absent — see the html/body rule below.
 */
const BASE_FONT_STACK =
	`'QP Serif', 'Times New Roman', Times, 'Liberation Serif', 'Tinos', 'DejaVu Serif', 'Noto Serif', 'Noto Sans Tamil', serif`

function buildHtml(ctx: {
	variant: PdfVariant
	institutionName: string
	address: string
	examHeading: string
	roman: string
	semesterText: string
	paper: any
	grouped: Map<string, any[]>
	partByLabel: Map<string, any>
	tamilFontCss: string
}): string {
	const { variant, institutionName, address, examHeading, roman, semesterText, paper, grouped, partByLabel, tamilFontCss } = ctx
	const isTwoUp = variant === '2up'

	// One table for the WHOLE paper (part headings are full-width rows) so every
	// question row — across Part A, B, C — shares identical column geometry and the
	// CO / K-Level columns line up perfectly.
	const partsRows = [...grouped.entries()]
		.map(([label, qs], partIdx) => {
			const part: any = partByLabel.get(label)
			const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
			const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
			// "Answer any N": only num_to_answer questions count toward marks
			const answerCount = Number(part?.num_to_answer) > 0 ? Number(part.num_to_answer) : Number(count)
			const total = Number(marksEach) * answerCount
			const heading = `PART ${label} – (${answerCount} x ${marksEach} = ${total})`
			const instr = part?.instruction ? `<div class="part-instr">${escapeHtml(part.instruction)}</div>` : ''

			const headerRow = `<tr class="part-hdr${partIdx === 0 ? ' first' : ''}">
				<td colspan="2" class="part-head">${escapeHtml(heading)}${instr}</td>
				<td class="co-head">CO</td>
				<td class="kl-head">K-Level(s)</td>
			</tr>`

			const qRows = qs
				.map((q: any) => {
					const orRow = q.is_choice_alternative
						? `<tr><td colspan="4" class="or">(OR)</td></tr>`
						: ''
					const prefix = q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`
					const body = renderQuestionHtml(q.question_text || '') + optionLineHtml(q.options, q.option_font)
					return `${orRow}<tr>
						<td class="qno">${escapeHtml(prefix)}</td>
						<td class="qbody">${body}</td>
						<td class="co">${escapeHtml(q.co_code || '')}</td>
						<td class="kl">${escapeHtml(q.k_level || '')}</td>
					</tr>`
				})
				.join('')

			return headerRow + qRows
		})
		.join('')

	const partsHtml = `<table class="paper">
		<colgroup><col class="c-qno"/><col class="c-body"/><col class="c-co"/><col class="c-kl"/></colgroup>
		<tbody>${partsRows}</tbody>
	</table>`

	const sheetInner = `
		<div class="head-name">${escapeHtml(institutionName.toUpperCase())}</div>
		${address ? `<div class="head-addr">${escapeHtml(address)}</div>` : ''}
		<div class="head-exam">${escapeHtml(examHeading)}</div>
		<div class="head-cia">CONTINUOUS INTERNAL ASSESSMENT-${escapeHtml(roman)} - JULY-AUG-2026
		</div>
		${semesterText ? `<div class="head-sem">${escapeHtml(semesterText)}</div>` : ''}
		<div class="meta">
			<div>Subject Code: ${escapeHtml(paper.course_code || '')}</div>
			<div class="title">Subject Title: ${escapeHtml(paper.subject_title || '')}</div>
			<div class="meta-row">
				<span>Time: ${escapeHtml(formatDuration(paper.duration_minutes))}</span>
				<span>Maximum: ${Number(paper.max_marks) || 0} Marks</span>
			</div>
		</div>
		${partsHtml}`

	const sheetHtml = isTwoUp
		? `<div id="sheet" class="twoup"><section class="copy">${sheetInner}</section><section class="copy">${sheetInner}</section></div>`
		: `<div id="sheet">${sheetInner}</div>`

	return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
	${tamilFontCss}
	@page { size: ${isTwoUp ? 'A4 landscape' : 'A4 portrait'}; margin: ${isTwoUp ? '5mm' : '8mm'}; }
	* { box-sizing: border-box; font-family: inherit; }
	html, body {
		margin: 0; padding: 0;
		/* NEVER list Bamini/Suntommy here. They are legacy (TSCII) faces whose LATIN
		   codepoints carry Tamil glyphs, so any English character that fell through to
		   them printed as Tamil. Headless Chromium has no 'Times New Roman'
		   (@sparticuz/chromium ships Open Sans only), and 'Noto Sans Tamil' is
		   unicode-range-limited to U+0B80-0BFF — so the whole paper turned Tamil.
		   Legacy faces are reachable ONLY via an explicit font-family on a span
		   (the editor's Font / Option font dropdowns). Unicode Tamil still falls
		   through to Noto because of its unicode-range. */
		font-family: ${BASE_FONT_STACK};
		color: #000; font-size: ${isTwoUp ? '9pt' : '11pt'};
	}
	#sheet { transform-origin: top left; }
	/* 2-up print: two identical copies side by side, dashed cut-line between them. */
	#sheet.twoup { display: flex; align-items: stretch; width: 100%; }
	#sheet.twoup .copy { flex: 1; min-width: 0; }
	#sheet.twoup .copy:first-child { border-right: 1px dashed #999; padding-right: 6mm; margin-right: 6mm; }
	${isTwoUp ? '.head-name{font-size:11pt}.head-exam{font-size:10pt}.head-cia,.head-sem{font-size:9pt}' : ''}
	.head-name { text-align: center; font-weight: bold; font-size: 13pt; }
	.head-addr { text-align: center; font-size: 9pt; margin-top: 2px; }
	.head-exam { text-align: center; font-weight: bold; font-size: 12pt; margin-top: 4px; }
	.head-cia { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 2px; }
	.head-sem { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 2px; }
	.meta { margin-top: 6px; }
	.meta-row { display: flex; justify-content: space-between; }
	.meta .title { font-weight: bold; }
	/* ONE table for the whole paper: table-layout:fixed + colgroup give every row the
	   same column geometry, so CO / K-Level align across Part A, B, C — always. */
	table.paper { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
	table.paper .c-qno { width: 14mm; }
	table.paper .c-co  { width: 12mm; }
	table.paper .c-kl  { width: 20mm; }
	table.paper td { border: none; vertical-align: top; padding: 2px 3px; word-wrap: break-word; overflow-wrap: break-word; }
	/* Keep each question row intact; Chromium can otherwise split a row at the
	   page boundary and visually repeat fragments (e.g., "8 a)" on page 2). */
	table.paper tr { break-inside: avoid; page-break-inside: avoid; }
	table.paper td { break-inside: avoid; page-break-inside: avoid; }
	/* Part heading rows */
	.part-hdr td { padding-top: 9px; }
	.part-hdr.first td { padding-top: 2px; }
	.part-head { text-align: center; font-weight: bold; }
	.part-instr { font-weight: normal; font-size: 9pt; margin-top: 2px; }
	.co-head, .kl-head { text-align: center; font-weight: bold; font-size: 9pt; white-space: nowrap; vertical-align: bottom; }
	.qno { font-weight: bold; }
	.co { text-align: center; font-weight: bold; font-size: 9pt; }
	.kl { text-align: center; font-weight: bold; font-size: 9pt; }
	.or { text-align: center; font-weight: bold; }
	.qbody p { margin: 0 0 2px; }
	.options { margin-top: 2px; }
	.options .opt { display: inline-block; margin-right: 12px; }
	/* CO / K values sit at the top of the row, aligned with the question's first line. */
	.co, .kl { vertical-align: top; }
	/* Author-drawn tables inside a question */
	.qbody table { border-collapse: collapse; margin: 3px 0; }
	.qbody td, .qbody th { border: 1px solid #000; padding: 2px 5px; }
	.qbody th { font-weight: bold; }
	math { font-family: ${BASE_FONT_STACK}; font-size: 1em; }
	.qp-math { white-space: nowrap; }
</style></head>
<body>
	${sheetHtml}
</body></html>`
}

/**
 * Build the A4 PDF for one question paper. Same signature as the jsPDF builder so
 * the route swaps cleanly. Returns null if the paper isn't found.
 */
export async function buildPaperPdfHtml(
	supabase: any,
	id: string,
	_origin: string,
	variant: PdfVariant = 'single'
): Promise<BuildPaperPdfResult | null> {
	const { data: paper, error } = await supabase
		.from('ia_question_papers')
		.select('*')
		.eq('id', id)
		.single()
	if (error || !paper) {
		console.error('[QP PDF] paper fetch failed for id', id, '— error:', error?.message || '(no row)')
		return null
	}

	const questionArr: any[] = Array.isArray(paper.questions) ? paper.questions : []

	const [instRes, { data: parts }] = await Promise.all([
		supabase.from('institutions').select('*').eq('id', paper.institutions_id).single(),
		paper.template_id
			? supabase
					.from('ia_template_parts')
					.select('*')
					.eq('template_id', paper.template_id)
					.order('display_order', { ascending: true })
			: Promise.resolve({ data: [] as any[] }),
	])

	const institution: any = instRes.data
	const letterhead = LETTERHEAD[institution?.institution_code || '']
	const institutionName = letterhead?.name || institution?.name || 'Institution'
	const address =
		letterhead?.address ||
		[institution?.address_line1, institution?.address_line2, institution?.city, institution?.state]
			.filter(Boolean)
			.join(', ') ||
		''
	const examHeading = `${getProgramTypeFromCode(paper.program_code)} - DEGREE EXAMINATIONS`
	const semesterText = semesterLine(paper.semester)

	const questions = questionArr.slice().sort((a: any, b: any) => a.display_order - b.display_order)
	const partList = (parts || []).slice().sort((a: any, b: any) => a.display_order - b.display_order)
	const partByLabel = new Map<string, any>(partList.map((p: any) => [p.part_label, p]))
	const grouped = new Map<string, any[]>()
	for (const q of questions) {
		const key = q.part_label || '—'
		if (!grouped.has(key)) grouped.set(key, [])
		grouped.get(key)!.push(q)
	}
	const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][paper.cia_round || 1] || String(paper.cia_round || 1)

	// Latin serif first so 'QP Serif' resolves ahead of the Tamil faces in the stack.
	const tamilFontCss = [buildLatinSerifFontFaceCss(), buildTamilFontFaceCss()]
		.filter(Boolean)
		.join('\n')
	const available = listAvailableTamilFonts()
	if (available.length === 0) {
		console.warn('[QP PDF] No Tamil fonts in public/fonts/tamil/ — Unicode/Bamini/Suntommy may render blank. See public/fonts/tamil/README.md')
	} else {
		console.info('[QP PDF] Tamil fonts embedded:', available.join(', '))
	}

	const html = buildHtml({
		variant,
		institutionName,
		address,
		examHeading,
		roman,
		semesterText,
		paper,
		grouped,
		partByLabel,
		tamilFontCss,
	})
	const isTwoUp = variant === '2up'

	const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
	let browser
	if (isVercel) {
		const chromium = (await import('@sparticuz/chromium')).default
		const puppeteerCore = (await import('puppeteer-core')).default
		const executablePath = await chromium.executablePath()
		browser = await puppeteerCore.launch({
			args: chromium.args,
			defaultViewport: { width: 1240, height: 1754 },
			executablePath,
			headless: true,
		})
	} else {
		const puppeteer = (await import('puppeteer')).default
		browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
			headless: true,
		})
	}

	try {
		const page = await browser.newPage()
		await page.setContent(html, { waitUntil: 'domcontentloaded' })
		// Keep natural print scale so larger papers can flow to next page when needed.
		// We only wait for fonts to load before rendering.
		const printScale = 1
		await page.evaluate(async () => {
			try {
				await (document as any).fonts?.ready
			} catch {
				// ignore font-ready failures
			}
		})
		const marginMm = isTwoUp ? '5mm' : '8mm'
		const pdf = await page.pdf({
			format: 'A4',
			landscape: isTwoUp,
			printBackground: true,
			scale: printScale,
			margin: { top: marginMm, bottom: marginMm, left: marginMm, right: marginMm },
		})
		const filename = `QP_${paper.course_code || 'paper'}_CIA${paper.cia_round || 1}${paper.set_label ? '_' + paper.set_label : ''}${isTwoUp ? '_2up' : ''}.pdf`
		return { buffer: Buffer.from(pdf), filename }
	} finally {
		await browser.close()
	}
}
