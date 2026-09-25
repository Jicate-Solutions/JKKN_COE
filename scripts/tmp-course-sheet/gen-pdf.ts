import { jsPDF } from 'jspdf'
import autoTableMod from 'jspdf-autotable'
const autoTable: any = (autoTableMod as any).default ?? autoTableMod
import type { CourseSheetData, CourseSheetProgram, CourseSheetPdfOptions } from '@/types/course-assessment-sheet'

/**
 * Generate Course Assessment Sheet PDF - one programme per file
 *
 * Portrait A4. The blank attendance sheet comes first, the blank mark entry
 * sheet (assessment components + total + signatories) follows in the same PDF.
 * The college header repeats on every page; the exam session line is shown on
 * the mark entry sheet only.
 */

const MARGIN = 12
const HEADER_END_Y = MARGIN + 42
const SIGNATURE_GAP = 26
// Tables stop short of the page foot so the page number has its own strip
const TABLE_BOTTOM = 16
const FOOTER_Y_OFFSET = 8

// Tall blank cells under the date columns for the faculty signature
const SIGNATURE_ROW_HEIGHT = 30

const COL_SNO = 11
const COL_REGISTER = 29

export function generateCourseAssessmentSheetPDFBlob(
	data: CourseSheetData,
	program: CourseSheetProgram,
	options: CourseSheetPdfOptions
): Blob {
	const doc = new jsPDF('portrait', 'mm', 'a4')

	drawAttendanceSheet(doc, data, program, options)
	doc.addPage()
	drawMarkEntrySheet(doc, data, program, options)
	drawPageNumbers(doc)

	return doc.output('blob')
}

export function getCourseAssessmentSheetFileName(data: CourseSheetData, program: CourseSheetProgram): string {
	const label = program.class_label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
	return `${data.course_code}_${program.program_code}_${label}.pdf`
}

// ========================================================================
// HEADER - logos, college name, class + subject line
// ========================================================================

function drawHeader(doc: jsPDF, data: CourseSheetData, program: CourseSheetProgram, showSession = true): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const y = MARGIN

	if (data.logo_image) {
		try {
			doc.addImage(data.logo_image, 'PNG', MARGIN, y, 18, 18)
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	if (data.right_logo_image) {
		try {
			doc.addImage(data.right_logo_image, 'PNG', pageWidth - MARGIN - 18, y, 18, 18)
		} catch (e) {
			console.warn('Failed to add right logo:', e)
		}
	}

	doc.setTextColor(0, 0, 0)
	doc.setFont('times', 'bold')
	// 12pt keeps the name clear of the logos on either side
	doc.setFontSize(12)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, y + 5, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B),', pageWidth / 2, y + 10, { align: 'center' })
	doc.text('Affiliated to Periyar University)', pageWidth / 2, y + 14, { align: 'center' })

	doc.setFontSize(10)
	doc.text('Komarapalayam- 638 183, Namakkal District, Tamil Nadu.', pageWidth / 2, y + 19, { align: 'center' })

	// Exam session line, e.g. END SEMESTER EXAMINATION - NOV-DEC-2026 (mark entry sheet only)
	doc.setFont('times', 'bold')
	doc.setFontSize(10.5)
	if (showSession) {
		doc.text(`END SEMESTER EXAMINATION - ${(data.session_name || data.session_code || '').toUpperCase()}`, pageWidth / 2, y + 25, { align: 'center' })
	}

	// Class on the left, course code & name on the right; a long title wraps under itself
	const lineY = showSession ? y + 35 : y + 31
	const halfWidth = (pageWidth - 2 * MARGIN) / 2 - 3
	const classLines = doc.splitTextToSize(`Class: ${program.class_label}`, halfWidth)
	const subjectLines = doc.splitTextToSize(`Course Code & Name: ${data.course_code} - ${data.course_title}`, halfWidth)
	doc.text(classLines.slice(0, 2), MARGIN + 2, lineY)
	doc.text(subjectLines.slice(0, 2), pageWidth - MARGIN - 2, lineY, { align: 'right' })
}

// Numbered once everything is drawn, so the total is known
function drawPageNumbers(doc: jsPDF): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const totalPages = doc.getNumberOfPages()

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)
	for (let page = 1; page <= totalPages; page++) {
		doc.setPage(page)
		doc.text(`Page ${page} of ${totalPages}`, pageWidth / 2, pageHeight - FOOTER_Y_OFFSET, { align: 'center' })
	}
}

const TABLE_STYLES = {
	font: 'times',
	fontSize: 10,
	textColor: [0, 0, 0] as [number, number, number],
	lineColor: [0, 0, 0] as [number, number, number],
	lineWidth: 0.2,
	halign: 'center' as const,
	valign: 'middle' as const,
	cellPadding: 1.2,
}

const HEAD_STYLES = {
	fillColor: [255, 255, 255] as [number, number, number],
	textColor: [0, 0, 0] as [number, number, number],
	fontStyle: 'bold' as const,
	lineColor: [0, 0, 0] as [number, number, number],
	lineWidth: 0.2,
}

// ========================================================================
// ATTENDANCE SHEET - blank date columns, tall signature row after the last learner
// ========================================================================

function drawAttendanceSheet(
	doc: jsPDF,
	data: CourseSheetData,
	program: CourseSheetProgram,
	options: CourseSheetPdfOptions
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const columns = Math.min(Math.max(Math.round(options.attendance_columns) || 10, 1), 20)

	const usableWidth = pageWidth - 2 * MARGIN
	const nameWidth = columns > 12 ? 44 : 50
	const attendanceWidth = (usableWidth - COL_SNO - COL_REGISTER - nameWidth) / columns

	const blanks = Array.from({ length: columns }, () => '')
	const columnStyles: Record<number, { cellWidth: number }> = {
		0: { cellWidth: COL_SNO },
		1: { cellWidth: COL_REGISTER },
		2: { cellWidth: nameWidth },
	}
	for (let i = 0; i < columns; i++) columnStyles[3 + i] = { cellWidth: attendanceWidth }

	autoTable(doc, {
		startY: HEADER_END_Y,
		margin: { top: HEADER_END_Y, left: MARGIN, right: MARGIN, bottom: TABLE_BOTTOM },
		theme: 'grid',
		styles: TABLE_STYLES,
		headStyles: HEAD_STYLES,
		columnStyles,
		head: [
			[
				{ content: 'S.No', rowSpan: 2 },
				{ content: 'Register No.', rowSpan: 2 },
				{ content: 'Name of the\nLearner', rowSpan: 2 },
				{ content: 'Attendance', colSpan: columns, styles: { minCellHeight: 8 } },
			],
			// Tall blank cells - the date is written in by hand
			blanks.map(() => ({ content: '', styles: { minCellHeight: 30 } })),
		],
		body: [
			...program.learners.map(l => [l.serial_number, l.register_number, l.learner_name, ...blanks]),
			// Faculty signs under each date column; the label cell spans the three left columns
			[
				{ content: 'Signature', colSpan: 3, styles: { fontStyle: 'bold', fontSize: 12 } },
				...blanks.map(() => ({ content: '', styles: { minCellHeight: SIGNATURE_ROW_HEIGHT } })),
			],
		],
		bodyStyles: { minCellHeight: 8 },
		rowPageBreak: 'avoid',
		didParseCell: (hook) => {
			if (hook.section === 'body' && hook.column.index === 2) hook.cell.styles.fontStyle = 'bold'
		},
		didDrawPage: () => drawHeader(doc, data, program, false),
	})
}

// ========================================================================
// MARK ENTRY SHEET - assessment components, total, signatories
// ========================================================================

function drawMarkEntrySheet(
	doc: jsPDF,
	data: CourseSheetData,
	program: CourseSheetProgram,
	options: CourseSheetPdfOptions
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const components = options.components.filter(c => c.label.trim())
	const totalMarks = components.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0)

	const usableWidth = pageWidth - 2 * MARGIN
	const registerWidth = 31
	const nameWidth = components.length > 4 ? 42 : 52
	const markWidth = (usableWidth - COL_SNO - registerWidth - nameWidth) / (components.length + 1)

	const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
		0: { cellWidth: COL_SNO },
		1: { cellWidth: registerWidth },
		2: { cellWidth: nameWidth, halign: 'left' },
	}
	for (let i = 0; i <= components.length; i++) columnStyles[3 + i] = { cellWidth: markWidth }

	const blanks = Array.from({ length: components.length + 1 }, () => '')
	const totalHead = { content: `Total\n\n(${totalMarks}\nMarks)`, rowSpan: 2 }

	autoTable(doc, {
		startY: HEADER_END_Y,
		margin: { top: HEADER_END_Y, left: MARGIN, right: MARGIN, bottom: TABLE_BOTTOM },
		theme: 'grid',
		styles: TABLE_STYLES,
		headStyles: HEAD_STYLES,
		columnStyles,
		head: components.length > 0
			? [
				[
					{ content: 'S.No', rowSpan: 2 },
					{ content: 'Register No.', rowSpan: 2 },
					{ content: 'Name of the Learner', rowSpan: 2, styles: { halign: 'center' } },
					{ content: 'Assessment', colSpan: components.length, styles: { minCellHeight: 8 } },
					totalHead,
				],
				components.map(c => ({ content: `${c.label.trim()}\n\n(${Number(c.max_marks) || 0} Marks)`, styles: { minCellHeight: 22 } })),
			]
			: [[
				'S.No',
				'Register No.',
				{ content: 'Name of the Learner', styles: { halign: 'center' as const } },
				{ content: `Total\n(${totalMarks} Marks)`, styles: { minCellHeight: 16 } },
			]],
		body: program.learners.map(l => [l.serial_number, l.register_number, l.learner_name, ...blanks]),
		bodyStyles: { minCellHeight: 11 },
		rowPageBreak: 'avoid',
		didDrawPage: () => drawHeader(doc, data, program),
	})

	drawSignatories(doc, data, program, options, true)
}

// ========================================================================
// SIGNATORIES - under the mark entry table
// ========================================================================

// Keep them on the sheet, move to a fresh page only when there is no room
function drawSignatories(
	doc: jsPDF,
	data: CourseSheetData,
	program: CourseSheetProgram,
	options: CourseSheetPdfOptions,
	showSession: boolean
): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const usableWidth = pageWidth - 2 * MARGIN
	const signatories = options.signatories.map(s => s.trim()).filter(Boolean)
	if (signatories.length === 0) return

	let signY = ((doc as any).lastAutoTable.finalY as number) + SIGNATURE_GAP
	if (signY > pageHeight - TABLE_BOTTOM - 8) {
		doc.addPage()
		drawHeader(doc, data, program, showSession)
		signY = HEADER_END_Y + SIGNATURE_GAP
	}

	doc.setFont('times', 'normal')
	doc.setFontSize(10.5)
	const slotWidth = usableWidth / signatories.length
	signatories.forEach((name, i) => {
		const lines = doc.splitTextToSize(name, slotWidth - 8)
		doc.text(lines, MARGIN + slotWidth * i + slotWidth / 2, signY, { align: 'center' })
	})
}
