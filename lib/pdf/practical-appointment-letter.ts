/**
 * Practical Examiner Appointment Letter PDF Generator
 *
 * Generates a formal PDF appointment letter for practical exam examiners
 * using Puppeteer to render HTML to PDF.
 *
 * Format matches the sample appointment letter:
 *   - Optional header with logos + institution name (hall-ticket style)
 *   - Ref number + date row
 *   - Addressee block
 *   - Subject line (varies by examiner type)
 *   - Course table with Date | Session | Programme | Course Code | Course Name | Students
 *   - Signature block
 *
 * Body text is BLACK. Only the header institution name uses primaryColor.
 * ALL visual styling is driven by `pdf_institution_settings` table.
 */

import puppeteerCore from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AppointmentLetterData } from '@/types/practical-email'
import type { PdfInstitutionSettings } from '@/types/pdf-settings'
import { DEFAULT_PDF_SETTINGS } from '@/types/pdf-settings'

// =============================================================================
// SETTINGS HELPERS
// =============================================================================

/** Resolve a setting value: pdf_settings → legacy field → default */
function s(
	settings: PdfInstitutionSettings | null,
	key: keyof PdfInstitutionSettings,
	fallback: string
): string {
	if (settings && settings[key] != null && settings[key] !== '') {
		return String(settings[key])
	}
	return fallback
}

/**
 * Load an image URL/path as a base64 data URI.
 *
 * Handles:
 * - Relative paths ("/jkkn_logo.png") → reads from public/ directory
 * - Full URLs ("https://...") → fetches via HTTP
 * - data: URIs → returns as-is
 */
async function urlToBase64(url: string | null | undefined): Promise<string | null> {
	if (!url) return null

	// Already a data URI
	if (url.startsWith('data:')) return url

	try {
		// Relative path → read from public/ directory
		if (url.startsWith('/')) {
			const filePath = join(process.cwd(), 'public', url)
			const buffer = readFileSync(filePath)
			const ext = url.split('.').pop()?.toLowerCase() || 'png'
			const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
				: ext === 'svg' ? 'image/svg+xml'
				: `image/${ext}`
			return `data:${mimeType};base64,${buffer.toString('base64')}`
		}

		// Full URL → fetch
		const res = await fetch(url)
		if (!res.ok) return null
		const contentType = res.headers.get('content-type') || 'image/png'
		const arrayBuffer = await res.arrayBuffer()
		const base64 = Buffer.from(arrayBuffer).toString('base64')
		return `data:${contentType};base64,${base64}`
	} catch {
		console.warn('Failed to load logo:', url)
		return null
	}
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

function formatDate(dateStr: string): string {
	const d = new Date(dateStr)
	if (isNaN(d.getTime())) return dateStr
	const dd = String(d.getDate()).padStart(2, '0')
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const yyyy = d.getFullYear()
	return `${dd}.${mm}.${yyyy}`
}

// =============================================================================
// HTML BUILDER
// =============================================================================

interface HtmlBuildOptions {
	logoBase64: string | null
	secondaryLogoBase64: string | null
	sealBase64: string | null
	signatureBase64: string | null
}

/**
 * Builds the complete HTML string for the appointment letter.
 * Matches the sample letter format with black body text and 12pt font.
 */
export function buildAppointmentLetterHtml(
	data: AppointmentLetterData,
	opts: HtmlBuildOptions = { logoBase64: null, secondaryLogoBase64: null, sealBase64: null, signatureBase64: null }
): string {
	const ps = data.pdf_settings

	// ----- Resolve visual settings -----
	const fontFamily = "'Times New Roman', serif"
	const fontSizeBody = '12pt'

	const primaryColor = s(ps, 'primary_color', data.primary_color || DEFAULT_PDF_SETTINGS.primary_color || '#006400')
	const accentColor = s(ps, 'accent_color', data.accent_color || DEFAULT_PDF_SETTINGS.accent_color || '#2b6cb0')
	const borderColor = '#000'

	// Logos — prefer base64 (pre-fetched), fall back to URL
	const logoSrc = opts.logoBase64 || ps?.logo_url || data.header_image_url || null
	const secondaryLogoSrc = opts.secondaryLogoBase64 || ps?.secondary_logo_url || null
	const sealSrc = opts.sealBase64 || data.coe_seal_url || (ps as any)?.coe_seal_url || null
	const signatureSrc = opts.signatureBase64 || data.coe_signature_url || null

	// No header_html or footer_html from settings — appointment letters always use custom layout

	// Watermark
	const watermarkEnabled = ps?.watermark_enabled ?? false
	const watermarkUrl = ps?.watermark_url || null
	const watermarkOpacity = ps?.watermark_opacity ?? 0.1

	// Signature
	const signatureEnabled = ps?.signature_section_enabled ?? true

	// ----- Build header section (always custom, matches hall-ticket: generate-hall-ticket-pdf.ts) -----
	const leftLogo = logoSrc
		? `<img src="${logoSrc}" alt="" style="width: 80px; height: 80px; object-fit: contain;" />`
		: ''
	const rightLogo = secondaryLogoSrc
		? `<img src="${secondaryLogoSrc}" alt="" style="width: 80px; height: 80px; object-fit: contain;" />`
		: ''

	const institutionNameUpper = (data.institution_name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE').toUpperCase()
	const accreditationText = data.institution_accreditation || '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	const addressText = data.institution_address || 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu'

	// COE info: name + qualifications (left), contact (right), then "Controller of Examinations" (left)
	const coeName = data.coe_name || ''
	const coeQual = data.coe_qualifications || ''
	const coeCont = data.coe_contact || ''
	const coeNameLine = coeQual ? `${coeName}, ${coeQual}` : coeName
	const showCoeInfo = coeName && coeName !== 'Controller of Examinations'

	const headerSection = `
	<!-- Logo row: left logo | institution name + accreditation | right logo -->
	<div class="header-row">
		${leftLogo ? `<div class="header-logo-left">${leftLogo}</div>` : ''}
		<div class="header-center">
			<div style="font-size: 18pt; font-weight: bold; color: ${primaryColor}; line-height: 1.3;">
				${institutionNameUpper}
			</div>
			
			<div style="font-size: 10pt; font-style: italic; color: #000; margin-top: 2pt; line-height: 1.4;">${accreditationText}</div>
		</div>
		${rightLogo ? `<div class="header-logo-right">${rightLogo}</div>` : ''}
	</div>

	<!-- Address (separate line below logos, bold, centered — matches hall ticket) -->
	<div style="text-align: center; font-size: 12pt; font-weight: bold; color: #000; margin-top: 2pt;">
		${addressText}
	</div>

	<!-- COE Name & Contact line (9pt bold, matches hall ticket) -->
	${showCoeInfo ? `
	<div class="coe-info-row">
		<div>
			<div class="coe-name-text">${coeNameLine}</div>
			<div class="coe-title-text">Controller of Examinations</div>
		</div>
		${coeCont ? `<div class="coe-contact-text">Contact: ${coeCont}</div>` : ''}
	</div>` : ''}

	<hr style="border: none; border-top: 2px solid ${primaryColor}; margin: 4pt 0 10pt 0;" />`

	// Watermark
	const watermarkSection = watermarkEnabled && watermarkUrl
		? `<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: -1; opacity: ${watermarkOpacity};">
				<img src="${watermarkUrl}" alt="" style="max-width: 60%; max-height: 60%;" />
			</div>`
		: ''

	// No footer for appointment letters

	// Course table rows
	const courseRows = data.courses
		.map((course) => {
			const displayDate = formatDate(course.date)
			return `
			<tr>
				<td>${displayDate}</td>
				<td style="text-align: center;">${course.session}</td>
				<td>${course.programme}</td>
				<td>${course.course_code}</td>
				<td>${course.course_name}</td>
				<td style="text-align: center;">${course.student_count}</td>
			</tr>`
		})
		.join('')

	// Signature block
	let signatureBlock = ''
	if (signatureEnabled) {
		const coeSignatureHtml = signatureSrc
			? `<img src="${signatureSrc}" alt="" style="max-height: 120px; background: transparent;" />`
			: ''
		const coeSealHtml = sealSrc
			? `<img src="${sealSrc}" alt="" style="max-height: 100px; background: transparent;" />`
			: ''

		signatureBlock = `
		<div style="margin-top: 2pt; text-align: center; font-size: ${fontSizeBody}; line-height: 1.2;">
			<div>Thanking you.</div>
		</div>
		<div style="margin-top: 2pt; text-align: right; padding-right: 72pt; font-size: ${fontSizeBody}; font-style: italic;">
			With Regards,
		</div>
		<div style="margin-top: 2pt; display: flex; justify-content: space-between; align-items: flex-end;">
			<div style="text-align: left;">${coeSealHtml}</div>
			<div style="text-align: right;">
				${coeSignatureHtml}
			</div>
		</div>`
	}

	const letterDate = formatDate(data.letter_date)

	// Subject label varies by examiner type
	const subjectExaminerLabel =
		data.examiner_type === 'external' ? 'External Examiner'
		: data.examiner_type === 'internal' ? 'Internal Examiner'
		: data.examiner_type === 'programmer' ? 'Programmer'
		: 'Skilled'

	// ----- Final HTML -----
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Appointment Letter - ${data.examiner_name}</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }

		html, body {
			width: 210mm;
			font-family: ${fontFamily};
			font-size: ${fontSizeBody};
			color: #000;
			background: #fff;
		}

		.page {
			width: 210mm;
			background: #fff;
			position: relative;
		}

		/* Hall-ticket-style header */
		.header-row {
			display: flex;
			align-items: center;
			justify-content: center;
			margin-bottom: 6pt;
			gap: 10pt;
		}
		.header-logo-left, .header-logo-right {
			flex-shrink: 0;
		}
		.header-center {
			text-align: center;
			flex: 1;
		}

		/* COE info line */
		.coe-info-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-top: 4pt;
		}
		.coe-name-text {
			font-size: 9pt;
			font-weight: bold;
			color: #000;
		}
		.coe-title-text {
			font-size: 9pt;
			font-weight: bold;
			color: #000;
		}
		.coe-contact-text {
			font-size: 9pt;
			font-weight: bold;
			color: #000;
			text-align: right;
		}

		.ref-date-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			margin-bottom: 12pt;
			font-size: ${fontSizeBody};
		}

		.address-block {
			margin-bottom: 12pt;
			font-size: ${fontSizeBody};
			line-height: 1.6;
		}
		.address-block p { margin: 0; }

		.salutation {
			margin-bottom: 8pt;
			font-size: ${fontSizeBody};
		}

		.subject-line {
			margin-bottom: 4pt;
			font-size: ${fontSizeBody};
			line-height: 1.3;
			text-align: center;
		}
		.subject-label { font-weight: bold; }

		.body-paragraph {
			margin-bottom: 4pt;
			font-size: ${fontSizeBody};
			line-height: 1.4;
			text-align: justify;
			text-indent: 36pt;
		}

		.course-table {
			width: 100%;
			border-collapse: collapse;
			margin-bottom: 12pt;
			font-size: 11pt;
		}
		.course-table th {
			padding: 6px 8px;
			border: 1px solid ${borderColor};
			background-color: #f0f0f0;
			color: #000;
			text-align: center;
			font-weight: bold;
			font-size: 11pt;
		}
		.course-table td {
			padding: 6px 8px;
			border: 1px solid ${borderColor};
			font-size: 11pt;
			color: #000;
			vertical-align: top;
		}

		.note-paragraph {
			margin-bottom: 2pt;
			font-size: ${fontSizeBody};
			line-height: 1.4;
		}
	</style>
</head>
<body>
	<div class="page">

		${watermarkSection}

		<!-- Header (hall-ticket style) -->
		${headerSection}

		<!-- Reference Number and Date -->
		<div class="ref-date-row">
			<span>Ref. No. ${data.ref_number}</span>
			<span>Date: ${letterDate}</span>
		</div>

		<!-- Addressee Block -->
		<div class="address-block">
			<p>To</p>
			<p style="padding-left: 24pt;">${data.examiner_name},</p>
			${data.examiner_designation ? `<p style="padding-left: 24pt;">${data.examiner_designation},</p>` : ''}
			${data.examiner_department ? `<p style="padding-left: 24pt;">Department of ${data.examiner_department},</p>` : ''}
			<p style="padding-left: 24pt;">${data.examiner_institution},</p>
			${data.examiner_address ? `<p style="padding-left: 24pt;">${data.examiner_address}.</p>` : ''}
			${data.examiner_mobile ? `<p style="padding-left: 24pt;">Mobile: ${data.examiner_mobile}</p>` : ''}
		</div>

		<!-- Salutation -->
		<div class="salutation">Sir/Madam,</div>

		<!-- Subject -->
		<div class="subject-line">
			<span class="subject-label">Sub:</span>
			Appointment of ${subjectExaminerLabel} for End Semester Practical Examinations &ndash;
			${data.exam_session_name} - Reg.
		</div>

		<!-- Body Paragraph -->
		<p class="body-paragraph">
			I am pleased to inform that you have been appointed as ${data.examiner_role}
			to conduct the Practical Examinations as detailed below:
		</p>

		<!-- Course Table -->
		<table class="course-table">
			<thead>
				<tr>
					<th style="white-space: nowrap;">Date</th>
					<th>Session</th>
					<th>Name of the Programme</th>
					<th style="white-space: nowrap;">Course Code</th>
					<th>Course Name</th>
					<th style="white-space: nowrap;">Number of<br/>students</th>
				</tr>
			</thead>
			<tbody>
				${courseRows}
			</tbody>
		</table>

		<!-- Note on non-acceptance -->
		<p class="note-paragraph">
			If you are not in a position to accept this offer, please inform us through mail${data.coe_email ? ` <strong><u>${data.coe_email}</u></strong>` : ''} immediately.
		</p>

		<!-- Remuneration note -->
		<p class="note-paragraph">
			Remuneration will be paid as per the norms.
		</p>

		<!-- Signature -->
		${signatureBlock}

		<!-- Footer -->
		<!-- No footer -->

	</div>
</body>
</html>`
}

// =============================================================================
// PDF GENERATOR
// =============================================================================

/**
 * Generates a PDF appointment letter buffer using Puppeteer.
 * Pre-fetches logo URLs as base64 data URIs so Puppeteer can render them.
 */
export async function generateAppointmentPdf(data: AppointmentLetterData): Promise<Buffer> {
	const ps = data.pdf_settings

	// Pre-fetch all images as base64 so Puppeteer can render them
	const logoUrl = ps?.logo_url || data.header_image_url || null
	const secondaryLogoUrl = ps?.secondary_logo_url || null
	const sealUrl = data.coe_seal_url || (ps as any)?.coe_seal_url || null
	const signatureUrl = data.coe_signature_url || null

	const [logoBase64, secondaryLogoBase64, sealBase64, signatureBase64] = await Promise.all([
		urlToBase64(logoUrl),
		urlToBase64(secondaryLogoUrl),
		urlToBase64(sealUrl),
		urlToBase64(signatureUrl),
	])

	const html = buildAppointmentLetterHtml(data, { logoBase64, secondaryLogoBase64, sealBase64, signatureBase64 })

	const paperSize = ps?.paper_size || 'A4'
	const orientation = ps?.orientation || 'portrait'
	const isLandscape = orientation === 'landscape'

	// Narrow margins matching hall ticket (6.35mm = 0.25 inch)
	const marginTop = s(ps, 'margin_top', '12.7mm')
	const marginBottom = s(ps, 'margin_bottom', '12.7mm')
	const marginLeft = s(ps, 'margin_left', '6.35mm')
	const marginRight = s(ps, 'margin_right', '6.35mm')

	const puppeteerMargins = {
		top: marginTop,
		bottom: marginBottom,
		left: marginLeft,
		right: marginRight,
	}

	const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

	let browser
	if (isVercel) {
		const executablePath = await chromium.executablePath()
		browser = await puppeteerCore.launch({
			args: chromium.args,
			defaultViewport: { width: 1920, height: 1080 },
			executablePath,
			headless: true,
		})
	} else {
		// Local development — use system Chrome or puppeteer's bundled Chromium
		const puppeteer = (await import('puppeteer')).default
		browser = await puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
			headless: true,
		})
	}

	try {
		const page = await browser.newPage()
		await page.setContent(html, { waitUntil: 'domcontentloaded' })

		const pdfBuffer = await page.pdf({
			format: paperSize as 'A4' | 'Letter' | 'Legal',
			landscape: isLandscape,
			printBackground: true,
			margin: puppeteerMargins,
		})

		return Buffer.from(pdfBuffer)
	} finally {
		await browser.close()
	}
}
