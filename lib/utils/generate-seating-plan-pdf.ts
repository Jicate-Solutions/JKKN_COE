import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SeatingPlanPdfData, RoomAllocationResult } from '@/types/seating-allocation'

const MARGIN = 6.35

export function generateSeatingPlanPDF(data: SeatingPlanPdfData): void {
	// A5 portrait
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	const assignedRooms = data.rooms.filter(r => r.students_seated > 0)
	if (assignedRooms.length === 0) return

	let isFirstPage = true

	for (const roomResult of assignedRooms) {
		if (!isFirstPage) doc.addPage()
		isFirstPage = false

		// A5 outline border
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.5)
		doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)

		let y = MARGIN + 2
		y = drawSeatingHeader(doc, data, roomResult, pageWidth, y)
		y = drawCourseInfo(doc, roomResult, pageWidth, y)
		drawSeatingTable(doc, roomResult, pageWidth, pageHeight, y)
		drawSeatingFooter(doc, pageWidth, pageHeight, roomResult)
	}

	const filename = `Seating_Plan_${data.exam_date || 'unknown'}_${data.session_type || ''}.pdf`
	doc.save(filename)
}

// ========================================================================
// HEADER — logos + institution name + exam session + title
// ========================================================================

function drawSeatingHeader(
	doc: jsPDF,
	data: SeatingPlanPdfData,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	startY: number
): number {
	let y = startY

	// College Logo (left) - 12x12mm for A5
	if (data.logo_image) {
		try {
			doc.addImage(data.logo_image, 'PNG', MARGIN + 2, y, 12, 12)
		} catch (e) {
			console.warn('Failed to add logo:', e)
		}
	}

	// College Logo (right) - 12x12mm for A5
	if (data.right_logo_image) {
		try {
			doc.addImage(data.right_logo_image, 'PNG', pageWidth - MARGIN - 14, y, 12, 12)
		} catch (e) {
			console.warn('Failed to add right logo:', e)
		}
	}

	// Institution name
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, y + 3, { align: 'center' })

	// Accreditation
	doc.setFont('times', 'normal')
	doc.setFontSize(5.5)
	doc.text(
		'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
		pageWidth / 2, y + 6.5, { align: 'center' }
	)

	y += 9

	// Address
	doc.setFont('times', 'bold')
	doc.setFontSize(7)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 3.5

	// Exam session — matches hall ticket: "SEMESTER EXAMINATION APRIL - MAY 2026"
	if (data.session_name) {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(`SEMESTER EXAMINATION ${data.session_name}`, pageWidth / 2, y, { align: 'center' })
		y += 3.5
	}

	// Title
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('SEATING ARRANGEMENT', pageWidth / 2, y, { align: 'center' })
	y += 4

	// Room info + date/session row
	const room = roomResult.room
	const leftX = MARGIN + 3
	const rightX = pageWidth - MARGIN - 3

	doc.setFont('times', 'bold')
	doc.setFontSize(7.5)

	// Left: Exam Room
	let roomLabel = `Exam Room : ${room.room_code}`
	if (room.building) {
		roomLabel += ` (${room.building}${room.floor ? `, Floor ${room.floor}` : ''})`
	}
	doc.text(roomLabel, leftX, y)

	// Right: Date + Session
	doc.text(`Session : ${data.session_type || ''}`, rightX, y, { align: 'right' })
	const dateText = `Date : ${formatDate(data.exam_date)}`
	doc.text(dateText, rightX - doc.getTextWidth(`Session : ${data.session_type || ''}`) - 8, y)

	y += 3.5

	// Seated count
	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text(`Seated: ${roomResult.students_seated} / ${roomResult.total_capacity}`, leftX, y)

	y += 3

	return y
}

// ========================================================================
// COURSE INFO — C1 - Course Name : UCC-24UGTA03
// ========================================================================

function drawCourseInfo(
	doc: jsPDF,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	startY: number
): number {
	let y = startY
	const room = roomResult.room

	// Build per-column course info from seat data
	const columnCourses = new Map<number, Set<string>>()
	for (const seat of roomResult.seats) {
		if (seat.student) {
			if (!columnCourses.has(seat.column_number)) {
				columnCourses.set(seat.column_number, new Set())
			}
			columnCourses.get(seat.column_number)!.add(`${seat.student.program_code}-${seat.student.course_code}`)
		}
	}

	doc.setFontSize(7)
	doc.setTextColor(0, 0, 0)

	for (let c = 1; c <= room.columns; c++) {
		const courses = columnCourses.get(c)
		if (courses && courses.size > 0) {
			const label = `C${c} - Course Name : `
			doc.setFont('times', 'bold')
			doc.text(label, MARGIN + 3, y)
			doc.setFont('times', 'normal')
			doc.text([...courses].join(', '), MARGIN + 3 + doc.getTextWidth(label), y)
			y += 3
		}
	}

	y += 1.5

	return y
}

// ========================================================================
// TWO-PANEL SEATING TABLE — left = floor(rows/2), right = remaining
// ========================================================================

function drawSeatingTable(
	doc: jsPDF,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	pageHeight: number,
	startY: number
): void {
	const room = roomResult.room
	const totalRows = room.rows
	const numCols = room.columns

	// Build seat lookup
	const seatLookup = new Map<string, string>()
	for (const seat of roomResult.seats) {
		if (seat.student) {
			seatLookup.set(`${seat.row_number}-${seat.column_number}`, seat.student.stu_register_no)
		}
	}

	// Split: left = floor(rows/2), right = rest
	const leftRows = Math.floor(totalRows / 2)

	// Column headers: SEAT NO., C-1, C-2, C-3
	const colHeaders = ['SEAT\nNO.']
	for (let c = 1; c <= numCols; c++) {
		colHeaders.push(`C-${c}`)
	}

	// Table widths for A5
	const innerMargin = MARGIN + 1.5
	const tableGap = 3
	const totalAvailable = pageWidth - 2 * innerMargin - tableGap
	const halfWidth = totalAvailable / 2

	// Build left panel body
	const leftBody: string[][] = []
	for (let r = 1; r <= leftRows; r++) {
		const row: string[] = [r.toString()]
		for (let c = 1; c <= numCols; c++) {
			row.push(seatLookup.get(`${r}-${c}`) || '')
		}
		leftBody.push(row)
	}

	// Build right panel body
	const rightBody: string[][] = []
	for (let r = leftRows + 1; r <= totalRows; r++) {
		const row: string[] = [r.toString()]
		for (let c = 1; c <= numCols; c++) {
			row.push(seatLookup.get(`${r}-${c}`) || '')
		}
		rightBody.push(row)
	}

	// Column widths
	const seatNoWidth = 8
	const colWidth = (halfWidth - seatNoWidth) / numCols

	const columnStyles: Record<number, any> = {
		0: { halign: 'center' as const, cellWidth: seatNoWidth, fontStyle: 'bold' as const },
	}
	for (let c = 1; c <= numCols; c++) {
		columnStyles[c] = { halign: 'center' as const, cellWidth: colWidth }
	}

	const commonStyles = {
		theme: 'grid' as const,
		styles: {
			font: 'times' as const,
			fontSize: 6.5,
			textColor: [0, 0, 0] as [number, number, number],
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.15,
			cellPadding: 0.6,
			valign: 'middle' as const,
			minCellHeight: 4.5,
		},
		headStyles: {
			font: 'times' as const,
			fontStyle: 'bold' as const,
			fontSize: 6.5,
			fillColor: [230, 230, 230] as [number, number, number],
			textColor: [0, 0, 0] as [number, number, number],
			halign: 'center' as const,
			valign: 'middle' as const,
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.2,
		},
		columnStyles,
	}

	// Draw LEFT table
	if (leftBody.length > 0) {
		autoTable(doc, {
			startY: startY,
			head: [colHeaders],
			body: leftBody,
			...commonStyles,
			margin: { left: innerMargin, right: pageWidth - innerMargin - halfWidth },
			tableWidth: halfWidth,
		})
	}

	// Draw RIGHT table
	if (rightBody.length > 0) {
		autoTable(doc, {
			startY: startY,
			head: [colHeaders],
			body: rightBody,
			...commonStyles,
			margin: { left: innerMargin + halfWidth + tableGap, right: innerMargin },
			tableWidth: halfWidth,
		})
	}
}

// ========================================================================
// FOOTER
// ========================================================================

function drawSeatingFooter(
	doc: jsPDF,
	pageWidth: number,
	pageHeight: number,
	roomResult: RoomAllocationResult
): void {
	const sigY = pageHeight - MARGIN - 3
	doc.setFont('times', 'bold')
	doc.setFontSize(7)
	doc.setTextColor(0, 0, 0)
	doc.text('Signature of the Hall Superintendent', MARGIN + 3, sigY)
	doc.text('Signature of the Chief Superintendent', pageWidth - MARGIN - 3, sigY, { align: 'right' })

	const footerY = pageHeight - MARGIN + 3
	doc.setFont('times', 'normal')
	doc.setFontSize(6.5)
	const now = new Date()
	const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`
	doc.text(dateStr, MARGIN + 3, footerY)
	doc.text(`Room: ${roomResult.room.room_code}`, pageWidth - MARGIN - 3, footerY, { align: 'right' })
}

// ========================================================================
// UTILITY
// ========================================================================

function formatDate(dateStr: string): string {
	if (!dateStr) return '-'
	try {
		const date = new Date(dateStr)
		if (isNaN(date.getTime())) return dateStr
		return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
	} catch {
		return dateStr
	}
}
