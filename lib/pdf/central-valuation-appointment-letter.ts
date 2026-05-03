/**
 * Central Valuation Examiner Appointment Letter PDF Generator
 *
 * Generates a formal PDF appointment letter for Central Valuation examiners
 * (Internal / External / Chief / Assistant).
 *
 * Mirrors the visual layout of lib/pdf/practical-appointment-letter.ts:
 *   - Hall-ticket-style header (logos + institution name + accreditation)
 *   - Ref number + date row
 *   - Addressee block
 *   - Subject line (varies by examiner role)
 *   - Course table with Date | Course Code | Course Name | Packets | Sheets
 *   - Signature block (seal + signature)
 */

import puppeteerCore from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { CentralValuationAppointmentData } from '@/types/central-valuation-email'
import type { PdfInstitutionSettings } from '@/types/pdf-settings'
import { DEFAULT_PDF_SETTINGS } from '@/types/pdf-settings'

function s(
	settings: PdfInstitutionSettings | null | undefined,
	key: keyof PdfInstitutionSettings,
	fallback: string
): string {
	if (settings && settings[key] != null && settings[key] !== '') {
		return String(settings[key])
	}
	return fallback
}

async function urlToBase64(url: string | null | undefined): Promise<string | null> {
	if (!url) return null
	if (url.startsWith('data:')) return url
	try {
		if (url.startsWith('/')) {
			const filePath = join(process.cwd(), 'public', url)
			const buffer = readFileSync(filePath)
			const ext = url.split('.').pop()?.toLowerCase() || 'png'
			const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
				: ext === 'svg' ? 'image/svg+xml'
				: `image/${ext}`
			return `data:${mimeType};base64,${buffer.toString('base64')}`
		}
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

function formatDate(dateStr: string): string {
	const d = new Date(dateStr)
	if (isNaN(d.getTime())) return dateStr
	const dd = String(d.getDate()).padStart(2, '0')
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const yyyy = d.getFullYear()
	return `${dd}.${mm}.${yyyy}`
}

const ROLE_LABEL: Record<CentralValuationAppointmentData['examiner_type'], string> = {
	internal: 'Internal Examiner',
	external: 'External Examiner',
	chief: 'Chief Examiner',
	assistant: 'Assistant Examiner',
}

interface HtmlBuildOptions {
	logoBase64: string | null
	secondaryLogoBase64: string | null
	sealBase64: string | null
	signatureBase64: string | null
}

export function buildCentralValuationAppointmentHtml(
	data: CentralValuationAppointmentData,
	opts: HtmlBuildOptions = { logoBase64: null, secondaryLogoBase64: null, sealBase64: null, signatureBase64: null }
): string {
	const ps = data.pdf_settings
	const fontFamily = "'Times New Roman', serif"
	const fontSizeBody = '12pt'

	const primaryColor = s(ps, 'primary_color', data.primary_color || DEFAULT_PDF_SETTINGS.primary_color || '#006400')
	const borderColor = '#000'

	const logoSrc = opts.logoBase64 || ps?.logo_url || data.header_image_url || null
	const secondaryLogoSrc = opts.secondaryLogoBase64 || ps?.secondary_logo_url || null
	const sealSrc = opts.sealBase64 || data.coe_seal_url || (ps as any)?.coe_seal_url || null
	const signatureSrc = opts.signatureBase64 || data.coe_signature_url || null

	const watermarkEnabled = ps?.watermark_enabled ?? false
	const watermarkUrl = ps?.watermark_url || null
	const watermarkOpacity = ps?.watermark_opacity ?? 0.1
	const signatureEnabled = ps?.signature_section_enabled ?? true

	const leftLogo = logoSrc
		? `<img src="${logoSrc}" alt="" style="width: 80px; height: 80px; object-fit: contain;" />`
		: ''
	const rightLogo = secondaryLogoSrc
		? `<img src="${secondaryLogoSrc}" alt="" style="width: 80px; height: 80px; object-fit: contain;" />`
		: ''

	const institutionNameUpper = (data.institution_name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE').toUpperCase()
	const accreditationText = data.institution_accreditation || '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	const addressText = data.institution_address || 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu'

	const coeName = data.coe_name || 'Dr. S. UMAVATHI'
	const coeQual = data.coe_qualifications || 'M.Sc., Ph.D'
	const coeCont = data.coe_contact || '93605 12090'
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

	const watermarkSection = watermarkEnabled && watermarkUrl
		? `<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: -1; opacity: ${watermarkOpacity};">
				<img src="${watermarkUrl}" alt="" style="max-width: 60%; max-height: 60%;" />
			</div>`
		: ''

	let signatureBlock = ''
	if (signatureEnabled) {
		const coeSignatureHtml = signatureSrc
			? `<img src="${signatureSrc}" alt="" style="max-height: 120px; background: transparent;" />`
			: ''
		const coeSealHtml = sealSrc
			? `<img src="${sealSrc}" alt="" style="max-height: 100px; background: transparent;" />`
			: ''

		signatureBlock = `
		<div class="signature-block">
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
			</div>
		</div>`
	}

	const letterDate = formatDate(data.letter_date)
	const roleLabel = ROLE_LABEL[data.examiner_type]
	// Resolve the board label — prefer the friendly name; fall back to the code.
	const boardLabel = data.board_name || data.board_code || ''

	// Build the list of unique valuation dates joined as "04.05.2026 and 05.05.2026"
	// (matches the Dr.M.Shobana sample letter format).
	const uniqueDates = [...new Set(
		data.courses.map(c => c.valuation_date).filter(Boolean),
	)].sort().map(formatDate)
	const valuationDates = uniqueDates.length > 0
		? uniqueDates.length === 1
			? uniqueDates[0]
			: uniqueDates.slice(0, -1).join(', ') + ' and ' + uniqueDates[uniqueDates.length - 1]
		: ''

	// Convert "APRIL-MAY-2026" → "April/May, 2026" (subject) and "April/May 2026" (body)
	const formatSession = (s: string): { subject: string; body: string } => {
		if (!s) return { subject: '', body: '' }
		const parts = s.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
		if (parts.length >= 3) {
			const year = parts[parts.length - 1]
			const months = parts.slice(0, -1).join('/')
			return { subject: `${months}, ${year}`, body: `${months} ${year}` }
		}
		return { subject: s, body: s }
	}
	const sessionFormatted = formatSession(data.exam_session_name)

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>Central Valuation Appointment - ${data.examiner_name}</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		html, body {
			width: 210mm;
			font-family: ${fontFamily};
			font-size: ${fontSizeBody};
			color: #000;
			background: #fff;
		}
		.page { width: 210mm; background: #fff; position: relative; }
		.header-row {
			display: flex;
			align-items: center;
			justify-content: center;
			margin-bottom: 6pt;
			gap: 10pt;
		}
		.header-logo-left, .header-logo-right { flex-shrink: 0; }
		.header-center { text-align: center; flex: 1; }
		.coe-info-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-top: 4pt;
		}
		.coe-name-text { font-size: 9pt; font-weight: bold; color: #000; }
		.coe-title-text { font-size: 9pt; font-weight: bold; color: #000; }
		.coe-contact-text { font-size: 9pt; font-weight: bold; color: #000; text-align: right; }
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
		.salutation { margin-bottom: 8pt; font-size: ${fontSizeBody}; }
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
			page-break-inside: avoid;
		}
		.course-table th {
			padding: 5px 8px;
			border: 1px solid ${borderColor};
			background-color: #f0f0f0;
			color: #000;
			text-align: center;
			font-weight: bold;
			font-size: 11pt;
		}
		.course-table td {
			padding: 5px 8px;
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
		.signature-block {
			page-break-inside: avoid;
			margin-top: 12pt;
		}
	</style>
</head>
<body>
	<div class="page">
		${watermarkSection}
		${headerSection}

		<div class="ref-date-row">
			<span>Ref. No. ${data.ref_number}</span>
			<span>Date: ${letterDate}</span>
		</div>

		<div class="address-block">
			<p>To</p>
			<p style="padding-left: 24pt;">${data.examiner_name},</p>
			${data.examiner_designation ? `<p style="padding-left: 24pt;">${data.examiner_designation},</p>` : ''}
			${data.examiner_department ? `<p style="padding-left: 24pt;">${/^department of/i.test(data.examiner_department) ? data.examiner_department : `Department of ${data.examiner_department}`},</p>` : ''}
			${data.examiner_institution ? `<p style="padding-left: 24pt;">${data.examiner_institution},</p>` : ''}
			${data.examiner_address ? `<p style="padding-left: 24pt;">${data.examiner_address}.</p>` : ''}
			${data.examiner_mobile ? `<p style="padding-left: 24pt;">Mobile: ${data.examiner_mobile}</p>` : ''}
		</div>

		<div class="salutation">Sir/Madam,</div>

		<div class="subject-line">
			<span class="subject-label">Sub:</span>
			Appointment of ${roleLabel} for ${sessionFormatted.subject} Semester valuation - Reg.
		</div>

		<p class="body-paragraph">
			I am pleased to inform you that you have been appointed as an ${roleLabel}
			for the ${boardLabel ? `UG-${boardLabel} Board` : 'UG Board'} semester valuation for the ${sessionFormatted.body}
			Examinations, scheduled to be held on ${valuationDates}. You are requested to report
			to the Office of the Controller of Examinations at 9:30 a.m.
		</p>

		<p class="body-paragraph">
			If you are unable to accept this appointment, kindly inform us immediately via email at${data.coe_email ? ` <strong><u>${data.coe_email}</u></strong>` : ''}
		</p>

		<p class="note-paragraph">
			Remuneration will be paid as per norms.
		</p>

		${signatureBlock}
	</div>
</body>
</html>`
}

export async function generateCentralValuationAppointmentPdf(
	data: CentralValuationAppointmentData,
): Promise<Buffer> {
	const ps = data.pdf_settings

	// Fall back to bundled JKKN assets in /public when DB settings have null URLs.
	// Left logo = JKKN brand stripe (jkkn_logo.png) — "Your Success - Our Tradition"
	// Right logo = LOVE-LEARN-SERVE circular badge (cas_secondary_*.png)
	const logoUrl = ps?.logo_url || data.header_image_url || '/jkkn_logo.png'
	const secondaryLogoUrl = ps?.secondary_logo_url || '/logo/cas_secondary_1773393756290.png'
	const sealUrl = data.coe_seal_url || (ps as any)?.coe_seal_url || '/coe_seal_cas.png'
	const signatureUrl = data.coe_signature_url || '/coe_signature_cas.png'

	const [logoBase64, secondaryLogoBase64, sealBase64, signatureBase64] = await Promise.all([
		urlToBase64(logoUrl),
		urlToBase64(secondaryLogoUrl),
		urlToBase64(sealUrl),
		urlToBase64(signatureUrl),
	])

	const html = buildCentralValuationAppointmentHtml(data, { logoBase64, secondaryLogoBase64, sealBase64, signatureBase64 })

	const paperSize = ps?.paper_size || 'A4'
	const orientation = ps?.orientation || 'portrait'
	const isLandscape = orientation === 'landscape'

	const marginTop = s(ps, 'margin_top', '12.7mm')
	const marginBottom = s(ps, 'margin_bottom', '12.7mm')
	const marginLeft = s(ps, 'margin_left', '6.35mm')
	const marginRight = s(ps, 'margin_right', '6.35mm')

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
			margin: { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight },
		})
		return Buffer.from(pdfBuffer)
	} finally {
		await browser.close()
	}
}
