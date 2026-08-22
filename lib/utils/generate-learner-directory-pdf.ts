import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Generate Learner Directory PDF
 *
 * Follows the Exam Attendance Sheet house style: A4 outline border on every
 * page, JKKN logos left and right, centered institution block, bold report
 * title, Times throughout, and a bordered grid table with the date and page
 * number printed below the border.
 *
 * Landscape rather than the attendance sheet's portrait — the directory has
 * eleven columns (email and batch included) and they do not read at portrait
 * width. Learner photos are deliberately omitted: a full roster runs to
 * thousands of rows, and embedding a thumbnail per row makes the file
 * unusable.
 */

const MARGIN = 6.35 // 0.25 inch narrow margin, same as the attendance sheet
const HEADER_HEIGHT = 30 // reserved band the repeated page header draws into
const FOOTER_HEIGHT = 10

export interface LearnerDirectoryPdfRow {
	register_number?: string
	roll_number?: string
	learner_name?: string
	program_code?: string
	current_semester?: number | null
	admission_year?: number | null
	batch_name?: string
	date_of_birth?: string
	email?: string
	phone?: string
	lifecycle_status?: string
}

export interface LearnerDirectoryPdfFilters {
	status: string
	program: string
	semester: string
	search?: string
}

export interface LearnerDirectoryPdfData {
	learners: LearnerDirectoryPdfRow[]
	/** Institution the roster is scoped to, or a group title for "All Institutions". */
	institutionName: string
	filters: LearnerDirectoryPdfFilters
	/** Base64 data URLs; the header simply skips a logo that failed to load. */
	logoImage?: string | null
	rightLogoImage?: string | null
}

export function generateLearnerDirectoryPDF(data: LearnerDirectoryPdfData): void {
	const doc = buildDocument(data)
	const stamp = new Date().toISOString().split('T')[0]
	doc.save(`learner_directory_${stamp}.pdf`)
}

export function generateLearnerDirectoryPDFBlob(data: LearnerDirectoryPdfData): Blob {
	return buildDocument(data).output('blob')
}

function buildDocument(data: LearnerDirectoryPdfData): jsPDF {
	// compress: zlib the content streams. A full-roster export is ~250 pages of
	// dense text; uncompressed that is ~18 MB, compressed it is a fraction of it.
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const innerMargin = MARGIN + 2
	const tableWidth = pageWidth - 2 * innerMargin

	// Column widths as fractions of the table, so the layout survives a different
	// paper size without re-tuning every number.
	const weights = [12, 26, 50, 22, 11, 13, 24, 20, 54, 22, 22]
	const weightTotal = weights.reduce((sum, w) => sum + w, 0)
	const colWidths = weights.map(w => (w / weightTotal) * tableWidth)

	const body = data.learners.map((learner, index) => [
		String(index + 1),
		learner.register_number || learner.roll_number || '-',
		learner.learner_name || '-',
		learner.program_code || '-',
		learner.current_semester ? String(learner.current_semester) : '-',
		learner.admission_year ? String(learner.admission_year) : '-',
		learner.batch_name || '-',
		formatDate(learner.date_of_birth),
		learner.email || '-',
		learner.phone || '-',
		formatLifecycleLabel(learner.lifecycle_status),
	])

	autoTable(doc, {
		startY: HEADER_HEIGHT,
		head: [[
			'S.No.', 'Register / Roll No.', 'Name of the Learner', 'Program', 'Sem',
			'Year', 'Batch', 'Date of Birth', 'Email', 'Mobile', 'Status',
		]],
		body: body.length > 0 ? body : [['', '', 'No learners match the selected filters.', '', '', '', '', '', '', '', '']],
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 8,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: 1,
			valign: 'middle',
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 8,
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'middle',
			lineColor: [0, 0, 0],
			lineWidth: 0.3,
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: colWidths[0] },
			1: { halign: 'center', cellWidth: colWidths[1] },
			2: { halign: 'left', cellWidth: colWidths[2] },
			3: { halign: 'center', cellWidth: colWidths[3] },
			4: { halign: 'center', cellWidth: colWidths[4] },
			5: { halign: 'center', cellWidth: colWidths[5] },
			6: { halign: 'center', cellWidth: colWidths[6] },
			7: { halign: 'center', cellWidth: colWidths[7] },
			8: { halign: 'left', cellWidth: colWidths[8] },
			9: { halign: 'center', cellWidth: colWidths[9] },
			10: { halign: 'center', cellWidth: colWidths[10] },
		},
		margin: { top: HEADER_HEIGHT, bottom: FOOTER_HEIGHT, left: innerMargin, right: innerMargin },
		tableWidth,
		// Runs for every page autoTable creates, so the border + header repeat.
		didDrawPage: () => {
			drawPageFrame(doc, pageWidth, pageHeight)
			drawHeader(doc, data, pageWidth)
		},
	})

	stampFooters(doc, pageWidth, pageHeight)
	return doc
}

// ========================================================================
// PAGE FRAME + HEADER
// ========================================================================

function drawPageFrame(doc: jsPDF, pageWidth: number, pageHeight: number) {
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.5)
	doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)
}

function drawHeader(doc: jsPDF, data: LearnerDirectoryPdfData, pageWidth: number) {
	let currentY = MARGIN + 2

	// The alias argument matters: without it jsPDF re-embeds the logo bitmap on
	// every page, which on a 200-page roster is tens of megabytes of duplicate
	// image data. With it the image is stored once and referenced per page.
	if (data.logoImage) {
		try {
			doc.addImage(data.logoImage, 'PNG', MARGIN + 2, currentY, 16, 16, 'directory-logo-left')
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	if (data.rightLogoImage) {
		try {
			doc.addImage(data.rightLogoImage, 'PNG', pageWidth - MARGIN - 18, currentY, 16, 16, 'directory-logo-right')
		} catch (e) {
			console.warn('Failed to add right logo:', e)
		}
	}

	// Institution name — font 12 bold
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text(data.institutionName.toUpperCase(), pageWidth / 2, currentY + 5, { align: 'center' })

	// Office line — font 8 normal
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text('Office of the Controller of Examinations', pageWidth / 2, currentY + 9.5, { align: 'center' })

	currentY += 14

	// Title — bold
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text('LEARNER DIRECTORY', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	// Applied filters on the left, roster size on the right — so a printed copy
	// says which slice of the roster it is.
	const { status, program, semester, search } = data.filters
	const parts = [`Status: ${status}`, `Program: ${program}`, `Semester: ${semester}`]
	if (search) parts.push(`Search: "${search}"`)

	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text(parts.join('   |   '), MARGIN + 2, currentY)
	doc.text(
		`Total Learners: ${data.learners.length.toLocaleString()}`,
		pageWidth - MARGIN - 2,
		currentY,
		{ align: 'right' }
	)

	currentY += 1.5
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	doc.line(MARGIN + 2, currentY, pageWidth - MARGIN - 2, currentY)
}

// ========================================================================
// FOOTER — needs the final page count, so it is stamped after the table
// ========================================================================

function stampFooters(doc: jsPDF, pageWidth: number, pageHeight: number) {
	const totalPages = doc.getNumberOfPages()
	const footerY = pageHeight - MARGIN + 4

	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`

	for (let page = 1; page <= totalPages; page++) {
		doc.setPage(page)
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(0, 0, 0)
		doc.text(`Generated on ${dateStr}`, MARGIN + 2, footerY)
		doc.text(`Page ${page}/${totalPages}`, pageWidth - MARGIN - 2, footerY, { align: 'right' })
	}
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

function formatDate(dateStr?: string): string {
	if (!dateStr) return '-'
	try {
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) return dateStr
		const day = date.getDate().toString().padStart(2, '0')
		const month = (date.getMonth() + 1).toString().padStart(2, '0')
		return `${day}-${month}-${date.getFullYear()}`
	} catch {
		return dateStr
	}
}

function formatLifecycleLabel(status?: string): string {
	if (!status) return 'Unknown'
	return status
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}
