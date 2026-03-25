import jsPDF from 'jspdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LunchDateRow {
	serial_number: number
	exam_date: string
	purpose: string
	internal_count: number
	external_count: number
	total_persons: number
}

export interface LunchRequirementPdfOptions {
	institution_name: string
	institution_address: string
	institution_accreditation: string
	session_name: string
	dates: LunchDateRow[]
	summary: {
		total_dates: number
		total_internal: number
		total_external: number
		total_persons: number
	}
	primary_color?: string
	logoImage?: string
	rightLogoImage?: string
}

// ---------------------------------------------------------------------------
// Constants (A5 landscape, narrow margins)
// ---------------------------------------------------------------------------

const MARGIN = 8
const FONT_SIZE = 9
const SMALL_FONT = 8
const ROW_HEIGHT = 8
const HEADER_ROW_HEIGHT = 10

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
	n = n.replace(/^JKKN\s+/i, 'J.K.K.NATARAJA ')
	n = n.replace(/\bAND\b/g, '&')
	return n
}

// ---------------------------------------------------------------------------
// Draw compact header (matching screenshot pattern)
// ---------------------------------------------------------------------------

function drawPageHeader(doc: jsPDF, pageWidth: number, opts: LunchRequirementPdfOptions): number {
	let y = MARGIN

	const pc = opts.primary_color || '#006400'
	const pcR = parseInt(pc.slice(1, 3), 16) || 0
	const pcG = parseInt(pc.slice(3, 5), 16) || 100
	const pcB = parseInt(pc.slice(5, 7), 16) || 0

	const logoSize = 12

	// Logos
	if (opts.logoImage) {
		try { doc.addImage(opts.logoImage, 'PNG', MARGIN, y, logoSize, logoSize) } catch { /* skip */ }
	}
	if (opts.rightLogoImage) {
		try { doc.addImage(opts.rightLogoImage, 'PNG', pageWidth - MARGIN - logoSize, y, logoSize, logoSize) } catch { /* skip */ }
	}

	// Institution name
	doc.setFont('times', 'bolditalic')
	doc.setFontSize(12)
	doc.setTextColor(pcR, pcG, pcB)
	const instName = normalizeInstitutionName(opts.institution_name || 'J.K.K. Nataraja College of Arts & Science')
	doc.text(instName, pageWidth / 2, y + 5, { align: 'center' })
	y += 9

	// Accreditation
	doc.setFont('times', 'italic')
	doc.setFontSize(7)
	doc.setTextColor(0, 0, 0)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, y, { align: 'center' })
	y += 4

	// Address (bold)
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text(opts.institution_address || 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 5

	// Report title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('Lunch Requirement', pageWidth / 2, y, { align: 'center' })
	const titleText = 'Lunch Requirement'
	const titleWidth = doc.getTextWidth(titleText)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	doc.line(pageWidth / 2 - titleWidth / 2, y + 1, pageWidth / 2 + titleWidth / 2, y + 1)
	y += 5

	return y
}

// ---------------------------------------------------------------------------
// Main PDF generator
// ---------------------------------------------------------------------------

export function generateLunchRequirementPdf(opts: LunchRequirementPdfOptions): jsPDF {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	let y = drawPageHeader(doc, pageWidth, opts)

	// Purpose label before table
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.setTextColor(0, 0, 0)
	doc.text('Purpose : Practical Examination', MARGIN + 4, y)
	y += 6

	// Column definitions (3 columns: S.No, Date, Total Persons)
	const cols = [
		{ header: 'S.No', width: 20 },
		{ header: 'Date', width: 40 },
		{ header: 'Total Persons', width: 35 },
	]

	const tableWidth = cols.reduce((sum, c) => sum + c.width, 0)
	const tableStartX = (pageWidth - tableWidth) / 2

	// Draw table header
	function drawTableHeader() {
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.setFillColor(240, 240, 240)
		let x = tableStartX
		for (const col of cols) {
			doc.rect(x, y, col.width, HEADER_ROW_HEIGHT, 'FD')
			x += col.width
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(FONT_SIZE)
		doc.setTextColor(0, 0, 0)

		x = tableStartX
		for (const col of cols) {
			doc.text(col.header, x + col.width / 2, y + HEADER_ROW_HEIGHT / 2 + 1, { align: 'center' })
			x += col.width
		}

		y += HEADER_ROW_HEIGHT
	}

	drawTableHeader()

	// Draw data rows
	doc.setFont('times', 'normal')
	doc.setFontSize(FONT_SIZE)

	for (const row of opts.dates) {
		// Check page break
		if (y + ROW_HEIGHT > pageHeight - 12) {
			doc.addPage()
			y = MARGIN
			drawPageHeader(doc, pageWidth, opts)
			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			doc.text('Purpose : Practical Examination', MARGIN + 4, y)
			y += 6
			drawTableHeader()
		}

		let x = tableStartX
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		// Draw cells
		for (const col of cols) {
			doc.rect(x, y, col.width, ROW_HEIGHT)
			x += col.width
		}

		x = tableStartX
		doc.setTextColor(0, 0, 0)
		doc.setFont('times', 'normal')
		const cellY = y + ROW_HEIGHT / 2 + 1.2

		// S.No
		doc.text(String(row.serial_number), x + cols[0].width / 2, cellY, { align: 'center' })
		x += cols[0].width

		// Date
		doc.text(formatDateDDMMYYYY(row.exam_date), x + cols[1].width / 2, cellY, { align: 'center' })
		x += cols[1].width

		// Total Persons
		doc.setFont('times', 'bold')
		doc.text(String(row.total_persons), x + cols[2].width / 2, cellY, { align: 'center' })
		doc.setFont('times', 'normal')

		y += ROW_HEIGHT
	}

	// Total row
	if (opts.dates.length > 0) {
		let x = tableStartX
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.setFillColor(230, 230, 230)
		for (const col of cols) {
			doc.rect(x, y, col.width, ROW_HEIGHT, 'FD')
			x += col.width
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(FONT_SIZE)
		const cellY = y + ROW_HEIGHT / 2 + 1.2

		// "Total" spanning first 2 cols
		doc.text('Total', tableStartX + (cols[0].width + cols[1].width) / 2, cellY, { align: 'center' })

		// Grand total
		x = tableStartX + cols[0].width + cols[1].width
		doc.text(String(opts.summary.total_persons), x + cols[2].width / 2, cellY, { align: 'center' })
	}

	return doc
}
