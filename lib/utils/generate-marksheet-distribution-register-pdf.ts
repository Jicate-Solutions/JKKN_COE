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
	batchYear?: string
	logoImage?: string
	rightLogoImage?: string
	learners: LearnerRecord[]
}

export function generateMarksheetDistributionRegisterPDF(data: MarksheetDistributionRegisterData): string {
	// A3 Landscape
	const doc = new jsPDF('landscape', 'mm', 'a3')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8

	const programLabel = `${data.programCode} - ${data.programName}`

	// Header (rendered on the first page via didDrawPage on the first page only)
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
		doc.setFontSize(14)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 10, { align: 'center' })

		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 15, { align: 'center' })

		currentY += 21

		doc.setFont('times', 'bold')
		doc.setFontSize(16)
		doc.text('MARKSHEET DISTRIBUTION REGISTER', pageWidth / 2, currentY, { align: 'center' })

		currentY += 8

		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.text(`Program Code & Name : ${programLabel}`, margin, currentY)
		doc.text(`Batch: ${data.batchYear || ''}`, pageWidth - margin, currentY, { align: 'right' })

		currentY += 4

		return currentY
	}

	const startY = addHeader()

	// One row per learner; operational columns are left blank for manual entry
	const body = data.learners.map((learner, index) => ([
		(index + 1).toString(),
		programLabel,
		learner.register_number,
		learner.learner_name,
		'', // Semester
		'', // Marksheet No.
		'', // Folio No.
		'', // Date of print
		'', // Remarks
	]))

	autoTable(doc, {
		startY,
		head: [[
			{ content: 'S.No', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Programme', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Register No.', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Name of the Students', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Semester', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Marksheet No.', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Folio No.', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Date of print', styles: { halign: 'center', valign: 'middle' } },
			{ content: 'Remarks', styles: { halign: 'center', valign: 'middle' } },
		]],
		body,
		theme: 'grid',
		showHead: 'everyPage',
		styles: {
			font: 'times',
			fontSize: 12,
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			cellPadding: 2.5,
			valign: 'middle',
			minCellHeight: 13,
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fontSize: 12,
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'middle',
			lineWidth: 0.3,
			minCellHeight: 12,
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 14 },   // S.No
			1: { halign: 'left', cellWidth: 64 },      // Programme
			2: { halign: 'center', cellWidth: 34 },    // Register No.
			3: { halign: 'left', cellWidth: 90 },      // Name of the Students
			4: { halign: 'center', cellWidth: 22 },    // Semester
			5: { halign: 'center', cellWidth: 44 },    // Marksheet No.
			6: { halign: 'center', cellWidth: 38 },    // Folio No.
			7: { halign: 'center', cellWidth: 32 },    // Date of print
			8: { halign: 'left', cellWidth: 64 },      // Remarks
		},
		margin: { left: margin, right: margin, bottom: 14 },
	})

	// Page numbers
	const totalPages = (doc as any).internal.getNumberOfPages()
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.setTextColor(0, 0, 0)
		doc.text(`Page ${i}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
	}

	const fileName = `Marksheet_Distribution_Register_${data.programCode}_${data.batchYear || 'batch'}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
