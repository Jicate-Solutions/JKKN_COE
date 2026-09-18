// Examiner Order + Claim Form PDFs for the End-Semester question-paper setter.
//
// Section 9 of the spec: the order design is configurable per institution. Two
// existing systems supply that, so nothing new is invented here:
//
//   • pdf_institution_settings  — logo(s), header/footer HTML, colours, fonts,
//                                 paper size, margins, watermark, signature block
//   • ia_qp_portal_content      — order title, intro paragraph, numbered terms,
//     (doc_type='order')          footer note, signatory name/designation, and
//                                 the letter-reference prefix
//
// Rendered with Chromium so the institution's own header_html/footer_html can be
// used verbatim, matching lib/pdf/practical-appointment-letter.ts.

import { readFileSync } from 'fs'
import { join } from 'path'
import type { PdfInstitutionSettings } from '@/types/pdf-settings'
import type { QpPortalContent } from '@/types/qp-examiner-assignment'
import { formatIst, formatIstDate } from '@/lib/qp-portal/ist'
import { launchHeadlessBrowser } from '@/lib/pdf/headless-browser'
import {
	getJkknLetterhead,
	isBoxedLetterhead,
	loadPublicImageDataUri,
} from '@/lib/pdf/jkkn-letterhead'

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

/** Resolve a setting: saved value → fallback. Blank strings count as unset. */
function s(settings: PdfInstitutionSettings | null, key: keyof PdfInstitutionSettings, fallback: string): string {
	const v = settings?.[key]
	return v == null || v === '' ? fallback : String(v)
}

/** Load a logo/signature as a data URI so Chromium can draw it offline. */
async function urlToBase64(url: string | null | undefined): Promise<string | null> {
	if (!url) return null
	if (url.startsWith('data:')) return url
	try {
		if (url.startsWith('/')) {
			const buffer = readFileSync(join(process.cwd(), 'public', url))
			const ext = url.split('.').pop()?.toLowerCase() || 'png'
			const mime =
				ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
			return `data:${mime};base64,${buffer.toString('base64')}`
		}
		const res = await fetch(url)
		if (!res.ok) return null
		const contentType = res.headers.get('content-type') || 'image/png'
		const bytes = Buffer.from(await res.arrayBuffer())
		return `data:${contentType};base64,${bytes.toString('base64')}`
	} catch {
		console.warn('[Examiner order] could not load image:', url)
		return null
	}
}

/** Substitute {{token}} placeholders in institution header/footer HTML. */
function fillPlaceholders(html: string | null | undefined, values: Record<string, string>): string {
	if (!html) return ''
	let out = html
	for (const [k, v] of Object.entries(values)) {
		out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), escapeHtml(v))
	}
	return out
}

// ── Input ───────────────────────────────────────────────────────────────────

export interface OrderCourseRow {
	semester?: number | null
	program_code?: string | null
	program_name?: string | null
	regulation?: string | null
	course_code: string
	title: string
	set_label?: string | null
	max_marks?: number | null
	assignment_type?: string | null
	valid_to?: string | null
	qp_fee?: number | null
	ak_fee?: number | null
}

export interface ExaminerOrderData {
	institution: {
		name: string
		institution_code: string
		address?: string | null
		accreditation?: string | null
		/** "(An Autonomous Institution)" — printed under the name. */
		subtitle?: string | null
		/** "Managed by ... Trust" — printed under the subtitle. */
		trust_line?: string | null
		/**
		 * /public path to the college's own logo, from institution-header.ts.
		 * Used when pdf_institution_settings carries no logo for this college —
		 * which is the normal case, since only CAS has settings rows.
		 */
		logo_path?: string | null
	}
	examiner: {
		full_name: string
		designation?: string | null
		department?: string | null
		institution_name?: string | null
		address?: string | null
		email: string
		mobile?: string | null
		kind: 'internal' | 'external'
	}
	/** courses.regulation_code, e.g. "R-2021". */
	regulation?: string | null
	/** Programme name from the course master, e.g. "B.E. Computer Science and Engineering". */
	program_name?: string | null
	/** The issuing officer, printed under the letterhead. */
	coe?: {
		name?: string | null
		designation?: string | null
		phone?: string | null
		email?: string | null
	}
	examination: {
		/** exam_types.examination_name, e.g. "End Semester Examinations". */
		exam_type_name?: string | null
		/** examination_sessions.session_name. */
		session_name?: string | null
		/** Printed session label from the content row, e.g. "NOV / DEC - 2026". */
		session_label?: string | null
		program_code?: string | null
		semester?: number | null
	}
	subject: {
		course_code: string
		title: string
		set_label?: string | null
		max_marks?: number | null
		duration_minutes?: number | null
	}
	/**
	 * Every course this order covers, one table row each. Absent = the single
	 * `subject`. A combined order (one examiner, several papers in a session)
	 * lists them all and goes out as one letter.
	 */
	courses?: OrderCourseRow[]
	assignment: {
		order_ref_no?: string | null
		order_date: string
		valid_from: string
		valid_to: string
		remuneration?: number | null
		/** question_paper | answer_key | both — and the fee of each component. */
		assignment_type?: string | null
		qp_fee?: number | null
		ak_fee?: number | null
		portal_url: string
	}
	content: QpPortalContent
	pdf_settings: PdfInstitutionSettings | null
}

/** Images the renderer draws; all optional, all already data URIs. */
export interface OrderAssets {
	logoBase64: string | null
	secondaryLogoBase64: string | null
	/** Logo inside the college's framed letterhead block. */
	letterheadLogoBase64?: string | null
	/** Scanned signature of the issuing authority, printed above the sign line. */
	authoritySignatureBase64?: string | null
}

/**
 * The college's own framed letterhead — the block printed at the top of its
 * question papers (logo at the left, coloured name / affiliation / address lines
 * centred beside it). Returns '' for a college that has no boxed letterhead, and
 * the caller falls back to the generic logo + name header.
 */
function boxedLetterheadHtml(institutionCode: string, logoBase64: string | null): string {
	const lh = getJkknLetterhead(institutionCode)
	if (!isBoxedLetterhead(lh)) return ''
	return `<div class="lh">
		${logoBase64 ? `<div class="lh-logo"><img src="${logoBase64}" alt="" /></div>` : ''}
		<div class="lh-text">
			${lh!.lines!.map(l => `<div class="${l.cls}">${escapeHtml(l.text)}</div>`).join('')}
		</div>
	</div>`
}

/** The `.lh*` rules for the letterhead, at full letter size. */
const LETTERHEAD_CSS = `
	/* Letterhead: logo at the left, the college's coloured name block centred — no frame,
	   unlike the question paper (lib/ia/build-paper-pdf-html.ts), which keeps its box. */
	.lh { display: flex; align-items: center; gap: 3mm; padding: 1.5mm 0; }
	.lh-logo img { height: 16mm; width: auto; }
	.lh-text { flex: 1; text-align: center; }
	.lh-name { color: #1a7a3c; font-weight: bold; font-size: 12.5pt; line-height: 1.15; }
	.lh-trust { color: #e6007e; font-weight: bold; font-size: 9.5pt; }
	.lh-approve { font-weight: bold; font-size: 8.5pt; }
	.lh-naac { color: #e6007e; font-weight: bold; font-size: 8.5pt; }
	.lh-addr { font-weight: bold; font-size: 8.5pt; }
	.lh-web { font-size: 8pt; color: #1a4fd6; text-decoration: underline; }
`

// ── Order HTML ──────────────────────────────────────────────────────────────

/**
 * The appointment's components and fees. Kept for callers that print the
 * particulars as label/value rows (the order itself now prints a fee line).
 */
export function assignmentRows(a: ExaminerOrderData['assignment']): [string, string][] {
	const money = (v: number | null | undefined) => `Rs. ${Number(v || 0).toFixed(2)}`
	const type = a.assignment_type || 'question_paper'
	const rows: [string, string][] = []
	if (type === 'both') {
		rows.push(['Assignment', 'Question Paper Setting and Answer Key'])
		rows.push(['Question Paper Setting', `${money(a.qp_fee)} per question paper`])
		rows.push(['Answer Key', `${money(a.ak_fee)} per question paper`])
		rows.push([
			'Potential Claim',
			`${money(a.remuneration ?? Number(a.qp_fee || 0) + Number(a.ak_fee || 0))} — payable for the parts you accept in the portal`,
		])
	} else if (type === 'answer_key') {
		rows.push(['Assignment', 'Answer Key'])
		rows.push(['Remuneration', `${money(a.remuneration ?? a.ak_fee)} per answer key`])
	} else {
		rows.push(['Assignment', 'Question Paper Setting'])
		if (a.remuneration || a.qp_fee) rows.push(['Remuneration', `${money(a.remuneration ?? a.qp_fee)} per question paper`])
	}
	return rows
}

export function buildExaminerOrderHtml(
	data: ExaminerOrderData,
	assets: OrderAssets = { logoBase64: null, secondaryLogoBase64: null }
): string {
	const ps = data.pdf_settings
	const c = data.content

	const fontFamily = s(ps, 'font_family', "'Times New Roman', Times, serif")
	const bodySize = s(ps, 'font_size_body', '11.5pt')
	const headingSize = s(ps, 'font_size_heading', '15pt')
	const primary = s(ps, 'primary_color', '#1a365d')
	const border = s(ps, 'border_color', '#111')

	const placeholderValues: Record<string, string> = {
		institution_name: data.institution.name,
		institution_code: data.institution.institution_code,
		exam_name: data.examination.exam_type_name || 'End Semester Examinations',
		date: formatIstDate(data.assignment.order_date),
		address: data.institution.address || '',
		accreditation_text: data.institution.accreditation || '',
	}

	// An institution that has written its own header_html keeps it verbatim;
	// otherwise the standard logo + name + address block is drawn.
	const customHeader = fillPlaceholders(ps?.header_html, placeholderValues)
	const leftLogo = assets.logoBase64
		? `<img src="${assets.logoBase64}" alt="" class="logo" />`
		: ''
	const rightLogo = assets.secondaryLogoBase64
		? `<img src="${assets.secondaryLogoBase64}" alt="" class="logo" />`
		: ''

	// The order is the college's own letterhead paper, so it prints the SAME framed
	// block as its question papers rather than a second, near-miss version of the
	// name and accreditation lines. A college that has written its own header_html
	// still wins; one with no framed letterhead falls back to the generic block.
	const boxed = boxedLetterheadHtml(data.institution.institution_code, assets.letterheadLogoBase64 ?? null)

	const headerHtml =
		customHeader ||
		(boxed
			? boxed
			: `<div class="head-row">
			<div class="head-logo">${leftLogo}</div>
			<div class="head-mid">
				<div class="inst-name">${escapeHtml(data.institution.name.toUpperCase())}</div>
				${data.institution.subtitle ? `<div class="inst-sub">${escapeHtml(data.institution.subtitle)}</div>` : ''}
				${data.institution.trust_line ? `<div class="inst-trust">${escapeHtml(data.institution.trust_line)}</div>` : ''}
				${data.institution.accreditation ? `<div class="inst-accr">${escapeHtml(data.institution.accreditation)}</div>` : ''}
				${data.institution.address ? `<div class="inst-addr">${escapeHtml(data.institution.address)}</div>` : ''}
				<div class="inst-office">OFFICE OF THE CONTROLLER OF EXAMINATIONS</div>
			</div>
			<div class="head-logo">${rightLogo}</div>
		</div>`)

	const footerHtml = fillPlaceholders(ps?.footer_html, placeholderValues)

	const watermark =
		ps?.watermark_enabled && ps?.watermark_url
			? `<div class="watermark" style="opacity:${ps.watermark_opacity ?? 0.1}">
					<img src="${escapeHtml(ps.watermark_url)}" alt="" />
				</div>`
			: ''

	const addressee = [
		data.examiner.designation,
		data.examiner.department,
		data.examiner.institution_name,
		data.examiner.address,
	]
		.filter(Boolean)
		.map(line => `<div>${escapeHtml(String(line).toUpperCase())}</div>`)
		.join('') + (data.examiner.mobile ? `<div>MOBILE: ${escapeHtml(data.examiner.mobile)}</div>` : '')

	const sessionText = (c.session_label || data.examination.session_name || '—').toUpperCase()
	const examName = data.examination.exam_type_name || 'End Semester Examinations'
	const type = data.assignment.assignment_type || 'question_paper'
	const roleCaps =
		type === 'both' ? 'QUESTION PAPER SETTER AND ANSWER KEY PREPARER' : type === 'answer_key' ? 'ANSWER KEY PREPARER' : 'QUESTION PAPER SETTER'
	const subjectLine =
		type === 'both'
			? 'Question Paper Setting and Answer Key Appointment Order'
			: type === 'answer_key'
				? 'Answer Key Preparation Appointment Order'
				: 'Question Paper Setting Appointment Order'

	const romanSem = (n: number | null | undefined) =>
		n ? (['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n)) : '—'
	const courseRows: OrderCourseRow[] =
		data.courses && data.courses.length > 0
			? data.courses
			: [
					{
						semester: data.examination.semester,
						program_code: data.examination.program_code,
						program_name: data.program_name,
						regulation: data.regulation,
						course_code: data.subject.course_code,
						title: data.subject.title,
						set_label: data.subject.set_label,
						max_marks: data.subject.max_marks,
						assignment_type: data.assignment.assignment_type || 'question_paper',
						qp_fee: data.assignment.qp_fee ?? null,
						ak_fee: data.assignment.ak_fee ?? null,
					},
				]
	const multi = courseRows.length > 1
	const noIst = (v: string) => v.replace(/\s*IST$/, '')

	const money = (v: number | null | undefined) => `Rs. ${Number(v || 0).toFixed(2)}`
	// The rates, one line: "Question Paper Setting Rs. 1250.00 + Answer Key
	// Rs. 750.00". Each component appears once if ANY course on the order
	// carries it, at the (institution-wide) per-paper rate.
	// Only what THIS examiner is appointed for: no Answer Key line for a
	// paper-only appointment. On a combined order where only some papers carry
	// the answer key, those papers are named so the line is not read as all.
	const hasQp = (r: OrderCourseRow) => (r.assignment_type || 'question_paper') !== 'answer_key'
	const hasAk = (r: OrderCourseRow) => (r.assignment_type || 'question_paper') !== 'question_paper'
	const qpCourses = courseRows.filter(hasQp)
	const akCourses = courseRows.filter(hasAk)
	const qpRate = qpCourses.map(r => r.qp_fee).find(v => v != null) ?? data.assignment.qp_fee ?? null
	const akRate = akCourses.map(r => r.ak_fee).find(v => v != null) ?? data.assignment.ak_fee ?? null
	const only = (list: OrderCourseRow[]) =>
		multi && list.length > 0 && list.length < courseRows.length ? ` (${list.map(r => r.course_code).join(', ')} only)` : ''
	const feeParts = [
		qpCourses.length && qpRate != null ? `Question Paper Setting ${money(qpRate)}${only(qpCourses)}` : null,
		akCourses.length && akRate != null ? `Answer Key ${money(akRate)}${only(akCourses)}` : null,
	].filter(Boolean)
	const feeLine = feeParts.length ? `Remuneration: ${feeParts.join(' + ')}` : ''

	// Instructions: the two fixed portal points first (acceptance and the dates),
	// then the CoE's own clauses, then the fee line.
	const instructions: string[] = [
		`The question paper setter is requested to record his / her acceptance of this appointment in the Examiner Portal (<span class="mono">${escapeHtml(
			data.assignment.portal_url
		)}</span>) by signing in with the registered e-mail address <strong>${escapeHtml(data.examiner.email)}</strong>.`,
		`${multi ? 'Each question paper' : 'The question paper'} must be entered in the Examiner Portal in the prescribed format and submitted online.
			<div class="dates">
				<div><span>Question paper${multi ? 's' : ''} available from</span><span>: ${escapeHtml(noIst(formatIst(data.assignment.valid_from)))}</span></div>
				<div><span>Last date for receipt of the question paper${multi ? 's' : ''}</span><span>: ${escapeHtml(noIst(formatIst(data.assignment.valid_to)))}</span></div>
			</div>`,
		...(c.body || []).map(
			clause => `${escapeHtml(clause.text)}${clause.note ? ` <span class="note">(${escapeHtml(clause.note)})</span>` : ''}`
		),
		...(feeLine ? [escapeHtml(feeLine)] : []),
	]

	const signatureEnabled = ps?.signature_section_enabled ?? true
	const signatoryDesignation = (c.signatory_designation || 'Controller of Examinations').toUpperCase()

	// The signature block: a scanned signature when available, else a ruled
	// space. The CET scan already carries name and designation, so the typed
	// designation is dropped whenever an image is used.
	const authoritySignature = assets.authoritySignatureBase64
		? `<img class="sign-img" src="${assets.authoritySignatureBase64}" alt="" />`
		: '<div class="sign-space"></div>'
	const signatoryLines = assets.authoritySignatureBase64 ? '' : `<div class="sign-title">${escapeHtml(signatoryDesignation)}</div>`

	const coe = data.coe || {}
	const coeRow =
		coe.name || coe.email
			? `<div class="coe-row">
			<div>
				${coe.name ? `<div class="coe-name">${escapeHtml(coe.name)}</div>` : ''}
				<div>${escapeHtml(coe.designation || 'Controller of Examinations')}</div>
			</div>
			<div class="coe-contact">
				${coe.email ? `<div>E-mail : ${escapeHtml(coe.email)}</div>` : ''}
			</div>
		</div>`
			: ''

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
	@page { size: ${s(ps, 'paper_size', 'A4')} ${s(ps, 'orientation', 'portrait')}; }
	* { box-sizing: border-box; }
	/* One page: the letter format is dense by design — letterhead, officer line,
	   reference, address, subject, one table, numbered points, signature, enclosures. */
	body { font-family: ${fontFamily}; font-size: 10.5pt; color: #000; margin: 0; line-height: 1.4; }
	.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: -1; }
	.watermark img { max-width: 60%; max-height: 60%; }
	.head-row { display: flex; align-items: center; gap: 10px; }
	.head-logo { width: 74px; flex: 0 0 74px; text-align: center; }
	.logo { width: 70px; height: 70px; object-fit: contain; }
	.head-mid { flex: 1; text-align: center; }
	.inst-name { font-size: ${headingSize}; font-weight: bold; color: ${primary}; line-height: 1.25; }
	.inst-sub { font-size: 9.5pt; font-weight: bold; margin-top: 1px; }
	.inst-trust { font-size: 8.5pt; margin-top: 1px; }
	.inst-accr { font-size: 8.5pt; font-style: italic; margin-top: 2px; }
	.inst-addr { font-size: 10pt; font-weight: bold; margin-top: 2px; }
	.inst-office { font-size: 11pt; font-weight: bold; letter-spacing: 0.4px; margin-top: 5px; }
${LETTERHEAD_CSS}
	hr.rule { border: none; border-top: 1.5px solid #000; margin: 5px 0 4px; }
	.coe-row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 9.5pt; font-weight: bold; padding-bottom: 3px; border-bottom: 1px solid #000; }
	.coe-contact { text-align: right; }
	.refrow { display: flex; justify-content: space-between; font-size: 10pt; font-weight: bold; margin: 5px 0 10px; }
	.addressee { margin: 0 0 8px; }
	.addressee .to { font-weight: bold; }
	.addressee .block { margin-left: 28px; font-weight: bold; font-size: 9.5pt; line-height: 1.3; }
	.salute { margin: 0 0 6px; }
	.sub { display: flex; gap: 10px; margin: 0 0 10px 40px; }
	.sub .k { font-weight: bold; flex: 0 0 34px; }
	.sub .v { flex: 1; text-align: justify; }
	p.body { margin: 0 0 8px; text-align: justify; text-indent: 28px; }
	table.courses { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9.5pt; }
	table.courses th, table.courses td { border: 1px solid #000; padding: 4px 5px; text-align: center; vertical-align: middle; }
	table.courses th { font-weight: normal; }
	table.courses td.l { text-align: left; }
	ol.points { margin: 0 0 6px; padding-left: 18px; }
	ol.points li { margin-bottom: 3px; text-align: justify; }
	ol.points .note { font-style: italic; font-size: 9pt; }
	.mono { font-family: ${fontFamily}; font-weight: bold; }
	.dates { margin: 3px 0 0 40px; }
	.dates div { display: flex; }
	.dates span:first-child { flex: 0 0 300px; }
	.close { margin: 6px 0 0; }
	.sign-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px; }
	.encl { font-size: 9.5pt; display: flex; gap: 14px; }
	.encl .k { font-weight: bold; }
	.encl ol { margin: 0; padding-left: 16px; }
	.sign-inner { text-align: center; min-width: 210px; }
	.sign-space { height: 40px; }
	.sign-title { font-weight: bold; font-size: 10pt; }
	.sign-img { display: block; margin: 0 auto; max-width: 190pt; max-height: 72pt; object-fit: contain; }
	.footer-note { margin-top: 8px; font-size: 8.5pt; font-style: italic; text-align: center; color: #333; }
	.inst-footer { margin-top: 6px; font-size: 8.5pt; text-align: center; color: #444; }
</style></head>
<body>
	${watermark}
	${headerHtml}
	${coeRow}

	<div class="refrow">
		<div>Ref.No : ${escapeHtml(data.assignment.order_ref_no || c.letter_ref || '—')}</div>
		<div>Date : ${escapeHtml(formatIstDate(data.assignment.order_date))}</div>
	</div>

	<div class="addressee">
		<div class="to">To</div>
		<div class="block">
			<div>${escapeHtml(data.examiner.full_name.toUpperCase())}</div>
			${addressee}
		</div>
	</div>

	<div class="salute">Sir/Madam</div>

	<div class="sub">
		<div class="k">Sub:</div>
		<div class="v">${escapeHtml(examName)} — ${escapeHtml(sessionText)} — ${escapeHtml(subjectLine)} — Reg.</div>
	</div>

	<p class="body">${escapeHtml(
		c.intro_text ||
			`We wish to inform that you are appointed as ${roleCaps} for the ${examName} to be held in ${sessionText} under the autonomous scheme of this college. The ${multi ? 'details of the courses' : 'course details'} are as mentioned below.`
	)}</p>

	<table class="courses">
		<thead><tr>
			<th>S.No</th><th>Sem</th><th>Programme</th><th>Regulation</th><th>Course Code</th><th>Name of the Course</th><th>Max.<br />Marks</th><th>No. of<br />Q.P Set</th>
		</tr></thead>
		<tbody>${courseRows
			.map(
				(r, i) => `<tr>
			<td>${i + 1}</td>
			<td>${escapeHtml(romanSem(r.semester))}</td>
			<td>${escapeHtml(r.program_code || r.program_name || '—')}</td>
			<td>${escapeHtml(r.regulation || '—')}</td>
			<td>${escapeHtml(r.course_code)}${r.set_label ? `<br />(Set ${escapeHtml(r.set_label)})` : ''}</td>
			<td class="l">${escapeHtml(r.title)}</td>
			<td>${escapeHtml(String(r.max_marks ?? '—'))}</td>
			<td>1</td>
		</tr>`
			)
			.join('')}</tbody>
	</table>

	<ol class="points">${instructions.map(i => `<li>${i}</li>`).join('')}</ol>

	<p class="close">We eagerly look forward to your kind co-operation for the smooth and successful conduct of the examinations.</p>

	<div class="sign-row">
		<div class="encl">
			<div class="k">Encl.:</div>
			<ol>
				<li>Syllabus</li>
				<li>Claim form</li>
				<li>Guidelines</li>
				<li>Q.P. Check List</li>
			</ol>
			<div style="align-self:flex-end;font-size:8.5pt;color:#333;">— all available in the Examiner Portal</div>
		</div>
		${
			signatureEnabled
				? `<div class="sign-inner">
					${authoritySignature}
					${signatoryLines}
				</div>`
				: ''
		}
	</div>

	${c.footer_note ? `<div class="footer-note">${escapeHtml(c.footer_note)}</div>` : ''}
	${footerHtml ? `<div class="inst-footer">${footerHtml}</div>` : ''}
</body></html>`
}

// ── Claim Form HTML ─────────────────────────────────────────────────────────

export interface ClaimFormData extends ExaminerOrderData {
	bank: {
		account_holder?: string | null
		bank_name?: string | null
		account_number?: string | null
		branch?: string | null
		ifsc?: string | null
	}
	/**
	 * Data URI of the examiner's signature, or null. The signature given for THIS
	 * submission (drawn or attached in the wizard) is preferred; the specimen on
	 * the profile is the fallback.
	 */
	signatureBase64?: string | null
	/** When the submission signature was given; printed under it. */
	signed_at?: string | null
	claim_date?: string | null
	/**
	 * Every paper this examiner has claimed in the SAME examination session,
	 * the current one included. One claim form per session: a second paper
	 * set later joins the same form rather than producing a second one.
	 */
	papers?: ClaimPaper[]
}

export interface ClaimPaper {
	course_code: string
	title: string
	program_code?: string | null
	semester?: number | null
	set_label?: string | null
	rate?: number | null
	/** "Question Paper + Answer Key" / "Question Paper" / "Answer Key" — what was accepted. */
	work?: string | null
	claim_submitted_at?: string | null
}

export function buildClaimFormHtml(
	data: ClaimFormData,
	assets: OrderAssets = {
		logoBase64: null,
		secondaryLogoBase64: null,
	}
): string {
	const ps = data.pdf_settings
	const c = data.content
	const fontFamily = s(ps, 'font_family', "'Times New Roman', Times, serif")
	const primary = s(ps, 'primary_color', '#1a365d')

	// The accepted claim for THIS paper wins over the content's flat rate and the
	// order's potential figure — an examiner who declined the answer key is paid
	// for the paper alone.
	const thisPaper = (data.papers || []).find(p => p.course_code === data.subject.course_code)
	const rate = thisPaper?.rate ?? c.rate_per_paper ?? data.assignment.remuneration ?? null
	const rateWords = c.rate_in_words || ''

	const leftLogo = assets.logoBase64 ? `<img src="${assets.logoBase64}" class="logo" alt="" />` : ''
	const rightLogo = assets.secondaryLogoBase64
		? `<img src="${assets.secondaryLogoBase64}" class="logo" alt="" />`
		: ''

	const bankRows: [string, string][] = [
		['Name of Account Holder', data.bank.account_holder || '—'],
		['Bank Name', data.bank.bank_name || '—'],
		['Account Number', data.bank.account_number || '—'],
		['Branch', data.bank.branch || '—'],
		['IFSC', data.bank.ifsc || '—'],
	]

	const money = (v: number | null | undefined) => (v != null ? `Rs. ${Number(v).toFixed(2)}` : '—')

	// The papers claimed in this session. A caller that did not gather siblings
	// still gets a one-paper form.
	const papers: ClaimPaper[] =
		data.papers && data.papers.length > 0
			? data.papers
			: [
					{
						course_code: data.subject.course_code,
						title: data.subject.title,
						program_code: data.examination.program_code,
						semester: data.examination.semester,
						set_label: data.subject.set_label,
						rate,
					},
				]
	const total = papers.reduce((sum, p) => sum + Number(p.rate ?? rate ?? 0), 0)
	const multi = papers.length > 1

	const claimRows: [string, string][] = [
		['Examination', data.examination.exam_type_name || 'End Semester Examinations'],
		['Session', c.session_label || data.examination.session_name || '—'],
		...((multi
			? []
			: [
					['Subject Code', data.subject.course_code],
					['Subject Title', data.subject.title],
					...(data.subject.set_label ? [['Set', data.subject.set_label]] : []),
				]) as [string, string][]),
		['Number of Question Papers Set', String(papers.length)],
		...((multi
			? []
			: [
					['Work Accepted', thisPaper?.work || 'Question Paper'],
					['Amount for this Question Paper', money(rate)],
				]) as [string, string][]),
		['Total Amount Claimed', money(total)],
		...((rateWords && !multi ? [['Amount in Words', rateWords]] : []) as [string, string][]),
	]

	const row = ([label, value]: [string, string]) =>
		`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`

	// With more than one paper, the papers get their own table between the
	// session lines and the totals.
	const papersTable = multi
		? `<table class="grid papers">
		<thead><tr>
			<th class="n">S.No</th><th>Subject Code</th><th class="t">Subject Title</th><th>Programme / Sem</th><th>Work</th><th class="r">Amount</th>
		</tr></thead>
		<tbody>${papers
			.map(
				(p, i) => `<tr>
			<td class="n">${i + 1}</td>
			<td>${escapeHtml(p.course_code)}${p.set_label ? ` (Set ${escapeHtml(p.set_label)})` : ''}</td>
			<td class="t">${escapeHtml(p.title)}</td>
			<td>${escapeHtml([p.program_code, p.semester ? `Sem ${p.semester}` : null].filter(Boolean).join(' / ') || '—')}</td>
			<td>${escapeHtml(p.work || 'Question Paper')}</td>
			<td class="r">${escapeHtml(money(p.rate ?? rate))}</td>
		</tr>`
			)
			.join('')}</tbody>
	</table>`
		: ''

	// The claim goes out on the same letterhead as the order: the college's
	// framed block when it has one, the generic logo + name header otherwise.
	const boxed = boxedLetterheadHtml(data.institution.institution_code, assets.letterheadLogoBase64 ?? null)
	const header = boxed
		? boxed
		: `<div class="head-row">
		<div class="head-logo">${leftLogo}</div>
		<div class="head-mid">
			<div class="inst-name">${escapeHtml(data.institution.name.toUpperCase())}</div>
			${data.institution.address ? `<div class="inst-addr">${escapeHtml(data.institution.address)}</div>` : ''}
			<div class="inst-office">OFFICE OF THE CONTROLLER OF EXAMINATIONS</div>
		</div>
		<div class="head-logo">${rightLogo}</div>
	</div>`

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
	@page { size: A4 portrait; }
	/* One page. Everything below is sized so the framed letterhead, three
	   tables, the certification and the office box fit A4 with 15mm margins. */
	body { font-family: ${fontFamily}; font-size: 10pt; color: #000; margin: 0; line-height: 1.35; }
	${LETTERHEAD_CSS}
	.head-row { display: flex; align-items: center; gap: 10px; }
	.head-logo { width: 74px; flex: 0 0 74px; text-align: center; }
	.logo { width: 70px; height: 70px; object-fit: contain; }
	.head-mid { flex: 1; text-align: center; }
	.inst-name { font-size: 14pt; font-weight: bold; color: ${primary}; }
	.inst-sub { font-size: 9.5pt; font-weight: bold; margin-top: 1px; }
	.inst-trust { font-size: 8.5pt; margin-top: 1px; }
	.inst-accr { font-size: 8.5pt; font-style: italic; margin-top: 2px; }
	.inst-addr { font-size: 10pt; font-weight: bold; margin-top: 2px; }
	.inst-office { font-size: 10.5pt; font-weight: bold; margin-top: 4px; }
	hr.rule { border: none; border-top: 2px solid ${primary}; margin: 5px 0 8px; }
	.title { text-align: center; font-weight: bold; font-size: 12pt; text-decoration: underline; margin: 2px 0 8px; }
	table.grid { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
	table.grid th, table.grid td { border: 1px solid #111; padding: 3px 7px; font-size: 9.5pt; text-align: left; }
	table.grid th { width: 40%; background: #f4f4f4; font-weight: bold; }
	table.grid + table.papers, table.papers + table.grid { margin-top: -4px; }
	table.papers th { width: auto; text-align: left; }
	table.papers th.n, table.papers td.n { width: 8%; text-align: center; }
	table.papers th.t { width: 42%; }
	table.papers th.r, table.papers td.r { width: 16%; text-align: right; white-space: nowrap; }
	.section { font-weight: bold; margin: 0 0 3px; font-size: 10pt; }
	.declare { margin: 6px 0 4px; font-size: 9.5pt; text-align: justify; }
	.sign-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px; }
	.date-cell { font-size: 9.5pt; padding-bottom: 6px; }
	.sign-cell { text-align: center; min-width: 200px; }
	.sign-img { height: 44px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto; }
	.sign-rule { border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; font-size: 9.5pt; }
	.pad { padding-top: 44px; }
	.sign-when { font-size: 8pt; color: #444; margin-top: 1px; }
	/* Office box — the CoE's own verification, on the same sheet. */
	.office { border: 1px solid #000; margin-top: 10px; padding: 6px 9px 8px; page-break-inside: avoid; }
	.office-title { text-align: center; font-weight: bold; font-size: 10pt; margin-bottom: 4px; }
	.office-text { margin: 0; font-size: 9.5pt; text-align: justify; }
	.office-verified { text-align: center; font-weight: bold; font-size: 9.5pt; margin-top: 6px; }
	.office-signs { display: flex; justify-content: space-between; margin-top: 30px; font-size: 9.5pt; }
	.office-sign { min-width: 170px; text-align: center; border-top: 1px solid #000; padding-top: 3px; }
</style></head>
<body>
	${header}

	<div class="title">${escapeHtml(c.title || 'Claim Form — Question Paper Setting')}</div>

	<div class="section">1. Examiner Particulars</div>
	<table class="grid">
		${row(['Name', data.examiner.full_name])}
		${row(['Designation', data.examiner.designation || '—'])}
		${row(['Department', data.examiner.department || '—'])}
		${row(['Institution', data.examiner.institution_name || '—'])}
		${row(['E-mail', data.examiner.email])}
		${row(['Mobile Number', data.examiner.mobile || '—'])}
		${row(['Examiner Type', data.examiner.kind === 'internal' ? 'Internal Examiner' : 'External Examiner'])}
	</table>

	<div class="section">2. Work Claimed</div>
	${
		multi
			? `<table class="grid">${claimRows.slice(0, 2).map(row).join('')}</table>
	${papersTable}
	<table class="grid">${claimRows.slice(2).map(row).join('')}</table>`
			: `<table class="grid">${claimRows.map(row).join('')}</table>`
	}

	<div class="section">3. Bank Details for Payment</div>
	<table class="grid">${bankRows.map(row).join('')}</table>

	<div class="declare">${escapeHtml(
		c.footer_note ||
			'I certify that the above particulars are true and that I have set the question paper(s) claimed for.'
	)}</div>

	<div class="sign-row">
		<div class="date-cell">Date: ${escapeHtml(formatIstDate(data.claim_date || new Date().toISOString()))}</div>
		<div class="sign-cell">
			${
				data.signatureBase64
					? `<img class="sign-img" src="${data.signatureBase64}" alt="" />`
					: '<div class="pad"></div>'
			}
			<div class="sign-rule">Signature of the Examiner<br />${escapeHtml(data.examiner.full_name)}</div>
			${
				data.signatureBase64 && data.signed_at
					? `<div class="sign-when">Signed digitally on ${escapeHtml(formatIstDate(data.signed_at))}</div>`
					: ''
			}
		</div>
	</div>

	<div class="office">
		<div class="office-title">For Office Use Only</div>
		<p class="office-text">
			Certified that the claim mentioned above has been verified and found correct and the bill may be
			passed for payment.
		</p>
		<div class="office-verified">Verified By</div>
		<div class="office-signs">
			<div class="office-sign">Deputy COE</div>
			<div class="office-sign">CONTROLLER OF EXAMINATIONS</div>
		</div>
	</div>
</body></html>`
}

// ── Rendering ───────────────────────────────────────────────────────────────

async function renderPdf(html: string, ps: PdfInstitutionSettings | null): Promise<Buffer> {
	const browser = await launchHeadlessBrowser()

	try {
		const page = await browser.newPage()
		await page.setContent(html, { waitUntil: 'domcontentloaded' })
		const pdf = await page.pdf({
			format: (ps?.paper_size || 'A4') as 'A4' | 'Letter' | 'Legal',
			landscape: (ps?.orientation || 'portrait') === 'landscape',
			printBackground: true,
			margin: {
				top: s(ps, 'margin_top', '15mm'),
				bottom: s(ps, 'margin_bottom', '15mm'),
				left: s(ps, 'margin_left', '15mm'),
				right: s(ps, 'margin_right', '15mm'),
			},
		})
		return Buffer.from(pdf)
	} finally {
		await browser.close()
	}
}

/**
 * The letterhead marks.
 *
 * pdf_institution_settings wins when a college has configured one, but most have
 * not — so the per-institution branding config (lib/utils/institution-header.ts,
 * the same source the hall ticket and the mark reports use) is the fallback.
 * Without it an order for a college with no settings row printed no logo at all.
 */
async function loadLogos(
	ps: PdfInstitutionSettings | null,
	fallbackLogoPath?: string | null
) {
	const [logoBase64, secondaryLogoBase64] = await Promise.all([
		urlToBase64(ps?.logo_url || fallbackLogoPath),
		urlToBase64(ps?.secondary_logo_url),
	])
	return { logoBase64, secondaryLogoBase64 }
}

/**
 * The framed letterhead's own logo and the issuing authority's scanned signature,
 * both read straight off public/ so they survive into headless Chromium.
 */
function loadLetterheadAssets(institutionCode: string) {
	const lh = getJkknLetterhead(institutionCode)
	return {
		letterheadLogoBase64: isBoxedLetterhead(lh) ? loadPublicImageDataUri(lh!.logoFile) : null,
		authoritySignatureBase64: loadPublicImageDataUri(lh?.signatureFile),
	}
}

export async function generateExaminerOrderPdf(data: ExaminerOrderData): Promise<Buffer> {
	const logos = await loadLogos(data.pdf_settings, data.institution.logo_path)
	const assets: OrderAssets = { ...logos, ...loadLetterheadAssets(data.institution.institution_code) }
	return renderPdf(buildExaminerOrderHtml(data, assets), data.pdf_settings)
}

export async function generateClaimFormPdf(data: ClaimFormData): Promise<Buffer> {
	const logos = await loadLogos(data.pdf_settings, data.institution.logo_path)
	const assets: OrderAssets = { ...logos, ...loadLetterheadAssets(data.institution.institution_code) }
	return renderPdf(buildClaimFormHtml(data, assets), data.pdf_settings)
}

// ── Consolidated claim report ───────────────────────────────────────────────

export interface ClaimReportExaminer {
	full_name: string
	designation?: string | null
	department?: string | null
	institution_name?: string | null
	email?: string | null
	mobile?: string | null
	bank?: {
		account_holder?: string | null
		bank_name?: string | null
		account_number?: string | null
		branch?: string | null
		ifsc?: string | null
	} | null
	/** Claimed papers only. */
	papers: { course_code: string; title: string; qp_amount: number; ak_amount: number }[]
}

export interface ClaimReportData {
	institution: { name: string; institution_code: string }
	session_name: string
	examiners: ClaimReportExaminer[]
}

/**
 * Every examiner's claim for the session on one statement: who, the account to
 * pay, the papers claimed with the question paper / answer key split, and the
 * total per examiner. Landscape, on the college letterhead, the examination
 * session under it.
 */
export function buildClaimReportHtml(data: ClaimReportData, letterheadLogoBase64: string | null): string {
	const money = (n: number) => (n ? Number(n).toLocaleString('en-IN') : '0')
	const lines = (parts: (string | null | undefined)[]) =>
		parts.filter(p => p && String(p).trim()).map(p => `<div>${escapeHtml(p)}</div>`).join('')

	const boxed = boxedLetterheadHtml(data.institution.institution_code, letterheadLogoBase64)
	const header = boxed || `<div class="plain-name">${escapeHtml(data.institution.name.toUpperCase())}</div>`

	let grandQp = 0
	let grandAk = 0
	const body = data.examiners
		.map((e, i) => {
			const span = Math.max(e.papers.length, 1)
			const total = e.papers.reduce((t, p) => t + p.qp_amount + p.ak_amount, 0)
			grandQp += e.papers.reduce((t, p) => t + p.qp_amount, 0)
			grandAk += e.papers.reduce((t, p) => t + p.ak_amount, 0)
			const particulars = `<div class="nm">${escapeHtml(e.full_name)}</div>${lines([
				[e.designation, e.department].filter(Boolean).join(', '), e.institution_name, e.email, e.mobile,
			])}`
			const bank = e.bank
				? lines([
						e.bank.account_holder,
						e.bank.bank_name,
						e.bank.account_number ? `A/c ${e.bank.account_number}` : null,
						e.bank.branch,
						e.bank.ifsc ? `IFSC ${e.bank.ifsc}` : null,
					])
				: '—'
			const papers = e.papers.length ? e.papers : [{ course_code: '—', title: '—', qp_amount: 0, ak_amount: 0 }]
			return `<tbody class="grp">${papers
				.map(
					(p, j) => `<tr>
				${j === 0 ? `<td class="c" rowspan="${span}">${i + 1}</td><td rowspan="${span}">${particulars}</td><td rowspan="${span}">${bank}</td>` : ''}
				<td class="c nw">${escapeHtml(p.course_code)}</td>
				<td>${escapeHtml(p.title)}</td>
				<td class="r">${money(p.qp_amount)}</td>
				<td class="r">${money(p.ak_amount)}</td>
				${j === 0 ? `<td class="r b" rowspan="${span}">${money(total)}</td>` : ''}
			</tr>`
				)
				.join('')}</tbody>`
		})
		.join('')

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
	* { box-sizing: border-box; }
	body { font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; margin: 0; }
	${LETTERHEAD_CSS}
	.lh { border-bottom: 1pt solid #000; padding-bottom: 2mm; }
	.plain-name { text-align: center; font-weight: bold; font-size: 14pt; border-bottom: 1pt solid #000; padding-bottom: 2mm; }
	.office { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 2.5mm; }
	.session { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 1mm; }
	.title { text-align: center; font-weight: bold; font-size: 11.5pt; margin: 1mm 0 3mm; text-decoration: underline; }
	table { width: 100%; border-collapse: collapse; }
	thead { display: table-header-group; }
	tbody.grp { break-inside: avoid; page-break-inside: avoid; }
	th, td { border: 0.7pt solid #000; padding: 1mm 2mm; vertical-align: middle; }
	th { font-size: 9.5pt; text-align: center; background: #eee; }
	td { font-size: 9.5pt; line-height: 1.22; }
	.nm { font-weight: bold; }
	.c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; } .nw { white-space: nowrap; }
	tr.total td { font-weight: bold; background: #f4f4f4; }
	.sign { display: flex; justify-content: space-between; margin-top: 16mm; font-weight: bold; font-size: 10pt; break-inside: avoid; }
	.sign div { min-width: 55mm; text-align: center; }
</style></head><body>
	${header}
	<div class="office">OFFICE OF THE CONTROLLER OF EXAMINATIONS</div>
	<div class="session">END SEMESTER EXAMINATIONS – ${escapeHtml(data.session_name)}</div>
	<div class="title">CONSOLIDATED CLAIM REPORT – QUESTION PAPER SETTING</div>
	<table>
		<colgroup>
			<col style="width:5%" /><col style="width:24%" /><col style="width:19%" /><col style="width:9%" />
			<col style="width:19%" /><col style="width:8%" /><col style="width:7%" /><col style="width:9%" />
		</colgroup>
		<thead><tr>
			<th>S.No</th><th>Examiner Particulars</th><th>Bank Details for Payment</th><th>Subject Code</th>
			<th>Subject Name</th><th>Question Paper (Rs.)</th><th>Answer Key (Rs.)</th><th>Total Amount Claimed (Rs.)</th>
		</tr></thead>
		${body || '<tbody><tr><td colspan="8" class="c">No claim has been submitted in this session.</td></tr></tbody>'}
		<tbody><tr class="total">
			<td colspan="5" class="r">Grand Total</td>
			<td class="r">${money(grandQp)}</td><td class="r">${money(grandAk)}</td><td class="r">${money(grandQp + grandAk)}</td>
		</tr></tbody>
	</table>
	<div class="sign"><div>Prepared by</div><div>Deputy Controller of Examinations</div><div>Controller of Examinations</div></div>
</body></html>`
}

export async function generateClaimReportPdf(data: ClaimReportData): Promise<Buffer> {
	const { letterheadLogoBase64 } = loadLetterheadAssets(data.institution.institution_code)
	const html = buildClaimReportHtml(data, letterheadLogoBase64)
	return renderPdf(html, {
		paper_size: 'A4',
		orientation: 'landscape',
		margin_top: '10mm',
		margin_bottom: '10mm',
		margin_left: '10mm',
		margin_right: '10mm',
	} as PdfInstitutionSettings)
}

/** File name for a saved order / claim, safe on every OS. */
export function orderFilename(prefix: string, courseCode: string, examinerName: string): string {
	const slug = (v: string) => v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
	return `${prefix}_${slug(courseCode)}_${slug(examinerName)}.pdf`
}
