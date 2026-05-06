import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getProgramDisplayName } from './program-name-mapper'

interface StudentAttendance {
	register_number: string
	attendance: 'PRESENT' | 'ABSENT'
	is_regular?: boolean
}

interface BundleCoverData {
	program_code: string
	program_name: string
	subject_code: string
	subject_name: string
	exam_date: string
	session: 'FN' | 'AN'
	session_name?: string
	students: StudentAttendance[]
}

interface BundleCoverPDFData {
	bundles: BundleCoverData[]
	logoImage?: string
	rightLogoImage?: string
}

const STUDENTS_PER_BUNDLE = 60
const COLUMNS_PER_ROW = 6
const ROWS_PER_COLUMN = 10

/**
 * Generates Answer Sheet Bundle Cover PDFs
 * Each bundle contains up to 60 students
 * Multiple subjects are merged into a single PDF (one PDF per date+session)
 */
export function generateBundleCoverPDF(data: BundleCoverPDFData): string {
	// Create a single PDF document for all subjects
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm

	let isFirstPage = true

	// Process each subject
	data.bundles.forEach((subjectData) => {
		// Split students into bundles of 60 for this subject
		const bundlesForSubject: StudentAttendance[][] = []
		for (let i = 0; i < subjectData.students.length; i += STUDENTS_PER_BUNDLE) {
			bundlesForSubject.push(subjectData.students.slice(i, i + STUDENTS_PER_BUNDLE))
		}

		bundlesForSubject.forEach((bundleStudents, bundleIndex) => {
			// Add new page for each bundle (except the very first page)
			if (!isFirstPage) {
				doc.addPage()
			}
			isFirstPage = false

			let currentY = margin

			// ========== HEADER SECTION ==========

			// College Logos
			if (data.logoImage) {
				try {
					const logoSize = 20
					doc.addImage(data.logoImage, 'PNG', margin, currentY, logoSize, logoSize)
				} catch (e) {
					console.warn('Failed to add logo to PDF:', e)
				}
			}

			if (data.rightLogoImage) {
				try {
					const logoSize = 20
					doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
				} catch (e) {
					console.warn('Failed to add right logo to PDF:', e)
				}
			}

			// College name and details (centered)
			doc.setFont('times', 'bold')
			doc.setFontSize(14)
			doc.setTextColor(0, 0, 0)
			doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

			doc.setFont('times', 'normal')
			doc.setFontSize(9)
			doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 11, { align: 'center' })

			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 17, { align: 'center' })

			currentY += 25

			// Center title
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.setTextColor(0, 0, 0)
			doc.text('EXAM ANSWER SHEET BUNDLE COVER', pageWidth / 2, currentY, { align: 'center' })

			// CONFIDENTIAL box on right side
			doc.setTextColor(255, 0, 0)
			const confBoxWidth = 50
			const confBoxHeight = 10
			const confBoxX = pageWidth - margin - confBoxWidth - 10
			const confBoxY = currentY - 7

			doc.setLineWidth(1)
			doc.setDrawColor(255, 0, 0)
			doc.rect(confBoxX, confBoxY, confBoxWidth, confBoxHeight)

			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.text('CONFIDENTIAL', confBoxX + (confBoxWidth / 2), currentY, { align: 'center' })

			doc.setTextColor(0, 0, 0)
			doc.setDrawColor(0, 0, 0)

			currentY += 9

			// ========== EXAMINATION DETAILS SECTION ==========

			doc.setFont('times', 'bold')
			doc.setFontSize(11)

			const leftColX = margin + 5
			const labelWidth = 50

			// Programme Name
			doc.text('Programme Name', leftColX, currentY)
			doc.setFont('times', 'normal')
			const displayProgramName = getProgramDisplayName(subjectData.program_code, subjectData.program_name)
			doc.text(`: ${subjectData.program_code} - ${displayProgramName}`, leftColX + labelWidth, currentY)

			currentY += 7

			// Subject Name
			doc.setFont('times', 'bold')
			doc.text('Subject Code & Name', leftColX, currentY)
			doc.setFont('times', 'normal')

			const subjectTextMaxWidth = pageWidth - leftColX - labelWidth - margin - 10
			const subjectText = `: ${subjectData.subject_code} - ${subjectData.subject_name}`
			const subjectLines = doc.splitTextToSize(subjectText, subjectTextMaxWidth)
			doc.text(subjectLines, leftColX + labelWidth, currentY)

			if (subjectLines.length > 1) {
				currentY += (subjectLines.length - 1) * 6
			}

			currentY += 7

			// Date & Session (left) & Bundle No. (right) - SAME ROW
			doc.setFont('times', 'bold')
			doc.text('Date & Session', leftColX, currentY)
			doc.setFont('times', 'normal')
			const sessionFull = subjectData.session === 'FN' ? 'FORENOON' : 'AFTERNOON'
			doc.text(`: ${subjectData.exam_date} - ${sessionFull}`, leftColX + labelWidth, currentY)

			// Bundle Number (right side, same row, right-aligned)
			doc.setFont('times', 'bold')
			doc.setFontSize(11)
			const bundleText = 'Bundle No.'
			const bundleNumberText = `(Bundle ${bundleIndex + 1} of ${bundlesForSubject.length})`

			const boxSize = 8
			const bundleTextWidth = doc.getTextWidth(bundleText)
			const bundleNumberWidth = doc.getTextWidth(bundleNumberText)
			const totalBundleWidth = bundleTextWidth + 5 + boxSize + 5 + bundleNumberWidth

			const bundleStartX = pageWidth - margin - totalBundleWidth

			doc.text(bundleText, bundleStartX, currentY)

			const boxX = bundleStartX + bundleTextWidth + 5
			const boxY = currentY - 4
			doc.setLineWidth(0.5)
			doc.setDrawColor(0, 0, 0)
			doc.rect(boxX, boxY, boxSize, boxSize)

			doc.setFont('times', 'normal')
			doc.text(bundleNumberText, boxX + boxSize + 5, currentY)

			currentY += 8

			// ========== ATTENDANCE TABLE SECTION ==========

			const presentCount = bundleStudents.filter(s => s.attendance === 'PRESENT').length
			const absentCount = bundleStudents.filter(s => s.attendance === 'ABSENT').length

			// Prepare table data (6 columns per row, 10 rows per column)
			const tableData: any[][] = []

			for (let row = 0; row < ROWS_PER_COLUMN; row++) {
				const rowData: string[] = []

				for (let col = 0; col < COLUMNS_PER_ROW; col++) {
					const studentIndex = col * ROWS_PER_COLUMN + row

					if (studentIndex < bundleStudents.length) {
						const student = bundleStudents[studentIndex]
						const attendanceMark = student.attendance === 'PRESENT' ? 'P' : 'A'
						rowData.push(student.register_number)
						rowData.push(attendanceMark)
					} else {
						rowData.push('')
						rowData.push('')
					}
				}

				tableData.push(rowData)
			}

			const tableHeaders: string[] = []
			for (let i = 0; i < COLUMNS_PER_ROW; i++) {
				tableHeaders.push('Register No.')
				tableHeaders.push('A/P')
			}

			autoTable(doc, {
				startY: currentY,
				head: [tableHeaders],
				body: tableData,
				theme: 'grid',
				styles: {
					font: 'times',
					fontSize: 10,
					textColor: [0, 0, 0],
					lineColor: [0, 0, 0],
					lineWidth: 0.3,
					cellPadding: 1.5,
					halign: 'center',
					valign: 'middle'
				},
				headStyles: {
					fontStyle: 'bold',
					fontSize: 10,
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0],
					lineWidth: 0.4
				},
				columnStyles: {
					0: { cellWidth: 32, halign: 'center' },
					2: { cellWidth: 32, halign: 'center' },
					4: { cellWidth: 32, halign: 'center' },
					6: { cellWidth: 32, halign: 'center' },
					8: { cellWidth: 32, halign: 'center' },
					10: { cellWidth: 32, halign: 'center' },
					1: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
					3: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
					5: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
					7: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
					9: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
					11: { cellWidth: 13, halign: 'center', fontStyle: 'bold' }
				},
				didParseCell: (data) => {
					if (data.section === 'body' && data.column.index % 2 === 1) {
						if (data.cell.text[0] === 'A') {
							data.cell.styles.textColor = [255, 0, 0]
							data.cell.styles.fontStyle = 'bold'
						} else if (data.cell.text[0] === 'P') {
							data.cell.styles.textColor = [0, 128, 0]
							data.cell.styles.fontStyle = 'bold'
						}
					}
				},
				margin: { left: margin, right: margin }
			})

			const finalY = (doc as any).lastAutoTable.finalY + 8

			// ========== BOTTOM SECTION ==========

			let bottomY = finalY

			// Summary counts - CENTER ALIGNED WITH BOXES
			doc.setFont('times', 'bold')
			doc.setFontSize(11)

			const absenteesText = 'No. of Absentees :'
			const bookletText = 'No. of Answer Booklets :'
			const countBoxWidth = 15
			const countBoxHeight = 8
			const gapBetweenSections = 40

			const absenteesTextWidth = doc.getTextWidth(absenteesText)
			const bookletTextWidth = doc.getTextWidth(bookletText)

			const totalWidth = absenteesTextWidth + 5 + countBoxWidth + gapBetweenSections + bookletTextWidth + 5 + countBoxWidth

			const startX = (pageWidth - totalWidth) / 2

			doc.text(absenteesText, startX, bottomY)

			const absentBoxX = startX + absenteesTextWidth + 5
			const absentBoxY = bottomY - 5
			doc.setLineWidth(0.5)
			doc.setDrawColor(0, 0, 0)
			doc.rect(absentBoxX, absentBoxY, countBoxWidth, countBoxHeight)

			doc.setFont('times', 'bold')
			doc.setFontSize(11)
			doc.text(absentCount.toString(), absentBoxX + (countBoxWidth / 2), bottomY, { align: 'center' })

			const bookletStartX = absentBoxX + countBoxWidth + gapBetweenSections
			doc.setFont('times', 'bold')
			doc.text(bookletText, bookletStartX, bottomY)

			const bookletBoxX = bookletStartX + bookletTextWidth + 5
			const bookletBoxY = bottomY - 5
			doc.rect(bookletBoxX, bookletBoxY, countBoxWidth, countBoxHeight)

			doc.setFont('times', 'bold')
			doc.text(presentCount.toString(), bookletBoxX + (countBoxWidth / 2), bottomY, { align: 'center' })

			bottomY += 20

			// ========== SINGLE ROW: CHIEF SIGNATURE | NOTES | ADDITIONAL SIGNATURE ==========
			doc.setFont('times', 'normal')
			doc.setFontSize(9)

			const chiefSigWidth = 75
			const notesWidth = 110
			const addSigWidth = 80

			const chiefSigX = leftColX
			const notesX = chiefSigX + chiefSigWidth + 5
			const addSigX = notesX + notesWidth + 5

			// Chief Superintendent Signature
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			const chiefCenterX = chiefSigX + (chiefSigWidth / 2)
			doc.text('Signature of the Chief', chiefCenterX, bottomY, { align: 'center' })
			doc.text('Superintendent with Date', chiefCenterX, bottomY + 4, { align: 'center' })

			// Notes
			doc.setFont('times', 'bold')
			doc.setFontSize(6.5)
			const notesText = 'Notes: '
			doc.text(notesText, notesX, bottomY)

			doc.setFont('times', 'normal')
			doc.setFontSize(10)
			doc.text('1) Do not pack the Answer Papers of different Subject Codes', notesX, bottomY + 4)
			doc.text('2) Mark the Absentees in Red Ink', notesX, bottomY + 7.5)
			doc.text('3) Send the Answer Booklets of the Absentees separately', notesX, bottomY + 11)

			// Additional Superintendent Signature
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			const addSigCenterX = addSigX + (addSigWidth / 2)
			doc.text('Signature of the Additional Chief', addSigCenterX, bottomY, { align: 'center' })
			doc.text('Superintendent with Name and Date', addSigCenterX, bottomY + 4, { align: 'center' })
		})
	})

	// Save the combined PDF
	const firstBundle = data.bundles[0]
	const sessionName = firstBundle.session_name || firstBundle.exam_date
	const fileName = `Bundle_Cover_${firstBundle.exam_date.replace(/\//g, '-')}_${firstBundle.session}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
