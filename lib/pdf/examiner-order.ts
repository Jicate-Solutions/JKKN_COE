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
		kind: 'internal' | 'external'
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
	assignment: {
		order_ref_no?: string | null
		order_date: string
		valid_from: string
		valid_to: string
		remuneration?: number | null
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

/** The `.lh*` rules for the framed letterhead, at full letter size. */
const LETTERHEAD_CSS = `
	/* Framed letterhead: logo at the left, the college's coloured name block centred.
	   Mirrors the question paper (lib/ia/build-paper-pdf-html.ts) at letter size. */
	.lh { display: flex; align-items: center; gap: 3mm; border: 0.8pt solid #000; padding: 1.5mm 2mm; }
	.lh-logo img { height: 16mm; width: auto; }
	.lh-text { flex: 1; text-align: center; }
	.lh-name { color: #1a7a3c; font-weight: bold; font-size: 12.5pt; line-height: 1.15; }
	.lh-trust { color: #e6007e; font-weight: bold; font-size: 9.5pt; }
	.lh-approve { font-weight: bold; font-size: 8.5pt; }
	.lh-naac { color: #e6007e; font-weight: bold; font-size: 8.5pt; }
	.lh-addr { font-weight: bold; font-size: 8.5pt; }
	.lh-web { font-size: 8pt; color: #1a4fd6; text-decoration: underline; }
	.lh-office { text-align: center; font-weight: bold; font-size: 11pt; letter-spacing: 0.4px; margin-top: 4px; }
`

// ── Order HTML ──────────────────────────────────────────────────────────────

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
			? `${boxed}<div class="lh-office">OFFICE OF THE CONTROLLER OF EXAMINATIONS</div>`
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
		.map(line => `<div>${escapeHtml(line as string)}</div>`)
		.join('')

	const sessionText =
		c.session_label || data.examination.session_name || data.examination.exam_type_name || '—'

	const duration = data.subject.duration_minutes
		? `${(data.subject.duration_minutes / 60).toFixed(data.subject.duration_minutes % 60 === 0 ? 0 : 1)} hours`
		: '—'

	const particulars: [string, string][] = [
		['Examination', data.examination.exam_type_name || 'End Semester Examinations'],
		['Session', sessionText],
		[
			'Programme / Semester',
			[data.examination.program_code, data.examination.semester ? `Semester ${data.examination.semester}` : null]
				.filter(Boolean)
				.join(' — ') || '—',
		],
		['Subject Code', data.subject.course_code],
		['Subject Title', data.subject.title],
		...((data.subject.set_label ? [['Question Paper Set', data.subject.set_label]] : []) as [string, string][]),
		[
			'Maximum Marks / Duration',
			`${data.subject.max_marks ?? '—'} marks · ${duration}`,
		],
		['Examiner Type', data.examiner.kind === 'internal' ? 'Internal Examiner' : 'External Examiner'],
		['Question Paper Available From', formatIst(data.assignment.valid_from)],
		['Submission Deadline', formatIst(data.assignment.valid_to)],
		...((data.assignment.remuneration
			? [['Remuneration', `Rs. ${Number(data.assignment.remuneration).toFixed(2)} per question paper`]]
			: []) as [string, string][]),
	]

	const particularRows = particulars
		.map(
			([label, value]) =>
				`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
		)
		.join('')

	const terms = (c.body || [])
		.map(clause => `<li>${escapeHtml(clause.text)}${clause.note ? ` <span class="note">(${escapeHtml(clause.note)})</span>` : ''}</li>`)
		.join('')

	const signatureEnabled = ps?.signature_section_enabled ?? true
	const signatoryDesignation = c.signatory_designation || 'Controller of Examinations'

	// The signature block, following the BoS call letter: when a scanned signature
	// is available it is drawn in place of the blank ruled space. The CET scan is
	// the Principal's and already carries the name, the designation and the college
	// beneath the squiggle, so printing a typed designation under it would
	// contradict the stamp — the typed lines are dropped whenever an image is used.
	const authoritySignature = assets.authoritySignatureBase64
		? `<img class="sign-img" src="${assets.authoritySignatureBase64}" alt="" />`
		: '<div class="sign-rule"></div>'
	const signatoryLines = assets.authoritySignatureBase64
		? ''
		: `${c.signatory_name ? `<div class="sign-name">${escapeHtml(c.signatory_name)}</div>` : ''}
					<div>${escapeHtml(signatoryDesignation)}</div>`

	return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
	@page { size: ${s(ps, 'paper_size', 'A4')} ${s(ps, 'orientation', 'portrait')}; }
	* { box-sizing: border-box; }
	body {
		font-family: ${fontFamily};
		font-size: ${bodySize};
		color: #000;
		margin: 0;
		line-height: 1.5;
	}
	.watermark {
		position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
		z-index: -1;
	}
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
	hr.rule { border: none; border-top: 2px solid ${primary}; margin: 8px 0 12px; }
	.refrow { display: flex; justify-content: space-between; font-size: 10.5pt; margin-bottom: 14px; }
	.order-title {
		text-align: center; font-weight: bold; font-size: 12.5pt;
		text-decoration: underline; text-underline-offset: 3px; margin: 4px 0 14px;
	}
	.subtitle { text-align: center; font-size: 10.5pt; margin: -8px 0 14px; }
	.addressee { margin-bottom: 12px; }
	.addressee .to { font-weight: bold; }
	.addressee .name { font-weight: bold; }
	p.intro { margin: 0 0 12px; text-align: justify; }
	table.particulars { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
	table.particulars th, table.particulars td {
		border: 1px solid ${border}; padding: 5px 8px; font-size: 10.5pt; vertical-align: top;
	}
	table.particulars th { width: 34%; text-align: left; background: #f4f4f4; font-weight: bold; }
	.terms-title { font-weight: bold; margin: 0 0 6px; }
	ol.terms { margin: 0 0 14px; padding-left: 20px; }
	ol.terms li { margin-bottom: 5px; text-align: justify; }
	ol.terms .note { font-style: italic; font-size: 9.5pt; }
	.portal-box {
		border: 1px dashed ${border}; padding: 8px 10px; font-size: 10pt; margin-bottom: 16px;
	}
	.sign-block { margin-top: 26px; display: flex; justify-content: flex-end; text-align: center; }
	.sign-inner { min-width: 220px; }
	.sign-rule { border-top: 1px solid #000; margin-bottom: 4px; padding-top: 34px; }
	.sign-name { font-weight: bold; }
	/* The scanned stamp carries its own name + designation, so it needs no rule.
	   Sized as on the BoS call letter, which prints the same asset. */
	.sign-img { display: block; margin: 2pt 0 0 auto; max-width: 210pt; max-height: 104pt; object-fit: contain; }
${LETTERHEAD_CSS}
	.footer-note { margin-top: 20px; font-size: 9.5pt; font-style: italic; text-align: center; }
	.inst-footer { margin-top: 12px; font-size: 9pt; text-align: center; color: #444; }
</style></head>
<body>
	${watermark}
	${headerHtml}
	<hr class="rule" />

	<div class="refrow">
		<div>${c.letter_ref || data.assignment.order_ref_no ? `Ref: ${escapeHtml(data.assignment.order_ref_no || c.letter_ref || '')}` : ''}</div>
		<div>Date: ${escapeHtml(formatIstDate(data.assignment.order_date))}</div>
	</div>

	<div class="order-title">${escapeHtml(c.title || 'ORDER OF APPOINTMENT — QUESTION PAPER SETTER')}</div>
	${c.subtitle ? `<div class="subtitle">${escapeHtml(c.subtitle)}</div>` : ''}

	<div class="addressee">
		<div class="to">To</div>
		<div class="name">${escapeHtml(data.examiner.full_name)}</div>
		${addressee}
	</div>

	<p class="intro">${escapeHtml(
		c.intro_text ||
			`You are hereby appointed as the ${data.examiner.kind === 'internal' ? 'Internal' : 'External'} Question Paper Setter for the subject detailed below for the ${data.examination.exam_type_name || 'End Semester Examinations'}, ${sessionText}. The particulars of the assignment are as follows.`
	)}</p>

	<table class="particulars">${particularRows}</table>

	${terms ? `<div class="terms-title">Instructions to the Examiner</div><ol class="terms">${terms}</ol>` : ''}

	<div class="portal-box">
		The question paper is to be entered and submitted online through the Examiner Portal at
		<strong>${escapeHtml(data.assignment.portal_url)}</strong>, using your registered e-mail address
		<strong>${escapeHtml(data.examiner.email)}</strong>. Access opens and closes automatically at the
		times shown above (Indian Standard Time).
		${c.contact_email ? `For any clarification, write to <strong>${escapeHtml(c.contact_email)}</strong>.` : ''}
	</div>

	${
		signatureEnabled
			? `<div class="sign-block"><div class="sign-inner">
					${authoritySignature}
					${signatoryLines}
				</div></div>`
			: ''
	}

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

	const rate = c.rate_per_paper ?? data.assignment.remuneration ?? null
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
		...((multi ? [] : [['Rate per Question Paper', money(rate)]]) as [string, string][]),
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
			<th class="n">S.No</th><th>Subject Code</th><th class="t">Subject Title</th><th>Programme / Sem</th><th class="r">Rate</th>
		</tr></thead>
		<tbody>${papers
			.map(
				(p, i) => `<tr>
			<td class="n">${i + 1}</td>
			<td>${escapeHtml(p.course_code)}${p.set_label ? ` (Set ${escapeHtml(p.set_label)})` : ''}</td>
			<td class="t">${escapeHtml(p.title)}</td>
			<td>${escapeHtml([p.program_code, p.semester ? `Sem ${p.semester}` : null].filter(Boolean).join(' / ') || '—')}</td>
			<td class="r">${escapeHtml(money(p.rate ?? rate))}</td>
		</tr>`
			)
			.join('')}</tbody>
	</table>`
		: ''

	const notes = (c.body || []).map(cl => `<li>${escapeHtml(cl.text)}</li>`).join('')

	// The claim goes out on the same letterhead as the order: the college's
	// framed block when it has one, the generic logo + name header otherwise.
	const boxed = boxedLetterheadHtml(data.institution.institution_code, assets.letterheadLogoBase64 ?? null)
	const header = boxed
		? `${boxed}<div class="lh-office">OFFICE OF THE CONTROLLER OF EXAMINATIONS</div>`
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
	body { font-family: ${fontFamily}; font-size: 11pt; color: #000; margin: 0; line-height: 1.45; }
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
	hr.rule { border: none; border-top: 2px solid ${primary}; margin: 8px 0 12px; }
	.title { text-align: center; font-weight: bold; font-size: 12.5pt; text-decoration: underline; margin: 4px 0 14px; }
	table.grid { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
	table.grid th, table.grid td { border: 1px solid #111; padding: 5px 8px; font-size: 10.5pt; text-align: left; }
	table.grid th { width: 40%; background: #f4f4f4; font-weight: bold; }
	table.papers th { width: auto; text-align: left; }
	table.papers th.n, table.papers td.n { width: 8%; text-align: center; }
	table.papers th.t { width: 42%; }
	table.papers th.r, table.papers td.r { width: 16%; text-align: right; white-space: nowrap; }
	.section { font-weight: bold; margin: 0 0 6px; }
	ol.notes { margin: 0 0 14px; padding-left: 20px; font-size: 10pt; }
	.declare { margin: 14px 0; font-size: 10.5pt; text-align: justify; }
	.sign-row { display: flex; justify-content: space-between; margin-top: 26px; }
	.sign-cell { text-align: center; min-width: 200px; }
	.sign-img { height: 56px; max-width: 220px; object-fit: contain; display: block; margin: 0 auto; }
	.sign-rule { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; font-size: 10pt; }
	.pad { padding-top: 56px; }
	.sign-when { font-size: 8.5pt; color: #444; margin-top: 2px; }
</style></head>
<body>
	${header}
	<hr class="rule" />

	<div class="title">${escapeHtml(c.title || 'CLAIM FORM — QUESTION PAPER SETTING')}</div>

	<div class="section">1. Examiner Particulars</div>
	<table class="grid">
		${row(['Name', data.examiner.full_name])}
		${row(['Designation', data.examiner.designation || '—'])}
		${row(['Department', data.examiner.department || '—'])}
		${row(['Institution', data.examiner.institution_name || '—'])}
		${row(['E-mail', data.examiner.email])}
		${row(['Examiner Type', data.examiner.kind === 'internal' ? 'Internal Examiner' : 'External Examiner'])}
	</table>

	<div class="section">2. Work Claimed</div>
	<table class="grid">${claimRows.slice(0, 2).map(row).join('')}</table>
	${papersTable}
	<table class="grid">${claimRows.slice(2).map(row).join('')}</table>

	<div class="section">3. Bank Details for Payment</div>
	<table class="grid">${bankRows.map(row).join('')}</table>

	${notes ? `<div class="section">4. Notes</div><ol class="notes">${notes}</ol>` : ''}

	<div class="declare">${escapeHtml(
		c.footer_note ||
			'I certify that the above particulars are true and that I have set the question paper(s) claimed for.'
	)}</div>

	<div class="sign-row">
		<div class="sign-cell">
			<div class="pad"></div>
			<div class="sign-rule">Controller of Examinations</div>
		</div>
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
	<div style="margin-top:16px;font-size:10pt;">Date: ${escapeHtml(
		formatIstDate(data.claim_date || new Date().toISOString())
	)}</div>
</body></html>`
}

// ── Rendering ───────────────────────────────────────────────────────────────

async function renderPdf(html: string, ps: PdfInstitutionSettings | null): Promise<Buffer> {
	const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

	let browser
	if (isServerless) {
		const chromium = (await import('@sparticuz/chromium')).default
		const puppeteerCore = (await import('puppeteer-core')).default
		browser = await puppeteerCore.launch({
			args: chromium.args,
			defaultViewport: { width: 1240, height: 1754 },
			executablePath: await chromium.executablePath(),
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

/** File name for a saved order / claim, safe on every OS. */
export function orderFilename(prefix: string, courseCode: string, examinerName: string): string {
	const slug = (v: string) => v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
	return `${prefix}_${slug(courseCode)}_${slug(examinerName)}.pdf`
}
