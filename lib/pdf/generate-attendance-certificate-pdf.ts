import jsPDF from 'jspdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExaminerCertificateData {
	examiner_name: string
	designation: string
	department: string
	institution_name: string
	type: 'External' | 'Internal' | 'Chief' | 'Assistant'
	from_date: string
	to_date: string // empty if same as from_date
	all_dates?: string[] // all individual dates (sorted)
	total_days: number
}

export interface AttendanceCertificatePdfOptions {
	institution_name: string
	institution_address: string
	institution_accreditation: string
	session_name: string
	examiners: ExaminerCertificateData[]
	primary_color?: string
	logoImage?: string
	rightLogoImage?: string
	coe_name?: string
	/**
	 * Which examination context to render (bold) in the certificate body.
	 * One of 'Practical' (default), 'Theory', 'Scrutiny', or 'Central Valuation'.
	 */
	certificate_context?: 'Practical' | 'Theory' | 'Scrutiny' | 'Central Valuation'
}

// ---------------------------------------------------------------------------
// Constants (A5 landscape, narrow margins)
// ---------------------------------------------------------------------------

const MARGIN = 8

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateDDMMYYYY(dateStr: string): string {
	if (!dateStr) return ''
	const d = new Date(dateStr)
	const dd = String(d.getDate()).padStart(2, '0')
	const mm = String(d.getMonth() + 1).padStart(2, '0')
	const yyyy = d.getFullYear()
	return `${dd}-${mm}-${yyyy}`
}

function normalizeInstitutionName(name: string): string {
	let n = name.toUpperCase()
	n = n.replace(/\s*\(AUTONOMOUS\)\s*/i, '').trim()
	// Map abbreviated forms to proper name
	n = n.replace(/^JKKN\s+/i, 'J.K.K.NATARAJA ')
	n = n.replace(/\bAND\b/g, '&')
	return n
}

// ---------------------------------------------------------------------------
// Draw compact certificate header
// ---------------------------------------------------------------------------

function drawCertificateHeader(doc: jsPDF, pageWidth: number, opts: AttendanceCertificatePdfOptions): number {
	let y = MARGIN

	const pc = opts.primary_color || '#006400'
	const pcR = parseInt(pc.slice(1, 3), 16) || 0
	const pcG = parseInt(pc.slice(3, 5), 16) || 100
	const pcB = parseInt(pc.slice(5, 7), 16) || 0

	const logoSize = 16

	// Logos
	if (opts.logoImage) {
		try { doc.addImage(opts.logoImage, 'PNG', MARGIN, y, logoSize, logoSize) } catch { /* skip */ }
	}
	if (opts.rightLogoImage) {
		try { doc.addImage(opts.rightLogoImage, 'PNG', pageWidth - MARGIN - logoSize, y, logoSize, logoSize) } catch { /* skip */ }
	}

	// Institution name
	doc.setFont('times', 'bolditalic')
	doc.setFontSize(14)
	doc.setTextColor(pcR, pcG, pcB)
	const instName = normalizeInstitutionName(opts.institution_name || 'J.K.K. Nataraja College of Arts & Science')
	doc.text(instName, pageWidth / 2, y + 6, { align: 'center' })
	y += 10

	// Accreditation
	doc.setFont('times', 'italic')
	doc.setFontSize(8)
	doc.setTextColor(0, 0, 0)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, y, { align: 'center' })
	y += 5

	// Address (bold)
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(opts.institution_address || 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 8

	// Title: ATTENDANCE CERTIFICATE
	doc.setFont('times', 'bold')
	doc.setFontSize(14)
	doc.text('ATTENDANCE CERTIFICATE', pageWidth / 2, y, { align: 'center' })
	const titleText = 'ATTENDANCE CERTIFICATE'
	const titleWidth = doc.getTextWidth(titleText)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	doc.line(pageWidth / 2 - titleWidth / 2, y + 1, pageWidth / 2 + titleWidth / 2, y + 1)
	y += 12

	return y
}

// ---------------------------------------------------------------------------
// Draw single certificate body (flowing paragraph text)
// ---------------------------------------------------------------------------

function drawCertificateBody(
	doc: jsPDF,
	pageWidth: number,
	y: number,
	examiner: ExaminerCertificateData,
	context: 'Practical' | 'Theory' | 'Scrutiny' | 'Central Valuation' = 'Practical',
): number {
	const contentX = MARGIN + 8
	const maxWidth = pageWidth - 2 * MARGIN - 16
	const lineSpacing = 10
	const fontSize = 13
	const underlineOffset = 1.5 // distance below text baseline

	doc.setTextColor(0, 0, 0)
	doc.setFontSize(fontSize)

	// Build examiner role phrase (e.g. "External examiner", "Chief Examiner")
	const examinerRoleText: Record<ExaminerCertificateData['type'], string> = {
		External: 'External examiner',
		Internal: 'Internal examiner',
		Chief: 'Chief Examiner',
		Assistant: 'Assistant Examiner',
	}
	const roleText = examinerRoleText[examiner.type] || 'External examiner'

	// Line 1: Name + Designation
	const nameDesigParts = [examiner.examiner_name, examiner.designation].filter(Boolean)
	const nameDesigStr = nameDesigParts.join(', ')

	// Line 2: Department + Institution
	const deptInstParts: string[] = []
	if (examiner.department) deptInstParts.push(`Department of ${examiner.department}`)
	if (examiner.institution_name) deptInstParts.push(examiner.institution_name)
	const deptInstStr = deptInstParts.join(', ')

	// Date string
	const allDates = examiner.all_dates || [examiner.from_date, ...(examiner.to_date ? [examiner.to_date] : [])]
	const uniqueDates = [...new Set(allDates)].sort()
	const dayCount = examiner.total_days || uniqueDates.length
	const daysText = `(${dayCount} Day${dayCount !== 1 ? 's' : ''})`

	function areDatesContiguous(dates: string[]): boolean {
		if (dates.length <= 1) return true
		for (let i = 1; i < dates.length; i++) {
			const prev = new Date(dates[i - 1])
			const curr = new Date(dates[i])
			const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
			if (diffDays !== 1) return false
		}
		return true
	}

	let dateStr: string
	if (uniqueDates.length === 1) {
		dateStr = `on ${formatDateDDMMYYYY(uniqueDates[0])}`
	} else if (areDatesContiguous(uniqueDates)) {
		dateStr = `from ${formatDateDDMMYYYY(uniqueDates[0])} to ${formatDateDDMMYYYY(uniqueDates[uniqueDates.length - 1])}`
	} else {
		dateStr = `on ${uniqueDates.map(d => formatDateDDMMYYYY(d)).join(', ')}`
	}

	// --- Render line by line with mixed bold/normal ---

	// Underline helper: draws line across full content width
	const drawUnderline = (yPos: number) => {
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(contentX, yPos + underlineOffset, contentX + maxWidth, yPos + underlineOffset)
	}

	// Line 1: "This is to certify that <Name>, <Designation>"
	doc.setFont('times', 'normal')
	doc.setFontSize(fontSize)
	const certPrefix = 'This is to certify that '
	doc.text(certPrefix, contentX, y)
	const prefixW = doc.getTextWidth(certPrefix)

	doc.setFont('times', 'bold')
	doc.text(nameDesigStr, contentX + prefixW, y)
	// Underline only from after "This is to certify that" to end
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	doc.line(contentX + prefixW, y + underlineOffset, contentX + maxWidth, y + underlineOffset)
	y += lineSpacing

	// Line 2: "Department, Institution" (if external with dept/inst info)
	if (deptInstStr) {
		doc.setFont('times', 'normal')
		doc.text(deptInstStr, contentX, y)
		drawUnderline(y)
		y += lineSpacing
	}

	// Line: "has acted as the External examiner for <context> Examination(s) in our"
	doc.setFont('times', 'normal')
	const part1 = `has acted as the ${roleText} for `
	doc.text(part1, contentX, y)

	let curX = contentX + doc.getTextWidth(part1)

	doc.setFont('times', 'bold')
	doc.text(context, curX, y)
	curX += doc.getTextWidth(context)

	doc.setFont('times', 'normal')
	doc.text(' Examination(s) in our', curX, y)
	y += lineSpacing

	// Line: "College on/from <dates>   (X Days)"
	doc.setFont('times', 'normal')
	doc.setFontSize(fontSize)

	if (uniqueDates.length === 1) {
		// "College on <date>   (X Days)"
		const collegePrefix = 'College on '
		doc.text(collegePrefix, contentX, y)
		const collegePW = doc.getTextWidth(collegePrefix)

		doc.setFont('times', 'bold')
		const singleDate = formatDateDDMMYYYY(uniqueDates[0])
		doc.text(singleDate, contentX + collegePW, y)
		const dateW = doc.getTextWidth(singleDate)
		// Underline only under date
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(contentX + collegePW, y + underlineOffset, contentX + collegePW + dateW + 4, y + underlineOffset)

		doc.setFont('times', 'normal')
		doc.text(`   ${daysText}`, contentX + collegePW + dateW + 6, y)
	} else if (areDatesContiguous(uniqueDates)) {
		// "College from <date> to <date>   (X Days)"
		const collegePrefix = 'College from '
		doc.text(collegePrefix, contentX, y)
		let cx = contentX + doc.getTextWidth(collegePrefix)

		doc.setFont('times', 'bold')
		const fromStr = formatDateDDMMYYYY(uniqueDates[0])
		doc.text(fromStr, cx, y)
		const fromW = doc.getTextWidth(fromStr)
		// Underline under from-date
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(cx, y + underlineOffset, cx + fromW + 4, y + underlineOffset)
		cx += fromW + 6

		doc.setFont('times', 'normal')
		doc.text('to ', cx, y)
		cx += doc.getTextWidth('to ')

		doc.setFont('times', 'bold')
		const toStr = formatDateDDMMYYYY(uniqueDates[uniqueDates.length - 1])
		doc.text(toStr, cx, y)
		const toW = doc.getTextWidth(toStr)
		// Underline under to-date
		doc.line(cx, y + underlineOffset, cx + toW + 4, y + underlineOffset)
		cx += toW + 6

		doc.setFont('times', 'normal')
		doc.text(daysText, cx, y)
	} else {
		// "College on <date1>, <date2>, ...   (X Days)"
		const collegePrefix = 'College on '
		doc.text(collegePrefix, contentX, y)
		const collegePW = doc.getTextWidth(collegePrefix)

		doc.setFont('times', 'bold')
		const allDatesStr = uniqueDates.map(d => formatDateDDMMYYYY(d)).join(', ')
		const availableW = maxWidth - collegePW - 30
		const datesLines = doc.splitTextToSize(allDatesStr, availableW)

		// First line of dates
		doc.text(datesLines[0], contentX + collegePW, y)
		const firstLineW = doc.getTextWidth(datesLines[0])
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(contentX + collegePW, y + underlineOffset, contentX + collegePW + firstLineW + 4, y + underlineOffset)

		// Remaining date lines
		for (let i = 1; i < datesLines.length; i++) {
			y += lineSpacing
			doc.text(datesLines[i], contentX, y)
			const lineW = doc.getTextWidth(datesLines[i])
			doc.line(contentX, y + underlineOffset, contentX + lineW + 4, y + underlineOffset)
		}

		// Days count
		const lastW = doc.getTextWidth(datesLines[datesLines.length - 1])
		const daysX = datesLines.length > 1 ? contentX + lastW + 6 : contentX + collegePW + lastW + 6
		doc.setFont('times', 'normal')
		doc.text(daysText, daysX, y)
	}

	y += 28

	// Signature line
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text('Signature of the CoE', pageWidth - MARGIN - 8, y, { align: 'right' })

	y += 8
	return y
}

// ---------------------------------------------------------------------------
// Main PDF generator
// ---------------------------------------------------------------------------

export function generateAttendanceCertificatePdf(opts: AttendanceCertificatePdfOptions): jsPDF {
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' })
	const pageWidth = doc.internal.pageSize.getWidth()

	for (let i = 0; i < opts.examiners.length; i++) {
		if (i > 0) doc.addPage()

		let y = drawCertificateHeader(doc, pageWidth, opts)
		drawCertificateBody(doc, pageWidth, y, opts.examiners[i], opts.certificate_context)
	}

	return doc
}
