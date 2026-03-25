import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
	CourseCountPDFData,
	ProgramCourseCount,
	BoardCourseCount,
	InstitutionPdfSettings
} from '@/types/course-count-report'

/**
 * Generates a PDF report for course count (question paper preparation)
 * Supports both program-wise and board-wise views
 */
export function generateCourseCountPDF(data: CourseCountPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm

	// Get institution settings or use defaults
	const settings = data.institutionSettings
	const defaultInstitutionName = 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)'
	const defaultAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	const defaultAddress = 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu'

	// Parse logo dimensions from settings (convert px to mm)
	const parsePxToMm = (value?: string): number => {
		if (!value) return 20 // default 20mm
		const px = parseInt(value.replace('px', ''), 10)
		return isNaN(px) ? 20 : px * 0.264583 // px to mm conversion
	}

	const logoWidth = parsePxToMm(settings?.logo_width)
	const logoHeight = parsePxToMm(settings?.logo_height)
	const secondaryLogoWidth = parsePxToMm(settings?.secondary_logo_width)
	const secondaryLogoHeight = parsePxToMm(settings?.secondary_logo_height)

	// Get text color from settings or use black
	const parseHexColor = (hex?: string): [number, number, number] => {
		if (!hex || !hex.startsWith('#')) return [0, 0, 0]
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
		return result
			? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
			: [0, 0, 0]
	}

	const primaryColor = parseHexColor(settings?.primary_color)
	const secondaryColor = parseHexColor(settings?.secondary_color)

	// Helper function to add header
	const addHeader = (currentY: number): number => {
		// College Logo (left side)
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, logoWidth, logoHeight)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side - secondary logo)
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - secondaryLogoWidth, currentY, secondaryLogoWidth, secondaryLogoHeight)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
			}
		}

		// Institution name (centered between logos)
		const institutionName = settings?.institution_name || data.metadata.institution_name || defaultInstitutionName
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
		doc.text(institutionName.toUpperCase(), pageWidth / 2, currentY + 5, { align: 'center' })

		// Accreditation text
		const accreditationText = settings?.accreditation_text || defaultAccreditation
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2])

		// Split accreditation text into lines if it contains newline
		const accreditationLines = accreditationText.split('\n')
		let accreditationY = currentY + 10
		accreditationLines.forEach((line) => {
			doc.text(line, pageWidth / 2, accreditationY, { align: 'center' })
			accreditationY += 4
		})

		// Address
		const address = settings?.address || defaultAddress
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
		doc.text(address, pageWidth / 2, currentY + 19, { align: 'center' })

		// Report Title
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.setTextColor(0, 0, 0)
		const titleText = data.view_type === 'board' ? 'Course Count Report (Board-wise)' : 'Course Count Report (Program-wise)'
		doc.text(titleText, pageWidth / 2, currentY + 25, { align: 'center' })

		return currentY + 32
	}

	// Helper to add session info
	const addSessionInfo = (currentY: number): number => {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)

		const col1X = margin + 2

		// Examination Session
		doc.text('Examination Session', col1X, currentY)
		doc.setFont('times', 'normal')
		doc.text(`: ${data.metadata.session_name} (${data.metadata.session_code})`, col1X + 38, currentY)

		currentY += 5

		// Horizontal line
		doc.setLineWidth(0.5)
		doc.setDrawColor(0, 0, 0)
		doc.line(margin, currentY, pageWidth - margin, currentY)

		return currentY + 5
	}

	// Add footer to each page
	const addFooter = () => {
		const pageCount = (doc as any).internal.getNumberOfPages()
		const currentPageNumber = (doc as any).internal.getCurrentPageInfo().pageNumber

		// Page number (centered)
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setTextColor(0, 0, 0)
		const footerText = `Page ${currentPageNumber} of ${pageCount}`
		doc.text(footerText, pageWidth / 2, pageHeight - margin + 5, { align: 'center' })

		// Date & time (right-aligned)
		doc.setFont('times', 'italic')
		doc.setFontSize(8)
		doc.setTextColor(80, 80, 80)
		const timestamp = new Date().toLocaleString('en-GB', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
		doc.text(`Generated on: ${timestamp}`, pageWidth - margin, pageHeight - margin + 5, { align: 'right' })
	}

	let currentY = margin

	// Add header
	currentY = addHeader(currentY)
	currentY = addSessionInfo(currentY)

	// Generate content based on view type
	if (data.view_type === 'board') {
		generateBoardWiseContent(doc, data.data as BoardCourseCount[], currentY, margin, pageWidth, pageHeight, addHeader, addSessionInfo, addFooter)
	} else {
		generateProgramWiseContent(doc, data.data as ProgramCourseCount[], currentY, margin, pageWidth, pageHeight, addHeader, addSessionInfo, addFooter)
	}

	// Add summary page
	doc.addPage()
	currentY = margin
	currentY = addHeader(currentY)
	currentY = addSessionInfo(currentY)

	// Summary Section Title
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)
	doc.text('Summary Statistics', pageWidth / 2, currentY, { align: 'center' })
	currentY += 8

	const summaryData = [
		['Total Programs', data.summary.total_programs.toString()],
		['Total Courses', data.summary.total_courses.toString()],
		['Regular Learner Count', data.summary.total_regular.toString()],
		['Arrear Learner Count', data.summary.total_arrear.toString()],
		['Grand Total', data.summary.grand_total.toString()]
	]

	autoTable(doc, {
		startY: currentY,
		head: [['Description', 'Count']],
		body: summaryData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 10,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.3,
			cellPadding: 3
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 10,
			fillColor: [220, 220, 220],
			halign: 'center',
			textColor: [0, 0, 0]
		},
		columnStyles: {
			0: { fontStyle: 'bold', cellWidth: 80 },
			1: { halign: 'center', cellWidth: 40 }
		},
		margin: { left: margin, right: margin },
		tableWidth: 120,
		didDrawPage: () => addFooter()
	})

	// Save the PDF
	const viewSuffix = data.view_type === 'board' ? 'Board_Wise' : 'Program_Wise'
	const fileName = `Course_Count_Report_${viewSuffix}_${data.metadata.session_code.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}

/**
 * Generate program-wise content
 */
function generateProgramWiseContent(
	doc: jsPDF,
	programs: ProgramCourseCount[],
	startY: number,
	margin: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: (y: number) => number,
	addSessionInfo: (y: number) => number,
	addFooter: () => void
) {
	let currentY = startY
	let sno = 1

	programs.forEach((program, programIndex) => {
		// Check if we need a new page
		if (currentY > pageHeight - 60) {
			doc.addPage()
			currentY = margin
			currentY = addHeader(currentY)
			currentY = addSessionInfo(currentY)
		}

		// Program header
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setFillColor(240, 240, 240)
		doc.rect(margin, currentY - 4, pageWidth - 2 * margin, 7, 'F')
		doc.setTextColor(0, 0, 0)
		doc.text(`${programIndex + 1}. ${program.program_code} - ${program.program_name}`, margin + 2, currentY)
		currentY += 6

		// Course table for this program
		const tableData = program.courses.map((course) => {
			const currentSno = sno
			sno++
			return [
				currentSno.toString(),
				course.course_code,
				course.course_title,
				course.regular_count.toString(),
				course.arrear_count.toString(),
				course.total_count.toString()
			]
		})

		// Add program totals row
		tableData.push([
			'',
			'',
			'Program Total',
			program.program_total_regular.toString(),
			program.program_total_arrear.toString(),
			program.program_total.toString()
		])

		autoTable(doc, {
			startY: currentY,
			head: [['S.No', 'Course Code', 'Course Title', 'Regular', 'Arrears', 'Total']],
			body: tableData,
			theme: 'grid',
			styles: {
				font: 'times',
				fontStyle: 'normal',
				fontSize: 9,
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				cellPadding: 2
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fontSize: 9,
				fillColor: [255, 255, 255],
				textColor: [0, 0, 0],
				halign: 'center',
				valign: 'middle',
				lineWidth: 0.3
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: 12 },
				1: { halign: 'center', cellWidth: 28 },
				2: { halign: 'left', cellWidth: 80 },
				3: { halign: 'center', cellWidth: 20 },
				4: { halign: 'center', cellWidth: 20 },
				5: { halign: 'center', cellWidth: 20 }
			},
			margin: { left: margin, right: margin },
			didParseCell: (data) => {
				// Bold the totals row
				if (data.row.index === tableData.length - 1) {
					data.cell.styles.fontStyle = 'bold'
					data.cell.styles.fillColor = [245, 245, 245]
				}
			},
			didDrawPage: () => addFooter()
		})

		currentY = (doc as any).lastAutoTable.finalY + 8
	})
}

/**
 * Generate board-wise content
 */
function generateBoardWiseContent(
	doc: jsPDF,
	boards: BoardCourseCount[],
	startY: number,
	margin: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: (y: number) => number,
	addSessionInfo: (y: number) => number,
	addFooter: () => void
) {
	let currentY = startY
	let globalSno = 1

	boards.forEach((board, boardIndex) => {
		// Check if we need a new page
		if (currentY > pageHeight - 60) {
			doc.addPage()
			currentY = margin
			currentY = addHeader(currentY)
			currentY = addSessionInfo(currentY)
		}

		// Board header
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.setFillColor(200, 200, 200)
		doc.rect(margin, currentY - 4, pageWidth - 2 * margin, 8, 'F')
		doc.setTextColor(0, 0, 0)
		doc.text(`Board: ${board.board_code} - ${board.board_name}`, margin + 2, currentY)
		currentY += 8

		board.programs.forEach((program, programIndex) => {
			// Check if we need a new page
			if (currentY > pageHeight - 60) {
				doc.addPage()
				currentY = margin
				currentY = addHeader(currentY)
				currentY = addSessionInfo(currentY)
			}

			// Program header within board
			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			doc.setFillColor(240, 240, 240)
			doc.rect(margin, currentY - 4, pageWidth - 2 * margin, 7, 'F')
			doc.text(`${programIndex + 1}. ${program.program_code} - ${program.program_name}`, margin + 2, currentY)
			currentY += 6

			// Course table for this program
			const tableData = program.courses.map((course) => {
				const currentSno = globalSno
				globalSno++
				return [
					currentSno.toString(),
					course.course_code,
					course.course_title,
					course.regular_count.toString(),
					course.arrear_count.toString(),
					course.total_count.toString()
				]
			})

			// Add program totals row
			tableData.push([
				'',
				'',
				'Program Total',
				program.program_total_regular.toString(),
				program.program_total_arrear.toString(),
				program.program_total.toString()
			])

			autoTable(doc, {
				startY: currentY,
				head: [['S.No', 'Course Code', 'Course Title', 'Regular', 'Arrears', 'Total']],
				body: tableData,
				theme: 'grid',
				styles: {
					font: 'times',
					fontStyle: 'normal',
					fontSize: 9,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 2
				},
				headStyles: {
					font: 'times',
					fontStyle: 'bold',
					fontSize: 9,
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0],
					halign: 'center',
					valign: 'middle',
					lineWidth: 0.3
				},
				columnStyles: {
					0: { halign: 'center', cellWidth: 12 },
					1: { halign: 'center', cellWidth: 28 },
					2: { halign: 'left', cellWidth: 80 },
					3: { halign: 'center', cellWidth: 20 },
					4: { halign: 'center', cellWidth: 20 },
					5: { halign: 'center', cellWidth: 20 }
				},
				margin: { left: margin, right: margin },
				didParseCell: (data) => {
					// Bold the totals row
					if (data.row.index === tableData.length - 1) {
						data.cell.styles.fontStyle = 'bold'
						data.cell.styles.fillColor = [245, 245, 245]
					}
				},
				didDrawPage: () => addFooter()
			})

			currentY = (doc as any).lastAutoTable.finalY + 6
		})

		// Board totals
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setFillColor(220, 220, 220)
		doc.rect(margin, currentY - 2, pageWidth - 2 * margin, 7, 'F')
		doc.text(
			`Board Total: Regular: ${board.board_total_regular} | Arrears: ${board.board_total_arrear} | Total: ${board.board_total}`,
			margin + 2,
			currentY + 2
		)
		currentY += 12
	})
}
