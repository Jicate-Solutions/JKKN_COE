import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AttendanceSheetPdfData, AttendanceSheet, AttendanceSheetStudent } from '@/types/exam-attendance-sheet'

/**
 * Generate Exam Attendance Sheet PDF
 *
 * Header: matches hall ticket (logos, institution name, accreditation)
 * Table + Footer: matches Anna University reference PDF format
 *
 * Portrait A4, 25 rows per page, student photos as thumbnails.
 * A4 outline border on every page.
 */

const ROWS_PER_PAGE = 25
const MARGIN = 6.35 // 0.25 inch narrow margin

export function generateExamAttendanceSheetPDF(data: AttendanceSheetPdfData): void {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	// Calculate global total pages across ALL sheets
	let globalTotalPages = 0
	for (const sheet of data.sheets) {
		globalTotalPages += Math.max(1, Math.ceil(sheet.students.length / ROWS_PER_PAGE))
	}

	let isFirstPage = true
	let globalPageNum = 0

	for (const sheet of data.sheets) {
		const totalStudents = sheet.students.length
		const sheetPages = Math.max(1, Math.ceil(totalStudents / ROWS_PER_PAGE))

		for (let pageNum = 0; pageNum < sheetPages; pageNum++) {
			if (!isFirstPage) doc.addPage()
			isFirstPage = false

			const startIdx = pageNum * ROWS_PER_PAGE
			const endIdx = Math.min(startIdx + ROWS_PER_PAGE, totalStudents)
			const pageStudents = sheet.students.slice(startIdx, endIdx)

			// A4 outline border
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.5)
			doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)

			let currentY = MARGIN + 2

			currentY = drawHeader(doc, data, pageWidth, currentY)
			currentY = drawMetadata(doc, sheet, pageWidth, currentY)
			const tableEndY = drawStudentTable(doc, pageStudents, startIdx, pageWidth, currentY)
			drawFooter(doc, pageWidth, pageHeight, tableEndY, globalPageNum, globalTotalPages, data.exam_type)
			globalPageNum++
		}
	}

	const dateFormatted = formatDateForFilename(data.exam_date)
	const examYear = data.exam_date ? new Date(data.exam_date).getFullYear() : new Date().getFullYear()
	const fileName = `${dateFormatted}_${data.session_type}_${data.session_code}_${examYear}_ESE_Att_Sheet.pdf`
	doc.save(fileName)
}

export function generateExamAttendanceSheetPDFBlob(data: AttendanceSheetPdfData): Blob {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	// Calculate global total pages across ALL sheets
	let globalTotalPages = 0
	for (const sheet of data.sheets) {
		globalTotalPages += Math.max(1, Math.ceil(sheet.students.length / ROWS_PER_PAGE))
	}

	let isFirstPage = true
	let globalPageNum = 0

	for (const sheet of data.sheets) {
		const totalStudents = sheet.students.length
		const sheetPages = Math.max(1, Math.ceil(totalStudents / ROWS_PER_PAGE))

		for (let pageNum = 0; pageNum < sheetPages; pageNum++) {
			if (!isFirstPage) doc.addPage()
			isFirstPage = false

			const startIdx = pageNum * ROWS_PER_PAGE
			const endIdx = Math.min(startIdx + ROWS_PER_PAGE, totalStudents)
			const pageStudents = sheet.students.slice(startIdx, endIdx)

			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.5)
			doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)

			let currentY = MARGIN + 2
			currentY = drawHeader(doc, data, pageWidth, currentY)
			currentY = drawMetadata(doc, sheet, pageWidth, currentY)
			const tableEndY = drawStudentTable(doc, pageStudents, startIdx, pageWidth, currentY)
			drawFooter(doc, pageWidth, pageHeight, tableEndY, globalPageNum, globalTotalPages, data.exam_type)
			globalPageNum++
		}
	}

	return doc.output('blob')
}

// ========================================================================
// HEADER — matches hall ticket exactly
// ========================================================================

function drawHeader(doc: jsPDF, data: AttendanceSheetPdfData, pageWidth: number, startY: number): number {
	let currentY = startY

	// College Logo (left side) - 16x16mm
	if (data.logo_image) {
		try {
			doc.addImage(data.logo_image, 'PNG', MARGIN + 2, currentY, 16, 16)
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	// College Logo (right side) - 16x16mm
	if (data.right_logo_image) {
		try {
			doc.addImage(data.right_logo_image, 'PNG', pageWidth - MARGIN - 18, currentY, 16, 16)
		} catch (e) {
			console.warn('Failed to add right logo:', e)
		}
	}

	// Institution name — font 12 bold
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

	// Accreditation — single line, font 7
	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 8, { align: 'center' })

	currentY += 11

	// Address — font 9 normal
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

	currentY += 4

	// Exam session name — normal (not bold)
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.text(`SEMESTER EXAMINATION - ${data.session_name}`, pageWidth / 2, currentY, { align: 'center' })

	currentY += 4

	// Title — bold
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text('EXAMINATION ATTENDANCE SHEET', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	return currentY
}

// ========================================================================
// METADATA — 2 rows only (no College Code/Name row)
// ========================================================================

function drawMetadata(doc: jsPDF, sheet: AttendanceSheet, pageWidth: number, startY: number): number {
	let currentY = startY
	const rightX = pageWidth - MARGIN - 2
	const labelEnd = MARGIN + 40
	const rightLabelX = rightX - 53
	const valueMaxWidth = rightLabelX - labelEnd - 2

	// Row 1: Program Code/Name ... Date of Examination
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)
	doc.text('Program Code/Name :', MARGIN + 2, currentY)
	doc.setFont('times', 'normal')
	const programText = `${sheet.program_code} - ${sheet.program_name}`
	const programLines = doc.splitTextToSize(programText, valueMaxWidth)
	doc.text(programLines, labelEnd, currentY)

	doc.setFont('times', 'bold')
	doc.text('Date of Examination :', rightLabelX, currentY)
	doc.setFont('times', 'normal')
	doc.text(formatExamDate(sheet.exam_date), rightX, currentY, { align: 'right' })

	currentY += Math.max(5, programLines.length * 4)

	// Row 2: Subject Code/Name ... Session
	doc.setFont('times', 'bold')
	doc.text('Subject Code/Name :', MARGIN + 2, currentY)
	doc.setFont('times', 'normal')
	const subjectText = `${sheet.course_code} - ${sheet.course_title}`
	const subjectLines = doc.splitTextToSize(subjectText, valueMaxWidth)
	doc.text(subjectLines, labelEnd, currentY)

	doc.setFont('times', 'bold')
	doc.text('Session :', rightLabelX, currentY)
	doc.setFont('times', 'normal')
	doc.text(sheet.session, rightX, currentY, { align: 'right' })

	currentY += Math.max(3, (subjectLines.length - 1) * 4 + 3)

	return currentY
}

// ========================================================================
// STUDENT TABLE
// ========================================================================

function drawStudentTable(
	doc: jsPDF,
	students: AttendanceSheetStudent[],
	startSerialOffset: number,
	pageWidth: number,
	startY: number
): number {
	const innerMargin = MARGIN + 2
	const tableWidth = pageWidth - 2 * innerMargin
	const headerHeight = 10
	const rowHeight = 8

	// Column widths: S.No 10, RegNo 28, Name 56, AnswerBook 26, WriteAB 18, Signature 32, Photo 20 (sum ~190)
	const colWidths = [10, 28, 56, 26, 18, 38, tableWidth - 10 - 28 - 56 - 26 - 18 - 38]

	const tableData: string[][] = []
	for (let i = 0; i < ROWS_PER_PAGE; i++) {
		if (i < students.length) {
			const s = students[i]
			tableData.push([
				(startSerialOffset + i + 1).toString(),
				s.register_number,
				s.student_name,
				'',
				'',
				'',
				''
			])
		} else {
			tableData.push(['', '', '', '', '', '', ''])
		}
	}

	autoTable(doc, {
		startY: startY,
		head: [['S.No.', 'Register\nNumber', 'Name of the Candidate', 'Answer Book No.', '* Write AB\nfor Absent', 'Signature of the\nCandidate', 'Photo']],
		body: tableData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontStyle: 'normal',
			fontSize: 10,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: 0.8,
			valign: 'middle',
			minCellHeight: rowHeight,
			cellWidth: 'wrap'
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 9,
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'middle',
			minCellHeight: headerHeight,
			lineColor: [0, 0, 0],
			lineWidth: 0.3
		},
		bodyStyles: {
			font: 'times',
			fontStyle: 'normal',
			fontSize: 10,
			valign: 'top',
			minCellHeight: rowHeight,
			overflow: 'linebreak'
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: colWidths[0] },
			1: { halign: 'center', cellWidth: colWidths[1] },
			2: { halign: 'left', cellWidth: colWidths[2] },
			3: { halign: 'center', cellWidth: colWidths[3] },
			4: { halign: 'center', cellWidth: colWidths[4] },
			5: { halign: 'center', cellWidth: colWidths[5] },
			6: { halign: 'center', cellWidth: colWidths[6] }
		},
		margin: { left: innerMargin, right: innerMargin },
		tableWidth: tableWidth,
		didDrawCell: (data: any) => {
			if (data.section === 'body' && data.column.index === 6) {
				const rowIndex = data.row.index
				if (rowIndex < students.length) {
					const student = students[rowIndex]
					if (!student) return
					if (student.student_photo_url) {
						try {
							const imgW = 7
							const imgH = 7
							const cellX = data.cell.x
							const cellY = data.cell.y
							const cellW = data.cell.width
							const cellH = data.cell.height
							const imgX = cellX + (cellW - imgW) / 2
							const imgY = cellY + (cellH - imgH) / 2
							doc.addImage(student.student_photo_url, 'JPEG', imgX, imgY, imgW, imgH)
						} catch (e) {
							drawEmptyPhotoBox(doc, data.cell)
						}
					} else {
						drawEmptyPhotoBox(doc, data.cell)
					}
				}
			}
		}
	})

	return (doc as any).lastAutoTable.finalY
}

function drawEmptyPhotoBox(doc: jsPDF, cell: any) {
	const boxW = 7
	const boxH = 7
	const boxX = cell.x + (cell.width - boxW) / 2
	const boxY = cell.y + (cell.height - boxH) / 2
	doc.setDrawColor(180, 180, 180)
	doc.setLineWidth(0.15)
	doc.rect(boxX, boxY, boxW, boxH)
	doc.setDrawColor(0, 0, 0)
}

// ========================================================================
// FOOTER — matches Anna University reference
// ========================================================================

function drawFooter(
	doc: jsPDF,
	pageWidth: number,
	pageHeight: number,
	tableEndY: number,
	pageNum: number,
	totalPages: number,
	examType?: string
) {
	const innerMargin = MARGIN + 2
	const tableWidth = pageWidth - 2 * innerMargin
	let currentY = tableEndY

	// ── Line above TOTAL PRESENT ──
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.3)
	doc.line(innerMargin, currentY, innerMargin + tableWidth, currentY)

	// ── TOTAL PRESENT / TOTAL ABSENT ──
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)
	doc.text('TOTAL PRESENT :', innerMargin + 5, currentY + 4)
	doc.text('TOTAL ABSENT :', innerMargin + tableWidth / 2 + 5, currentY + 4)

	currentY += 6
	doc.line(innerMargin, currentY, innerMargin + tableWidth, currentY)
	currentY += 3

	// ── Certificate line + AB note ──
	doc.setFont('times', 'bold')
	doc.setFontSize(8)
	doc.text('Certified that the following particulars have been Verified :', MARGIN + 2, currentY)
	doc.setFont('times', 'normal')
	doc.text("* Hall Superintendent should mark 'AB' for Absent", pageWidth - MARGIN - 2, currentY, { align: 'right' })

	currentY += 3

	// ── Certificate points ──
	doc.setFont('times', 'normal')
	doc.setFontSize(8)

	const certPoints = [
		'1. The Register No. in the attendance sheet with that in the hall ticket.',
		'2. The identification of the candidate with the photo given in the hall ticket.',
		'3. The answer book number entered in the attendance sheet by the candidate with the Serial No. on the Answer Book.'
	]

	for (const point of certPoints) {
		doc.text(point, MARGIN + 7, currentY)
		currentY += 3
	}

	// ── Signature lines (down 1mm from previous position) ──
	const sigY = pageHeight - MARGIN - 3
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	const isPracticalOrProject = examType === 'Practical' || examType === 'Project'
	const leftSigLabel = isPracticalOrProject
		? 'Signature of the Internal Examiner'
		: 'Signature of the Hall Superintendent with Name and Designation'
	const rightSigLabel = isPracticalOrProject
		? 'Signature of the External Examiner'
		: 'Signature of the Chief Superintendent with Name and Designation'
	doc.text(leftSigLabel, MARGIN + 2, sigY)
	doc.text(rightSigLabel, pageWidth - MARGIN - 2, sigY, { align: 'right' })

	// ── Date & Page number: BELOW the A4 border ──
	const footerY = pageHeight - MARGIN + 4
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.setTextColor(0, 0, 0)

	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`
	doc.text(dateStr, MARGIN + 2, footerY)
	doc.text(`Page ${pageNum + 1}/${totalPages}`, pageWidth - MARGIN - 2, footerY, { align: 'right' })
}

// ========================================================================
// UTILITY FUNCTIONS
// ========================================================================

function formatExamDate(dateStr: string): string {
	if (!dateStr) return '-'
	try {
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) return dateStr
		const day = date.getDate().toString().padStart(2, '0')
		const month = (date.getMonth() + 1).toString().padStart(2, '0')
		const year = date.getFullYear()
		return `${day}-${month}-${year}`
	} catch {
		return dateStr
	}
}

function formatDateForFilename(dateStr: string): string {
	if (!dateStr) return 'unknown'
	try {
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) return dateStr.replace(/[^a-zA-Z0-9]/g, '_')
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
	} catch {
		return dateStr.replace(/[^a-zA-Z0-9]/g, '_')
	}
}
