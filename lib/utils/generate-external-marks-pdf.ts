import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface StudentMark {
	dummy_number: string
	total_marks_obtained: number | null
	total_marks_in_words: string
	remarks: string
}

interface ExternalMarksPDFData {
	subject_code: string
	subject_name: string
	packet_no: string
	bundle_no: string
	total_sheets: number
	maximum_marks: number
	minimum_pass_marks: number
	exam_date: string
	exam_month_year: string // e.g., "OCTOBER, 2025"
	program_code: string
	program_name: string
	semester: string
	year: string
	students: StudentMark[]
	logoImage?: string
	rightLogoImage?: string
}

/**
 * Generates External Marks Entry Sheet PDF (EXAMINATION FOIL SHEET)
 * Single page PDF with signature fields
 */
export function generateExternalMarksPDF(data: ExternalMarksPDFData): string {
	const doc = new jsPDF()
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm
	let currentY = margin

	// ========== HEADER SECTION ==========

	// College Logo (left side - JKKN text logo)
	if (data.rightLogoImage) {
		try {
			const logoSize = 20
			doc.addImage(data.rightLogoImage, 'PNG', margin, currentY, logoSize, logoSize)
		} catch (e) {
			console.warn('Failed to add left logo to PDF:', e)
		}
	}

	// College Logo (right side - JKKNCAS logo)
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

	// Exam Month/Year (e.g., "OCTOBER, 2025")
	doc.setFontSize(10)
	doc.text(data.exam_month_year, pageWidth / 2, currentY + 21, { align: 'center' })

	// Report Title with underline - "EXAMINATION FOIL SHEET" centered with "DATE:" on right
	doc.setFont('times', 'bolditalic')
	doc.setFontSize(11)
	const titleText = 'FOIL SHEET'
	const titleWidth = doc.getTextWidth(titleText)
	doc.text(titleText, pageWidth / 2, currentY + 27, { align: 'center' })
	// Underline
	doc.setLineWidth(0.3)
	doc.line(pageWidth / 2 - titleWidth / 2, currentY + 28, pageWidth / 2 + titleWidth / 2, currentY + 28)

	// DATE: with current date in DD/MM/YYYY format on the right
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	const currentDate = new Date()
	const dateStr = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`
	doc.text(`DATE: ${dateStr}`, pageWidth - margin, currentY + 27, { align: 'right' })

	currentY += 34

	// ========== COURSE DETAILS SECTION (4-column layout with borders) ==========

	doc.setFont('times', 'normal')
	doc.setFontSize(10)

	const detailsTableWidth = pageWidth - (margin * 2)
	const col1Width = 30  // Label column
	const col2Width = detailsTableWidth / 2 - col1Width  // Value column
	const col3Width = 35  // Label column
	const col4Width = detailsTableWidth / 2 - col3Width  // Value column
	const rowHeight = 7
	const cellPadding = 2

	// Draw table borders
	doc.setLineWidth(0.2)
	doc.setDrawColor(0, 0, 0)

	// Row 1: Program Code | [blank] | Semester & Year | value
	doc.rect(margin, currentY - 4, col1Width, rowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, rowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, rowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, rowHeight)
	doc.text('Program Code', margin + cellPadding, currentY)
	doc.text(data.program_code || '', margin + col1Width + cellPadding, currentY)
	doc.text('Semester & Year', margin + col1Width + col2Width + cellPadding, currentY)
	doc.text(`${data.semester} - ${data.year}`, margin + col1Width + col2Width + col3Width + cellPadding, currentY)

	currentY += rowHeight

	// Row 2: Subject Code | value | Maximum Marks | value
	doc.rect(margin, currentY - 4, col1Width, rowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, rowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, rowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, rowHeight)
	doc.text('Subject Code', margin + cellPadding, currentY)
	doc.text(data.subject_code, margin + col1Width + cellPadding, currentY)
	doc.text('Maximum Mark', margin + col1Width + col2Width + cellPadding, currentY)
	doc.text(data.maximum_marks.toString(), margin + col1Width + col2Width + col3Width + cellPadding, currentY)

	currentY += rowHeight

	// Row 3: Subject Name | value | Minimum pass marks | value
	// Calculate if we need extra height for subject name wrapping
	doc.setFontSize(9)
	const maxSubjectWidth = col2Width - (cellPadding * 2)
	const subjectLines = doc.splitTextToSize(data.subject_name, maxSubjectWidth)
	const subjectRowHeight = subjectLines.length > 1 ? rowHeight + (subjectLines.length - 1) * 4 : rowHeight

	doc.setFontSize(10)
	doc.rect(margin, currentY - 4, col1Width, subjectRowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, subjectRowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, subjectRowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, subjectRowHeight)
	doc.text('Subject Name', margin + cellPadding, currentY)
	// Handle long subject names - wrap text
	doc.setFontSize(9)
	doc.text(subjectLines, margin + col1Width + cellPadding, currentY)
	doc.setFontSize(10)
	doc.text('Minimum pass mark', margin + col1Width + col2Width + cellPadding, currentY)
	doc.text(data.minimum_pass_marks.toString(), margin + col1Width + col2Width + col3Width + cellPadding, currentY)

	currentY += subjectRowHeight - rowHeight // Adjust for extra height used

	currentY += rowHeight

	// Row 4: Bundle no. | [blank] | Packet No. | value
	doc.rect(margin, currentY - 4, col1Width, rowHeight)
	doc.rect(margin + col1Width, currentY - 4, col2Width, rowHeight)
	doc.rect(margin + col1Width + col2Width, currentY - 4, col3Width, rowHeight)
	doc.rect(margin + col1Width + col2Width + col3Width, currentY - 4, col4Width, rowHeight)
	doc.text('Bundle no.', margin + cellPadding, currentY)
	// Bundle no. value left blank
	doc.text('Packet No.', margin + col1Width + col2Width + cellPadding, currentY)
	doc.text(data.packet_no, margin + col1Width + col2Width + col3Width + cellPadding, currentY)

	currentY += rowHeight

	// ========== MARKS TABLE SECTION ==========

	// Prepare table data
	const tableData = data.students.map((student, index) => [
		index + 1,
		student.dummy_number,
		student.total_marks_obtained ?? '',
		student.total_marks_in_words || '',
		student.remarks || ''
	])

	// Compute totals
	const totalCount = data.students.length
	const passCount = data.students.filter(s => (s.remarks || '').toUpperCase() === 'PASS').length
	const failCount = data.students.filter(s => (s.remarks || '').toUpperCase() === 'FAIL').length

	// Adaptive sizing to keep everything on a single page
	const signatureBoxHeight = 18
	const footerReserve = 15 // signature gap + page footer
	const availableHeight = pageHeight - currentY - signatureBoxHeight - footerReserve
	// Rows = students + header + totals foot row
	const rowsToFit = totalCount + 2
	const estRowHeight = availableHeight / rowsToFit
	let tableFontSize = 10
	let tableCellPadding = 1.5
	if (estRowHeight < 6) {
		tableFontSize = 8
		tableCellPadding = 0.8
	} else if (estRowHeight < 7) {
		tableFontSize = 9
		tableCellPadding = 1
	}

	let finalTableY = currentY

	autoTable(doc, {
		startY: currentY,
		head: [['S. No', 'Dummy No', 'Marks\nAwarded', 'Marks in Words', 'Remarks']],
		body: tableData,
		foot: [[
			{ content: `Total: ${totalCount}`, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
			{ content: `Pass: ${passCount}`, colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
			{ content: `Fail: ${failCount}`, colSpan: 1, styles: { halign: 'center', fontStyle: 'bold' } }
		]],
		theme: 'grid',
		styles: {
			fontSize: tableFontSize,
			font: 'times',
			cellPadding: tableCellPadding,
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
			fontSize: tableFontSize,
			lineWidth: 0.2,
			lineColor: [0, 0, 0]
		},
		bodyStyles: {
			lineWidth: 0.2,
			lineColor: [0, 0, 0]
		},
		footStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			fontSize: tableFontSize,
			lineWidth: 0.2,
			lineColor: [0, 0, 0]
		},
		columnStyles: {
			0: { cellWidth: 15, halign: 'center' },  // S. No
			1: { cellWidth: 28, halign: 'center' },  // Dummy No
			2: { cellWidth: 20, halign: 'center' },  // Marks Awarded
			3: { cellWidth: 'auto', halign: 'center' },  // Marks in Words
			4: { cellWidth: 22, halign: 'center' }   // Remarks
		},
		margin: { left: margin, right: margin, top: 15, bottom: 20 },
		tableWidth: 'auto',
		didDrawPage: function(hookData: any) {
			finalTableY = hookData.cursor.y
		}
	})

	// ========== SIGNATURE SECTION ==========
	// Ensure signature section fits on current page (signature + footer space)
	if (finalTableY + signatureBoxHeight + 15 > pageHeight) {
		doc.addPage()
		finalTableY = margin
	}

	const sigTableWidth = pageWidth - (margin * 2)
	const boxWidth = sigTableWidth / 3

	// Draw three connected boxes for signatures
	doc.setLineWidth(0.2)
	doc.setDrawColor(0, 0, 0)

	// Left box - Internal/External Examiner
	doc.rect(margin, finalTableY, boxWidth, signatureBoxHeight)

	// Middle box - Chief/Chairman
	doc.rect(margin + boxWidth, finalTableY, boxWidth, signatureBoxHeight)

	// Right box - COE
	doc.rect(margin + (boxWidth * 2), finalTableY, boxWidth, signatureBoxHeight)

	// Add signature text in boxes
	doc.setFont('times', 'normal')
	doc.setFontSize(9)

	const textY = finalTableY + signatureBoxHeight - 6

	// Left signature - Internal/External Examiner
	doc.text('Name & Signature of', margin + boxWidth / 2, textY, { align: 'center' })
	doc.text('Internal/External Examiner', margin + boxWidth / 2, textY + 4, { align: 'center' })

	// Middle signature - Chief/Chairman
	doc.text('Name & Signature of', margin + boxWidth + boxWidth / 2, textY, { align: 'center' })
	doc.text('Chief/Chairman', margin + boxWidth + boxWidth / 2, textY + 4, { align: 'center' })

	// Right signature - COE
	doc.text('Signature of COE', margin + (boxWidth * 2) + boxWidth / 2, textY + 2, { align: 'center' })

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

	// Save PDF with format: CourseCode_PacketNo_TotalSheets_Date_mark.pdf
	const fileName = `${data.subject_code}_${data.packet_no}_${data.total_sheets}_${new Date().toISOString().split('T')[0]}_mark.pdf`
	doc.save(fileName)

	return fileName
}
