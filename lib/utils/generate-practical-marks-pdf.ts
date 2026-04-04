import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'

interface PracticalStudentMark {
	serial_number: number
	register_number: string
	student_name: string
	total_marks_obtained: number | null
	status: string | null // 'Present' | 'AB'
	evaluator_remarks: string | null // 'PASS' | 'FAIL' | 'RA RE-APPEAR'
}

interface PracticalMarksPDFData {
	course_code: string
	course_name: string
	maximum_marks: number
	minimum_pass_marks: number
	batch_label: string // e.g. "Batch 1 — 09-Mar-2026 FN (Cap: 30)"
	exam_date: string
	exam_month_year: string // e.g. "MARCH, 2026"
	students: PracticalStudentMark[]
	logoImage?: string
	rightLogoImage?: string
	internalExaminer?: { name: string } | null
	externalExaminer?: { name: string; designation: string | null; institution: string | null } | null
}

/**
 * Generates Practical Marks Entry Sheet PDF
 * Similar to external marks PDF but uses register numbers and shows AB status
 */
export function generatePracticalMarksPDF(data: PracticalMarksPDFData): string {
	const doc = new jsPDF()
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm
	let currentY = margin

	// ========== HEADER SECTION ==========

	// College Logo (left side)
	if (data.rightLogoImage) {
		try {
			const logoSize = 20
			doc.addImage(data.rightLogoImage, 'PNG', margin, currentY, logoSize, logoSize)
		} catch (e) {
			console.warn('Failed to add left logo to PDF:', e)
		}
	}

	// College Logo (right side)
	if (data.logoImage) {
		try {
			const logoSize = 20
			doc.addImage(data.logoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
		} catch (e) {
			console.warn('Failed to add right logo to PDF:', e)
		}
	}

	// College name and details (centered between logos)
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 10, { align: 'center' })

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 15, { align: 'center' })

	// Exam Month/Year
	doc.setFontSize(10)
	doc.text(data.exam_month_year, pageWidth / 2, currentY + 21, { align: 'center' })

	// Report Title
	doc.setFont('times', 'bolditalic')
	doc.setFontSize(11)
	const titleText = 'FOIL SHEET'
	const titleWidth = doc.getTextWidth(titleText)
	doc.text(titleText, pageWidth / 2, currentY + 27, { align: 'center' })
	// Underline
	doc.setLineWidth(0.3)
	doc.line(pageWidth / 2 - titleWidth / 2, currentY + 28, pageWidth / 2 + titleWidth / 2, currentY + 28)

	// DATE on right
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`DATE: ${data.exam_date}`, pageWidth - margin, currentY + 27, { align: 'right' })

	currentY += 34

	// ========== COURSE DETAILS SECTION ==========

	doc.setFont('times', 'normal')
	doc.setFontSize(10)

	const detailsTableWidth = pageWidth - (margin * 2)
	const col1Width = 30
	const col2Width = detailsTableWidth / 2 - col1Width
	const col3Width = 35
	const col4Width = detailsTableWidth / 2 - col3Width
	const rowHeight = 7
	const cellPadding = 2

	doc.setLineWidth(0.2)
	doc.setDrawColor(0, 0, 0)

	// Row 1: Subject Code | value | Maximum Marks | value
	doc.rect(margin, currentY - 4, col1Width, rowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, rowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, rowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, rowHeight)
	doc.text('Subject Code', margin + cellPadding, currentY)
	doc.text(data.course_code, margin + col1Width + cellPadding, currentY)
	doc.text('Maximum Mark', margin + col1Width + col2Width + cellPadding, currentY)
	doc.text(data.maximum_marks.toString(), margin + col1Width + col2Width + col3Width + cellPadding, currentY)

	currentY += rowHeight

	// Row 2: Subject Name | value | Batch | value
	doc.setFontSize(9)
	const maxSubjectWidth = col2Width - (cellPadding * 2)
	const subjectLines = doc.splitTextToSize(data.course_name, maxSubjectWidth)
	const subjectRowHeight = subjectLines.length > 1 ? rowHeight + (subjectLines.length - 1) * 4 : rowHeight

	doc.setFontSize(10)
	doc.rect(margin, currentY - 4, col1Width, subjectRowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, subjectRowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, subjectRowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, subjectRowHeight)
	doc.text('Subject Name', margin + cellPadding, currentY)
	doc.setFontSize(9)
	doc.text(subjectLines, margin + col1Width + cellPadding, currentY)
	doc.setFontSize(10)
	doc.text('Batch', margin + col1Width + col2Width + cellPadding, currentY)
	doc.setFontSize(8)
	const batchLines = doc.splitTextToSize(data.batch_label, col4Width - (cellPadding * 2))
	doc.text(batchLines, margin + col1Width + col2Width + col3Width + cellPadding, currentY)
	doc.setFontSize(10)

	currentY += subjectRowHeight

	// ========== MARKS TABLE SECTION ==========

	const tableData = data.students.map(student => {
		// Absent: explicit AB status OR no marks at all (check attendance)
		const isAbsent = student.status === 'AB' || student.total_marks_obtained == null
		const marks = isAbsent ? 'AB' : student.total_marks_obtained
		const marksInWords = isAbsent
			? 'ABSENT'
			: numberToWords(student.total_marks_obtained!)
		const remarks = isAbsent
			? 'ABSENT'
			: (student.evaluator_remarks || (student.total_marks_obtained! >= data.minimum_pass_marks ? 'PASS' : 'FAIL'))

		return [
			student.serial_number,
			student.register_number,
			marks,
			marksInWords,
			remarks
		]
	})

	let finalTableY = currentY

	autoTable(doc, {
		startY: currentY,
		head: [['S. No', 'Register No', 'Marks\nAwarded', 'Marks in Words', 'Remarks']],
		body: tableData,
		theme: 'grid',
		styles: {
			fontSize: 10,
			font: 'times',
			cellPadding: 1.5,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			halign: 'center',
			valign: 'middle'
		},
		headStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			fontSize: 10,
			lineWidth: 0.2,
			lineColor: [0, 0, 0]
		},
		bodyStyles: {
			lineWidth: 0.2,
			lineColor: [0, 0, 0]
		},
		columnStyles: {
			0: { cellWidth: 15, halign: 'center' },   // S.No
			1: { cellWidth: 28, halign: 'center' },   // Register No
			2: { cellWidth: 20, halign: 'center' },   // Marks Awarded
			3: { cellWidth: 'auto', halign: 'center' }, // Marks in Words
			4: { cellWidth: 22, halign: 'center' }    // Remarks
		},
		margin: { left: margin, right: margin, top: 15, bottom: 20 },
		tableWidth: 'auto',
		didDrawPage: function(hookData: any) {
			finalTableY = hookData.cursor.y
		}
	})

	// ========== SIGNATURE SECTION (no border) ==========
	// Calculate required space for signature section
	let signatureHeight = 30
	if (data.externalExaminer?.name) signatureHeight += 4
	if (data.externalExaminer?.designation) signatureHeight += 4
	if (data.externalExaminer?.institution) signatureHeight += 4

	// Ensure signature section fits on current page
	if (finalTableY + signatureHeight + 15 > pageHeight) {
		doc.addPage()
		finalTableY = margin
	}

	const sigTableWidth = pageWidth - (margin * 2)
	const boxWidth = sigTableWidth / 2
	let sigY = finalTableY + 22

	doc.setFont('times', 'normal')
	doc.setFontSize(9)

	// Internal examiner — left side
	const intCenterX = margin + boxWidth / 2
	if (data.internalExaminer?.name) {
		doc.setFont('times', 'bold')
		doc.text(data.internalExaminer.name, intCenterX, sigY, { align: 'center' })
		doc.setFont('times', 'normal')
	}
	doc.text('Signature of the Internal Examiner', intCenterX, sigY + 5, { align: 'center' })

	// External examiner — right side
	const extCenterX = margin + boxWidth + boxWidth / 2
	let extLineY = sigY
	if (data.externalExaminer?.name) {
		doc.setFont('times', 'bold')
		doc.text(data.externalExaminer.name, extCenterX, extLineY, { align: 'center' })
		doc.setFont('times', 'normal')
		extLineY += 4
		if (data.externalExaminer.designation) {
			doc.text(data.externalExaminer.designation, extCenterX, extLineY, { align: 'center' })
			extLineY += 4
		}
		if (data.externalExaminer.institution) {
			doc.text(data.externalExaminer.institution, extCenterX, extLineY, { align: 'center' })
			extLineY += 4
		}
	}
	doc.text('Signature of the External Examiner', extCenterX, extLineY + 1, { align: 'center' })

	// ========== FOOTER — Downloaded date/time & page number ==========
	const totalPages = doc.getNumberOfPages()
	const now = new Date()
	const downloadTimestamp = `Downloaded: ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		doc.setFont('times', 'normal')
		doc.setFontSize(7)
		doc.setTextColor(150, 150, 150)
		doc.text(downloadTimestamp, margin, pageHeight - 5)
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
	}
	doc.setTextColor(0, 0, 0)

	// Save PDF
	const fileName = `${data.course_code}_Practical_${new Date().toISOString().split('T')[0]}_mark.pdf`
	doc.save(fileName)

	return fileName
}
