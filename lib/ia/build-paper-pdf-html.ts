// Faithful A4 question-paper PDF via headless Chromium (HTML → PDF).
//
// Replaces the jsPDF renderer (build-paper-pdf.ts) so that rich question content
// authored in MyJKKN — inline math (KaTeX), tables, bold/italic/sub/superscript —
// prints EXACTLY as it appears in the editor. Both surfaces share one source of
// truth: sanitized HTML where each formula is a <span data-latex="…">. Here that
// LaTeX is typeset by KaTeX's own HTML renderer against an inlined katex.min.css
// (lib/ia/katex-css.ts) — the same stylesheet and faces the editor loads — and the
// page is printed through the same Chromium pattern used by
// lib/pdf/central-valuation-appointment-letter.ts.
//
// Tamil/Bamini/Suntommy: fonts under public/fonts/tamil/ are embedded as base64
// @font-face (see lib/ia/tamil-fonts.ts). Chromium shapes Tamil far more reliably
// than jsPDF ever did.

import fs from 'fs'
import path from 'path'
import katex from 'katex'
import { readSubQuestions, readQuestionImage } from './sub-questions'
import { paperPdfFilename } from './paper-filename'
import { buildKatexCss } from './katex-css'
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

/** One printed line of a boxed letterhead; `cls` picks its colour/size. */
interface LetterheadLine {
	text: string
	cls: 'lh-name' | 'lh-trust' | 'lh-approve' | 'lh-naac' | 'lh-addr' | 'lh-web'
}

interface Letterhead {
	name: string
	address: string
	/**
	 * 'plain'  — centred name + address (the arts & science paper).
	 * 'boxed'  — the engineering-college letterhead: framed block with the logo at
	 *            the left and the coloured name/affiliation lines centred beside it,
	 *            under a Register Number grid.
	 */
	style?: 'plain' | 'boxed'
	/** File under public/ — embedded as base64 (Chromium can't fetch a relative URL). */
	logoFile?: string
	lines?: LetterheadLine[]
	/** Cells in the Register Number grid; 0 / absent = don't print one. */
	registerCells?: number
}

/** Printed letterhead per COE institution_code (mirrors build-paper-pdf.ts). */
const LETTERHEAD: Record<string, Letterhead> = {
	CAS: {
		name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
		address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
	},
	// Engineering college. Its printed papers carry the Register Number grid at the
	// top right; the "Question Paper Code" box next to it belongs to the SEMESTER-END
	// paper only — an internal (CIA) paper has no code, so none is printed here.
	CET: {
		name: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING AND TECHNOLOGY',
		address: 'Natarajapuram, NH-544, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
		style: 'boxed',
		logoFile: 'jkkncet_logo.png',
		registerCells: 12,
		lines: [
			{ text: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING AND TECHNOLOGY', cls: 'lh-name' },
			{ text: '(AUTONOMOUS)', cls: 'lh-name' },
			{ text: '(MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST)', cls: 'lh-trust' },
			{ text: '(Approved by AICTE - New Delhi and Affiliated to Anna University - Chennai)', cls: 'lh-approve' },
			{ text: 'Recognized by UGC under Section 2(f) & Accredited by NAAC', cls: 'lh-naac' },
			{ text: 'Natarajapuram, NH-544, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.', cls: 'lh-addr' },
			{ text: 'Website: www.engg.jkkn.in', cls: 'lh-web' },
		],
	},
}

/** public/<file> → data URI, so the logo survives into headless Chromium. */
const logoCache = new Map<string, string | null>()
function loadLogoDataUri(file?: string | null): string | null {
	if (!file) return null
	if (logoCache.has(file)) return logoCache.get(file) || null
	let uri: string | null = null
	try {
		const full = path.join(process.cwd(), 'public', file)
		if (fs.existsSync(full)) {
			const ext = path.extname(full).toLowerCase()
			const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/png'
			uri = `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`
		} else {
			console.warn('[QP PDF] letterhead logo not found:', full)
		}
	} catch (e: any) {
		console.warn('[QP PDF] letterhead logo failed:', e?.message)
	}
	logoCache.set(file, uri)
	return uri
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

/**
 * LaTeX → print-ready formula markup.
 *
 * Prefers KaTeX's own HTML output, styled by the embedded katex.min.css — the very
 * stylesheet and faces the editor loads, so a formula prints exactly as it was
 * authored, on any machine. MathML is only the fallback for when the KaTeX data
 * files are missing from the deployment: Chromium renders a single-letter <mi>
 * through the Unicode math-alphanumeric block (U+1D400…), which no text font
 * carries, so identifiers silently vanish while digits and operators survive —
 * "dy/dx" printed as a bare fraction bar. See lib/ia/katex-css.ts.
 */
function latexToPrintHtml(latex: string): string {
	try {
		return katex.renderToString(decodeEntities(latex), {
			output: buildKatexCss() ? 'html' : 'mathml',
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
 * A question pasted in from Word arrives wrapped in a 1x1 Tiptap table that holds
 * no tabular data at all — 97 of the 101 papers carrying a <table> are this. The
 * cell's own padding then shifted that question a few points right of and below
 * its neighbours, so it visibly failed to line up with its question number and
 * with the questions around it. Unwrap the shell; anything with a second cell or
 * a second row is a real table and is left alone.
 */
const SINGLE_CELL_TABLE =
	/<table\b[^>]*>\s*(?:<tbody\b[^>]*>\s*)?<tr\b[^>]*>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>\s*(?:<\/tbody>\s*)?<\/table>/gi

/**
 * Any table markup surviving inside the captured cell means the lazy capture
 * backtracked past the cell it was meant to match — on a multi-row table the
 * engine happily stretches it to the LAST </td></tr></table> and would splice the
 * intervening </tr><tr><td> straight into the question. Those stray tags become
 * extra columns on the paper table, which then splits the body column in half and
 * squeezes every question on the sheet. Only a genuinely single-cell table passes.
 */
const CELL_HAS_TABLE_MARKUP = /<\/?(?:table|thead|tbody|tr|td|th)\b/i

function unwrapSingleCellTables(html: string): string {
	if (!/<table/i.test(html)) return html
	return html.replace(SINGLE_CELL_TABLE, (whole, inner: string) =>
		CELL_HAS_TABLE_MARKUP.test(inner) ? whole : inner
	)
}

/**
 * Turn stored question HTML into print-ready HTML:
 *   1. sanitize (allowlist — the content comes from users)
 *   2. drop 1x1 table shells left behind by Word pastes
 *   3. typeset every <span data-latex="…"> through KaTeX
 * Plain-text (legacy) questions pass straight through as safe text.
 */
function renderQuestionHtml(raw: string): string {
	if (!raw) return ''
	const clean = unwrapSingleCellTables(sanitizeHtml(raw))
	// Replace the (atom) math spans with their typeset form.
	return clean.replace(
		/<span[^>]*\bdata-latex="([^"]*)"[^>]*>(?:.*?)<\/span>/g,
		(_m, latex) => `<span class="qp-math">${latexToPrintHtml(latex)}</span>`
	)
}

/**
 * MCQ options. `text_html` is rich content authored in the same editor as the
 * questions (bold, sub/superscript, inline equations) and renders through the
 * same sanitize+MathML path. Options without it are LEGACY PLAIN TEXT and must be
 * escaped — values like "<html>" / "<head>" would otherwise be dropped as tags
 * and print blank.
 */
function optionLineHtml(opts: any, optionFont?: string | null): string {
	if (!Array.isArray(opts) || opts.length === 0) return ''
	const font = optionFont ? canonicalizeFontFamily(optionFont) : null
	const style = font ? ` style="font-family:'${font}'"` : ''
	const items = opts
		.map((o: any) => {
			const rich = typeof o.text_html === 'string' ? o.text_html.trim() : ''
			const plain = String(o.text ?? '').trim()
			const body = rich ? renderQuestionHtml(rich) : plain ? escapeHtml(plain) : '____'
			return `<span class="opt"${style}>${escapeHtml(String(o.key))}) ${body}</span>`
		})
		.join('')
	return `<div class="options">${items}</div>`
}

/**
 * Figure attached to a question / sub-division: printed CENTRED under that
 * question's text at the author's chosen share of the text column. The URL is
 * already restricted to http(s) by readQuestionImage.
 */
function questionImageHtml(image: any): string {
	const img = readQuestionImage(image)
	if (!img) return ''
	const pct = Math.min(100, Math.max(10, Number(img.width_pct) || 60))
	const src = escapeHtml(img.url).replace(/"/g, '&quot;')
	return `<div class="q-img"><img src="${src}" style="width:${pct}%"/></div>`
}

/**
 * Tamil fonts are loaded dynamically from public/fonts/tamil/ (Unicode / Bamini /
 * Suntommy). See lib/ia/tamil-fonts.ts.
 */
export type PdfVariant = 'single' | '2up'

/**
 * A Continuous Internal Assessment paper is printed as a hand-out and must not
 * run past two sheets. When the content overflows, the whole sheet is printed at
 * a reduced scale rather than spilling onto a third page — every proportion is
 * preserved, only the size changes.
 */
const MAX_PAGES = 2

/**
 * The smallest print scale that keeps an 11pt paper legible in the hand (~7.7pt).
 * A paper that still overflows at this size has more content than two sheets can
 * hold, and is printed full size instead — see buildPaperPdfHtml.
 */
const MIN_PRINT_SCALE = 0.7

/**
 * Pages in a Chromium-generated PDF. Its page objects are written as plain
 * dictionaries, so counting `/Type /Page` markers is exact — the negative lookahead
 * keeps the single `/Type /Pages` tree node out of the tally.
 */
function countPdfPages(buffer: Buffer): number {
	const matches = buffer.toString('latin1').match(/\/Type\s*\/Page(?![s/\w])/g)
	return matches ? matches.length : 1
}

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
	/** katex.min.css with its faces inlined ('' when the package data is missing). */
	katexCss: string
	/** Paper-wide common font (already canonicalized), or null. */
	defaultFont: string | null
	/** Printed letterhead for this institution (plain, or the boxed engineering one). */
	letterhead: Letterhead | null
	/** Base64 logo for a boxed letterhead, or null when the file is missing. */
	logoDataUri: string | null
}): string {
	const { variant, institutionName, address, examHeading, roman, semesterText, paper, grouped, partByLabel, tamilFontCss, katexCss, defaultFont, letterhead, logoDataUri } = ctx
	const isTwoUp = variant === '2up'

	// One table for the WHOLE paper (part headings are full-width rows) so every
	// question row — across Part A, B, C — shares identical column geometry and the
	// CO / K-Level columns line up perfectly.
	//
	// Pagination is controlled with <tbody> groups rather than per-row rules, which
	// is the only lever Chromium honours reliably inside a table: `break-after:avoid`
	// on a <tr> is ignored, so a PART heading used to be able to print alone at the
	// foot of a page with its first question stranded overleaf. Each group below is
	// one indivisible block — a question with its (OR) marker, its stem and all of
	// its sub-divisions; the part heading is bound to its first question.
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

			const qGroups = qs
				.map((q: any) => {
					const orRow = q.is_choice_alternative
						? `<tr><td colspan="4" class="or">(OR)</td></tr>`
						: ''
					const prefix = q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`
					// Per-question option font wins; otherwise fall back to the paper-wide common font.
					// Order: question text → centred figure → options.
					const body =
						renderQuestionHtml(q.question_text || '') +
						questionImageHtml(q.image) +
						optionLineHtml(q.options, q.option_font ?? defaultFont)

					// Author-defined sub-divisions ("12 a) i. (8) / ii. (7)"): the parent
					// row keeps only its optional stem — marks and CO/K move to the subs.
					const subs = readSubQuestions(q)
					if (subs.length > 0) {
						// With no stem, the question number rides the first sub-division's row
						// (as in a printed paper) instead of taking an empty row of its own.
						const hasStem = (q.question_text || '').replace(/<[^>]*>/g, '').trim() !== ''
						const subRows = subs
							.map((sb, i) => {
								const marks = sb.marks == null ? '' : ` <span class="sub-marks">(${sb.marks})</span>`
								const qno = !hasStem && i === 0 ? escapeHtml(prefix) : ''
								return `<tr>
									<td class="qno">${qno}</td>
									<td class="qbody sub"><span class="sub-lbl">${escapeHtml(sb.label)}.</span> ${renderQuestionHtml(sb.question_text || '')}${marks}${questionImageHtml(sb.image)}</td>
									<td class="co">${escapeHtml(sb.co_code || '')}</td>
									<td class="kl">${escapeHtml(sb.k_level || '')}</td>
								</tr>`
							})
							.join('')
						const stemRow = hasStem
							? `<tr>
								<td class="qno">${escapeHtml(prefix)}</td>
								<td class="qbody">${body}</td>
								<td class="co"></td>
								<td class="kl"></td>
							</tr>`
							: ''
						return `${orRow}${stemRow}${subRows}`
					}

					return `${orRow}<tr>
						<td class="qno">${escapeHtml(prefix)}</td>
						<td class="qbody">${body}</td>
						<td class="co">${escapeHtml(q.co_code || '')}</td>
						<td class="kl">${escapeHtml(q.k_level || '')}</td>
					</tr>`
				})

			// The heading rides along with the first question so it can never be
			// orphaned at the foot of a page; everything after it is its own block.
			const first = qGroups.length > 0 ? qGroups[0] : ''
			const rest = qGroups.slice(1)
			return (
				`<tbody class="grp part-open">${headerRow}${first}</tbody>` +
				rest.map((g) => `<tbody class="grp">${g}</tbody>`).join('')
			)
		})
		.join('')

	const partsHtml = `<table class="paper">
		<colgroup><col class="c-qno"/><col class="c-body"/><col class="c-co"/><col class="c-kl"/></colgroup>
		${partsRows}
	</table>`

	// Register Number grid — printed above the letterhead, at the right, exactly as
	// on the college's own papers. The semester-end paper also carries a "Question
	// Paper Code" box beside it; internal papers have no code, so it is omitted.
	const registerCells = Number(letterhead?.registerCells) || 0
	const registerHtml =
		registerCells > 0
			? `<div class="rn"><span class="rn-lbl">Register Number</span><span class="rn-grid">${'<i></i>'.repeat(registerCells)}</span></div>`
			: ''

	const isBoxed = letterhead?.style === 'boxed' && (letterhead?.lines?.length || 0) > 0
	const letterheadHtml = isBoxed
		? `<div class="lh">
			${logoDataUri ? `<div class="lh-logo"><img src="${logoDataUri}"/></div>` : ''}
			<div class="lh-text">
				${letterhead!.lines!.map(l => `<div class="${l.cls}">${escapeHtml(l.text)}</div>`).join('')}
			</div>
		</div>`
		: `<div class="head-name">${escapeHtml(institutionName.toUpperCase())}</div>
		${address ? `<div class="head-addr">${escapeHtml(address)}</div>` : ''}`

	const sheetInner = `
		${registerHtml}
		${letterheadHtml}
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
	${katexCss}
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
	/* Register Number grid (engineering-college papers): label + empty digit cells,
	   right-aligned above the letterhead. */
	.rn { display: flex; align-items: center; justify-content: flex-end; gap: 3mm; margin-bottom: 2mm; }
	.rn-lbl { font-weight: bold; font-size: ${isTwoUp ? '8.5pt' : '10.5pt'}; }
	.rn-grid { display: flex; }
	.rn-grid i {
		display: block;
		width: ${isTwoUp ? '4.5mm' : '6.5mm'};
		height: ${isTwoUp ? '4.5mm' : '6.5mm'};
		border: 0.7pt solid #000;
		border-left: none;
	}
	.rn-grid i:first-child { border-left: 0.7pt solid #000; }
	/* Boxed letterhead: logo at the left, the college's coloured name block centred. */
	.lh { display: flex; align-items: center; gap: 3mm; border: 0.8pt solid #000; padding: 1.5mm 2mm; }
	.lh-logo img { height: ${isTwoUp ? '11mm' : '16mm'}; width: auto; }
	.lh-text { flex: 1; text-align: center; }
	.lh-name { color: #1a7a3c; font-weight: bold; font-size: ${isTwoUp ? '9.5pt' : '12.5pt'}; line-height: 1.15; }
	.lh-trust { color: #e6007e; font-weight: bold; font-size: ${isTwoUp ? '7.5pt' : '9.5pt'}; }
	.lh-approve { font-weight: bold; font-size: ${isTwoUp ? '7pt' : '8.5pt'}; }
	.lh-naac { color: #e6007e; font-weight: bold; font-size: ${isTwoUp ? '7pt' : '8.5pt'}; }
	.lh-addr { font-weight: bold; font-size: ${isTwoUp ? '7pt' : '8.5pt'}; }
	.lh-web { font-size: ${isTwoUp ? '6.5pt' : '8pt'}; color: #1a4fd6; text-decoration: underline; }
	.lh + .head-exam { margin-top: 3mm; }
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
	table.paper { width: 100%; border-collapse: collapse; margin-top: ${isTwoUp ? '6px' : '10px'}; table-layout: fixed; }
	table.paper .c-qno { width: ${isTwoUp ? '12mm' : '15mm'}; }
	table.paper .c-co  { width: 12mm; }
	table.paper .c-kl  { width: 20mm; }
	/* One ABSOLUTE line-height for every cell in the row. CO / K-Level print two
	   points smaller than the question, so a relative line-height gave them a
	   shorter first line box and their baseline floated above the question's — the
	   columns looked a whisker high on every row. An absolute value is inherited as
	   computed, so all four cells open with an identical first line. */
	table.paper td {
		border: none; vertical-align: top;
		padding: ${isTwoUp ? '2.5px 3px' : '4px 4px'};
		line-height: ${isTwoUp ? '12.5pt' : '15.5pt'};
		word-wrap: break-word; overflow-wrap: break-word;
	}
	/* Pagination, in blocks rather than rows: a <tbody class="grp"> holds one whole
	   question — its (OR) marker, stem and every sub-division — and .part-open also
	   carries the PART heading, so a heading can never print alone at the foot of a
	   page. Rows/cells keep their own avoid rules for the degenerate case of a group
	   taller than the page, where Chromium has to break somewhere. */
	table.paper tbody.grp { break-inside: avoid; page-break-inside: avoid; }
	table.paper tr { break-inside: avoid; page-break-inside: avoid; }
	table.paper td { break-inside: avoid; page-break-inside: avoid; }
	/* Part heading rows: clear air above the heading separates it from the previous
	   part, and a little below it before the first question. */
	.part-hdr td { padding-top: ${isTwoUp ? '8px' : '16px'}; padding-bottom: ${isTwoUp ? '2px' : '4px'}; }
	.part-hdr.first td { padding-top: 2px; }
	.part-head { text-align: center; font-weight: bold; }
	.part-instr { font-weight: normal; font-size: 9pt; margin-top: 2px; }
	.co-head, .kl-head { text-align: center; font-weight: bold; font-size: 9pt; white-space: nowrap; vertical-align: bottom; }
	.qno { font-weight: bold; white-space: nowrap; }
	.co { text-align: center; font-weight: bold; font-size: 9pt; }
	.kl { text-align: center; font-weight: bold; font-size: 9pt; }
	/* (OR) sits midway between the two alternatives it separates. */
	.or { text-align: center; font-weight: bold; padding-top: ${isTwoUp ? '3px' : '6px'}; padding-bottom: ${isTwoUp ? '1px' : '3px'}; }
	.qbody p { margin: 0 0 2px; }
	.qbody p:last-child { margin-bottom: 0; }
	/* Sub-divisions ("12 a) i. … (8)"): indented under their parent question, with
	   the marks printed inline at the end of the sub-division's text. */
	.qbody.sub { padding-left: 5mm; }
	.qbody.sub p { display: inline; }
	.sub-lbl { font-weight: bold; }
	.sub-marks { font-weight: bold; white-space: nowrap; }
	/* Paper-wide common font: question bodies render in it unless an inline span
	   (explicit per-selection font) overrides. Scoped to .qbody so question numbers,
	   CO/K columns and headings keep the Latin serif — never put a legacy TSCII face
	   on html/body (see the html/body rule above). Formulae are immune: KaTeX's own
	   .katex rule names its faces explicitly and wins over this inherited family. */
	${defaultFont ? `.qbody { font-family: '${defaultFont}'; }` : ''}
	.options { margin-top: 2px; }
	.options .opt { display: inline-block; margin-right: 12px; }
	/* Rich options are authored as paragraphs; keep them on the option's own line. */
	.options .opt p { display: inline; margin: 0; }
	/* Attached figure: centred under the question, never wide/tall enough to
	   push the row past a page break. object-fit keeps the aspect ratio when the
	   max-height clamps a tall image. */
	.q-img { text-align: center; margin: 3px 0; break-inside: avoid; page-break-inside: avoid; }
	.q-img img {
		display: inline-block;
		max-width: 100%;
		max-height: ${isTwoUp ? '55mm' : '85mm'};
		height: auto;
		object-fit: contain;
	}
	/* CO / K values sit at the top of the row, aligned with the question's first line. */
	.co, .kl { vertical-align: top; }
	/* Author-drawn tables inside a question (accounting figures, comparison grids).
	   They stay BORDERLESS: the paper table is table-layout:fixed, so an inner table
	   whose min-content width exceeds the body column pushes the whole sheet wider
	   than A4 and Chromium then shrinks the entire page to fit — borders and roomy
	   cells alone were enough to trigger it. max-width pins the inner table to its
	   column, and the tight cell padding out-specifies the paper's own row padding
	   so a wide figure table keeps its columns. */
	.qbody table { border-collapse: collapse; margin: 3px 0; max-width: 100%; }
	table.paper .qbody table td, table.paper .qbody table th {
		padding: 1px 4px; line-height: 1.35;
	}
	table.paper .qbody table th { font-weight: bold; }
	/* Formulae. KaTeX sets .katex to 1.21em so its glyphs optically match the
	   surrounding serif; keep that, but pin the line-height so a fraction or a
	   superscript cannot stretch the row it sits in — the tall/deep parts are
	   already drawn with negative margins inside .katex's own box. */
	.qp-math { white-space: nowrap; }
	.qp-math .katex { line-height: 1.2; text-indent: 0; }
	/* MathML fallback (only when the KaTeX data files are missing — see katex-css.ts). */
	math { font-family: ${BASE_FONT_STACK}; font-size: 1em; }
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
	const letterhead: Letterhead | undefined = LETTERHEAD[(institution?.institution_code || '').toUpperCase()]
	const logoDataUri = letterhead?.style === 'boxed' ? loadLogoDataUri(letterhead.logoFile) : null
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

	// Paper-wide common font → canonicalize to an embedded face, or null.
	const defaultFont = paper.default_font ? canonicalizeFontFamily(paper.default_font) : null

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
		katexCss: buildKatexCss(),
		defaultFont,
		letterhead: letterhead || null,
		logoDataUri,
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
		await page.evaluate(async () => {
			try {
				await (document as any).fonts?.ready
			} catch {
				// ignore font-ready failures
			}
			// Attached figures load over the network — print only once they have
			// settled, or after 8s so one bad URL can't hang the whole PDF.
			const pending = Array.from(document.images).filter((img) => !img.complete)
			if (pending.length > 0) {
				await Promise.race([
					Promise.all(
						pending.map(
							(img) =>
								new Promise((resolve) => {
									img.addEventListener('load', resolve, { once: true })
									img.addEventListener('error', resolve, { once: true })
								})
						)
					),
					new Promise((resolve) => setTimeout(resolve, 8000)),
				])
			}
		})
		const marginMm = isTwoUp ? '5mm' : '8mm'
		const renderAt = async (scale: number) => {
			const out = await page.pdf({
				format: 'A4',
				landscape: isTwoUp,
				printBackground: true,
				scale,
				margin: { top: marginMm, bottom: marginMm, left: marginMm, right: marginMm },
			})
			const buffer = Buffer.from(out)
			return { scale, buffer, pages: countPdfPages(buffer) }
		}

		// A CIA paper is a hand-out, not a booklet: it must come off the press as
		// MAX_PAGES sheets. Full size first — that is what nearly every paper needs —
		// and only a paper that overflows pays for the search below.
		let best = await renderAt(1)
		if (best.pages > MAX_PAGES) {
			const floor = await renderAt(MIN_PRINT_SCALE)
			// Aim for MAX_PAGES; when even the smallest legible size cannot reach it —
			// three full-page balance-sheet problems simply are not a two-page paper —
			// aim instead for the fewest pages that size can achieve. Shrinking past
			// what actually saves a page only makes the paper harder to read.
			const target = Math.max(MAX_PAGES, floor.pages)
			if (best.pages > target) {
				// Largest scale that still meets the target: binary search between the
				// floor (known to meet it) and 1 (known not to). Four probes land within
				// ~2% of the true threshold, finer than the eye reads off the page.
				best = floor
				let lo = MIN_PRINT_SCALE
				let hi = 1
				for (let i = 0; i < 4; i++) {
					const mid = (lo + hi) / 2
					const probe = await renderAt(mid)
					if (probe.pages <= target) {
						best = probe
						lo = mid
					} else {
						hi = mid
					}
				}
			}
			const how = `${best.pages} page(s) at ${best.scale.toFixed(3)}x`
			if (best.pages > MAX_PAGES) {
				console.warn(`[QP PDF] ${paper.course_code || id} will not fit ${MAX_PAGES} pages — printed as ${how}`)
			} else {
				console.info(`[QP PDF] ${paper.course_code || id} fitted to ${how}`)
			}
		}
		const filename = paperPdfFilename(paper, { variant })
		return { buffer: best.buffer, filename }
	} finally {
		await browser.close()
	}
}
