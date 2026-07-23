// Shared A4 question-paper PDF builder (text letterhead, auto-fit to 1 page).
// Used by the internal route and the /api/v1 route so output stays identical.

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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

/**
 * Flatten rich question HTML to plain text for the (legacy) jsPDF renderer, which
 * can only draw strings. Question text is now authored as HTML in MyJKKN, so a raw
 * value like "<p>…</p>" must NOT be printed verbatim. Inline math (<span
 * data-latex="…">) degrades to its LaTeX source — jsPDF cannot typeset it, but the
 * faithful Chromium renderer (build-paper-pdf-html.ts) does. Block tags become
 * line breaks; entities are decoded.
 */
function stripHtmlToText(html?: string | null): string {
	if (!html) return ''
	if (!/[<&]/.test(html)) return html // fast path: already plain
	return html
		// Inline math → its LaTeX (best-effort for the text-only renderer)
		.replace(/<span[^>]*\bdata-latex="([^"]*)"[^>]*>(?:.*?)<\/span>/gi, ' $1 ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
		.replace(/<li[^>]*>/gi, '• ')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim()
}

/**
 * Printed letterhead per COE institution_code.
 *
 * The `institutions` row carries a short/informal name ("JKKN College of Arts and
 * Science (Autonomous)") and no printable address, and pdf_institution_settings has
 * no name/address columns — so the official letterhead text is configured here.
 * Keyed by institution_code so other colleges keep their own details.
 */
const LETTERHEAD: Record<string, { name: string; address: string }> = {
	CAS: {
		name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
		address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
	},
}

/**
 * UG/PG from the program code. Mirrors the DB function get_program_type_from_code()
 * (20260117_fix_pg_program_pass_status.sql) — keep the rules in sync.
 */
function getProgramTypeFromCode(programCode?: string | null): 'UG' | 'PG' {
	if (!programCode) return 'UG'
	const upperCode = programCode.toUpperCase()
	const pgPrefixes = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
	for (const prefix of pgPrefixes) {
		if (upperCode.startsWith(prefix)) return 'PG'
	}
	if (/^[0-9]{2}P[A-Z]/.test(upperCode)) return 'PG' // e.g. 24PCHC02
	if (/^P[A-Z]{2,3}$/.test(upperCode)) return 'PG' // e.g. PCH, PZO
	return 'UG'
}

export interface BuildPaperPdfResult {
	buffer: Buffer
	filename: string
}

/**
 * Build the A4 PDF for a single question paper.
 * @param supabase service-role client
 * @param id       ia_question_papers.id
 * @param origin   request origin, used to resolve relative logo URLs
 * @returns null if the paper is not found
 */
export async function buildPaperPdf(
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

	// Questions live in the JSONB column.
	const questionArr: any[] = Array.isArray(paper.questions) ? paper.questions : []

	// The exam session name is no longer printed, and pdf_institution_settings has
	// no name/address/logo we use, so neither is fetched.
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
	if (instRes.error || !institution) {
		console.error('[QP PDF] institution lookup failed for', paper.institutions_id, instRes.error)
	}

	// Letterhead: official name + address (no logos, no accreditation line).
	const letterhead = LETTERHEAD[institution?.institution_code || '']
	const institutionName = letterhead?.name || institution?.name || 'Institution'
	const address =
		letterhead?.address ||
		[institution?.address_line1, institution?.address_line2, institution?.city, institution?.state]
			.filter(Boolean)
			.join(', ') ||
		''
	// UG - / PG - DEGREE EXAMINATIONS, from the paper's program code.
	const examHeading = `${getProgramTypeFromCode(paper.program_code)} - DEGREE EXAMINATIONS`

	const questions = questionArr.slice().sort((a: any, b: any) => a.display_order - b.display_order)
	const partList = (parts || []).slice().sort((a: any, b: any) => a.display_order - b.display_order)

	const partByLabel = new Map(partList.map((p: any) => [p.part_label, p]))
	const grouped = new Map<string, any[]>()
	for (const q of questions) {
		const key = q.part_label || '—'
		if (!grouped.has(key)) grouped.set(key, [])
		grouped.get(key)!.push(q)
	}
	const optionLine = (opts: any) => {
		if (!Array.isArray(opts) || opts.length === 0) return ''
		return opts.map((o: any) => `${o.key}) ${stripHtmlToText(o.text) || '____'}`).join('    ')
	}
	const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][paper.cia_round || 1] || String(paper.cia_round || 1)

	// Spacing presets, roomiest first. To fit one page we tighten whitespace BEFORE
	// shrinking the font, so text stays as large as possible.
	//   pad/gap/startGap = cell padding + gaps between parts (mm)
	//   lh               = jsPDF line-height factor (leading inside a cell)
	const SPACING = [
		{ pad: 2, gap: 2, startGap: 3, lh: 1.15 }, // roomy (default)
		{ pad: 1.5, gap: 1.5, startGap: 2.5, lh: 1.05 }, // snug
		{ pad: 1.0, gap: 1.0, startGap: 2, lh: 0.98 }, // tight
		{ pad: 0.7, gap: 0.5, startGap: 1, lh: 0.9 }, // tightest
	]

	const buildDoc = (qFont: number, sp: { pad: number; gap: number; startGap: number; lh: number }) => {
		const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
		// Tighter leading = shorter multi-line cells, applied before any text is measured.
		doc.setLineHeightFactor(sp.lh)
		const pageW = doc.internal.pageSize.getWidth() // 210mm
		const margin = 8
		const centerFit = (t: string, yy: number, size: number, bold = true, maxW?: number) => {
			doc.setFont('times', bold ? 'bold' : 'normal')
			const limit = maxW ?? pageW - margin * 2
			let s = size
			doc.setFontSize(s)
			while (doc.getTextWidth(t) > limit && s > 4.5) {
				s -= 0.5
				doc.setFontSize(s)
			}
			doc.text(t, pageW / 2, yy, { align: 'center' })
		}

		let y = margin
		// No logos — the letterhead is text-only, so it spans the full width.
		const textMaxW = pageW - margin * 2
		centerFit(institutionName.toUpperCase(), y + 4, 12, true, textMaxW)
		y += 7
		if (address) centerFit(address, y, 9, true, textMaxW)
		y += 5
		centerFit(examHeading, y, 12)
		y += 5
		centerFit(`Continuous Internal Assessment- ${roman}`, y, 11)
		y += 6

		doc.setFont('times', 'normal')
		doc.setFontSize(11)
		doc.text(`Subject Code: ${paper.course_code || ''}`, margin, y)
		y += 5.5
		doc.setFont('times', 'bold')
		doc.text(`Subject Title: ${paper.subject_title || ''}`, margin, y)
		y += 5.5
		doc.setFont('times', 'normal')
		doc.text(`Time: ${formatDuration(paper.duration_minutes)}`, margin, y)
		doc.text(`Maximum: ${Number(paper.max_marks) || 0} Marks`, pageW - margin, y, { align: 'right' })
		y += 2

		// Question no. (14, bold) + CO (12) + K-Level(s) (20) reserved from the content column.
		const numW = 14
		const contentW = pageW - margin * 2 - 32 - numW
		for (const [label, qs] of grouped) {
			const part: any = partByLabel.get(label)
			const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
			const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
			// "Answer any N": only num_to_answer questions count toward marks
			const answerCount = Number(part?.num_to_answer) > 0 ? Number(part.num_to_answer) : Number(count)
			const total = Number(marksEach) * answerCount
			const heading = `PART ${label} – (${answerCount} x ${marksEach} = ${total})`

			const rows: any[] = []
			for (const q of qs) {
				if (q.is_choice_alternative) {
					rows.push([{ content: '(OR)', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold' } }])
				}
				// Question number lives in its own bold column ("6 a)", "1.")
				const prefix = q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`
				let text = stripHtmlToText(q.question_text)
				const opts = optionLine(q.options)
				if (opts) text += `\n${opts}`
				rows.push([{ content: prefix, styles: { fontStyle: 'bold' } }, text, q.co_code || '', q.k_level || ''])
			}

			autoTable(doc, {
				startY: y + sp.startGap,
				head: [[
					{ content: `${heading}${part?.instruction ? '\n' + part.instruction : ''}`, colSpan: 2, styles: { halign: 'center' } },
					// 10pt (at qFont 12) — small enough that "K-Level(s)" stays on one line in its 20mm column
					{ content: 'CO', styles: { fontSize: Math.max(6, qFont - 2) } },
					{ content: 'K-Level(s)', styles: { fontSize: Math.max(6, qFont - 2) } },
				]],
				body: rows,
				theme: 'plain',
				styles: { font: 'times', fontSize: qFont, cellPadding: sp.pad, valign: 'top' },
				headStyles: { fontStyle: 'bold', fontSize: qFont, halign: 'center', textColor: 20 },
				columnStyles: {
					0: { cellWidth: numW, fontStyle: 'bold' },
					1: { cellWidth: contentW },
					// CO / K-Level: bold and a couple of points smaller than the question text
					2: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fontSize: Math.max(6, qFont - 2) },
					3: { cellWidth: 20, halign: 'center', fontStyle: 'bold', fontSize: Math.max(6, qFont - 2) },
				},
				margin: { left: margin, right: margin },
			})
			y = (doc as any).lastAutoTable.finalY + sp.gap
		}
		return doc
	}

	// Always fit one page. At each font size try roomy → tight → tightest spacing;
	// only when even the tightest spacing overflows do we drop the font a step.
	const FONT_MAX = 12
	const FONT_MIN = 6
	let doc = buildDoc(FONT_MAX, SPACING[0])
	if (doc.getNumberOfPages() > 1) {
		let fitted = false
		for (let f = FONT_MAX; f >= FONT_MIN && !fitted; f -= 0.5) {
			for (const sp of SPACING) {
				doc = buildDoc(f, sp)
				if (doc.getNumberOfPages() === 1) {
					fitted = true
					break
				}
			}
		}
		// If nothing fits even at FONT_MIN/tightest, `doc` holds that densest attempt.
	}

	const buffer = Buffer.from(doc.output('arraybuffer'))
	const filename = `QP_${paper.course_code || 'paper'}_CIA${paper.cia_round || 1}${paper.set_label ? '_' + paper.set_label : ''}.pdf`
	return { buffer, filename }
}
