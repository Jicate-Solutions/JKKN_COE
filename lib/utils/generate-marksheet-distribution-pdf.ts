import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LearnerRecord {
	register_number: string
	learner_name: string
	dob: string
	email?: string
	phone?: string
}

interface MarksheetDistributionData {
	institutionName: string
	institutionCode: string
	programName: string
	programCode: string
	semesterName?: string
	semesterCode?: string
	programDuration?: number // Number of semesters (e.g., 6 for 3-year program)
	batchYear?: string // e.g., "2025-2028"
	logoImage?: string
	rightLogoImage?: string
	learners: LearnerRecord[]
}

export function generateMarksheetDistributionPDF(data: MarksheetDistributionData): string {
	// A4 Portrait
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8

	// Determine program duration (number of semesters) - default to 6 semesters (3-year program)
	const programDuration = data.programDuration || 6

	// Generate semester labels with superscript-style formatting
	const semesterLabels: string[] = []
	for (let i = 1; i <= programDuration; i++) {
		const ordinal = getOrdinalSuffix(i)
		semesterLabels.push(`${i}${ordinal} Semester`)
	}
	semesterLabels.push('Con.Marksheet')

	// Additional certificate rows
	const certificateRows = [
		'Provisional\ncertificate',
		'Degree\ncertificate',
		'Transfer\ncertificate'
	]

	// Total rows per learner = semester rows + certificate rows
	const rowsPerLearner = semesterLabels.length + certificateRows.length // 7 + 3 = 10 rows

	// Calculate row height to fit exactly 2 learners per page
	const headerHeight = 40 // Header on first page only
	const tableHeaderHeight = 12
	const footerMargin = 15
	const learnersPerPage = 2

	// Available height for learner rows on first page
	const availableHeightFirstPage = pageHeight - margin - headerHeight - tableHeaderHeight - footerMargin
	// Available height for learner rows on subsequent pages
	const availableHeightOtherPages = pageHeight - margin - tableHeaderHeight - footerMargin

	// Row height to fit 2 learners (20 rows total) perfectly
	const rowHeightFirstPage = availableHeightFirstPage / (learnersPerPage * rowsPerLearner)
	const rowHeightOtherPages = availableHeightOtherPages / (learnersPerPage * rowsPerLearner)

	// Use a fixed row height that works for both
	const rowHeight = Math.min(rowHeightFirstPage, rowHeightOtherPages, 11) // Cap at 11mm per row

	// Helper function to add header (first page only)
	const addHeader = () => {
		let currentY = margin

		// College Logo (left side)
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}

		// College Logo (right side)
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		// College name
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

		currentY += 13

		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

		currentY += 5


		

		// Title: MARKSHEET DISTRIBUTION
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text('MARKSHEET DISTRIBUTION', pageWidth / 2, currentY, { align: 'center' })

		currentY += 5

		// Program code & name (left) | Batch (right)
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(`Program Code & Name : ${data.programCode} - ${data.programName}`, margin, currentY)
		doc.text(`Batch: ${data.batchYear || ''}`, pageWidth - margin, currentY, { align: 'right' })

		currentY += 5

		return currentY
	}

	// Build table for learners - 2 learners per page
	let currentSNo = 1

	// Split learners into chunks of 2
	const learnerChunks: LearnerRecord[][] = []
	for (let i = 0; i < data.learners.length; i += learnersPerPage) {
		learnerChunks.push(data.learners.slice(i, i + learnersPerPage))
	}

	for (let chunkIndex = 0; chunkIndex < learnerChunks.length; chunkIndex++) {
		const chunk = learnerChunks[chunkIndex]
		const isFirstPage = chunkIndex === 0

		if (chunkIndex > 0) {
			doc.addPage()
		}

		// Add header only on first page
		let startY = margin
		if (isFirstPage) {
			startY = addHeader()
		}

		// Build table body for this chunk
		const tableBody: any[][] = []

		for (const learner of chunk) {
			const learnerInfo = `${learner.register_number}\n${learner.learner_name}\n${learner.dob}`

			// Add semester rows (starting from 1st Semester)
			for (let i = 0; i < semesterLabels.length; i++) {
				const row: any[] = []

				if (i === 0) {
					row.push({
						content: currentSNo.toString(),
						rowSpan: rowsPerLearner,
						styles: { halign: 'center', valign: 'middle', fontStyle: 'normal' }
					})
					row.push({
						content: learnerInfo,
						rowSpan: rowsPerLearner,
						styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' }
					})
				}

				row.push(semesterLabels[i])
				row.push('')
				row.push('')
				row.push('')
				row.push('')

				tableBody.push(row)
			}

			// Add certificate rows
			for (let i = 0; i < certificateRows.length; i++) {
				const row = [certificateRows[i], '', '', '', '']
				tableBody.push(row)
			}

			currentSNo++
		}

		// Create table for this page
		autoTable(doc, {
			startY: startY,
			head: [
				[
					{ content: 'S.No', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Reg. No/Name/ DOB', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Original\nMark\nSheets', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Issue Date', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Signature', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Arrears\nCertificate\nIssue Date', styles: { halign: 'center', valign: 'middle' } },
					{ content: 'Signature', styles: { halign: 'center', valign: 'middle' } }
				]
			],
			body: tableBody,
			theme: 'grid',
			showHead: 'everyPage',
			styles: {
				font: 'times',
				fontSize: 8,
				textColor: [0, 0, 0],
				lineColor: [0, 0, 0],
				lineWidth: 0.2,
				cellPadding: 1.5,
				valign: 'middle',
				minCellHeight: rowHeight
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fontSize: 8,
				fillColor: [255, 255, 255],
				textColor: [0, 0, 0],
				halign: 'center',
				valign: 'middle',
				lineWidth: 0.3,
				minCellHeight: 10
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: 12 },    // S.No
				1: { halign: 'center', cellWidth: 40 },    // Reg No/Name/DOB
				2: { halign: 'left', cellWidth: 26 },      // Original Mark Sheets
				3: { halign: 'center', cellWidth: 24 },    // Issue Date
				4: { halign: 'center', cellWidth: 34 },    // Signature
				5: { halign: 'center', cellWidth: 24 },    // Arrears Certificate Issue Date
				6: { halign: 'center', cellWidth: 34 }     // Signature
			},
			margin: { left: margin, right: margin, bottom: footerMargin }
		})
	}

	// Add page numbers
	const totalPages = (doc as any).internal.getNumberOfPages()
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(0, 0, 0)
		doc.text(`Page ${i}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
	}

	// Save PDF
	const fileName = `Marksheet_Distribution_${data.programCode}_${data.batchYear || 'batch'}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}

// Helper function to get ordinal suffix only (st, nd, rd, th)
function getOrdinalSuffix(n: number): string {
	if (n === 1) return 'st'
	if (n === 2) return 'nd'
	if (n === 3) return 'rd'
	return 'th'
}
