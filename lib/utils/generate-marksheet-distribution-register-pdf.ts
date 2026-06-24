import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LearnerRecord {
	register_number: string
	learner_name: string
	dob: string
	email?: string
	phone?: string
}

interface MarksheetDistributionRegisterData {
	institutionName: string
	institutionCode: string
	programName: string
	programCode: string
	programDuration?: number // Number of semesters (e.g., 6 for 3-year program)
	batchYear?: string
	logoImage?: string
	rightLogoImage?: string
	learners: LearnerRecord[]
}

// Helper function to get ordinal suffix only (st, nd, rd, th)
function getOrdinalSuffix(n: number): string {
	if (n === 1) return 'st'
	if (n === 2) return 'nd'
	if (n === 3) return 'rd'
	return 'th'
}

export function generateMarksheetDistributionRegisterPDF(data: MarksheetDistributionRegisterData): string {
	// Legal Landscape
	const doc = new jsPDF('landscape', 'mm', 'legal')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8

	const programLabel = `${data.programCode} - ${data.programName}`

	// Build the list of "Original Mark Sheets" labels for each learner
	// UG (program code starts with 'U') runs 6 semesters; PG (starts with 'P') runs 4.
	const isPG = (data.programCode || '').trim().toUpperCase().startsWith('P')
	const programDuration = data.programDuration || (isPG ? 4 : 6)
	const semesterLabels: string[] = []
	for (let i = 1; i <= programDuration; i++) {
		semesterLabels.push(`${i}${getOrdinalSuffix(i)} Semester`)
	}
	semesterLabels.push('Con.Marksheet')

	// Three extra rows kept blank for handwritten entry (Provisional / Degree / Transfer certificate)
	const blankRows = ['', '', '']

	const marksheetRows = [...semesterLabels, ...blankRows]
	const rowsPerLearner = marksheetRows.length

	// Header (rendered on the first page only)
	const addHeader = () => {
		let currentY = margin

		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, 18, 18)
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}

		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 18, currentY, 18, 18)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 10, { align: 'center' })

		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 15, { align: 'center' })

		currentY += 21

		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.text('MARKSHEET DISTRIBUTION REGISTER', pageWidth / 2, currentY, { align: 'center' })

		currentY += 8

		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text(`Program Code & Name : ${programLabel}`, margin, currentY)
		doc.text(`Batch: ${data.batchYear || ''}`, pageWidth - margin, currentY, { align: 'right' })

		currentY += 4

		return currentY
	}

	// Layout: exactly 2 learners per page
	const learnersPerPage = 2
	const tableHeaderHeight = 11
	const footerMargin = 14
	const headerHeight = addHeader() // returns the Y where the table starts on page 1

	// Compute a fixed row height so 2 learners (their rows + the repeated table head) fit per page.
	// A safety factor keeps the second learner's block from spilling onto the next page.
	const safetyFactor = 0.94
	const availableHeightFirstPage = pageHeight - headerHeight - tableHeaderHeight - footerMargin
	const availableHeightOtherPages = pageHeight - margin - tableHeaderHeight - footerMargin
	const totalRowsPerPage = learnersPerPage * rowsPerLearner
	const rowHeight = Math.min(
		availableHeightFirstPage / totalRowsPerPage,
		availableHeightOtherPages / totalRowsPerPage
	) * safetyFactor

	const tableHead = [[
		{ content: 'S.No', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Programme', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Register No.', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Name of the Students', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Original Mark Sheets', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Marksheet No.', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Folio No.', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Date of print', styles: { halign: 'center', valign: 'middle' } },
		{ content: 'Remarks', styles: { halign: 'center', valign: 'middle' } },
	]]

	const baseStyles = {
		font: 'times',
		fontSize: 10,
		textColor: [0, 0, 0] as [number, number, number],
		lineColor: [0, 0, 0] as [number, number, number],
		lineWidth: 0.2,
		cellPadding: 1.5,
		valign: 'middle' as const,
		minCellHeight: rowHeight,
	}
	const headStyles = {
		font: 'times',
		fontStyle: 'bold' as const,
		fontSize: 10,
		fillColor: [255, 255, 255] as [number, number, number],
		textColor: [0, 0, 0] as [number, number, number],
		halign: 'center' as const,
		valign: 'middle' as const,
		lineWidth: 0.3,
		minCellHeight: tableHeaderHeight,
	}
	const columnStyles = {
		0: { halign: 'center' as const, cellWidth: 12 },   // S.No
		1: { halign: 'left' as const, cellWidth: 50 },     // Programme
		2: { halign: 'center' as const, cellWidth: 30 },   // Register No.
		3: { halign: 'left' as const, cellWidth: 62 },     // Name of the Students
		4: { halign: 'left' as const, cellWidth: 36 },     // Original Mark Sheets
		5: { halign: 'center' as const, cellWidth: 40 },   // Marksheet No.
		6: { halign: 'center' as const, cellWidth: 33 },   // Folio No.
		7: { halign: 'center' as const, cellWidth: 28 },   // Date of print
		8: { halign: 'left' as const, cellWidth: 48 },     // Remarks
	}

	// Split learners into chunks of 2 and render each chunk on its own page
	const learnerChunks: { learner: LearnerRecord; index: number }[][] = []
	for (let i = 0; i < data.learners.length; i += learnersPerPage) {
		learnerChunks.push(
			data.learners.slice(i, i + learnersPerPage).map((learner, j) => ({ learner, index: i + j }))
		)
	}

	for (let chunkIndex = 0; chunkIndex < learnerChunks.length; chunkIndex++) {
		const chunk = learnerChunks[chunkIndex]
		const isFirstPage = chunkIndex === 0

		if (!isFirstPage) {
			doc.addPage()
		}

		const tableBody: any[][] = []
		for (const { learner, index } of chunk) {
			for (let i = 0; i < marksheetRows.length; i++) {
				const row: any[] = []

				if (i === 0) {
					row.push({ content: (index + 1).toString(), rowSpan: rowsPerLearner, styles: { halign: 'center', valign: 'middle' } })
					row.push({ content: programLabel, rowSpan: rowsPerLearner, styles: { halign: 'left', valign: 'middle' } })
					row.push({ content: learner.register_number, rowSpan: rowsPerLearner, styles: { halign: 'center', valign: 'middle' } })
					row.push({ content: learner.learner_name, rowSpan: rowsPerLearner, styles: { halign: 'left', valign: 'middle', fontStyle: 'bold' } })
				}

				row.push(marksheetRows[i]) // Original Mark Sheets
				row.push('') // Marksheet No.
				row.push('') // Folio No.
				row.push('') // Date of print
				row.push('') // Remarks

				tableBody.push(row)
			}
		}

		autoTable(doc, {
			startY: isFirstPage ? headerHeight : margin,
			head: tableHead,
			body: tableBody,
			theme: 'grid',
			showHead: 'everyPage',
			rowPageBreak: 'avoid',
			styles: baseStyles,
			headStyles,
			columnStyles,
			margin: { left: margin, right: margin, bottom: footerMargin },
		})
	}

	// Page numbers
	const totalPages = (doc as any).internal.getNumberOfPages()
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setTextColor(0, 0, 0)
		doc.text(`${i}/${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
	}

	const fileName = `Marksheet_Distribution_Register_${data.programCode}_${data.batchYear || 'batch'}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
