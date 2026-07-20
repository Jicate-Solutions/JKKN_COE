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
// Tamil/Bamini: the PDF HTML supports an embedded @font-face (see TAMIL_FONT_CSS);
// drop the Bamini .ttf base64 in there to render Tamil papers. Chromium shapes
// Tamil far more reliably than jsPDF ever did.

import katex from 'katex'
import DOMPurify from 'isomorphic-dompurify'
import puppeteerCore from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

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
	const clean = DOMPurify.sanitize(raw, {
		ALLOWED_TAGS: [
			'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
			'ul', 'ol', 'li', 'span',
			'table', 'thead', 'tbody', 'tr', 'td', 'th',
		],
		ALLOWED_ATTR: ['data-latex', 'class', 'colspan', 'rowspan'],
	})
	// Replace the (atom) math spans with MathML.
	return clean.replace(
		/<span[^>]*\bdata-latex="([^"]*)"[^>]*>(?:.*?)<\/span>/g,
		(_m, latex) => `<span class="qp-math">${latexToMathml(latex)}</span>`
	)
}

function optionLineHtml(opts: any): string {
	if (!Array.isArray(opts) || opts.length === 0) return ''
	const items = opts
		.map((o: any) => `<span class="opt">${escapeHtml(String(o.key))}) ${renderQuestionHtml(o.text || '____')}</span>`)
		.join('')
	return `<div class="options">${items}</div>`
}

/**
 * Tamil / Bamini support (PDF only).
 * Paste the Bamini font as a base64 data URI below to enable Tamil rendering.
 * NOTE: Bamini is a LEGACY glyph font (maps Latin codepoints) — it renders
 * Bamini-ENCODED text, not Unicode Tamil. If questions are stored as Unicode
 * Tamil, a Unicode→TSCII conversion step is required before this helps; if they
 * are already Bamini-encoded, embedding the font here is sufficient.
 */
const TAMIL_FONT_CSS = `
/* @font-face { font-family: 'Bamini'; src: url(data:font/truetype;base64,PASTE_BAMINI_TTF_BASE64) format('truetype'); } */
`

function buildHtml(ctx: {
	institutionName: string
	address: string
	examHeading: string
	roman: string
	paper: any
	grouped: Map<string, any[]>
	partByLabel: Map<string, any>
}): string {
	const { institutionName, address, examHeading, roman, paper, grouped, partByLabel } = ctx

	const partsHtml = [...grouped.entries()]
		.map(([label, qs]) => {
			const part: any = partByLabel.get(label)
			const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
			const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
			const total = Number(marksEach) * Number(count)
			const heading = `PART ${label} – (${count} x ${marksEach} = ${total})`
			const instr = part?.instruction ? `<div class="part-instr">${escapeHtml(part.instruction)}</div>` : ''

			const rows = qs
				.map((q: any) => {
					if (q.is_choice_alternative) {
						return `<tr><td colspan="4" class="or">(OR)</td></tr>`
					}
					const prefix = q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`
					const body = renderQuestionHtml(q.question_text || '') + optionLineHtml(q.options)
					return `<tr>
						<td class="qno">${escapeHtml(prefix)}</td>
						<td class="qbody">${body}</td>
						<td class="co">${escapeHtml(q.co_code || '')}</td>
						<td class="kl">${escapeHtml(q.k_level || '')}</td>
					</tr>`
				})
				.join('')

			return `<table class="part">
				<thead>
					<tr>
						<th colspan="2" class="part-head">${escapeHtml(heading)}${instr}</th>
						<th class="co-head">CO</th>
						<th class="kl-head">K-Level(s)</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>`
		})
		.join('')

	return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
	${TAMIL_FONT_CSS}
	@page { size: A4 portrait; margin: 8mm; }
	* { box-sizing: border-box; }
	body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; font-size: 11pt; }
	#sheet { transform-origin: top left; }
	.head-name { text-align: center; font-weight: bold; font-size: 13pt; }
	.head-addr { text-align: center; font-size: 9pt; margin-top: 2px; }
	.head-exam { text-align: center; font-weight: bold; font-size: 12pt; margin-top: 4px; }
	.head-cia { text-align: center; font-size: 11pt; margin-top: 2px; }
	.meta { margin-top: 6px; }
	.meta-row { display: flex; justify-content: space-between; }
	.meta .title { font-weight: bold; }
	table.part { width: 100%; border-collapse: collapse; margin-top: 8px; }
	table.part th, table.part td { border: none; vertical-align: top; padding: 2px 3px; }
	.part-head { text-align: center; font-weight: bold; }
	.part-instr { font-weight: normal; font-size: 9pt; margin-top: 2px; }
	.co-head, .kl-head { text-align: center; font-weight: bold; font-size: 9pt; white-space: nowrap; }
	.qno { width: 14mm; font-weight: bold; }
	.qbody { }
	.co { width: 12mm; text-align: center; font-weight: bold; font-size: 9pt; }
	.kl { width: 20mm; text-align: center; font-weight: bold; font-size: 9pt; }
	.or { text-align: center; font-weight: bold; }
	.qbody p { margin: 0 0 2px; }
	.options { margin-top: 2px; }
	.options .opt { display: inline-block; margin-right: 12px; }
	/* Author-drawn tables inside a question */
	.qbody table { border-collapse: collapse; margin: 3px 0; }
	.qbody td, .qbody th { border: 1px solid #000; padding: 2px 5px; }
	.qbody th { font-weight: bold; }
	math { font-size: 1em; }
	.qp-math { white-space: nowrap; }
</style></head>
<body>
	<div id="sheet">
		<div class="head-name">${escapeHtml(institutionName.toUpperCase())}</div>
		${address ? `<div class="head-addr">${escapeHtml(address)}</div>` : ''}
		<div class="head-exam">${escapeHtml(examHeading)}</div>
		<div class="head-cia">Continuous Internal Assessment- ${escapeHtml(roman)}</div>
		<div class="meta">
			<div>Subject Code: ${escapeHtml(paper.course_code || '')}</div>
			<div class="title">Subject Title: ${escapeHtml(paper.subject_title || '')}</div>
			<div class="meta-row">
				<span>Time: ${escapeHtml(formatDuration(paper.duration_minutes))}</span>
				<span>Maximum: ${Number(paper.max_marks) || 0} Marks</span>
			</div>
		</div>
		${partsHtml}
	</div>
</body></html>`
}

/**
 * Build the A4 PDF for one question paper. Same signature as the jsPDF builder so
 * the route swaps cleanly. Returns null if the paper isn't found.
 */
export async function buildPaperPdfHtml(
	supabase: any,
	id: string,
	_origin: string
): Promise<BuildPaperPdfResult | null> {
	const { data: paper, error } = await supabase
		.from('ia_question_papers')
		.select('*')
		.eq('id', id)
		.single()
	if (error || !paper) return null

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

	const html = buildHtml({ institutionName, address, examHeading, roman, paper, grouped, partByLabel })

	const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME
	let browser
	if (isVercel) {
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
		// One-page fit: shrink the sheet uniformly (like the jsPDF font auto-fit) if
		// content overflows the A4 printable height (297mm − 16mm margins ≈ 281mm).
		await page.evaluate(() => {
			const A4_PRINTABLE_PX = ((297 - 16) * 96) / 25.4
			const sheet = document.getElementById('sheet')
			if (!sheet) return
			const h = sheet.scrollHeight
			if (h > A4_PRINTABLE_PX) {
				const scale = Math.max(0.5, A4_PRINTABLE_PX / h)
				sheet.style.transform = `scale(${scale})`
				sheet.style.width = `${100 / scale}%`
			}
		})
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' },
		})
		const filename = `QP_${paper.course_code || 'paper'}_CIA${paper.cia_round || 1}${paper.set_label ? '_' + paper.set_label : ''}.pdf`
		return { buffer: Buffer.from(pdf), filename }
	} finally {
		await browser.close()
	}
}
