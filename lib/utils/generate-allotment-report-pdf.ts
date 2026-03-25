import jsPDF from 'jspdf'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllotmentReportRow {
	timetable_id: string
	exam_date: string
	session: string
	batch_no: number
	course_code: string
	course_title: string
	student_count: number
	register_range: string
	internal_examiner: string
	external_examiner: string
	skilled_examiner: string
	programmer_examiner: string
	exam_duration: number | null
	board_code: string
}

export interface AllotmentReportGroup {
	board_code: string
	board_name: string
	rows: AllotmentReportRow[]
}

export interface AllotmentReportPdfOptions {
	institution_name: string
	institution_address: string
	institution_accreditation: string
	session_name: string
	ref_number: string
	groups: AllotmentReportGroup[]
	hasSkilled: boolean
	hasProgrammer: boolean
	/** Primary color hex (e.g. '#006400') for institution name */
	primary_color?: string
	/** Logo images (base64 data URIs) */
	logoImage?: string
	rightLogoImage?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINE_HEIGHT_FACTOR = 0.4
const MARGIN = 10
const MIN_ROW_HEIGHT = 12
const HEADER_ROW_HEIGHT = 14
const FONT_SIZE = 9
const FONT_SIZE_SMALL = 8

// Roman numeral conversion
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
	'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']

function toRoman(n: number): string {
	if (n >= 1 && n <= ROMAN_NUMERALS.length) return ROMAN_NUMERALS[n - 1]
	return String(n)
}

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

function formatDuration(hours: number | null): string {
	if (!hours) return '-'
	const wholeHours = Math.floor(hours)
	const mins = Math.round((hours - wholeHours) * 60)
	if (mins === 0) return `${wholeHours} Hr${wholeHours !== 1 ? 's' : ''}`
	return `${wholeHours}h ${mins}m`
}

function calcWrappedHeight(doc: jsPDF, text: string, maxWidth: number, fontSize: number): number {
	if (!text) return 0
	doc.setFontSize(fontSize)
	const lines = doc.splitTextToSize(text, maxWidth)
	const lineH = fontSize * LINE_HEIGHT_FACTOR
	return lines.length * lineH
}

function drawWrappedCell(
	doc: jsPDF,
	text: string,
	x: number,
	y: number,
	cellWidth: number,
	cellHeight: number,
	align: 'left' | 'center' = 'left',
	fontSize: number = FONT_SIZE
) {
	if (!text) return
	doc.setFontSize(fontSize)
	const maxW = cellWidth - 2
	const lines = doc.splitTextToSize(text, maxW)
	const lineH = fontSize * LINE_HEIGHT_FACTOR
	const textX = align === 'left' ? x + 1 : x + cellWidth / 2
	const startY = y + cellHeight / 2 + 1.5 - (lines.length - 1) * lineH / 2
	for (let i = 0; i < lines.length; i++) {
		doc.text(lines[i], textX, startY + i * lineH, { align })
	}
}

// ---------------------------------------------------------------------------
// Draw header (institution info + report title)
// ---------------------------------------------------------------------------

function drawPageHeader(doc: jsPDF, pageWidth: number, opts: AllotmentReportPdfOptions): number {
	let y = MARGIN

	// College Logo (left side) - 16x16mm
	if (opts.logoImage) {
		try { doc.addImage(opts.logoImage, 'PNG', MARGIN, y, 16, 16) } catch {}
	}

	// College Logo (right side) - 16x16mm
	if (opts.rightLogoImage) {
		try { doc.addImage(opts.rightLogoImage, 'PNG', pageWidth - MARGIN - 16, y, 16, 16) } catch {}
	}

	// Institution name — font 14 bold, dark blue
	doc.setFont('times', 'bold')
	doc.setFontSize(14)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, y + 5, { align: 'center' })

	// Accreditation — font 10 italic
	doc.setFont('times', 'italic')
	doc.setFontSize(10)
	doc.setTextColor(0, 0, 0)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, y + 10, { align: 'center' })

	y += 15

	// Address — font 11 bold italic
	doc.setFont('times', 'bolditalic')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 6

	// Ref. No.
	doc.setFontSize(10)
	doc.setFont('times', 'normal')
	doc.text(`Ref. No.: ${opts.ref_number}`, MARGIN, y)
	y += 6

	// Report title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text('PRACTICAL EXAMINATIONS', pageWidth / 2, y, { align: 'center' })
	y += 5

	doc.setFontSize(11)
	doc.text(`SEMESTER EXAMINATION - ${opts.session_name}`, pageWidth / 2, y, { align: 'center' })
	y += 7

	return y
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function getColumnDefs(hasSkilled: boolean, hasProgrammer: boolean) {
	const cols: Array<{ header: string; width: number; align: 'left' | 'center' }> = [
		{ header: 'DATE &\nSESSION', width: 20, align: 'center' },
		{ header: 'BATCH\nNO.', width: 10, align: 'center' },
		{ header: 'NAME OF THE PRACTICAL\nEXAMINATION & CODE', width: 48, align: 'center' },
		{ header: 'NO. OF\nSTUDENTS', width: 12, align: 'center' },
		{ header: 'REGISTER\nNUMBER', width: 24, align: 'center' },
		{ header: 'INTERNAL\nEXAMINER', width: 34, align: 'center' },
		{ header: 'EXTERNAL\nEXAMINER', width: 42, align: 'center' },
	]

	if (hasSkilled) {
		cols.push({ header: 'SKILLED', width: 28, align: 'center' })
	}
	if (hasProgrammer) {
		cols.push({ header: 'PROGRAMMER', width: 28, align: 'center' })
	}

	cols.push({ header: 'EXAM\nDURATION', width: 14, align: 'center' })

	// Scale widths to fit the landscape page
	const pageWidth = 297 - MARGIN * 2 // A4 landscape
	const totalW = cols.reduce((s, c) => s + c.width, 0)
	const scale = pageWidth / totalW
	return cols.map(c => ({ ...c, width: Math.round(c.width * scale * 10) / 10 }))
}

// ---------------------------------------------------------------------------
// Draw table header row (white bg, bold black text, black borders)
// ---------------------------------------------------------------------------

function drawTableHeader(doc: jsPDF, y: number, columns: ReturnType<typeof getColumnDefs>): number {
	let x = MARGIN

	// Black borders on each cell (no fill — white background)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	for (const col of columns) {
		doc.rect(x, y, col.width, HEADER_ROW_HEIGHT, 'S')
		x += col.width
	}

	// Bold black text
	x = MARGIN
	doc.setFont('times', 'bold')
	doc.setFontSize(FONT_SIZE)
	doc.setTextColor(0, 0, 0)

	for (const col of columns) {
		drawWrappedCell(doc, col.header, x, y, col.width, HEADER_ROW_HEIGHT, 'center')
		x += col.width
	}

	return y + HEADER_ROW_HEIGHT
}

// ---------------------------------------------------------------------------
// Draw table data row (white bg, black text, black borders)
// ---------------------------------------------------------------------------

function drawDataRow(
	doc: jsPDF,
	y: number,
	row: AllotmentReportRow,
	columns: ReturnType<typeof getColumnDefs>,
	hasSkilled: boolean,
	hasProgrammer: boolean
): number {
	// Calculate row height from all cells
	doc.setFont('times', 'normal')

	const courseText = `${row.course_code} - ${row.course_title}`
	const courseW = columns[2].width - 2
	const intW = columns[5].width - 2
	const extW = columns[6].width - 2

	let rowH = MIN_ROW_HEIGHT
	const courseH = calcWrappedHeight(doc, courseText, courseW, FONT_SIZE) + 5
	const intH = calcWrappedHeight(doc, row.internal_examiner, intW, FONT_SIZE_SMALL) + 5
	const extH = calcWrappedHeight(doc, row.external_examiner, extW, FONT_SIZE_SMALL) + 5
	rowH = Math.max(rowH, courseH, intH, extH)

	if (hasSkilled) {
		const skilledIdx = 7
		const skilledH = calcWrappedHeight(doc, row.skilled_examiner, columns[skilledIdx].width - 2, FONT_SIZE_SMALL) + 5
		rowH = Math.max(rowH, skilledH)
	}
	if (hasProgrammer) {
		const progIdx = hasSkilled ? 8 : 7
		const progH = calcWrappedHeight(doc, row.programmer_examiner, columns[progIdx].width - 2, FONT_SIZE_SMALL) + 5
		rowH = Math.max(rowH, progH)
	}

	// Draw cell borders (all black, no fill)
	let x = MARGIN
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	for (const col of columns) {
		doc.rect(x, y, col.width, rowH, 'S')
		x += col.width
	}

	// Draw cell contents
	x = MARGIN
	doc.setTextColor(0, 0, 0)

	let colIdx = 0

	// Date & Session
	doc.setFont('times', 'normal')
	drawWrappedCell(doc, `${formatDateDDMMYYYY(row.exam_date)}\n${row.session}`, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE)
	x += columns[colIdx].width; colIdx++

	// Batch (Roman numeral, bold)
	doc.setFont('times', 'bold')
	drawWrappedCell(doc, toRoman(row.batch_no), x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE)
	x += columns[colIdx].width; colIdx++

	// Course Code & Name (bold)
	doc.setFont('times', 'bold')
	drawWrappedCell(doc, `${row.course_code} - ${row.course_title}`, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE)
	x += columns[colIdx].width; colIdx++

	// Number of Students
	doc.setFont('times', 'normal')
	drawWrappedCell(doc, String(row.student_count), x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE)
	x += columns[colIdx].width; colIdx++

	// Register Number
	const regText = row.register_range.includes(' - ')
		? row.register_range.replace(' - ', ' -\n')
		: row.register_range
	drawWrappedCell(doc, regText, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE_SMALL)
	x += columns[colIdx].width; colIdx++

	// Internal Examiner (name, mobile — smaller font)
	doc.setFont('times', 'normal')
	drawWrappedCell(doc, row.internal_examiner, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE_SMALL)
	x += columns[colIdx].width; colIdx++

	// External Examiner (name, designation, address, mobile — smaller font)
	drawWrappedCell(doc, row.external_examiner, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE_SMALL)
	x += columns[colIdx].width; colIdx++

	// Skilled (conditional)
	if (hasSkilled) {
		drawWrappedCell(doc, row.skilled_examiner, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE_SMALL)
		x += columns[colIdx].width; colIdx++
	}

	// Programmer (conditional)
	if (hasProgrammer) {
		drawWrappedCell(doc, row.programmer_examiner, x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE_SMALL)
		x += columns[colIdx].width; colIdx++
	}

	// Exam Duration
	drawWrappedCell(doc, formatDuration(row.exam_duration), x, y, columns[colIdx].width, rowH, 'center', FONT_SIZE)

	return y + rowH
}

// ---------------------------------------------------------------------------
// Draw programme group header (separate section, no border)
// ---------------------------------------------------------------------------

function drawGroupHeader(doc: jsPDF, y: number, label: string, pageWidth: number): number {
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)

	// Wrap text if needed
	const maxW = pageWidth - 2 * MARGIN
	const lines = doc.splitTextToSize(`Board :  ${label}`, maxW)
	for (const line of lines) {
		doc.text(line, MARGIN, y)
		y += 5
	}
	y += 2

	return y
}

// ---------------------------------------------------------------------------
// Draw footer
// ---------------------------------------------------------------------------

function drawFooter(doc: jsPDF, pageWidth: number, pageNum: number, totalPages: number) {
	const pageHeight = doc.internal.pageSize.getHeight()
	const footerY = pageHeight - MARGIN + 2

	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.setTextColor(0, 0, 0)

	const now = new Date()
	const dd = String(now.getDate()).padStart(2, '0')
	const mm = String(now.getMonth() + 1).padStart(2, '0')
	const yyyy = now.getFullYear()
	doc.text(`Generated: ${dd}/${mm}/${yyyy}`, MARGIN, footerY)
	doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - MARGIN, footerY, { align: 'right' })
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export function generateAllotmentReportPdf(opts: AllotmentReportPdfOptions): jsPDF {
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const maxY = pageHeight - MARGIN - 5 // leave room for footer

	const columns = getColumnDefs(opts.hasSkilled, opts.hasProgrammer)

	let pageNum = 0

	for (let gIdx = 0; gIdx < opts.groups.length; gIdx++) {
		const group = opts.groups[gIdx]

		// New page per programme (first group uses page 1)
		if (gIdx > 0) doc.addPage('a4', 'landscape')
		pageNum++

		// Draw page header
		let y = drawPageHeader(doc, pageWidth, opts)

		// Draw programme group header (separate section, no border)
		y = drawGroupHeader(doc, y, `${group.board_code} - ${group.board_name}`, pageWidth)

		// Draw table header
		y = drawTableHeader(doc, y, columns)

		// Draw data rows
		for (let rIdx = 0; rIdx < group.rows.length; rIdx++) {
			const row = group.rows[rIdx]

			// Check if we need a new page (within same group)
			if (y + MIN_ROW_HEIGHT > maxY) {
				doc.addPage('a4', 'landscape')
				pageNum++
				y = drawPageHeader(doc, pageWidth, opts)

				// Re-draw programme header (contd.) and table header
				y = drawGroupHeader(doc, y, `${group.board_code} - ${group.board_name} (contd.)`, pageWidth)
				y = drawTableHeader(doc, y, columns)
			}

			y = drawDataRow(doc, y, row, columns, opts.hasSkilled, opts.hasProgrammer)
		}
	}

	// Draw footers on all pages
	const actualTotalPages = doc.getNumberOfPages()
	for (let p = 1; p <= actualTotalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, p, actualTotalPages)
	}

	return doc
}
