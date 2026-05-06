import jsPDF from 'jspdf'
import type { ReportType } from '@/types/exam-registration-reports'
import { getProgramDisplayName } from './program-name-mapper'

interface ReportPdfOptions {
	report_type: ReportType
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	data: any[]
	logoImage?: string
	rightLogoImage?: string
	course_level?: 'UG' | 'PG'
	course_category_filter?: string[]
}

// ── Helpers ──

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function toRoman(n: number): string { return ROMAN[n] || String(n) }

function semesterToYear(semester: number): string {
	const yearNum = Math.ceil(semester / 2)
	return `${toRoman(yearNum)} Year`
}

/** Build a map of student register number → current year (based on max regular semester) */
function buildStudentYearMap(data: any[]): Map<string, string> {
	const maxRegSem = new Map<string, number>()
	const maxAnySem = new Map<string, number>()
	for (const row of data) {
		const regNo = row.stu_register_no
		if (!regNo) continue
		const sem = row.course_offering?.semester || 0
		if (sem <= 0) continue
		if (row.is_regular) maxRegSem.set(regNo, Math.max(maxRegSem.get(regNo) || 0, sem))
		maxAnySem.set(regNo, Math.max(maxAnySem.get(regNo) || 0, sem))
	}
	const result = new Map<string, string>()
	for (const regNo of new Set([...maxRegSem.keys(), ...maxAnySem.keys()])) {
		const maxSem = maxRegSem.get(regNo) || maxAnySem.get(regNo) || 1
		result.set(regNo, semesterToYear(maxSem))
	}
	return result
}

/** Line height factor: fontSize (pt) × factor = line height (mm) */
const LINE_HEIGHT_FACTOR = 0.4

/** Calculate row height needed for wrapped text. Caller must set font on doc first. */
function calcWrappedRowHeight(doc: jsPDF, text: string, maxWidth: number, baseHeight: number): number {
	if (!text) return baseHeight
	const lines = doc.splitTextToSize(text, maxWidth)
	if (lines.length <= 1) return baseHeight
	const lineH = doc.getFontSize() * LINE_HEIGHT_FACTOR
	return Math.max(baseHeight, lines.length * lineH + 3)
}

/** Format board display as "CODE - Name" or just "CODE" */
function formatBoardDisplay(boardCode: string, boardName?: string | null): string {
	if (!boardCode) return ''
	return boardName ? `${boardCode} -\n${boardName}` : boardCode
}

/** Ensure board group row heights accommodate the board label's wrapped text */
function padBoardGroupHeights(doc: jsPDF, rows: any[], boardGroups: { board_code: string, startIdx: number, count: number }[], rowHeights: number[], boardColWidth: number) {
	const savedSize = doc.getFontSize()
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	for (const bg of boardGroups) {
		const boardRow = rows[bg.startIdx]
		const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
		if (!boardLabel) continue
		const neededHeight = calcWrappedRowHeight(doc, boardLabel, boardColWidth - 2, 0) + 3
		let groupHeight = 0
		for (let i = 0; i < bg.count; i++) groupHeight += rowHeights[bg.startIdx + i]
		if (neededHeight > groupHeight) {
			rowHeights[bg.startIdx] += (neededHeight - groupHeight)
		}
	}
	doc.setFontSize(savedSize)
}

/** Draw text with wrapping, vertically centered in cell. Clips lines that exceed cell boundary. */
function drawWrappedCell(doc: jsPDF, text: string, x: number, y: number, cellWidth: number, cellHeight: number, align: 'left' | 'center' = 'left') {
	if (!text) return
	const maxW = cellWidth - 2
	const lines = doc.splitTextToSize(text, maxW)
	const lineH = doc.getFontSize() * LINE_HEIGHT_FACTOR
	const textX = align === 'left' ? x + 1 : x + cellWidth / 2
	const startY = y + cellHeight / 2 + 1.5 - (lines.length - 1) * lineH / 2
	const cellBottom = y + cellHeight
	for (let i = 0; i < lines.length; i++) {
		const lineY = startY + i * lineH
		if (lineY < y + 1 || lineY > cellBottom - 0.5) continue
		doc.text(lines[i], textX, lineY, { align })
	}
}

function drawHeader(
	doc: jsPDF,
	pageWidth: number,
	margin: number,
	opts: ReportPdfOptions,
	reportTitle: string
): number {
	let currentY = margin

	// College Logo (left side)
	if (opts.logoImage) {
		try { doc.addImage(opts.logoImage, 'PNG', margin, currentY, 16, 16) } catch {}
	}
	// College Logo (right side)
	if (opts.rightLogoImage) {
		try { doc.addImage(opts.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16) } catch {}
	}

	// Institution name
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

	// Accreditation
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

	currentY += 13

	// Address
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Session
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text(`SEMESTER EXAMINATION - ${opts.session_name}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Report title
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text(reportTitle, pageWidth / 2, currentY, { align: 'center' })
	currentY += 4

	// Course category filter label (only when partial selection)
	if (opts.course_category_filter && opts.course_category_filter.length > 0) {
		doc.setFontSize(10)
		doc.setFont('times', 'bold')
		const boldPart = 'Course Category'
		doc.text(boldPart, margin, currentY)
		const boldWidth = doc.getTextWidth(boldPart)
		doc.setFont('times', 'normal')
		doc.text(` ${opts.course_category_filter.join(', ')}`, margin + boldWidth, currentY)
		currentY += 4
	}

	return currentY
}

/** Draw Program and Year subtitle lines below the main header */
function drawProgramYearSubtitle(
	doc: jsPDF,
	pageWidth: number,
	margin: number,
	y: number,
	programCode: string,
	programName: string | null,
	year: string
): number {
	doc.setFont('times', 'bold')
	doc.setFontSize(10)

	const programLabel = programName
		? `Program : ${programCode} - ${programName}`
		: `Program : ${programCode}`
	doc.text(programLabel, margin, y)
	doc.text(`Year : ${year}`, pageWidth - margin, y, { align: 'right' })

	return y + 4
}

function drawFooter(doc: jsPDF, pageWidth: number, margin: number, pageNum: number, totalPages: number) {
	const pageHeight = doc.internal.pageSize.getHeight()
	const footerY = pageHeight - margin

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.setTextColor(100, 100, 100)

	const now = new Date()
	const dd = String(now.getDate()).padStart(2, '0')
	const mm = String(now.getMonth() + 1).padStart(2, '0')
	const yyyy = now.getFullYear()
	doc.text(`Generated: ${dd}/${mm}/${yyyy}`, margin, footerY)
	doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
	doc.setTextColor(0, 0, 0)
}

// ── Report 1: Student Fee Details (A4 Landscape) ──

function generateStudentFeeDetailsPdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Group registrations by program_code, then by year within each program
	const programDataMap = new Map<string, any[]>()
	const programMeta = new Map<string, { program_board_order: number, program_name: string | null }>()
	for (const row of opts.data) {
		const programCode = row.course_offering?.program_code || row.program_code || 'Unknown'
		if (!programDataMap.has(programCode)) {
			programDataMap.set(programCode, [])
			programMeta.set(programCode, {
				program_board_order: row.course_offering?.program_board_order ?? 999,
				program_name: row.course_offering?.program_name || null,
			})
		}
		programDataMap.get(programCode)!.push(row)
	}

	// Sort programs by program_board_order ASC (board_order where program_code = board_code)
	const sortedPrograms = Array.from(programDataMap.keys()).sort((a, b) => {
		const ma = programMeta.get(a)!
		const mb = programMeta.get(b)!
		return (ma.program_board_order - mb.program_board_order) || a.localeCompare(b)
	})

	// Build sections: each section = one program + one year
	const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
	interface Section { programCode: string, programName: string | null, year: string, rows: any[] }
	const sections: Section[] = []

	for (const programCode of sortedPrograms) {
		const programRows = programDataMap.get(programCode)!

		// Group rows by year (determined by max semester per student in this program)
		// First, figure out which year each student belongs to
		const studentYearMap = new Map<string, number>() // regNo → max semester
		for (const row of programRows) {
			const regNo = row.stu_register_no || 'Unknown'
			const semester = row.course_offering?.semester || 0
			studentYearMap.set(regNo, Math.max(studentYearMap.get(regNo) || 0, semester))
		}

		// Group rows by the student's year
		const yearGroups = new Map<string, any[]>()
		for (const row of programRows) {
			const regNo = row.stu_register_no || 'Unknown'
			const maxSem = studentYearMap.get(regNo) || 1
			const year = semesterToYear(maxSem)
			if (!yearGroups.has(year)) yearGroups.set(year, [])
			yearGroups.get(year)!.push(row)
		}

		// Sort years in order
		const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => yearOrder.indexOf(a) - yearOrder.indexOf(b))

		const pName = programMeta.get(programCode)?.program_name || null
		for (const year of sortedYears) {
			sections.push({ programCode, programName: pName, year, rows: yearGroups.get(year)! })
		}
	}

	// Column widths (landscape A4 = ~287mm usable width minus margins)
	const colWidths = [10, 28, 35, 20, 18, 22, 60, 18, 18, 18, 15, 25]
	const headers = ['S.No', 'Register No', 'Name of the\nCandidate', 'Date of\nBirth', 'SEM/\nYear', 'Subject\nCode', 'Course Name', 'Theory', 'Application\nFee', 'Mark\nStatement\nFee', 'Total\nAmount', 'Student\nSign']
	const headerHeight = 10
	const rowHeight = 6
	const footerSpace = 10

	let currentPage = 1
	let rowsOnPage = 0

	function drawTableHeader(y: number) {
		doc.setFont('times', 'bold')
		doc.setFontSize(7)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		for (let i = 0; i < headers.length; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			const lines = headers[i].split('\n')
			const lineHeight = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + colWidths[i] / 2, y + lineHeight * (li + 1), { align: 'center' })
			})
			x += colWidths[i]
		}
		return y + headerHeight
	}

	// Render each section (program + year) on a fresh page with header
	sections.forEach((section, sectionIdx) => {
		const { programCode, programName, year, rows: sectionRows } = section

		// Build student map for this section
		const studentMap = new Map<string, { name: string, dob: string, courses: any[] }>()
		for (const row of sectionRows) {
			const regNo = row.stu_register_no || 'Unknown'
			if (!studentMap.has(regNo)) {
				studentMap.set(regNo, { name: row.student_name || '', dob: row.date_of_birth || '', courses: [] })
			}
			const co = row.course_offering
			if (co) {
				const student = studentMap.get(regNo)!
				// Deduplicate by course_code (same course can exist under multiple offerings)
				if (!student.courses.some((c: any) => c.course_code === co.course_code)) {
					student.courses.push({
						semester: co.semester || 0,
						course_order: co.course_order ?? 999,
						course_code: co.course_code || '',
						course_name: co.course_name || '',
					})
				}
			}
		}

		const students = Array.from(studentMap.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([regNo, info], idx) => {
				info.courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))
				return { sno: idx + 1, regNo, ...info }
			})

		if (students.length === 0) return

		// Start new page for each section (except the first)
		if (sectionIdx > 0) {
			doc.addPage()
			currentPage++
		}

		// Draw header + program/year subtitle
		let startY = drawHeader(doc, pageWidth, margin, opts, 'STUDENT EXAM REGISTRATION')
		startY = drawProgramYearSubtitle(doc, pageWidth, margin, startY, programCode, programName, year)
		let tableY = drawTableHeader(startY)
		rowsOnPage = 0

		// Draw data rows - merge S.No, Register No, Name for each student
		students.forEach((student) => {
			doc.setFont('times', 'normal')
			doc.setFontSize(7)

			// Pre-compute per-course row heights based on course name wrapping
			const courseRowHeights = student.courses.length > 0
				? student.courses.map((c: any) => calcWrappedRowHeight(doc, c.course_name, colWidths[6] - 2, rowHeight))
				: [rowHeight]
			const groupHeight = courseRowHeights.reduce((a: number, b: number) => a + b, 0)
			const courseCount = courseRowHeights.length

			// Check if we need a new page
			if (tableY + groupHeight > pageHeight - margin - footerSpace) {
				doc.addPage()
				currentPage++
				startY = margin + 2
				tableY = drawTableHeader(startY)
				rowsOnPage = 0
			}

			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)

			// Draw merged cells for student-level columns (S.No, Register No, Name, DOB)
			let x = margin
			for (let col = 0; col < 4; col++) {
				doc.rect(x, tableY, colWidths[col], groupHeight)
				x += colWidths[col]
			}

			// Place student info text in the merged cells (vertically centered)
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			const midY = tableY + groupHeight / 2 + 1.5
			let tx = margin
			doc.text(String(student.sno), tx + colWidths[0] / 2, midY, { align: 'center' })
			tx += colWidths[0]
			doc.text(student.regNo, tx + colWidths[1] / 2, midY, { align: 'center' })
			tx += colWidths[1]
			// Truncate name if too wide
			let nameText = student.name
			const nameMaxW = colWidths[2] - 2
			while (doc.getTextWidth(nameText) > nameMaxW && nameText.length > 3) {
				nameText = nameText.slice(0, -4) + '...'
			}
			doc.text(nameText, tx + colWidths[2] / 2, midY, { align: 'center' })
			tx += colWidths[2]
			// DOB
			if (student.dob) {
				doc.text(student.dob, tx + colWidths[3] / 2, midY, { align: 'center' })
			}
			tx += colWidths[3]

			// Fee columns (7-10) and Sign (11) - merged per student
			let fx = margin
			for (let c = 0; c < 7; c++) fx += colWidths[c]
			for (let col = 7; col < colWidths.length; col++) {
				doc.rect(fx, tableY, colWidths[col], groupHeight)
				fx += colWidths[col]
			}

			// Draw individual rows for course-level columns (Semester, Code, Course Name)
			let courseY = tableY
			for (let ci = 0; ci < courseCount; ci++) {
				const course = student.courses[ci]
				const crh = courseRowHeights[ci]
				let cx = margin
				// Skip first 4 columns (already merged)
				for (let c = 0; c < 4; c++) cx += colWidths[c]

				doc.setFont('times', 'normal')
				doc.setFontSize(7)

				// Semester column
				doc.rect(cx, courseY, colWidths[4], crh)
				if (course) {
					doc.text(toRoman(course.semester), cx + colWidths[4] / 2, courseY + crh / 2 + 1.5, { align: 'center' })
				}
				cx += colWidths[4]

				// Course Code column
				doc.rect(cx, courseY, colWidths[5], crh)
				if (course) {
					doc.text(course.course_code, cx + colWidths[5] / 2, courseY + crh / 2 + 1.5, { align: 'center' })
				}
				cx += colWidths[5]

				// Course Name column - wrapped text
				doc.rect(cx, courseY, colWidths[6], crh)
				if (course) {
					drawWrappedCell(doc, course.course_name, cx, courseY, colWidths[6], crh)
				}

				courseY += crh
			}

			tableY += groupHeight
			rowsOnPage += courseCount
		})
	})

	// Add footers to all pages
	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-reg-fee-details-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report 2A: Course Count Regular/Arrear (A4 Portrait) ──

function generateCourseCountRegularArrearPdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Aggregate counts by board_code + course_code
	const countMap = new Map<string, any>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const key = `${co.board_code || ''}|${co.course_code}`
		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', regular: 0, arrear: 0 })
		}
		const entry = countMap.get(key)!
		if (row.is_regular) entry.regular++
		else entry.arrear++
	}

	const rows = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Build board groups
	const boardGroups: { board_code: string, startIdx: number, count: number }[] = []
	let prevBoard: string | null = null
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].board_code !== prevBoard) {
			boardGroups.push({ board_code: rows[i].board_code, startIdx: i, count: 1 })
			prevBoard = rows[i].board_code
		} else {
			boardGroups[boardGroups.length - 1].count++
		}
	}

	// A4 portrait usable = 210 - 2*6.35 = 197.3mm
	const colWidths = [8, 40, 10, 22, 47, 24, 24, 20]  // Total = 195mm
	const headers = ['S.No', 'Board', 'Sem', 'Course\nCode', 'Course Name', 'Regular\nStudents', 'Arrear\nStudents', 'Total']
	const headerHeight = 14
	const rowHeight = 7
	const footerSpace = 10

	let currentPage = 1
	let rowsOnPage = 0

	function drawSpanningHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		const spanH = 6
		const subH = headerHeight - spanH

		// "No. Of Students Register" spanning header over Regular + Arrear + Total
		const dataColsStart = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + margin
		const dataColsWidth = colWidths[5] + colWidths[6] + colWidths[7]
		doc.rect(dataColsStart, y, dataColsWidth, spanH)
		doc.text('No. Of Students Register', dataColsStart + dataColsWidth / 2, y + spanH - 1.5, { align: 'center' })

		// Top headers for S.No, Board, Sem, Course Code, Course Name
		let x = margin
		for (let i = 0; i < 5; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			const lines = headers[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + colWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			x += colWidths[i]
		}

		// Sub-headers for Regular/Arrear/Total (with line break support)
		let sx = dataColsStart
		doc.setFontSize(8)
		for (let i = 5; i < 8; i++) {
			doc.rect(sx, y + spanH, colWidths[i], subH)
			const lines = headers[i].split('\n')
			const lineH = subH / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, sx + colWidths[i] / 2, y + spanH + lineH * (li + 1), { align: 'center' })
			})
			sx += colWidths[i]
		}

		return y + headerHeight
	}

	let startY = drawHeader(doc, pageWidth, margin, opts, 'COURSE WISE REGISTRATION COUNT (REGULAR / ARREAR)')
	let tableY = drawSpanningHeader(startY)

	// Pre-compute row heights based on course name wrapping
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const rowHeights = rows.map(row => calcWrappedRowHeight(doc, row.course_name, colWidths[4] - 2, rowHeight))
	padBoardGroupHeights(doc, rows, boardGroups, rowHeights, colWidths[1])

	// Track which board group the current row belongs to
	let boardGroupIdx = 0
	let boardGroupRowOffset = 0

	for (let idx = 0; idx < rows.length; idx++) {
		const row = rows[idx]
		const rh = rowHeights[idx]

		const bg = boardGroups[boardGroupIdx]

		// When starting a new board group, check if the board label fits on this page
		if (boardGroupRowOffset === 0 && rowsOnPage > 0) {
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			const labelHeight = calcWrappedRowHeight(doc, boardLabel, colWidths[1] - 2, rh)
			if (tableY + labelHeight > pageHeight - margin - footerSpace) {
				doc.addPage()
				currentPage++
				tableY = margin + 2
				tableY = drawSpanningHeader(tableY)
				rowsOnPage = 0
			}
		}

		// Page break check
		if (tableY + rh > pageHeight - margin - footerSpace) {
			doc.addPage()
			currentPage++
			tableY = margin + 2
			tableY = drawSpanningHeader(tableY)
			rowsOnPage = 0
		}

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin

		// Column 0: S.No
		doc.rect(x, tableY, colWidths[0], rh)
		doc.text(String(idx + 1), x + colWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[0]

		// Column 1: Board - merged cell (handle page breaks within group)
		if (boardGroupRowOffset === 0 || rowsOnPage === 0) {
			const remainingInGroup = bg.count - boardGroupRowOffset
			const availableSpace = pageHeight - margin - footerSpace - tableY
			let mergeHeight = 0
			for (let ri = 0; ri < remainingInGroup; ri++) {
				const h = rowHeights[bg.startIdx + boardGroupRowOffset + ri]
				if (mergeHeight + h > availableSpace) break
				mergeHeight += h
			}
			if (mergeHeight === 0) mergeHeight = rh
			doc.rect(x, tableY, colWidths[1], mergeHeight)
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			drawWrappedCell(doc, boardLabel, x, tableY, colWidths[1], mergeHeight, 'center')
		}
		x += colWidths[1]

		// Column 2: Sem
		doc.rect(x, tableY, colWidths[2], rh)
		doc.text(row.semester ? toRoman(row.semester) : '', x + colWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[2]

		// Column 3: Course Code
		doc.rect(x, tableY, colWidths[3], rh)
		doc.text(row.course_code, x + colWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[3]

		// Column 4: Course Name - wrapped
		doc.rect(x, tableY, colWidths[4], rh)
		drawWrappedCell(doc, row.course_name, x, tableY, colWidths[4], rh)
		x += colWidths[4]

		// Column 5: Regular
		doc.rect(x, tableY, colWidths[5], rh)
		doc.text(String(row.regular), x + colWidths[5] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[5]

		// Column 6: Arrear
		doc.rect(x, tableY, colWidths[6], rh)
		doc.text(String(row.arrear), x + colWidths[6] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[6]

		// Column 7: Total
		doc.setFont('times', 'bold')
		doc.rect(x, tableY, colWidths[7], rh)
		doc.text(String(row.regular + row.arrear), x + colWidths[7] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		doc.setFont('times', 'normal')

		tableY += rh
		rowsOnPage++

		boardGroupRowOffset++
		if (boardGroupRowOffset >= bg.count) {
			boardGroupIdx++
			boardGroupRowOffset = 0
		}
	}

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-reg-course-count-regular-arrear-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report 2B: Board & Year Wise Course List (A4 Portrait) ──

function generateCourseCountYearWisePdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Build student year map for student-based year counting
	const studentYearMap = buildStudentYearMap(opts.data)

	// Aggregate counts by board_code + course_code + year (using student's current year)
	const countMap = new Map<string, any>()
	const allYears = new Set<string>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const key = `${co.board_code || ''}|${co.course_code}`
		const year = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(year)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
		}
		const entry = countMap.get(key)!
		entry.years[year] = (entry.years[year] || 0) + 1
	}

	const sortedYears = Array.from(allYears).sort((a, b) => {
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return order.indexOf(a) - order.indexOf(b)
	})

	const rows = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Board groups
	const boardGroups: { board_code: string, startIdx: number, count: number }[] = []
	let prevBoard: string | null = null
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].board_code !== prevBoard) {
			boardGroups.push({ board_code: rows[i].board_code, startIdx: i, count: 1 })
			prevBoard = rows[i].board_code
		} else {
			boardGroups[boardGroups.length - 1].count++
		}
	}

	// Dynamic columns: fixed cols + year cols + total col (portrait A4 = ~197mm usable)
	const fixedColWidths = [8, 40, 10, 22, 47]
	const fixedTotal = fixedColWidths.reduce((a, b) => a + b, 0)
	const totalColWidth = 18
	const yearColWidth = Math.min(25, (pageWidth - margin * 2 - fixedTotal - totalColWidth) / Math.max(sortedYears.length, 1))
	const headerHeight = 12
	const rowHeight = 7
	const footerSpace = 10

	let currentPage = 1
	let rowsOnPage = 0

	function drawYearHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		// Spanning header for year columns + total
		const dataColsStart = margin + fixedTotal
		const dataColsWidth = sortedYears.length * yearColWidth + totalColWidth
		if (sortedYears.length > 0) {
			doc.rect(dataColsStart, y, dataColsWidth, headerHeight / 2)
			doc.text('No. Of Students Register', dataColsStart + dataColsWidth / 2, y + headerHeight / 2 - 1, { align: 'center' })
		}

		// Fixed column headers
		let x = margin
		const fixedHeaders = ['S.No', 'Board', 'Sem', 'Course\nCode', 'Course Name']
		for (let i = 0; i < 5; i++) {
			doc.rect(x, y, fixedColWidths[i], headerHeight)
			const lines = fixedHeaders[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + fixedColWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			x += fixedColWidths[i]
		}

		// Year sub-headers
		let sx = dataColsStart
		for (let i = 0; i < sortedYears.length; i++) {
			doc.rect(sx, y + headerHeight / 2, yearColWidth, headerHeight / 2)
			doc.setFontSize(8)
			doc.text(sortedYears[i], sx + yearColWidth / 2, y + headerHeight - 1, { align: 'center' })
			sx += yearColWidth
		}

		// Total sub-header
		doc.rect(sx, y + headerHeight / 2, totalColWidth, headerHeight / 2)
		doc.setFontSize(8)
		doc.text('Total', sx + totalColWidth / 2, y + headerHeight - 1, { align: 'center' })

		return y + headerHeight
	}

	let startY = drawHeader(doc, pageWidth, margin, opts, 'BOARD & YEAR WISE COURSE LIST')
	let tableY = drawYearHeader(startY)

	// Pre-compute row heights based on course name wrapping
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const rowHeights = rows.map(row => calcWrappedRowHeight(doc, row.course_name, fixedColWidths[4] - 2, rowHeight))
	padBoardGroupHeights(doc, rows, boardGroups, rowHeights, fixedColWidths[1])

	let boardGroupIdx = 0
	let boardGroupRowOffset = 0

	for (let idx = 0; idx < rows.length; idx++) {
		const row = rows[idx]
		const rh = rowHeights[idx]

		const bg = boardGroups[boardGroupIdx]

		// When starting a new board group, check if the board label fits on this page
		if (boardGroupRowOffset === 0 && rowsOnPage > 0) {
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			const labelHeight = calcWrappedRowHeight(doc, boardLabel, fixedColWidths[1] - 2, rh)
			if (tableY + labelHeight > pageHeight - margin - footerSpace) {
				doc.addPage()
				currentPage++
				tableY = margin + 2
				tableY = drawYearHeader(tableY)
				rowsOnPage = 0
			}
		}

		if (tableY + rh > pageHeight - margin - footerSpace) {
			doc.addPage()
			currentPage++
			tableY = margin + 2
			tableY = drawYearHeader(tableY)
			rowsOnPage = 0
		}

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin

		// S.No
		doc.rect(x, tableY, fixedColWidths[0], rh)
		doc.text(String(idx + 1), x + fixedColWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[0]

		// Board - merged (handle page breaks within group)
		if (boardGroupRowOffset === 0 || rowsOnPage === 0) {
			const remainingInGroup = bg.count - boardGroupRowOffset
			const availableSpace = pageHeight - margin - footerSpace - tableY
			let mergeHeight = 0
			for (let ri = 0; ri < remainingInGroup; ri++) {
				const h = rowHeights[bg.startIdx + boardGroupRowOffset + ri]
				if (mergeHeight + h > availableSpace) break
				mergeHeight += h
			}
			if (mergeHeight === 0) mergeHeight = rh
			doc.rect(x, tableY, fixedColWidths[1], mergeHeight)
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			drawWrappedCell(doc, boardLabel, x, tableY, fixedColWidths[1], mergeHeight, 'center')
		}
		x += fixedColWidths[1]

		// Sem
		doc.rect(x, tableY, fixedColWidths[2], rh)
		doc.text(row.semester ? toRoman(row.semester) : '', x + fixedColWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[2]

		// Course Code
		doc.rect(x, tableY, fixedColWidths[3], rh)
		doc.text(row.course_code, x + fixedColWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[3]

		// Course Name - wrapped
		doc.rect(x, tableY, fixedColWidths[4], rh)
		drawWrappedCell(doc, row.course_name, x, tableY, fixedColWidths[4], rh)
		x += fixedColWidths[4]

		// Year columns
		let rowTotal = 0
		for (let yi = 0; yi < sortedYears.length; yi++) {
			doc.rect(x, tableY, yearColWidth, rh)
			const count = row.years[sortedYears[yi]] || 0
			rowTotal += count
			doc.text(String(count), x + yearColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += yearColWidth
		}

		// Total column
		doc.setFont('times', 'bold')
		doc.rect(x, tableY, totalColWidth, rh)
		doc.text(String(rowTotal), x + totalColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		doc.setFont('times', 'normal')

		tableY += rh
		rowsOnPage++

		boardGroupRowOffset++
		if (boardGroupRowOffset >= bg.count) {
			boardGroupIdx++
			boardGroupRowOffset = 0
		}
	}

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-reg-course-count-year-wise-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report 2C: Board & Program Wise Course List (A4 Portrait) ──

function generateCourseCountProgramYearWisePdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Build student year map
	const studentYearMap = buildStudentYearMap(opts.data)

	// Aggregate counts by board_code + program_code + course_code + year (using student's current year)
	const countMap = new Map<string, any>()
	const allYears = new Set<string>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const key = `${co.board_code || ''}|${programCode}|${co.course_code}`
		const year = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(year)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: programCode, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
		}
		const entry = countMap.get(key)!
		entry.years[year] = (entry.years[year] || 0) + 1
	}

	const sortedYears = Array.from(allYears).sort((a, b) => {
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return order.indexOf(a) - order.indexOf(b)
	})

	const rows = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Board groups
	const boardGroups: { board_code: string, startIdx: number, count: number }[] = []
	let prevBoard: string | null = null
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].board_code !== prevBoard) {
			boardGroups.push({ board_code: rows[i].board_code, startIdx: i, count: 1 })
			prevBoard = rows[i].board_code
		} else {
			boardGroups[boardGroups.length - 1].count++
		}
	}

	// Program groups (within board)
	const programGroups: { key: string, startIdx: number, count: number }[] = []
	let prevPgKey: string | null = null
	for (let i = 0; i < rows.length; i++) {
		const pgKey = `${rows[i].board_code}|${rows[i].program_code}`
		if (pgKey !== prevPgKey) {
			programGroups.push({ key: pgKey, startIdx: i, count: 1 })
			prevPgKey = pgKey
		} else {
			programGroups[programGroups.length - 1].count++
		}
	}

	// Lookup: row index -> board group index, program group index
	const rowToBoardGroup = new Map<number, number>()
	boardGroups.forEach((bg, gi) => {
		for (let i = bg.startIdx; i < bg.startIdx + bg.count; i++) rowToBoardGroup.set(i, gi)
	})
	const rowToProgramGroup = new Map<number, number>()
	programGroups.forEach((pg, gi) => {
		for (let i = pg.startIdx; i < pg.startIdx + pg.count; i++) rowToProgramGroup.set(i, gi)
	})

	// Dynamic columns with total (portrait A4 = ~197mm usable)
	const fixedColWidths = [8, 37, 18, 10, 20, 37]
	const fixedTotal2c = fixedColWidths.reduce((a, b) => a + b, 0)
	const totalColWidth = 18
	const yearColWidth = Math.min(25, (pageWidth - margin * 2 - fixedTotal2c - totalColWidth) / Math.max(sortedYears.length, 1))
	const headerHeight = 12
	const rowHeight = 7
	const footerSpace = 10

	let currentPage = 1
	let rowsOnPage = 0

	function drawProgramHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		// Spanning header for year columns + total
		const dataColsStart = margin + fixedTotal2c
		const dataColsWidth = sortedYears.length * yearColWidth + totalColWidth
		if (sortedYears.length > 0) {
			doc.rect(dataColsStart, y, dataColsWidth, headerHeight / 2)
			doc.text('No. Of Students Register', dataColsStart + dataColsWidth / 2, y + headerHeight / 2 - 1, { align: 'center' })
		}

		// Fixed column headers
		const fixedHeaders = ['S.No', 'Board', 'Program\nCode', 'Sem', 'Course\nCode', 'Course Name']
		let hx = margin
		for (let i = 0; i < fixedColWidths.length; i++) {
			doc.rect(hx, y, fixedColWidths[i], headerHeight)
			const lines = fixedHeaders[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, hx + fixedColWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			hx += fixedColWidths[i]
		}

		// Year sub-headers
		let sx = dataColsStart
		for (let i = 0; i < sortedYears.length; i++) {
			doc.rect(sx, y + headerHeight / 2, yearColWidth, headerHeight / 2)
			doc.setFontSize(8)
			doc.text(sortedYears[i], sx + yearColWidth / 2, y + headerHeight - 1, { align: 'center' })
			sx += yearColWidth
		}

		// Total sub-header
		doc.rect(sx, y + headerHeight / 2, totalColWidth, headerHeight / 2)
		doc.setFontSize(8)
		doc.text('Total', sx + totalColWidth / 2, y + headerHeight - 1, { align: 'center' })

		return y + headerHeight
	}

	let startY = drawHeader(doc, pageWidth, margin, opts, 'BOARD & PROGRAM WISE REGISTRATION LIST')
	let tableY = drawProgramHeader(startY)

	// Pre-compute row heights based on course name wrapping
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const rowHeights = rows.map(row => calcWrappedRowHeight(doc, row.course_name, fixedColWidths[5] - 2, rowHeight))
	padBoardGroupHeights(doc, rows, boardGroups, rowHeights, fixedColWidths[1])

	for (let idx = 0; idx < rows.length; idx++) {
		const row = rows[idx]
		const rh = rowHeights[idx]

		const bgi = rowToBoardGroup.get(idx)!
		const pgi = rowToProgramGroup.get(idx)!
		const bg = boardGroups[bgi]
		const pg = programGroups[pgi]
		const boardRowOffset = idx - bg.startIdx
		const programRowOffset = idx - pg.startIdx

		// When starting a new board group, check if the board label fits on this page
		if (boardRowOffset === 0 && rowsOnPage > 0) {
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			const labelHeight = calcWrappedRowHeight(doc, boardLabel, fixedColWidths[1] - 2, rh)
			if (tableY + labelHeight > pageHeight - margin - footerSpace) {
				doc.addPage()
				currentPage++
				tableY = margin + 2
				tableY = drawProgramHeader(tableY)
				rowsOnPage = 0
			}
		}

		if (tableY + rh > pageHeight - margin - footerSpace) {
			doc.addPage()
			currentPage++
			tableY = margin + 2
			tableY = drawProgramHeader(tableY)
			rowsOnPage = 0
		}

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin

		// S.No
		doc.rect(x, tableY, fixedColWidths[0], rh)
		doc.text(String(idx + 1), x + fixedColWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[0]

		// Board - merged (handle page breaks within group)
		if (boardRowOffset === 0 || rowsOnPage === 0) {
			const remainingInGroup = bg.count - boardRowOffset
			const availableSpace = pageHeight - margin - footerSpace - tableY
			let mergeHeight = 0
			for (let ri = 0; ri < remainingInGroup; ri++) {
				const h = rowHeights[bg.startIdx + boardRowOffset + ri]
				if (mergeHeight + h > availableSpace) break
				mergeHeight += h
			}
			if (mergeHeight === 0) mergeHeight = rh
			doc.rect(x, tableY, fixedColWidths[1], mergeHeight)
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			drawWrappedCell(doc, boardLabel, x, tableY, fixedColWidths[1], mergeHeight, 'center')
		}
		x += fixedColWidths[1]

		// Program Code - merged (handle page breaks within group)
		if (programRowOffset === 0 || rowsOnPage === 0) {
			const remainingInGroup = pg.count - programRowOffset
			const availableSpace = pageHeight - margin - footerSpace - tableY
			let mergeHeight = 0
			for (let ri = 0; ri < remainingInGroup; ri++) {
				const h = rowHeights[pg.startIdx + programRowOffset + ri]
				if (mergeHeight + h > availableSpace) break
				mergeHeight += h
			}
			if (mergeHeight === 0) mergeHeight = rh
			doc.rect(x, tableY, fixedColWidths[2], mergeHeight)
			doc.text(row.program_code, x + fixedColWidths[2] / 2, tableY + mergeHeight / 2 + 1.5, { align: 'center' })
		}
		x += fixedColWidths[2]

		// Sem
		doc.rect(x, tableY, fixedColWidths[3], rh)
		doc.text(row.semester ? toRoman(row.semester) : '', x + fixedColWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[3]

		// Course Code
		doc.rect(x, tableY, fixedColWidths[4], rh)
		doc.text(row.course_code, x + fixedColWidths[4] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += fixedColWidths[4]

		// Course Name - wrapped
		doc.rect(x, tableY, fixedColWidths[5], rh)
		drawWrappedCell(doc, row.course_name, x, tableY, fixedColWidths[5], rh)
		x += fixedColWidths[5]

		// Year columns
		let rowTotal = 0
		for (let yi = 0; yi < sortedYears.length; yi++) {
			doc.rect(x, tableY, yearColWidth, rh)
			const count = row.years[sortedYears[yi]] || 0
			rowTotal += count
			doc.text(String(count), x + yearColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += yearColWidth
		}

		// Total column
		doc.setFont('times', 'bold')
		doc.rect(x, tableY, totalColWidth, rh)
		doc.text(String(rowTotal), x + totalColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		doc.setFont('times', 'normal')

		tableY += rh
		rowsOnPage++
	}

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-reg-course-count-program-year-wise-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report 3: Program Wise Course List (A4 Portrait, 1 page per section) ──

function generateCourseCountProgramYearSectionPdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Build student year map
	const studentYearMap = buildStudentYearMap(opts.data)

	// Group registrations by program_code → courses with year-wise counts
	const programMap = new Map<string, {
		program_code: string
		program_name: string | null
		program_order: number
		courses: Map<string, { semester: number; course_order: number; course_code: string; course_name: string; years: Record<string, number> }>
	}>()
	const allYears = new Set<string>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const studentYear = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(studentYear)

		if (!programMap.has(programCode)) {
			programMap.set(programCode, {
				program_code: programCode,
				program_name: co.program_name || null,
				program_order: co.program_order ?? 999,
				courses: new Map(),
			})
		}
		const program = programMap.get(programCode)!
		const courseKey = co.course_code
		if (!program.courses.has(courseKey)) {
			program.courses.set(courseKey, {
				semester: co.semester || 0,
				course_order: co.course_order ?? 999,
				course_code: co.course_code,
				course_name: co.course_name || '',
				years: {},
			})
		}
		const course = program.courses.get(courseKey)!
		course.years[studentYear] = (course.years[studentYear] || 0) + 1
	}

	const sortedYears = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year'].filter(y => allYears.has(y))

	const sections = Array.from(programMap.values())
		.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))

	if (sections.length === 0) return ''

	// Table config (portrait A4 = ~197mm usable)
	const fixedColWidths = [10, 12, 28, 75]
	const fixedTotal = fixedColWidths.reduce((a, b) => a + b, 0)
	const totalColWidth = 18
	const yearColWidth = Math.min(25, (pageWidth - margin * 2 - fixedTotal - totalColWidth) / Math.max(sortedYears.length, 1))
	const headerHeight = 14
	const rowHeight = 7
	const signatureSpaceHeight = 25

	function drawSectionHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		const spanH = 6
		const subH = headerHeight - spanH

		// Spanning header for year columns + total
		const dataColsStart = margin + fixedTotal
		const dataColsWidth = sortedYears.length * yearColWidth + totalColWidth
		if (sortedYears.length > 0) {
			doc.rect(dataColsStart, y, dataColsWidth, spanH)
			doc.text('No. Of Students Register', dataColsStart + dataColsWidth / 2, y + spanH - 1.5, { align: 'center' })
		}

		// Fixed column headers
		const fixedHeaders = ['S.No', 'Sem', 'Course\nCode', 'Course Name']
		let hx = margin
		for (let i = 0; i < fixedColWidths.length; i++) {
			doc.rect(hx, y, fixedColWidths[i], headerHeight)
			const lines = fixedHeaders[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, hx + fixedColWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			hx += fixedColWidths[i]
		}

		// Year sub-headers
		let sx = dataColsStart
		doc.setFontSize(8)
		for (const yr of sortedYears) {
			doc.rect(sx, y + spanH, yearColWidth, subH)
			doc.text(yr, sx + yearColWidth / 2, y + headerHeight - 1, { align: 'center' })
			sx += yearColWidth
		}

		// Total sub-header
		doc.rect(sx, y + spanH, totalColWidth, subH)
		doc.text('Total', sx + totalColWidth / 2, y + headerHeight - 1, { align: 'center' })

		return y + headerHeight
	}

	function drawSignatureFooter(y: number) {
		const sigY = Math.max(y + 20, pageHeight - margin - signatureSpaceHeight)
		doc.setFont('times', 'normal')
		doc.setFontSize(9)

		const col1X = margin + 10
		const col2X = pageWidth / 2
		const col3X = pageWidth - margin - 45

		doc.text('Signature of Class Incharge', col1X, sigY, { align: 'left' })
		doc.text('Signature of HOD', col2X, sigY, { align: 'center' })
		doc.text('Signature of Principal', col3X, sigY, { align: 'left' })
	}

	// Render each program on its own page
	sections.forEach((section, sectionIdx) => {
		if (sectionIdx > 0) {
			doc.addPage()
		}

		let currentY = drawHeader(doc, pageWidth, margin, opts, 'PROGRAM WISE REGISTRATION LIST')

		// Program subtitle (no year)
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		const displayProgramName = getProgramDisplayName(section.program_code, section.program_name)
		doc.text(`Program : ${section.program_code}${displayProgramName ? ` - ${displayProgramName}` : ''}`, margin, currentY + 3)
		currentY += 5

		let tableY = drawSectionHeader(currentY)

		const courses = Array.from(section.courses.values())
			.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		const rowHeights = courses.map(c => calcWrappedRowHeight(doc, c.course_name, fixedColWidths[3] - 2, rowHeight))

		for (let idx = 0; idx < courses.length; idx++) {
			const course = courses[idx]
			const rh = rowHeights[idx]

			if (tableY + rh > pageHeight - margin - signatureSpaceHeight - 5) {
				drawSignatureFooter(tableY)
				doc.addPage()
				let newY = drawHeader(doc, pageWidth, margin, opts, 'PROGRAM WISE REGISTRATION LIST')
				doc.setFont('times', 'bold')
				doc.setFontSize(10)
				doc.text(`Program : ${section.program_code}${section.program_name ? ` - ${section.program_name}` : ''}`, margin, newY + 3)
				newY += 5
				tableY = drawSectionHeader(newY)
			}

			doc.setFont('times', 'normal')
			doc.setFontSize(9)
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)

			let x = margin

			// S.No
			doc.rect(x, tableY, fixedColWidths[0], rh)
			doc.text(String(idx + 1), x + fixedColWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += fixedColWidths[0]

			// Semester
			doc.rect(x, tableY, fixedColWidths[1], rh)
			doc.text(toRoman(course.semester), x + fixedColWidths[1] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += fixedColWidths[1]

			// Course Code
			doc.rect(x, tableY, fixedColWidths[2], rh)
			doc.text(course.course_code, x + fixedColWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += fixedColWidths[2]

			// Course Name (wrapped)
			doc.rect(x, tableY, fixedColWidths[3], rh)
			drawWrappedCell(doc, course.course_name, x, tableY, fixedColWidths[3], rh)
			x += fixedColWidths[3]

			// Year columns
			let rowTotal = 0
			for (const yr of sortedYears) {
				doc.rect(x, tableY, yearColWidth, rh)
				const count = course.years[yr] || 0
				rowTotal += count
				doc.text(String(count), x + yearColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
				x += yearColWidth
			}

			// Total
			doc.setFont('times', 'bold')
			doc.rect(x, tableY, totalColWidth, rh)
			doc.text(String(rowTotal), x + totalColWidth / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			doc.setFont('times', 'normal')

			tableY += rh
		}

		drawSignatureFooter(tableY)
	})

	// Add page footers
	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-reg-course-count-program-year-section-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report: Exam Date-wise Registration (A4 Portrait) ──

// ── Report: Exam Date-wise Summary (A4 Portrait) ──

function generateExamDateWiseSummaryPdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Aggregate by exam_date: count FN and AN registrations
	const dateMap = new Map<string, { exam_date: string; fn: number; an: number }>()
	for (const row of opts.data) {
		const examDate = row.exam_date
		if (!examDate) continue
		const session = row.exam_session || ''
		if (!dateMap.has(examDate)) {
			dateMap.set(examDate, { exam_date: examDate, fn: 0, an: 0 })
		}
		const entry = dateMap.get(examDate)!
		if (session === 'FN') entry.fn++
		else if (session === 'AN') entry.an++
	}

	const rows = Array.from(dateMap.values())
		.sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())

	if (rows.length === 0) return ''

	const colWidths = [12, 50, 40, 40, 40]  // 182mm
	const headers = ['S.No', 'Exam Date', 'FN', 'AN', 'Total']
	const headerHeight = 10
	const rowHeight = 7
	const footerSpace = 10

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr)
			if (isNaN(d.getTime())) return dateStr
			return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
		} catch { return dateStr }
	}

	function drawSummaryHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		for (let i = 0; i < headers.length; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			doc.text(headers[i], x + colWidths[i] / 2, y + headerHeight / 2 + 1.5, { align: 'center' })
			x += colWidths[i]
		}
		return y + headerHeight
	}

	let startY = drawHeader(doc, pageWidth, margin, opts, 'EXAM DATE-WISE SUMMARY')
	let tableY = drawSummaryHeader(startY)

	let grandFN = 0, grandAN = 0

	for (let idx = 0; idx < rows.length; idx++) {
		const row = rows[idx]

		if (tableY + rowHeight > pageHeight - margin - footerSpace - rowHeight) {
			doc.addPage()
			tableY = margin + 2
			tableY = drawSummaryHeader(tableY)
		}

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		const total = row.fn + row.an
		grandFN += row.fn
		grandAN += row.an

		// S.No
		doc.rect(x, tableY, colWidths[0], rowHeight)
		doc.text(String(idx + 1), x + colWidths[0] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		x += colWidths[0]

		// Exam Date
		doc.rect(x, tableY, colWidths[1], rowHeight)
		doc.text(formatDate(row.exam_date), x + colWidths[1] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		x += colWidths[1]

		// FN
		doc.rect(x, tableY, colWidths[2], rowHeight)
		doc.text(String(row.fn), x + colWidths[2] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		x += colWidths[2]

		// AN
		doc.rect(x, tableY, colWidths[3], rowHeight)
		doc.text(String(row.an), x + colWidths[3] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		x += colWidths[3]

		// Total
		doc.setFont('times', 'bold')
		doc.rect(x, tableY, colWidths[4], rowHeight)
		doc.text(String(total), x + colWidths[4] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		doc.setFont('times', 'normal')

		tableY += rowHeight
	}

	// Grand total row
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	let x = margin
	const grandTotalWidth = colWidths[0] + colWidths[1]
	doc.rect(x, tableY, grandTotalWidth, rowHeight)
	doc.text('Grand Total', x + grandTotalWidth / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
	x += grandTotalWidth

	doc.rect(x, tableY, colWidths[2], rowHeight)
	doc.text(String(grandFN), x + colWidths[2] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
	x += colWidths[2]

	doc.rect(x, tableY, colWidths[3], rowHeight)
	doc.text(String(grandAN), x + colWidths[3] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
	x += colWidths[3]

	doc.rect(x, tableY, colWidths[4], rowHeight)
	doc.text(String(grandFN + grandAN), x + colWidths[4] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const filename = `exam-date-wise-summary-${opts.session_code}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

function generateExamDateWiseRegistrationPdf(opts: ReportPdfOptions): string {
	return generateExamDateWisePdf(opts, false)
}

// ── Report: Exam Date-wise Attendance (A4 Portrait) ──

function generateExamDateWiseAttendancePdf(opts: ReportPdfOptions): string {
	return generateExamDateWisePdf(opts, true)
}

// ── Report: QP Packing List (A4 Landscape, 1 page per date+session) ──

function generateQPPackingListPdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Aggregate by date+session → courses with count
	interface CourseAgg { semester: number; board_code: string; board_name: string; board_order: number; course_code: string; course_name: string; course_order: number; count: number }
	const groupMap = new Map<string, CourseAgg[]>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const examDate = row.exam_date || ''
		const examSession = row.exam_session || ''
		if (!examDate || !examSession) continue
		const groupKey = `${examDate}|${examSession}`
		if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
		const courses = groupMap.get(groupKey)!
		let existing = courses.find(c => c.course_code === co.course_code)
		if (!existing) {
			existing = { semester: co.semester || 0, board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', course_order: co.course_order ?? 999, count: 0 }
			courses.push(existing)
		}
		existing.count++
	}

	if (groupMap.size === 0) return ''

	const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
		const [dA, sA] = a.split('|'); const [dB, sB] = b.split('|')
		const dc = new Date(dA).getTime() - new Date(dB).getTime()
		if (dc !== 0) return dc
		return (sA === 'FN' ? 0 : 1) - (sB === 'FN' ? 0 : 1)
	})

	// Sort courses within each group
	for (const courses of groupMap.values()) {
		courses.sort((a, b) => (a.semester - b.semester) || (a.board_order - b.board_order) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))
	}

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr)
			if (isNaN(d.getTime())) return dateStr
			return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
		} catch { return dateStr }
	}

	// Landscape A4 = ~284mm usable
	const colWidths = [10, 15, 20, 28, 165, 25, 21]  // S.No, Sem, Board, Course Code, Course Name, QP Count, Signature
	const headers = ['S.No', 'Sem', 'Board', 'Course\nCode', 'Name of the Course Code', 'QP\nCount', 'Verified\n(/)']
	const headerHeight = 10
	const rowHeight = 7
	const signatureSpaceHeight = 25

	function drawPackingHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		for (let i = 0; i < headers.length; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			const lines = headers[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + colWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			x += colWidths[i]
		}
		return y + headerHeight
	}

	function drawSignatureFooter(y: number) {
		const sigY = y + 25
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('Signature of the COE', pageWidth - margin, sigY, { align: 'right' })
	}

	// Render each date+session on its own page
	sortedKeys.forEach((key, groupIdx) => {
		if (groupIdx > 0) doc.addPage()

		const [examDate, examSession] = key.split('|')
		const courses = groupMap.get(key)!

		// Draw main header
		let currentY = drawHeader(doc, pageWidth, margin, opts, 'QUESTION PAPER PACKING LIST')

		// Date & Session subtitle
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(`Exam Date : ${formatDate(examDate)}`, margin, currentY + 3)
		doc.text(`Session : ${examSession}`, pageWidth - margin, currentY + 3, { align: 'right' })
		currentY += 6

		let tableY = drawPackingHeader(currentY)

		// Pre-compute row heights
		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		const rowHeights = courses.map(c => calcWrappedRowHeight(doc, c.course_name, colWidths[4] - 2, rowHeight))

		let totalCount = 0

		for (let idx = 0; idx < courses.length; idx++) {
			const course = courses[idx]
			const rh = rowHeights[idx]

			// Page break within same date+session
			if (tableY + rh + rowHeight > pageHeight - margin - signatureSpaceHeight - 5) {
				doc.addPage()
				let newY = drawHeader(doc, pageWidth, margin, opts, 'QUESTION PAPER PACKING LIST')
				doc.setFont('times', 'bold')
				doc.setFontSize(10)
				doc.text(`Exam Date : ${formatDate(examDate)}`, margin, newY + 3)
				doc.text(`Session : ${examSession}`, pageWidth - margin, newY + 3, { align: 'right' })
				newY += 6
				tableY = drawPackingHeader(newY)
			}

			doc.setFont('times', 'normal')
			doc.setFontSize(10)
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)

			let x = margin
			totalCount += course.count

			// S.No
			doc.rect(x, tableY, colWidths[0], rh)
			doc.text(String(idx + 1), x + colWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[0]

			// Sem
			doc.rect(x, tableY, colWidths[1], rh)
			doc.text(toRoman(course.semester), x + colWidths[1] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[1]

			// Board
			doc.rect(x, tableY, colWidths[2], rh)
			doc.text(course.board_code, x + colWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[2]

			// Course Code
			doc.rect(x, tableY, colWidths[3], rh)
			doc.text(course.course_code, x + colWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[3]

			// Course Name (wrapped)
			doc.rect(x, tableY, colWidths[4], rh)
			drawWrappedCell(doc, course.course_name, x, tableY, colWidths[4], rh)
			x += colWidths[4]

			// QP Count
			doc.rect(x, tableY, colWidths[5], rh)
			doc.text(String(course.count), x + colWidths[5] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[5]

			// Verified (blank — header shows tick symbol)
			doc.rect(x, tableY, colWidths[6], rh)

			tableY += rh
		}

		// Total row
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		let x = margin
		const totalLabelWidth = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]
		doc.rect(x, tableY, totalLabelWidth, rowHeight)
		doc.text('Total :', x + totalLabelWidth - 2, tableY + rowHeight / 2 + 1.5, { align: 'right' })
		x += totalLabelWidth

		doc.rect(x, tableY, colWidths[5], rowHeight)
		doc.text(String(totalCount), x + colWidths[5] / 2, tableY + rowHeight / 2 + 1.5, { align: 'center' })
		x += colWidths[5]

		doc.rect(x, tableY, colWidths[6], rowHeight)
		tableY += rowHeight

		// Signature footer
		drawSignatureFooter(tableY)
	})

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const filename = `qp-packing-list-${opts.session_code}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Report: Board Wise Exam Timetable (A4 Portrait) ──

function generateBoardWiseExamTimetablePdf(opts: ReportPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// Aggregate unique courses with exam date/session
	const courseMap = new Map<string, any>()
	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const examDate = row.exam_date || ''
		const examSession = row.exam_session || ''
		const key = `${co.board_code || ''}|${co.course_code}|${examDate}|${examSession}`
		if (!courseMap.has(key)) {
			courseMap.set(key, {
				board_code: co.board_code || '',
				board_name: co.board_name || '',
				board_order: co.board_order ?? 999,
				semester: co.semester || 0,
				course_order: co.course_order ?? 999,
				course_code: co.course_code,
				course_name: co.course_name || '',
				exam_date: examDate,
				exam_session: examSession,
			})
		}
	}

	const rows = Array.from(courseMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	if (rows.length === 0) return ''

	// Build board groups for merged cells
	const boardGroups: { board_code: string, startIdx: number, count: number }[] = []
	let prevBoard: string | null = null
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].board_code !== prevBoard) {
			boardGroups.push({ board_code: rows[i].board_code, startIdx: i, count: 1 })
			prevBoard = rows[i].board_code
		} else {
			boardGroups[boardGroups.length - 1].count++
		}
	}

	// Portrait A4 = ~197mm usable
	const colWidths = [8, 40, 22, 12, 10, 22, 83]  // Total = 197
	const headers = ['S.No', 'Board', 'Exam Date', 'Session', 'Sem', 'Course\nCode', 'Course Name']
	const headerHeight = 10
	const rowHeight = 7
	const footerSpace = 10

	let currentPage = 1
	let rowsOnPage = 0

	function drawTimetableHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		for (let i = 0; i < headers.length; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			const lines = headers[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + colWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			x += colWidths[i]
		}
		return y + headerHeight
	}

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr)
			if (isNaN(d.getTime())) return dateStr
			return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
		} catch { return dateStr }
	}

	let startY = drawHeader(doc, pageWidth, margin, opts, 'BOARD WISE EXAM TIMETABLE')
	let tableY = drawTimetableHeader(startY)

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const rowHeights = rows.map(row => calcWrappedRowHeight(doc, row.course_name, colWidths[6] - 2, rowHeight))
	padBoardGroupHeights(doc, rows, boardGroups, rowHeights, colWidths[1])

	let boardGroupIdx = 0
	let boardGroupRowOffset = 0

	for (let idx = 0; idx < rows.length; idx++) {
		const row = rows[idx]
		const rh = rowHeights[idx]

		const bg = boardGroups[boardGroupIdx]

		// When starting a new board group, check if the board label + first row fits on this page
		if (boardGroupRowOffset === 0 && rowsOnPage > 0) {
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			const labelHeight = calcWrappedRowHeight(doc, boardLabel, colWidths[1] - 2, rh)
			if (tableY + labelHeight > pageHeight - margin - footerSpace) {
				doc.addPage()
				currentPage++
				tableY = margin + 2
				tableY = drawTimetableHeader(tableY)
				rowsOnPage = 0
			}
		}

		if (tableY + rh > pageHeight - margin - footerSpace) {
			doc.addPage()
			currentPage++
			tableY = margin + 2
			tableY = drawTimetableHeader(tableY)
			rowsOnPage = 0
		}

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin

		// S.No
		doc.rect(x, tableY, colWidths[0], rh)
		doc.text(String(idx + 1), x + colWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[0]

		// Board - merged
		if (boardGroupRowOffset === 0 || rowsOnPage === 0) {
			const remainingInGroup = bg.count - boardGroupRowOffset
			const availableSpace = pageHeight - margin - footerSpace - tableY
			let mergeHeight = 0
			for (let ri = 0; ri < remainingInGroup; ri++) {
				const h = rowHeights[bg.startIdx + boardGroupRowOffset + ri]
				if (mergeHeight + h > availableSpace) break
				mergeHeight += h
			}
			if (mergeHeight === 0) mergeHeight = rh
			doc.rect(x, tableY, colWidths[1], mergeHeight)
			const boardRow = rows[bg.startIdx]
			const boardLabel = formatBoardDisplay(bg.board_code, boardRow?.board_name)
			drawWrappedCell(doc, boardLabel, x, tableY, colWidths[1], mergeHeight, 'center')
		}
		x += colWidths[1]

		// Exam Date
		doc.rect(x, tableY, colWidths[2], rh)
		doc.text(row.exam_date ? formatDate(row.exam_date) : '-', x + colWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[2]

		// Session
		doc.rect(x, tableY, colWidths[3], rh)
		doc.text(row.exam_session || '-', x + colWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[3]

		// Sem
		doc.rect(x, tableY, colWidths[4], rh)
		doc.text(row.semester ? toRoman(row.semester) : '', x + colWidths[4] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[4]

		// Course Code
		doc.rect(x, tableY, colWidths[5], rh)
		doc.text(row.course_code, x + colWidths[5] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
		x += colWidths[5]

		// Course Name - wrapped
		doc.rect(x, tableY, colWidths[6], rh)
		drawWrappedCell(doc, row.course_name, x, tableY, colWidths[6], rh)

		tableY += rh
		rowsOnPage++

		boardGroupRowOffset++
		if (boardGroupRowOffset >= bg.count) {
			boardGroupIdx++
			boardGroupRowOffset = 0
		}
	}

	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `board-wise-exam-timetable-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

/** Shared generator for both exam-date-wise Registration and Attendance reports.
 * Continuous layout: single institution header on page 1, all date+session groups
 * flow continuously. Page breaks only when content overflows. */
function generateExamDateWisePdf(opts: ReportPdfOptions, includePresent: boolean): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35

	// ── Step 1: Aggregate rows by exam_date + session + course_code ──
	interface CourseAgg {
		semester: number
		board_code: string
		board_name: string
		board_order: number
		course_code: string
		course_name: string
		course_order: number
		registered: number
		present: number
	}

	const groupMap = new Map<string, CourseAgg[]>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const examDate = row.exam_date
		const examSession = row.exam_session
		if (!examDate || !examSession) continue

		const groupKey = `${examDate}|${examSession}`
		if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])

		const courses = groupMap.get(groupKey)!
		const courseKey = co.course_code
		let existing = courses.find(c => c.course_code === courseKey)

		if (!existing) {
			existing = {
				semester: co.semester || 0,
				board_code: co.board_code || '',
				board_name: co.board_name || '',
				board_order: co.board_order ?? 999,
				course_code: co.course_code,
				course_name: co.course_name || '',
				course_order: co.course_order ?? 999,
				registered: 0,
				present: 0,
			}
			courses.push(existing)
		}

		existing.registered++
		if (includePresent && row.is_present) {
			existing.present++
		}
	}

	if (groupMap.size === 0) return ''

	// ── Step 2: Sort groups by date ASC, FN before AN ──
	const sortedGroupKeys = Array.from(groupMap.keys()).sort((a, b) => {
		const [dateA, sessA] = a.split('|')
		const [dateB, sessB] = b.split('|')
		const dateCompare = new Date(dateA).getTime() - new Date(dateB).getTime()
		if (dateCompare !== 0) return dateCompare
		const sessOrder = (s: string) => s === 'FN' ? 0 : s === 'AN' ? 1 : 2
		return sessOrder(sessA) - sessOrder(sessB)
	})

	// Sort courses within each group by semester → board_order → course_order
	for (const courses of groupMap.values()) {
		courses.sort((a, b) =>
			(a.semester - b.semester) ||
			(a.board_order - b.board_order) ||
			(a.course_order - b.course_order) ||
			a.course_code.localeCompare(b.course_code)
		)
	}

	// ── Step 3: Define table layout ──
	const colWidths = includePresent
		? [9, 15, 15, 22, 100.3, 18, 18]  // 197.3mm total
		: [9, 15, 15, 22, 118.3, 18]       // 197.3mm total

	const headers = includePresent
		? ['S.No', 'Sem', 'Board', 'Course\nCode', 'Course Name', 'No. of\nStudents\nRegister/QP', 'No. of\nStudents\nPresent']
		: ['S.No', 'Sem', 'Board', 'Course\nCode', 'Course Name', 'No. of\nStudents\nRegister/QP']

	const headerHeight = 12
	const rowHeight = 7
	const totalRowHeight = 7
	const groupLabelHeight = 7
	const footerSpace = 10
	const courseNameColIdx = 4

	const reportTitle = includePresent
		? 'EXAM DATE WISE ATTENDANCE / ANSWER SHEET COUNT'
		: 'EXAM DATE WISE REGISTRATION / QP COUNT'

	function formatExamDate(dateStr: string): string {
		try {
			const d = new Date(dateStr)
			if (isNaN(d.getTime())) return dateStr
			return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
		} catch {
			return dateStr
		}
	}

	function drawTableHeader(y: number): number {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		let x = margin
		for (let i = 0; i < headers.length; i++) {
			doc.rect(x, y, colWidths[i], headerHeight)
			const lines = headers[i].split('\n')
			const lineH = headerHeight / (lines.length + 1)
			lines.forEach((line, li) => {
				doc.text(line, x + colWidths[i] / 2, y + lineH * (li + 1), { align: 'center' })
			})
			x += colWidths[i]
		}
		return y + headerHeight
	}

	/** Draw group label + table header, checking for page break. Returns new tableY. */
	function startGroupSection(tableY: number, groupLabel: string): number {
		// Need space for: group label + header + at least 1 row + total row
		const minNeeded = groupLabelHeight + headerHeight + rowHeight + totalRowHeight
		if (tableY + minNeeded > pageHeight - margin - footerSpace) {
			doc.addPage()
			tableY = margin + 2
		}

		// Draw group label
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setTextColor(0, 0, 0)
		doc.text(groupLabel, margin, tableY + 4)
		tableY += groupLabelHeight

		// Draw table header
		return drawTableHeader(tableY)
	}

	// ── Step 4: Draw institution header ONCE on first page ──
	let tableY = drawHeader(doc, pageWidth, margin, opts, reportTitle)

	// ── Step 5: Render all groups continuously ──
	for (const groupKey of sortedGroupKeys) {
		const [examDate, session] = groupKey.split('|')
		const courses = groupMap.get(groupKey)!
		const formattedDate = formatExamDate(examDate)
		const groupLabel = `Exam Date : ${formattedDate}  & ${session}`

		// Pre-compute row heights for course name wrapping
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		const rowHeights = courses.map(c => calcWrappedRowHeight(doc, c.course_name, colWidths[courseNameColIdx] - 2, rowHeight))

		// Start this group (label + table header)
		tableY = startGroupSection(tableY, groupLabel)

		// Draw data rows
		for (let idx = 0; idx < courses.length; idx++) {
			const course = courses[idx]
			const rh = rowHeights[idx]

			// Page break check — need room for this row + total row
			if (tableY + rh + totalRowHeight > pageHeight - margin - footerSpace && idx < courses.length - 1) {
				doc.addPage()
				tableY = margin + 2
				// Re-draw table header on new page (no institution header — continuous)
				tableY = drawTableHeader(tableY)
			}

			doc.setFont('times', 'normal')
			doc.setFontSize(9)
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)

			let x = margin

			// S.No
			doc.rect(x, tableY, colWidths[0], rh)
			doc.text(String(idx + 1), x + colWidths[0] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[0]

			// Semester (Roman numeral)
			doc.rect(x, tableY, colWidths[1], rh)
			doc.text(toRoman(course.semester), x + colWidths[1] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[1]

			// Board
			doc.rect(x, tableY, colWidths[2], rh)
			doc.text(course.board_code, x + colWidths[2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[2]

			// Course Code
			doc.rect(x, tableY, colWidths[3], rh)
			doc.text(course.course_code, x + colWidths[3] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[3]

			// Course Name (wrapped)
			doc.rect(x, tableY, colWidths[courseNameColIdx], rh)
			drawWrappedCell(doc, course.course_name, x, tableY, colWidths[courseNameColIdx], rh)
			x += colWidths[courseNameColIdx]

			// No. of Students Register/QP
			doc.rect(x, tableY, colWidths[courseNameColIdx + 1], rh)
			doc.text(String(course.registered), x + colWidths[courseNameColIdx + 1] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			x += colWidths[courseNameColIdx + 1]

			// No. of Students Present (attendance report only)
			if (includePresent) {
				doc.rect(x, tableY, colWidths[courseNameColIdx + 2], rh)
				doc.text(String(course.present), x + colWidths[courseNameColIdx + 2] / 2, tableY + rh / 2 + 1.5, { align: 'center' })
			}

			tableY += rh
		}

		// Draw Total row
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		const totalRegistered = courses.reduce((sum, c) => sum + c.registered, 0)
		const totalPresent = courses.reduce((sum, c) => sum + c.present, 0)

		// Total row spans S.No through Course Name
		const totalLabelWidth = colWidths.slice(0, courseNameColIdx + 1).reduce((a, b) => a + b, 0)
		let tx = margin
		doc.rect(tx, tableY, totalLabelWidth, totalRowHeight)
		doc.text('Total :', tx + totalLabelWidth - 2, tableY + totalRowHeight / 2 + 1.5, { align: 'right' })
		tx += totalLabelWidth

		// Total Registered
		doc.rect(tx, tableY, colWidths[courseNameColIdx + 1], totalRowHeight)
		doc.text(String(totalRegistered), tx + colWidths[courseNameColIdx + 1] / 2, tableY + totalRowHeight / 2 + 1.5, { align: 'center' })
		tx += colWidths[courseNameColIdx + 1]

		// Total Present (attendance only)
		if (includePresent) {
			doc.rect(tx, tableY, colWidths[courseNameColIdx + 2], totalRowHeight)
			doc.text(String(totalPresent), tx + colWidths[courseNameColIdx + 2] / 2, tableY + totalRowHeight / 2 + 1.5, { align: 'center' })
		}

		// Advance Y for next group (small gap between groups)
		tableY += totalRowHeight + 4
	}

	// Add footers to all pages
	const totalPages = doc.getNumberOfPages()
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		drawFooter(doc, pageWidth, margin, p, totalPages)
	}

	const reportSuffix = includePresent ? 'attendance' : 'registration'
	const levelSuffix = opts.course_level ? `-${opts.course_level}` : ''
	const filename = `exam-date-wise-${reportSuffix}-${opts.session_code}${levelSuffix}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}

// ── Main Export ──

export function generateExamRegistrationReportPdf(opts: ReportPdfOptions): string {
	// Filter data by course_level (UG/PG) if specified
	let filteredOpts = opts
	if (opts.course_level) {
		const filteredData = opts.data.filter(row => {
			// 1. Student's own board_type (most reliable — from their program registration)
			const studentBoardType = row.student_board_type || ''
			if (studentBoardType === 'UG' || studentBoardType === 'PG') {
				return studentBoardType === opts.course_level
			}
			// 2. Course offering's board_type
			const courseBoardType = row.course_offering?.board_type || ''
			if (courseBoardType === 'UG' || courseBoardType === 'PG') {
				return courseBoardType === opts.course_level
			}
			// 3. Fallback: program code prefix (legacy)
			const prefix = opts.course_level === 'UG' ? 'U' : 'P'
			const programCode = row.course_offering?.program_code || row.program_code || ''
			return programCode.startsWith(prefix)
		})
		filteredOpts = { ...opts, data: filteredData }
	}

	if (filteredOpts.data.length === 0) return ''

	switch (filteredOpts.report_type) {
		case 'student-fee-details':
			return generateStudentFeeDetailsPdf(filteredOpts)
		case 'course-count-regular-arrear':
			return generateCourseCountRegularArrearPdf(filteredOpts)
		case 'course-count-year-wise':
			return generateCourseCountYearWisePdf(filteredOpts)
		case 'course-count-program-year-wise':
			return generateCourseCountProgramYearWisePdf(filteredOpts)
		case 'course-count-program-year-section':
			return generateCourseCountProgramYearSectionPdf(filteredOpts)
		case 'qp-packing-list':
			return generateQPPackingListPdf(filteredOpts)
		case 'board-wise-exam-timetable':
			return generateBoardWiseExamTimetablePdf(filteredOpts)
		case 'exam-date-wise-summary':
			return generateExamDateWiseSummaryPdf(filteredOpts)
		case 'exam-date-wise-registration':
			return generateExamDateWiseRegistrationPdf(filteredOpts)
		case 'exam-date-wise-attendance':
			return generateExamDateWiseAttendancePdf(filteredOpts)
		default:
			throw new Error(`Unknown report type: ${filteredOpts.report_type}`)
	}
}
