import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { HallTicketData, HallTicketStudent } from '@/types/hall-ticket'

/**
 * Generate Hall Ticket Distribution PDF
 *
 * Creates a distribution list PDF for hall ticket handover tracking.
 * Grouped by program & year, with columns: S.No, Register Number, Student Name, Signature
 */

interface GenerateDistributionOptions {
	data: HallTicketData
	programCode: string
	programName: string
}

export function generateHallTicketDistributionPDF(options: GenerateDistributionOptions): string {
	const { data, programCode, programName } = options

	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const margin = 10

	// Group students by semester_group (year)
	const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
	const groupedByYear = data.students.reduce((acc, student) => {
		const group = student.semester_group || deriveYear(student)
		if (!acc[group]) acc[group] = []
		acc[group].push(student)
		return acc
	}, {} as Record<string, HallTicketStudent[]>)

	// Sort each group by register_number
	Object.values(groupedByYear).forEach(group => {
		group.sort((a, b) => a.register_number.localeCompare(b.register_number))
	})

	// Sort groups by year order
	const sortedGroups = Object.entries(groupedByYear)
		.sort((a, b) => {
			const indexA = yearOrder.indexOf(a[0])
			const indexB = yearOrder.indexOf(b[0])
			return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
		})

	let isFirstPage = true

	for (const [yearGroup, students] of sortedGroups) {
		if (!isFirstPage) {
			doc.addPage()
		}
		isFirstPage = false

		let currentY = margin

		// ========== HEADER ==========

		// College Logo (left side)
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side)
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
			}
		}

		// Institution name
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

		// Accreditation text
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

		currentY += 13

		// Address
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

		currentY += 5

		// Examination Session Title
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text(`SEMESTER EXAMINATION ${data.session.session_name}`, pageWidth / 2, currentY, { align: 'center' })

		currentY += 6

		// Hall Ticket Distribution heading
		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.text('Hall Ticket Distribution', pageWidth / 2, currentY, { align: 'center' })

		currentY += 7

		// Program & Year row
		const programDisplay = programName ? `${programCode} - ${programName}` : programCode
		const yearRoman = yearGroup.replace(/\s*Year\s*/, '').trim() // "I Year" → "I"
		doc.setFont('times', 'bold')
		doc.setFontSize(11)

		// Measure "Year: X" width to reserve space on the right
		const yearLabel = `Year: ${yearRoman}`
		const yearLabelWidth = doc.getTextWidth(yearLabel) + 4
		const programMaxWidth = pageWidth - 2 * margin - yearLabelWidth

		// Hanging indent: continuation lines start under the program code (after the label prefix)
		const prefix = 'Program Code & Name: '
		const prefixWidth = doc.getTextWidth(prefix)
		const programLines = doc.splitTextToSize(prefix + programDisplay, programMaxWidth)

		// First line at left margin; continuation lines indented to align with program value
		doc.text(programLines[0], margin, currentY)
		for (let i = 1; i < programLines.length; i++) {
			doc.text(programLines[i], margin + prefixWidth, currentY + i * 5)
		}
		doc.text(yearLabel, pageWidth - margin, currentY, { align: 'right' })

		currentY += programLines.length > 1 ? programLines.length * 5 : 4

		// ========== STUDENT TABLE ==========

		const tableWidth = pageWidth - 2 * margin
		const columnWidths = [12, 45, 90, tableWidth - 12 - 45 - 90] // S.No, Reg No, Name, Signature

		const tableData: string[][] = students.map((student, index) => [
			(index + 1).toString(),
			student.register_number,
			student.student_name,
			'' // Empty signature column
		])

		autoTable(doc, {
			startY: currentY,
			head: [['S.No', 'Register Number', 'Student Name', 'Signature']],
			body: tableData,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 10,
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				cellPadding: 2,
				valign: 'middle',
				minCellHeight: 8
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fontSize: 10,
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				valign: 'middle',
				minCellHeight: 10
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: columnWidths[0] },
				1: { halign: 'center', cellWidth: columnWidths[1] },
				2: { halign: 'left', cellWidth: columnWidths[2] },
				3: { halign: 'center', cellWidth: columnWidths[3] }
			},
			margin: { left: margin, right: margin },
			tableWidth: tableWidth
		})

		// Total count below table
		const finalY = (doc as any).lastAutoTable?.finalY || currentY + 20
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(`Total: ${students.length} Learners`, margin, finalY + 6)

		
	}

	// Save PDF
	const fileName = `Hall_Ticket_Distribution_${programCode}_${data.session.session_code || 'exam'}.pdf`
	doc.save(fileName)
	return fileName
}

/**
 * Derive year group from student's subjects (semester numbers)
 * Falls back to "Other" if no semester info available
 */
function deriveYear(student: HallTicketStudent): string {
	const yearLabels = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
	let maxSemester = 0

	for (const subject of student.subjects) {
		const match = subject.semester?.match(/(\d+)/)
		if (match) {
			const semNum = parseInt(match[1], 10)
			if (semNum > maxSemester) maxSemester = semNum
		}
	}

	if (maxSemester > 0) {
		const yearIndex = Math.ceil(maxSemester / 2) - 1
		return yearLabels[yearIndex] || `Year ${yearIndex + 1}`
	}

	return 'Other'
}
