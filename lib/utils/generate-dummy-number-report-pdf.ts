import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface DummyNumberReportData {
	institutionName: string
	institutionCode: string
	sessionName: string
	sessionCode: string
	boardName?: string
	boardCode?: string
	courseCodes?: string[]
	logoImage?: string
	rightLogoImage?: string
	records: {
		roll_number_for_evaluation: number
		dummy_number: string
		actual_register_number: string
		student_name: string
		board_code: string
		program_code: string
		course_code: string
		course_name: string
		type: string
	}[]
}

export function generateDummyNumberReportPDF(data: DummyNumberReportData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 6.35 // 0.25 inch narrow margin matching hall ticket
	const tableWidth = pageWidth - 2 * margin

	// Group records by board_code then course_code
	const grouped = new Map<string, Map<string, typeof data.records>>()
	for (const r of data.records) {
		const board = r.board_code || 'Unknown'
		if (!grouped.has(board)) grouped.set(board, new Map())
		const boardMap = grouped.get(board)!
		const course = r.course_code || 'Unknown'
		if (!boardMap.has(course)) boardMap.set(course, [])
		boardMap.get(course)!.push(r)
	}

	let isFirstPage = true

	// If no grouping needed (single board + single/all courses), print flat
	const totalBoards = grouped.size
	const hasSingleBoard = totalBoards <= 1

	if (hasSingleBoard && data.records.length > 0) {
		// Flat report — all records in one table
		printSection(doc, data, data.records, margin, pageWidth, pageHeight, tableWidth, isFirstPage)
	} else {
		// Grouped by board → course
		for (const [boardCode, courseMap] of grouped) {
			for (const [courseCode, records] of courseMap) {
				if (!isFirstPage) doc.addPage()
				printSection(doc, data, records, margin, pageWidth, pageHeight, tableWidth, isFirstPage, boardCode, courseCode, records[0]?.course_name)
				isFirstPage = false
			}
		}
	}

	const fileName = `Dummy_Number_Report_${data.sessionCode}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

function printSection(
	doc: jsPDF,
	data: DummyNumberReportData,
	records: DummyNumberReportData['records'],
	margin: number,
	pageWidth: number,
	pageHeight: number,
	tableWidth: number,
	isFirstPage: boolean,
	boardCode?: string,
	courseCode?: string,
	courseName?: string,
) {
	let currentY = margin

	// ========== HEADER (matching hall ticket pattern) ==========

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

	// Address — font 9 bold
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	// Report Title
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text('DUMMY NUMBER REPORT', pageWidth / 2, currentY, { align: 'center' })

	currentY += 5

	// Session info
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`Examination Session: ${data.sessionName}`, pageWidth / 2, currentY, { align: 'center' })

	currentY += 4

	// Board & Course info if grouped
	if (boardCode || courseCode) {
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		const info: string[] = []
		if (boardCode) info.push(`Board: ${boardCode}`)
		if (courseCode && courseName) info.push(`Course: ${courseCode} - ${courseName}`)
		else if (courseCode) info.push(`Course: ${courseCode}`)
		doc.text(info.join('    |    '), pageWidth / 2, currentY, { align: 'center' })
		currentY += 4
	}

	currentY += 2

	// ========== TABLE ==========
	const tableData = records.map((r, idx) => [
		(idx + 1).toString(),
		r.dummy_number,
		r.actual_register_number,
		r.student_name,
		r.course_code,
		r.type,
	])

	autoTable(doc, {
		startY: currentY,
		head: [['S.No', 'Dummy Number', 'Register Number', 'Learner Name', 'Course Code', 'Type']],
		body: tableData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 9,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: 1.5,
			valign: 'middle',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 9,
			fillColor: [220, 220, 220],
			textColor: [0, 0, 0],
			halign: 'center',
		},
		bodyStyles: {
			font: 'times',
			fontSize: 8,
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 30 },
			2: { halign: 'center', cellWidth: 35 },
			3: { halign: 'left', cellWidth: 'auto' },
			4: { halign: 'center', cellWidth: 30 },
			5: { halign: 'center', cellWidth: 18 },
		},
		margin: { left: margin, right: margin },
		tableWidth: tableWidth,
		didDrawPage: (hookData) => {
			// Footer on every page
			const footerY = pageHeight - margin
			const now = new Date()
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
			const hours = now.getHours()
			const ampm = hours >= 12 ? 'PM' : 'AM'
			const hours12 = hours % 12 || 12
			const timeStr = `${String(hours12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`

			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(100, 100, 100)
			doc.text(`Generated: ${dateStr} ${timeStr}`, margin, footerY)

			const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber
			doc.text(`Page ${pageNum}`, pageWidth - margin, footerY, { align: 'right' })

			doc.text(`Total Records: ${records.length}`, pageWidth / 2, footerY, { align: 'center' })
		},
	})
}
