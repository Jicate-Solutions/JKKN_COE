import jsPDF from 'jspdf'
import type { SeatingPlanPdfData, SeatingStrategy } from '@/types/seating-allocation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = 15

const PROGRAM_COLORS_HEX = [
	'#DBEAFE', // blue-100
	'#D1FAE5', // emerald-100
	'#FEF3C7', // amber-100
	'#EDE9FE', // purple-100
	'#FFE4E6', // rose-100
	'#CFFAFE', // cyan-100
	'#FFEDD5', // orange-100
	'#E0E7FF', // indigo-100
]

const STRATEGY_LABELS: Record<SeatingStrategy, string> = {
	'institution-standard': 'Institution Standard',
	'smart-mixing': 'Smart Mixing',
	'strict': 'Strict Mode',
	'manual': 'Manual Assignment',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const cleaned = hex.replace('#', '')
	return {
		r: parseInt(cleaned.substring(0, 2), 16),
		g: parseInt(cleaned.substring(2, 4), 16),
		b: parseInt(cleaned.substring(4, 6), 16),
	}
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateSeatingPlanPDF(data: SeatingPlanPdfData): void {
	const doc = new jsPDF({
		orientation: 'landscape',
		unit: 'mm',
		format: 'a4',
	})

	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	// Build a program → color index map across all rooms
	const allPrograms = new Set<string>()
	for (const room of data.rooms) {
		for (const seat of room.seats) {
			if (seat.student) {
				allPrograms.add(seat.student.program_code)
			}
		}
	}
	const programList = [...allPrograms].sort()
	const programColorMap = new Map<string, number>()
	programList.forEach((code, idx) => {
		programColorMap.set(code, idx % PROGRAM_COLORS_HEX.length)
	})

	const strategyLabel = STRATEGY_LABELS[data.strategy] || data.strategy

	// Generate one page per room
	data.rooms.forEach((roomResult, roomIndex) => {
		if (roomIndex > 0) {
			doc.addPage()
		}

		const room = roomResult.room
		let y = MARGIN

		// ----- Header -----
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(14)
		doc.text(data.institution_name || 'JKKN Institution', pageWidth / 2, y, { align: 'center' })
		y += 7

		doc.setFont('helvetica', 'normal')
		doc.setFontSize(9)
		const sessionLine = [
			data.session_name ? `Session: ${data.session_name}` : null,
			data.exam_date ? `Date: ${data.exam_date}` : null,
			data.session_type ? `${data.session_type}` : null,
			`Strategy: ${strategyLabel}`,
		].filter(Boolean).join('  |  ')
		doc.text(sessionLine, pageWidth / 2, y, { align: 'center' })
		y += 8

		// ----- Room info line -----
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(10)
		const roomTitle = `${room.room_code} - ${room.room_name}`
		doc.text(roomTitle, MARGIN, y)

		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		const roomDetails = [
			room.building ? `Building: ${room.building}` : null,
			room.floor ? `Floor: ${room.floor}` : null,
			`Seated: ${roomResult.students_seated} / ${roomResult.total_capacity}`,
		].filter(Boolean).join('  |  ')
		doc.text(roomDetails, pageWidth - MARGIN, y, { align: 'right' })
		y += 7

		// ----- Separator line -----
		doc.setDrawColor(180, 180, 180)
		doc.setLineWidth(0.3)
		doc.line(MARGIN, y, pageWidth - MARGIN, y)
		y += 4

		// ----- Grid calculations -----
		const rowLabelWidth = 10 // space for R1, R2, etc.
		const gridX = MARGIN + rowLabelWidth
		const availableWidth = pageWidth - 2 * MARGIN - rowLabelWidth
		const cellWidth = availableWidth / room.columns

		// Reserve space for legend at bottom
		const legendHeight = 12
		const gridHeight = pageHeight - y - MARGIN - legendHeight
		const cellHeight = Math.min(gridHeight / (room.rows + 1), 12) // +1 for column header row

		// ----- Column headers (C1, C2, ...) -----
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(6)
		doc.setTextColor(100, 100, 100)
		for (let col = 0; col < room.columns; col++) {
			const cx = gridX + col * cellWidth + cellWidth / 2
			doc.text(`C${col + 1}`, cx, y + cellHeight / 2, { align: 'center' })
		}
		y += cellHeight

		// ----- Grid rows -----
		// Build a lookup map: `row-col` -> seat
		const seatMap = new Map<string, typeof roomResult.seats[0]>()
		for (const seat of roomResult.seats) {
			seatMap.set(`${seat.row_number}-${seat.column_number}`, seat)
		}

		for (let row = 0; row < room.rows; row++) {
			const rowY = y + row * cellHeight

			// Row label
			doc.setFont('helvetica', 'bold')
			doc.setFontSize(6)
			doc.setTextColor(100, 100, 100)
			doc.text(`R${row + 1}`, MARGIN + rowLabelWidth / 2, rowY + cellHeight / 2 + 1, { align: 'center' })

			for (let col = 0; col < room.columns; col++) {
				const cellX = gridX + col * cellWidth
				const seat = seatMap.get(`${row + 1}-${col + 1}`)

				// Cell border (light gray)
				doc.setDrawColor(200, 200, 200)
				doc.setLineWidth(0.2)
				doc.rect(cellX, rowY, cellWidth, cellHeight)

				if (seat?.student) {
					// Colored background
					const colorIdx = programColorMap.get(seat.student.program_code) ?? 0
					const bgColor = hexToRgb(PROGRAM_COLORS_HEX[colorIdx])
					doc.setFillColor(bgColor.r, bgColor.g, bgColor.b)
					doc.rect(cellX + 0.3, rowY + 0.3, cellWidth - 0.6, cellHeight - 0.6, 'F')

					// Register number (bold, centered)
					doc.setFont('helvetica', 'bold')
					doc.setFontSize(6)
					doc.setTextColor(30, 30, 30)
					doc.text(
						seat.student.stu_register_no || '',
						cellX + cellWidth / 2,
						rowY + cellHeight * 0.4,
						{ align: 'center' }
					)

					// Student name (smaller, truncated)
					doc.setFont('helvetica', 'normal')
					doc.setFontSize(5)
					doc.setTextColor(80, 80, 80)
					const displayName = seat.student.student_name.length > 15
						? seat.student.student_name.substring(0, 15) + '..'
						: seat.student.student_name
					doc.text(
						displayName,
						cellX + cellWidth / 2,
						rowY + cellHeight * 0.75,
						{ align: 'center' }
					)
				}
			}
		}

		// ----- Legend -----
		const legendY = pageHeight - MARGIN - legendHeight + 4
		doc.setDrawColor(180, 180, 180)
		doc.setLineWidth(0.3)
		doc.line(MARGIN, legendY - 2, pageWidth - MARGIN, legendY - 2)

		doc.setFont('helvetica', 'bold')
		doc.setFontSize(7)
		doc.setTextColor(60, 60, 60)
		doc.text('Legend:', MARGIN, legendY + 3)

		let legendX = MARGIN + 18
		const swatchSize = 4
		for (const [program, colorIdx] of programColorMap) {
			const color = hexToRgb(PROGRAM_COLORS_HEX[colorIdx])
			doc.setFillColor(color.r, color.g, color.b)
			doc.setDrawColor(150, 150, 150)
			doc.setLineWidth(0.2)
			doc.rect(legendX, legendY, swatchSize, swatchSize, 'FD')

			doc.setFont('helvetica', 'normal')
			doc.setFontSize(6)
			doc.setTextColor(60, 60, 60)
			doc.text(program, legendX + swatchSize + 1.5, legendY + 3)

			legendX += swatchSize + doc.getTextWidth(program) + 6

			// Wrap if too wide
			if (legendX > pageWidth - MARGIN - 30) {
				// stop adding more to avoid overflow
				doc.text('...', legendX, legendY + 3)
				break
			}
		}
	})

	// Save
	const filename = `seating-plan-${data.exam_date}-${data.session_type}.pdf`
	doc.save(filename)
}
