import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SeatingPlanPdfData, RoomAllocationResult } from '@/types/seating-allocation'

const MARGIN = 6.35

const COLUMN_COUNT_COLORS: Record<number, [number, number, number]> = {
	1: [30, 100, 220],
	2: [200, 110, 0],
	3: [20, 140, 60],
	4: [140, 30, 180],
	5: [180, 30, 80],
	6: [0, 150, 160],
}
const DEFAULT_COUNT_COLOR: [number, number, number] = [80, 80, 80]

// Column display order: C1 → C2 → C3 (natural left-to-right for PDF panels)
// Seat numbers follow fill order C1 → C3 → C2 (computed separately).
function getColOrder(numCols: number): number[] {
	return Array.from({ length: numCols }, (_, i) => i + 1)
}

// Fill order for continuous seat numbering: C1 first, then C3, then C2
function getFillOrder(numCols: number): number[] {
	if (numCols >= 3) return [1, 3, 2]
	return Array.from({ length: numCols }, (_, i) => i + 1)
}

export function generateSeatingPlanPDF(data: SeatingPlanPdfData): void {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	const assignedRooms = data.rooms.filter(r => r.students_seated > 0)
	if (assignedRooms.length === 0) return

	let isFirstPage = true

	for (const roomResult of assignedRooms) {
		if (!isFirstPage) doc.addPage()
		isFirstPage = false

		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.5)
		doc.rect(MARGIN, MARGIN, pageWidth - 2 * MARGIN, pageHeight - 2 * MARGIN)

		let y = MARGIN + 2
		y = drawSeatingHeader(doc, data, roomResult, pageWidth, y)
		y = drawCourseInfo(doc, roomResult, pageWidth, y)
		drawSeatingTable(doc, roomResult, pageWidth, pageHeight, y)
	}

	const filename = `Seating_Plan_${data.exam_date || 'unknown'}_${data.session_type || ''}.pdf`
	doc.save(filename)
}

// ========================================================================
// HEADER
// ========================================================================

function drawSeatingHeader(
	doc: jsPDF,
	data: SeatingPlanPdfData,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	startY: number
): number {
	let y = startY

	if (data.logo_image) {
		try { doc.addImage(data.logo_image, 'PNG', MARGIN + 2, y, 12, 12) } catch { /* skip */ }
	}
	if (data.right_logo_image) {
		try { doc.addImage(data.right_logo_image, 'PNG', pageWidth - MARGIN - 14, y, 12, 12) } catch { /* skip */ }
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, y + 3, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(5.5)
	doc.text(
		'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
		pageWidth / 2, y + 6.5, { align: 'center' }
	)

	y += 9
	doc.setFont('times', 'bold')
	doc.setFontSize(7)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, y, { align: 'center' })
	y += 3.5

	if (data.session_name) {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(`SEMESTER EXAMINATION ${data.session_name}`, pageWidth / 2, y, { align: 'center' })
		y += 3.5
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('SEATING ARRANGEMENT', pageWidth / 2, y, { align: 'center' })
	y += 4

	// Room info row — three fixed columns: Room | Date | Session
	const room = roomResult.room
	const leftX = MARGIN + 3
	const centerX = pageWidth / 2
	const rightX = pageWidth - MARGIN - 3

	doc.setFont('times', 'bold')
	doc.setFontSize(8)

	// Left: Room name + building/floor
	let roomLabel = `Room : ${room.room_name}`
	if (room.building) {
		roomLabel += ` (${room.building}${room.floor ? `, ${room.floor}` : ''})`
	}
	doc.text(roomLabel, leftX, y)

	// Center: Date
	doc.text(`Date : ${formatDate(data.exam_date)}`, centerX, y, { align: 'center' })

	// Right: Session
	doc.text(`Session : ${data.session_type || ''}`, rightX, y, { align: 'right' })

	y += 3.5

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text(`Seated: ${roomResult.students_seated} / ${roomResult.total_capacity}`, leftX, y)
	y += 3

	return y
}

// ========================================================================
// COURSE INFO — C1 : PCM-24PCMC12 (14) — count in accent colour
// ========================================================================

function drawCourseInfo(
	doc: jsPDF,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	startY: number
): number {
	let y = startY
	const room = roomResult.room
	const colOrder = getColOrder(room.columns)

	// Count students per course per column
	const columnCourses = new Map<number, Map<string, number>>()
	for (const seat of roomResult.seats) {
		if (seat.student) {
			const colMap = columnCourses.get(seat.column_number) ?? new Map<string, number>()
			const key = `${seat.student.program_code}-${seat.student.course_code}`
			colMap.set(key, (colMap.get(key) ?? 0) + 1)
			columnCourses.set(seat.column_number, colMap)
		}
	}

	doc.setFontSize(8)

	for (const c of colOrder) {
		const courses = columnCourses.get(c)
		if (!courses || courses.size === 0) continue

		const accentColor = COLUMN_COUNT_COLORS[c] ?? DEFAULT_COUNT_COLOR
		let xPos = MARGIN + 3

		doc.setFont('times', 'bold')
		doc.setTextColor(0, 0, 0)
		const label = `C${c} : `
		doc.text(label, xPos, y)
		xPos += doc.getTextWidth(label)

		doc.setFont('times', 'normal')
		let first = true
		for (const [courseName, count] of courses) {
			if (!first) {
				doc.setTextColor(0, 0, 0)
				doc.text(', ', xPos, y)
				xPos += doc.getTextWidth(', ')
			}
			doc.setTextColor(0, 0, 0)
			doc.text(courseName, xPos, y)
			xPos += doc.getTextWidth(courseName)
			doc.setFont('times', 'bold')
			doc.setTextColor(...accentColor)
			doc.text(` (${count})`, xPos, y)
			xPos += doc.getTextWidth(` (${count})`)
			doc.setFont('times', 'normal')
			first = false
		}

		doc.setTextColor(0, 0, 0)
		y += 3
	}

	y += 1.5
	return y
}

// ========================================================================
// SEATING TABLE — per-column panels: C-1 | C-2 | C-3
// Each panel: SEAT NO. | PROGRAM | REGISTER NO.
// Seat numbers are CONTINUOUS across columns:
//   C-1 → 1..N1,  C-2 → N1+1..N1+N2,  C-3 → N1+N2+1..total
// ========================================================================

function drawSeatingTable(
	doc: jsPDF,
	roomResult: RoomAllocationResult,
	pageWidth: number,
	pageHeight: number,
	startY: number
): void {
	const room = roomResult.room
	// Display order: C1 → C3 → C2 so seat numbers are continuous in that visual sequence
	const colOrder = getColOrder(room.columns)
	const panelCount = colOrder.length

	// Group seats by column_number, sorted by row_number
	const colSeats = new Map<number, Array<{ reg_no: string; program: string }>>()
	for (const colNum of colOrder) colSeats.set(colNum, [])

	const seatsByCol = new Map<number, typeof roomResult.seats>()
	for (const seat of roomResult.seats) {
		if (!seatsByCol.has(seat.column_number)) seatsByCol.set(seat.column_number, [])
		seatsByCol.get(seat.column_number)!.push(seat)
	}
	for (const colNum of colOrder) {
		const seats = (seatsByCol.get(colNum) || [])
			.sort((a, b) => a.row_number - b.row_number)
			.filter(s => s.student)
		colSeats.set(colNum, seats.map(s => ({
			reg_no: s.student!.stu_register_no,
			program: s.student!.program_display_name || s.student!.program_code,
		})))
	}

	const maxRows = Math.max(...colOrder.map(c => colSeats.get(c)?.length ?? 0))
	if (maxRows === 0) return

	// Seat numbers follow fill order (C1 → C3 → C2), not display order
	const fillOrder = getFillOrder(room.columns)
	const colOffset = new Map<number, number>()
	let runningOffset = 0
	for (const colNum of fillOrder) {
		colOffset.set(colNum, runningOffset)
		runningOffset += colSeats.get(colNum)?.length ?? 0
	}

	// Single-row header: "C-1 SEAT\nNO." | PROGRAM | REGISTER NO.
	const headerRow: string[] = []
	for (const colNum of colOrder) {
		headerRow.push(`C-${colNum} SEAT\nNO.`, 'PROGRAM', 'REGISTER NO.')
	}

	// Build body rows
	const body: string[][] = []
	for (let i = 0; i < maxRows; i++) {
		const row: string[] = []
		for (const colNum of colOrder) {
			const seats = colSeats.get(colNum) ?? []
			if (i < seats.length) {
				const seatNo = (colOffset.get(colNum) ?? 0) + i + 1
				row.push(seatNo.toString(), seats[i].program, seats[i].reg_no)
			} else {
				row.push('', '', '')
			}
		}
		body.push(row)
	}

	// Column widths — wider PROGRAM, narrower REGISTER NO.
	const innerMargin = MARGIN + 1.5
	const totalAvailable = pageWidth - 2 * innerMargin
	const panelWidth = totalAvailable / panelCount
	const seatNoWidth = 11
	const programWidth = 27
	const regNoWidth = panelWidth - seatNoWidth - programWidth

	// Dynamic font sizing — fit all rows on a single A4 page
	const availableTableHeight = pageHeight - startY - MARGIN - 4
	// At fontSize 9, a row renders at ~6mm (padding 1mm both sides + line height).
	// Calculate scale factor so `maxRows` fits in availableTableHeight.
	const baseRowHeight = 6
	const baseFontSize = 9
	const neededHeight = (maxRows + 1) * baseRowHeight // +1 for header row
	let scale = 1
	if (neededHeight > availableTableHeight) {
		scale = availableTableHeight / neededHeight
	}
	const bodyFontSize = Math.max(5.5, baseFontSize * scale)
	const headerFontSize = Math.max(5.5, baseFontSize * scale)
	const programFontSize = bodyFontSize // same base; shrunk per-cell if content too long
	const cellPadding = Math.max(0.4, 1 * scale)
	const minCellHeight = Math.max(3, 5 * scale)

	// Per-cell shrink threshold for long PROGRAM values
	// Approximate char capacity at a given font size & cell width (mm)
	const programCharsAtBase = Math.floor(programWidth * 0.75) // ~0.75 chars per mm at fontSize 9

	const columnStyles: Record<number, object> = {}
	for (let p = 0; p < panelCount; p++) {
		const base = p * 3
		columnStyles[base + 0] = { halign: 'center', cellWidth: seatNoWidth, fontStyle: 'bold' }
		columnStyles[base + 1] = { halign: 'left', cellWidth: programWidth, fontSize: programFontSize }
		columnStyles[base + 2] = { halign: 'left', cellWidth: regNoWidth }
	}

	autoTable(doc, {
		startY,
		head: [headerRow],
		body,
		theme: 'grid',
		pageBreak: 'avoid',
		rowPageBreak: 'avoid',
		styles: {
			font: 'times',
			fontSize: bodyFontSize,
			textColor: [0, 0, 0] as [number, number, number],
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.2,
			cellPadding,
			valign: 'middle',
			minCellHeight,
			fillColor: [255, 255, 255] as [number, number, number],
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: headerFontSize,
			fillColor: [255, 255, 255] as [number, number, number],
			textColor: [0, 0, 0] as [number, number, number],
			halign: 'center',
			valign: 'middle',
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.3,
		},
		columnStyles,
		margin: { left: innerMargin, right: innerMargin },
		tableWidth: totalAvailable,
		didParseCell: (data: any) => {
			// Shrink font size for long PROGRAM values (body cells in PROGRAM column)
			if (data.section === 'body' && data.column.index % 3 === 1) {
				const text = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '')
				if (text.length > programCharsAtBase) {
					const shrinkRatio = programCharsAtBase / text.length
					data.cell.styles.fontSize = Math.max(4.5, programFontSize * shrinkRatio)
				}
			}
		},
		didDrawCell: (data: any) => {
			// Thicker vertical divider between panels
			if (data.column.index > 0 && data.column.index % 3 === 0) {
				doc.setDrawColor(0, 0, 0)
				doc.setLineWidth(0.6)
				doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height)
				doc.setLineWidth(0.2)
			}
		},
	})
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
