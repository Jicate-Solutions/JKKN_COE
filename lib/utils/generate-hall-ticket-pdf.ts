import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { HallTicketData, HallTicketStudent, HallTicketPdfSettings } from '@/types/hall-ticket'

/**
 * Generate Hall Ticket PDF
 *
 * Creates a professional hall ticket PDF matching the sample layout:
 * - Institution header with logos and accreditation
 * - Student information section
 * - Examination subjects table
 * - Signature sections and notes
 *
 * Each student gets their own page in the PDF.
 */

interface GenerateHallTicketOptions {
	data: HallTicketData
	settings?: HallTicketPdfSettings
}

export function generateHallTicketPDF(options: GenerateHallTicketOptions): string {
	const { data } = options

	// Create a single PDF document for all students
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const margin = 6.35 // 0.25 inch narrow margin

	// Group students by semester_group (year) for year-wise PDF generation
	// Then sort within each group by register_number
	const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
	const groupedByYear = data.students.reduce((acc, student) => {
		const group = student.semester_group || 'Other'
		if (!acc[group]) acc[group] = []
		acc[group].push(student)
		return acc
	}, {} as Record<string, HallTicketStudent[]>)

	// Sort each group by register_number
	Object.values(groupedByYear).forEach(group => {
		group.sort((a, b) => a.register_number.localeCompare(b.register_number))
	})

	// Sort groups by year order and flatten
	const sortedStudents = Object.entries(groupedByYear)
		.sort((a, b) => {
			const indexA = yearOrder.indexOf(a[0])
			const indexB = yearOrder.indexOf(b[0])
			return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
		})
		.flatMap(([, students]) => students)

	// Track total pages for multi-page students
	let isFirstPage = true

	// Process each student (may need multiple pages if subjects > maxRows)
	sortedStudents.forEach((student) => {
		// Sort subjects by exam date asc, then FN before AN
		const sortedSubjects = sortSubjectsByDateSession(student.subjects)

		// Split subjects into chunks of maxRows (22) for multi-page support
		const maxRows = 22
		const totalSubjects = sortedSubjects.length
		const totalPages = Math.max(1, Math.ceil(totalSubjects / maxRows))

		// Process each page for this student
		for (let pageNum = 0; pageNum < totalPages; pageNum++) {
			// Add new page (except the very first page of the document)
			if (!isFirstPage) {
				doc.addPage()
			}
			isFirstPage = false

			// Get subjects for this page
			const startIdx = pageNum * maxRows
			const endIdx = Math.min(startIdx + maxRows, totalSubjects)
			const pageSubjects = sortedSubjects.slice(startIdx, endIdx)

			let currentY = margin

		// ========== HEADER SECTION (matching 1.pdf reference style) ==========

		const inst1 = data.institution
		const primaryColor1 = inst1.primary_color || '#006400'
		const pcR1 = parseInt(primaryColor1.slice(1, 3), 16) || 0
		const pcG1 = parseInt(primaryColor1.slice(3, 5), 16) || 100
		const pcB1 = parseInt(primaryColor1.slice(5, 7), 16) || 0

		// College Logo (left side) - 16x16mm
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side) - 16x16mm
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
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

		// Examination Session Title
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text(`SEMESTER EXAMINATION ${data.session.session_name}`, pageWidth / 2, currentY, { align: 'center' })

		currentY += 5

		// Hall Ticket heading with page number if multi-page
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		if (totalPages > 1) {
			doc.text(`Hall Ticket (Page ${pageNum + 1} of ${totalPages})`, pageWidth / 2, currentY, { align: 'center' })
		} else {
			doc.text('Hall Ticket', pageWidth / 2, currentY, { align: 'center' })
		}

		currentY += 3

		// ========== STUDENT INFORMATION SECTION (TABLE WITH GRID) ==========

		// Student info table with photo on right side
		const infoTableWidth = pageWidth - 2 * margin
		const labelColWidth = 35
		const photoColWidth = 28
		const valueColWidth = infoTableWidth - labelColWidth - photoColWidth
		const rowHeight = 7

		// Student info fields
		const fields = [
			{ label: 'Register Number', value: student.register_number },
			{ label: 'Name of the Student', value: student.student_name },
			{ label: 'Date of Birth', value: student.date_of_birth || '' },
			{ label: 'Program', value: student.program },
			{ label: 'UMIS', value: student.emis || '' },
		]

		// Pre-compute row heights — Program row expands for long names
		const lineH = 4
		const fieldHeights = fields.map((field) => {
			if (field.label === 'Program' && field.value) {
				const lines = doc.splitTextToSize(field.value, valueColWidth - 4)
				return Math.max(rowHeight, lines.length * lineH + 3)
			}
			return rowHeight
		})

		const infoTableHeight = fieldHeights.reduce((sum, h) => sum + h, 0)
		const infoBoxY = currentY

		// Draw table borders
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		// Outer border for entire info section
		doc.rect(margin, infoBoxY, infoTableWidth, infoTableHeight)

		// Vertical line separating info from photo area
		const photoAreaX = margin + labelColWidth + valueColWidth

		// Draw each row with grid lines (variable row heights)
		let rowOffsetY = 0
		fields.forEach((field, index) => {
			const rowY = infoBoxY + rowOffsetY
			const rowH = fieldHeights[index]

			// Horizontal line (except first row — outer border covers it)
			if (index > 0) {
				doc.line(margin, rowY, photoAreaX, rowY)
			}

			// Vertical line between label and value
			doc.line(margin + labelColWidth, rowY, margin + labelColWidth, rowY + rowH)

			// Label text (bold, vertically centered)
			const textY = rowY + (rowH / 2) + 1.5
			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			doc.setTextColor(0, 0, 0)
			doc.text(field.label, margin + 2, textY)

			// Value text (normal) — wrap for Program field
			doc.setFont('times', 'normal')
			if (field.label === 'Program' && field.value) {
				const lines = doc.splitTextToSize(field.value, valueColWidth - 4)
				const totalH = lines.length * lineH
				const startY = rowY + (rowH - totalH) / 2 + lineH * 0.75
				lines.forEach((line: string, li: number) => {
					doc.text(line, margin + labelColWidth + 2, startY + li * lineH)
				})
			} else {
				doc.text(field.value, margin + labelColWidth + 2, textY)
			}

			rowOffsetY += rowH
		})

		// Vertical line separating info from photo area
		doc.line(photoAreaX, infoBoxY, photoAreaX, infoBoxY + infoTableHeight)

		// Photo fills the entire photo column (no inner box — table borders are the boundary)
		if (student.student_photo_url) {
			try {
				const imgPad = 1.5
				doc.addImage(
					student.student_photo_url, 'JPEG',
					photoAreaX + imgPad,
					infoBoxY + imgPad,
					photoColWidth - imgPad * 2,
					infoTableHeight - imgPad * 2
				)
			} catch (e) {
				console.warn('Failed to add student photo:', e)
			}
		}

		currentY = infoBoxY + infoTableHeight // Join directly with subject table

		// ========== FIXED LAYOUT SUBJECT TABLE ==========
		// Fixed dimensions for A4 academic document standard
		const tableWidth = pageWidth - 2 * margin
		const subjectHeaderHeight = 8 // Header row height
		const subjectRowHeight = 4 // Each subject row height (compact like marksheet)
		// Calculate display rows to fill page down to signature section
		const pgHeight = doc.internal.pageSize.getHeight()
		const bottomReserved = 18 + 6 + 8 + margin + 4 // signature + timings + note + margin + gap
		const availableHeight = pgHeight - currentY - bottomReserved
		const displayRows = Math.max(maxRows, Math.floor((availableHeight - subjectHeaderHeight) / subjectRowHeight))
		const tableHeight = subjectHeaderHeight + (displayRows * subjectRowHeight)

		const subjectTableStartY = currentY

		// Column widths (must sum to tableWidth = 197.3mm for A4 with 6.35mm margins)
		const columnWidths = [9, 9, 22, 125.3, 20, 12] // S.No, Sem, Code, Name, Date, Session

		// Prepare table data - only actual subjects (no empty padding rows)
		// Empty padding is handled visually by the fixed-height border rectangle
		const tableData: string[][] = []
		for (let i = 0; i < pageSubjects.length; i++) {
			const subject = pageSubjects[i]
			// Serial number continues from previous pages
			const serialNum = startIdx + i + 1
			tableData.push([
				serialNum.toString(),
				semesterToRoman(subject.semester),
				subject.subject_code,
				subject.subject_name,
				formatExamDate(subject.exam_date),
				formatExamSession(subject.exam_time)
			])
		}

		// Draw subject table - only actual subjects to prevent autoTable page overflow
		autoTable(doc, {
			startY: subjectTableStartY,
			head: [['S.No', 'Sem', 'Subject Code', 'Subject Name', 'Date of Exam', 'Session']],
			body: tableData,
			theme: 'plain', // No default borders - we'll draw custom borders
			pageBreak: 'avoid',
			styles: {
				font: 'times',
				fontStyle: 'normal',
				fontSize: 9,
				textColor: [0, 0, 0],
				cellPadding: 0.5,
				valign: 'middle',
				minCellHeight: subjectRowHeight,
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
				minCellHeight: subjectHeaderHeight
			},
			bodyStyles: {
				font: 'times',
				fontSize: 9,
				valign: 'middle',
				minCellHeight: subjectRowHeight
			},
			columnStyles: {
				0: { halign: 'center', valign: 'middle', cellWidth: columnWidths[0] }, // S.No
				1: { halign: 'center', valign: 'middle', cellWidth: columnWidths[1] }, // Sem
				2: { halign: 'center', valign: 'middle', cellWidth: columnWidths[2] }, // Subject Code
				3: { halign: 'left', valign: 'middle', cellWidth: columnWidths[3] }, // Subject Name
				4: { halign: 'center', valign: 'middle', cellWidth: columnWidths[4] }, // Date of Exam
				5: { halign: 'center', valign: 'middle', cellWidth: columnWidths[5] } // Session
			},
			margin: { left: margin, right: margin },
			tableWidth: tableWidth
		})

		// Draw custom borders (fixed height, not based on actual content)
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)

		// Draw outer border (rectangle around entire subject table - FIXED HEIGHT)
		doc.rect(margin, subjectTableStartY, tableWidth, tableHeight)

		// Draw vertical column lines (5 separators for 6 columns) - full table height
		let xPos = margin
		for (let i = 0; i < 5; i++) {
			xPos += columnWidths[i]
			doc.line(xPos, subjectTableStartY, xPos, subjectTableStartY + tableHeight)
		}

		// Draw horizontal line below header row ONLY (no lines between subject rows)
		doc.line(margin, subjectTableStartY + subjectHeaderHeight, margin + tableWidth, subjectTableStartY + subjectHeaderHeight)

		// ========== SIGNATURE SECTION (Only on last page for multi-page students) ==========
		const isLastPage = pageNum === totalPages - 1

		if (isLastPage) {
			const pageHeight = doc.internal.pageSize.getHeight()
			const signatureHeight = 18 // Height for signature row
			const timingsHeight = 6 // Height for timings row

			// Position signature immediately after course table (joined)
			const signatureStartY = subjectTableStartY + tableHeight

			// Draw signature row using autoTable for proper alignment
			autoTable(doc, {
				startY: signatureStartY,
				body: [
					[
						{ content: '\n\nSignature of the Student', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } },
						{ content: '\n\nSignature of the Controller of Examinations (FAC)', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } },
						{ content: '\n\nSignature of the Chief Controller', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } }
					]
				],
				theme: 'grid',
				styles: {
					font: 'times',
					fontStyle: 'bold',
					fontSize: 9,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 1,
					minCellHeight: signatureHeight
				},
				columnStyles: {
					0: { cellWidth: tableWidth * 0.25 },
					1: { cellWidth: tableWidth * 0.42 },
					2: { cellWidth: tableWidth * 0.33 }
				},
				margin: { left: margin, right: margin },
				tableWidth: tableWidth
			})

			// Get Y position after signature row
			const signatureEndY = (doc as any).lastAutoTable.finalY

			// Draw timings row
			autoTable(doc, {
				startY: signatureEndY,
				body: [
					[{ content: 'Timings: FN - 10.00 A.M. to 01.00 P.M.    AN - 02.00 P.M. to 05.00 P.M.', styles: { halign: 'right', fontStyle: 'bold' } }]
				],
				theme: 'grid',
				styles: {
					font: 'times',
					fontSize: 8,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 1.5,
					fillColor: [255, 255, 255], // White background
					minCellHeight: timingsHeight
				},
				columnStyles: {
					0: { cellWidth: tableWidth }
				},
				margin: { left: margin, right: margin },
				tableWidth: tableWidth
			})

			// Get Y position after timings row
			const timingsEndY = (doc as any).lastAutoTable.finalY

			// ========== FOOTER NOTE ==========

			doc.setFont('times', 'bold')
			doc.setFontSize(8)
			doc.setTextColor(0, 0, 0)
			doc.text('Note: Student must bring their college ID Card and hall ticket at the time of the Examinations', margin, timingsEndY + 4)

			// ========== FOOTER PAGE NUMBER, DATE & TIME ==========
			const footerY = pageHeight - margin
			const now = new Date()
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
			const hours = now.getHours()
			const ampm = hours >= 12 ? 'PM' : 'AM'
			const hours12 = hours % 12 || 12
			const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(100, 100, 100)

			// Left: Date & Time
			doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

			// Right: Page number (per student)
			if (totalPages > 1) {
				doc.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
			} else {
				doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' })
			}
		} else {
			// For non-last pages, add "Continued on next page..." indicator and page info
			const pageHeight = doc.internal.pageSize.getHeight()
			doc.setFont('times', 'italic')
			doc.setFontSize(9)
			doc.setTextColor(100, 100, 100)
			doc.text('(Continued on next page...)', pageWidth / 2, pageHeight - margin - 8, { align: 'center' })

			// ========== FOOTER PAGE NUMBER, DATE & TIME (for continuation pages) ==========
			const footerY = pageHeight - margin
			const now = new Date()
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
			const hours = now.getHours()
			const ampm = hours >= 12 ? 'PM' : 'AM'
			const hours12 = hours % 12 || 12
			const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(100, 100, 100)

			// Left: Date & Time
			doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

			// Right: Page number (per student)
			doc.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
		}
		} // End of page loop for this student
	})

	// Generate filename
	const programName = data.students[0]?.program?.replace(/[^a-zA-Z0-9]/g, '_') || 'Program'
	const sessionName = data.session.session_name.replace(/[^a-zA-Z0-9]/g, '_')
	const fileName = `HallTicket_${programName}_${sessionName}_${new Date().toISOString().split('T')[0]}.pdf`

	// Save the PDF
	doc.save(fileName)

	return fileName
}

/**
 * Sort subjects by exam date ascending, then FN before AN on same date
 */
function sortSubjectsByDateSession<T extends { exam_date: string; exam_time: string }>(subjects: T[]): T[] {
	return [...subjects].sort((a, b) => {
		const dateA = parseDateForSort(a.exam_date)
		const dateB = parseDateForSort(b.exam_date)
		if (dateA !== dateB) return dateA - dateB
		return sessionOrder(a.exam_time) - sessionOrder(b.exam_time)
	})
}

function parseDateForSort(dateStr: string): number {
	if (!dateStr) return Infinity
	try {
		const d = new Date(dateStr)
		if (!isNaN(d.getTime())) return d.getTime()
	} catch { /* ignore */ }
	return Infinity
}

function sessionOrder(examTime: string): number {
	const s = formatExamSession(examTime)
	if (s === 'FN') return 0
	if (s === 'AN') return 1
	return 2
}

/**
 * Format exam date to DD-MM-YYYY format (e.g., 27-10-2025)
 * Returns '-' for unavailable dates
 */
function formatExamDate(dateStr: string): string {
	if (!dateStr || dateStr.toLowerCase().includes('announced') || dateStr.toLowerCase().includes('tba')) {
		return '-'
	}
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

/**
 * Convert exam time to FN (Forenoon) or AN (Afternoon)
 */
function formatExamSession(examTime: string): string {
	if (!examTime) return ''
	const upper = examTime.toUpperCase()
	if (upper.includes('FN') || upper.includes('FORENOON') || upper.includes('10:') || upper.includes('10.') || upper.includes('MORNING')) return 'FN'
	if (upper.includes('AN') || upper.includes('AFTERNOON') || upper.includes('02:') || upper.includes('02.') || upper.includes('2:') || upper.includes('PM')) return 'AN'
	return examTime
}

/**
 * Convert semester number/string to Roman numeral
 */
function semesterToRoman(semester: string): string {
	if (!semester) return ''
	const num = parseInt(semester.replace(/\D/g, ''), 10)
	if (isNaN(num)) return semester
	const romans: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' }
	return romans[num] || semester
}

/**
 * Generate Hall Ticket PDF and return as Blob (for preview or download)
 */
export function generateHallTicketPDFBlob(options: GenerateHallTicketOptions): Blob {
	const { data } = options

	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const margin = 6.35 // 0.25 inch narrow margin

	// Group students by semester_group (year) for year-wise PDF generation
	// Then sort within each group by register_number
	const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
	const groupedByYear = data.students.reduce((acc, student) => {
		const group = student.semester_group || 'Other'
		if (!acc[group]) acc[group] = []
		acc[group].push(student)
		return acc
	}, {} as Record<string, HallTicketStudent[]>)

	// Sort each group by register_number
	Object.values(groupedByYear).forEach(group => {
		group.sort((a, b) => a.register_number.localeCompare(b.register_number))
	})

	// Sort groups by year order and flatten
	const sortedStudents = Object.entries(groupedByYear)
		.sort((a, b) => {
			const indexA = yearOrder.indexOf(a[0])
			const indexB = yearOrder.indexOf(b[0])
			return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
		})
		.flatMap(([, students]) => students)

	// Track total pages for multi-page students
	let isFirstPage = true

	// Process each student (may need multiple pages if subjects > maxRows)
	sortedStudents.forEach((student) => {
		// Sort subjects by exam date asc, then FN before AN
		const sortedSubjects = sortSubjectsByDateSession(student.subjects)

		// Split subjects into chunks of maxRows (22) for multi-page support
		const maxRows = 22
		const totalSubjects = sortedSubjects.length
		const totalPages = Math.max(1, Math.ceil(totalSubjects / maxRows))

		// Process each page for this student
		for (let pageNum = 0; pageNum < totalPages; pageNum++) {
			// Add new page (except the very first page of the document)
			if (!isFirstPage) {
				doc.addPage()
			}
			isFirstPage = false

			// Get subjects for this page
			const startIdx = pageNum * maxRows
			const endIdx = Math.min(startIdx + maxRows, totalSubjects)
			const pageSubjects = sortedSubjects.slice(startIdx, endIdx)

			let currentY = margin

			// ========== HEADER SECTION (matching 1.pdf reference style) ==========

			const inst2 = data.institution
			const primaryColor2 = inst2.primary_color || '#006400'
			const pcR2 = parseInt(primaryColor2.slice(1, 3), 16) || 0
			const pcG2 = parseInt(primaryColor2.slice(3, 5), 16) || 100
			const pcB2 = parseInt(primaryColor2.slice(5, 7), 16) || 0

			// College Logo (left side) - 16x16mm
			if (data.logoImage) {
				try {
					doc.addImage(data.logoImage, 'PNG', margin, currentY, 16, 16)
				} catch (e) {
					console.warn('Failed to add logo:', e)
				}
			}

			// College Logo (right side) - 16x16mm
			if (data.rightLogoImage) {
				try {
					doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
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

			// Examination Session Title
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.setTextColor(0, 0, 0)
			doc.text(`SEMESTER EXAMINATION ${data.session.session_name}`, pageWidth / 2, currentY, { align: 'center' })

			currentY += 5

			// Hall Ticket heading with page number if multi-page
			doc.setFont('times', 'bold')
			doc.setFontSize(14)
			if (totalPages > 1) {
				doc.text(`Hall Ticket (Page ${pageNum + 1} of ${totalPages})`, pageWidth / 2, currentY, { align: 'center' })
			} else {
				doc.text('Hall Ticket', pageWidth / 2, currentY, { align: 'center' })
			}

			currentY += 3

			// Student Info (Table with Grid)
			const infoTableWidth = pageWidth - 2 * margin
			const labelColWidth = 35
			const photoColWidth = 35
			const valueColWidth = infoTableWidth - labelColWidth - photoColWidth
			const rowHeight = 7

			const fields = [
				{ label: 'Register Number', value: student.register_number },
				{ label: 'Name of the Student', value: student.student_name },
				{ label: 'Date of Birth', value: student.date_of_birth || '' },
				{ label: 'Program', value: student.program },
				{ label: 'UMIS', value: student.emis || '' },
			]

			// Pre-compute row heights — Program row expands for long names
			const lineH = 4
			const fieldHeights = fields.map((field) => {
				if (field.label === 'Program' && field.value) {
					const lines = doc.splitTextToSize(field.value, valueColWidth - 4)
					return Math.max(rowHeight, lines.length * lineH + 3)
				}
				return rowHeight
			})

			const infoTableHeight = fieldHeights.reduce((sum, h) => sum + h, 0)
			const infoBoxY = currentY

			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)
			doc.rect(margin, infoBoxY, infoTableWidth, infoTableHeight)

			const photoAreaX = margin + labelColWidth + valueColWidth

			let rowOffsetY = 0
			fields.forEach((field, index) => {
				const rowY = infoBoxY + rowOffsetY
				const rowH = fieldHeights[index]

				if (index > 0) {
					doc.line(margin, rowY, photoAreaX, rowY)
				}
				doc.line(margin + labelColWidth, rowY, margin + labelColWidth, rowY + rowH)

				const textY = rowY + (rowH / 2) + 1.5
				doc.setFont('times', 'bold')
				doc.setFontSize(10)
				doc.setTextColor(0, 0, 0)
				doc.text(field.label, margin + 2, textY)

				doc.setFont('times', 'normal')
				if (field.label === 'Program' && field.value) {
					const lines = doc.splitTextToSize(field.value, valueColWidth - 4)
					const totalH = lines.length * lineH
					const startY = rowY + (rowH - totalH) / 2 + lineH * 0.75
					lines.forEach((line: string, li: number) => {
						doc.text(line, margin + labelColWidth + 2, startY + li * lineH)
					})
				} else {
					doc.text(field.value, margin + labelColWidth + 2, textY)
				}

				rowOffsetY += rowH
			})

			doc.line(photoAreaX, infoBoxY, photoAreaX, infoBoxY + infoTableHeight)

			if (student.student_photo_url) {
				try {
					const imgPad = 1.5
					doc.addImage(student.student_photo_url, 'JPEG',
						photoAreaX + imgPad, infoBoxY + imgPad,
						photoColWidth - imgPad * 2, infoTableHeight - imgPad * 2)
				} catch (e) {
					console.warn('Failed to add student photo:', e)
				}
			}

			currentY = infoBoxY + infoTableHeight // Join directly with subject table

			// ========== FIXED LAYOUT SUBJECT TABLE ==========
			// Fixed dimensions for A4 academic document standard
			const tableWidth = pageWidth - 2 * margin
			const subjectHeaderHeight = 8 // Header row height
			const subjectRowHeight = 4 // Each subject row height (compact like marksheet)
			// Calculate display rows to fill page down to signature section
			const pgHeight = doc.internal.pageSize.getHeight()
			const bottomReserved = 18 + 6 + 8 + margin + 4 // signature + timings + note + margin + gap
			const availableHeight = pgHeight - currentY - bottomReserved
			const displayRows = Math.max(maxRows, Math.floor((availableHeight - subjectHeaderHeight) / subjectRowHeight))
			const tableHeight = subjectHeaderHeight + (displayRows * subjectRowHeight)

			const subjectTableStartY = currentY

			// Column widths (must sum to tableWidth = 197.3mm for A4 with 6.35mm margins)
			const columnWidths = [9, 9, 22, 125.3, 20, 12] // S.No, Sem, Code, Name, Date, Session

			// Prepare table data - only actual subjects (no empty padding rows)
			// Empty padding is handled visually by the fixed-height border rectangle
			const tableData: string[][] = []
			for (let i = 0; i < pageSubjects.length; i++) {
				const subject = pageSubjects[i]
				// Serial number continues from previous pages
				const serialNum = startIdx + i + 1
				tableData.push([
					serialNum.toString(),
					semesterToRoman(subject.semester),
					subject.subject_code,
					subject.subject_name,
					formatExamDate(subject.exam_date),
					formatExamSession(subject.exam_time)
				])
			}

			// Draw subject table - only actual subjects to prevent autoTable page overflow
			autoTable(doc, {
				startY: subjectTableStartY,
				head: [['S.No', 'Sem', 'Subject Code', 'Subject Name', 'Date of Exam', 'Session']],
				body: tableData,
				theme: 'plain', // No default borders - we'll draw custom borders
				pageBreak: 'avoid',
				styles: {
					font: 'times',
					fontStyle: 'normal',
					fontSize: 9,
					textColor: [0, 0, 0],
					cellPadding: 0.5,
					valign: 'middle',
					minCellHeight: subjectRowHeight,
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
					minCellHeight: subjectHeaderHeight
				},
				bodyStyles: {
					font: 'times',
					fontSize: 9,
					valign: 'middle',
					minCellHeight: subjectRowHeight
				},
				columnStyles: {
					0: { halign: 'center', valign: 'middle', cellWidth: columnWidths[0] }, // S.No
					1: { halign: 'center', valign: 'middle', cellWidth: columnWidths[1] }, // Sem
					2: { halign: 'center', valign: 'middle', cellWidth: columnWidths[2] }, // Subject Code
					3: { halign: 'left', valign: 'middle', cellWidth: columnWidths[3] }, // Subject Name
					4: { halign: 'center', valign: 'middle', cellWidth: columnWidths[4] }, // Date of Exam
					5: { halign: 'center', valign: 'middle', cellWidth: columnWidths[5] } // Session
				},
				margin: { left: margin, right: margin },
				tableWidth: tableWidth
			})

			// Draw custom borders (fixed height, not based on actual content)
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)

			// Draw outer border (rectangle around entire subject table - FIXED HEIGHT)
			doc.rect(margin, subjectTableStartY, tableWidth, tableHeight)

			// Draw vertical column lines (5 separators for 6 columns) - full table height
			let xPos = margin
			for (let i = 0; i < 5; i++) {
				xPos += columnWidths[i]
				doc.line(xPos, subjectTableStartY, xPos, subjectTableStartY + tableHeight)
			}

			// Draw horizontal line below header row ONLY (no lines between subject rows)
			doc.line(margin, subjectTableStartY + subjectHeaderHeight, margin + tableWidth, subjectTableStartY + subjectHeaderHeight)

			// ========== SIGNATURE SECTION (Only on last page for multi-page students) ==========
			const isLastPage = pageNum === totalPages - 1

			if (isLastPage) {
				const pageHeight = doc.internal.pageSize.getHeight()
				const signatureHeight = 18 // Height for signature row
				const timingsHeight = 6 // Height for timings row

				// Position signature immediately after course table (joined)
				const signatureStartY = subjectTableStartY + tableHeight

				// Draw signature row using autoTable for proper alignment
				autoTable(doc, {
					startY: signatureStartY,
					body: [
						[
							{ content: '\n\nSignature of the Student', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } },
							{ content: '\n\nSignature of the Controller of Examinations (FAC)', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } },
							{ content: '\n\nSignature of the Chief Controller', styles: { halign: 'center', valign: 'bottom', fontStyle: 'bold' } }
						]
					],
					theme: 'grid',
					styles: {
						font: 'times',
						fontStyle: 'bold',
						fontSize: 9,
						textColor: [0, 0, 0],
						lineColor: [0, 0, 0],
						lineWidth: 0.3,
						cellPadding: 1,
						minCellHeight: signatureHeight
					},
					columnStyles: {
						0: { cellWidth: tableWidth * 0.25 },
						1: { cellWidth: tableWidth * 0.42 },
						2: { cellWidth: tableWidth * 0.33 }
					},
					margin: { left: margin, right: margin },
					tableWidth: tableWidth
				})

				// Get Y position after signature row
				const signatureEndY = (doc as any).lastAutoTable.finalY

				// Draw timings row
				autoTable(doc, {
					startY: signatureEndY,
					body: [
						[{ content: 'Timings: FN - 10.00 A.M. to 01.00 P.M.    AN - 02.00 P.M. to 05.00 P.M.', styles: { halign: 'right', fontStyle: 'bold' } }]
					],
					theme: 'grid',
					styles: {
						font: 'times',
						fontSize: 8,
						textColor: [0, 0, 0],
						lineColor: [0, 0, 0],
						lineWidth: 0.3,
						cellPadding: 1.5,
						fillColor: [255, 255, 255], // White background
						minCellHeight: timingsHeight
					},
					columnStyles: {
						0: { cellWidth: tableWidth }
					},
					margin: { left: margin, right: margin },
					tableWidth: tableWidth
				})

				// Get Y position after timings row
				const timingsEndY = (doc as any).lastAutoTable.finalY

				// ========== FOOTER NOTE ==========

				doc.setFont('times', 'bold')
				doc.setFontSize(8)
				doc.setTextColor(0, 0, 0)
				doc.text('Note: Student must bring their college ID Card and hall ticket at the time of the Examinations', margin, timingsEndY + 4)

				// ========== FOOTER PAGE NUMBER, DATE & TIME ==========
				const footerY = pageHeight - margin
				const now = new Date()
				const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
				const hours = now.getHours()
				const ampm = hours >= 12 ? 'PM' : 'AM'
				const hours12 = hours % 12 || 12
				const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(100, 100, 100)

				// Left: Date & Time
				doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

				// Right: Page number (per student)
				if (totalPages > 1) {
					doc.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
				} else {
					doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' })
				}
			} else {
				// For non-last pages, add "Continued on next page..." indicator and page info
				const pageHeight = doc.internal.pageSize.getHeight()
				doc.setFont('times', 'italic')
				doc.setFontSize(9)
				doc.setTextColor(100, 100, 100)
				doc.text('(Continued on next page...)', pageWidth / 2, pageHeight - margin - 8, { align: 'center' })

				// ========== FOOTER PAGE NUMBER, DATE & TIME (for continuation pages) ==========
				const footerY = pageHeight - margin
				const now = new Date()
				const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
				const hours = now.getHours()
				const ampm = hours >= 12 ? 'PM' : 'AM'
				const hours12 = hours % 12 || 12
				const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(100, 100, 100)

				// Left: Date & Time
				doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

				// Right: Page number (per student)
				doc.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
			}
		} // End of page loop for this student
	})

	return doc.output('blob')
}
