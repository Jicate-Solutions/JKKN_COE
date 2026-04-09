import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface CourseDef {
	course_code: string
	course_name: string
	internal_max_mark: number
}

interface LearnerRow {
	serial_number: number
	register_number: string
	student_name: string
	course_marks: Record<string, number | null>
	total: number
}

interface SemesterBlock {
	semester: number
	courses: CourseDef[]
	learners: LearnerRow[]
}

interface ConsolidatedPDFData {
	institution_name: string
	program_code: string
	program_name: string
	exam_session: string
	assessment_name: string
	cia_round_name: string
	semesters: SemesterBlock[]
	logoImage?: string
	rightLogoImage?: string
}

const MARGIN = 8

/**
 * Consolidated Internal Marks PDF — Landscape A4
 * One page per semester. Columns: S.No | Reg No | Name | Course1 (max) | Course2 (max) | ... | Total
 */
export function generateConsolidatedInternalMarksPDF(data: ConsolidatedPDFData): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()  // 297
	const pageHeight = doc.internal.pageSize.getHeight() // 210
	const tableWidth = pageWidth - MARGIN * 2

	// Filter out empty semesters
	const validSemesters = data.semesters.filter(s => s.learners.length > 0 && s.courses.length > 0)
	if (validSemesters.length === 0) return ''

	validSemesters.forEach((semBlock, semIdx) => {
		if (semIdx > 0) doc.addPage()
		let currentY = MARGIN

		// ========== HEADER ==========
		if (data.rightLogoImage) {
			try { doc.addImage(data.rightLogoImage, 'PNG', MARGIN, currentY, 14, 14) } catch {}
		}
		if (data.logoImage) {
			try { doc.addImage(data.logoImage, 'PNG', pageWidth - MARGIN - 14, currentY, 14, 14) } catch {}
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 3, { align: 'center' })
		doc.setFont('times', 'normal')
		doc.setFontSize(7)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 7.5, { align: 'center' })
		currentY += 10
		doc.setFont('times', 'bold')
		doc.setFontSize(8)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })
		currentY += 4
		doc.setFontSize(10)
		doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, { align: 'center' })
		currentY += 4.5
		doc.text('CONSOLIDATED INTERNAL MARK REPORT', pageWidth / 2, currentY, { align: 'center' })
		currentY += 4
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(`${data.assessment_name} \u2014 ${data.cia_round_name}`, pageWidth / 2, currentY, { align: 'center' })
		currentY += 5

		// Program + Semester
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(`Program: ${data.program_code} - ${data.program_name}`, MARGIN, currentY)
		doc.text(`Semester: ${semBlock.semester}`, pageWidth - MARGIN, currentY, { align: 'right' })
		currentY += 4

		// ========== TABLE ==========
		const courseCount = semBlock.courses.length
		const snoW = 7
		const regW = 24
		// Total column removed — consolidated report only shows per-course totals
		const fixedUsed = snoW + regW
		const remaining = tableWidth - fixedUsed
		const nameW = Math.max(25, remaining * 0.25)
		const courseTotalW = remaining - nameW
		const courseW = courseCount > 0 ? courseTotalW / courseCount : 15

		const headRow: string[] = ['S.No', 'Reg No', 'Name of the Student']
		semBlock.courses.forEach(c => headRow.push(`${c.course_code}\n(${c.internal_max_mark})`))

		const bodyRows = semBlock.learners.map(l => {
			const row: (string | number)[] = [l.serial_number, l.register_number, l.student_name]
			semBlock.courses.forEach(c => {
				const mark = l.course_marks[c.course_code]
				row.push(mark != null && mark > 0 ? mark : '-')
			})
			return row
		})

		const columnStyles: Record<number, any> = {
			0: { cellWidth: snoW, halign: 'center' },
			1: { cellWidth: regW, halign: 'center' },
			2: { cellWidth: nameW, halign: 'left' },
		}
		semBlock.courses.forEach((_, i) => {
			columnStyles[3 + i] = { cellWidth: courseW, halign: 'center' }
		})

		const fontSize = courseCount > 10 ? 7 : courseCount > 6 ? 8 : 9
		const headFontSize = courseCount > 10 ? 6.5 : courseCount > 6 ? 7.5 : 8.5

		autoTable(doc, {
			head: [headRow],
			body: bodyRows,
			startY: currentY,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize,
				cellPadding: 1.5,
				lineColor: [0, 0, 0],
				lineWidth: 0.2,
				textColor: [0, 0, 0],
				valign: 'middle',
				minCellHeight: 6,
				overflow: 'linebreak',
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				fontSize: headFontSize,
				minCellHeight: 10,
			},
			columnStyles,
			didDrawPage: (hookData) => {
				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(128, 128, 128)
				doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, pageHeight - 5)
				doc.text(`Page ${hookData.pageNumber}`, pageWidth - MARGIN, pageHeight - 5, { align: 'right' })
				doc.setTextColor(0, 0, 0)
			},
		})

		// ========== SUMMARY + SIGNATURES ==========
		const finalY = (doc as any).lastAutoTable?.finalY || currentY + 50
		currentY = finalY + 5

		if (currentY + 18 > pageHeight - 10) {
			doc.addPage()
			currentY = MARGIN
		}

		// Summary line removed — go straight to signatures
		currentY += 4

		const sigWidth = tableWidth / 3
		const sigLabels = ['Signature of the Class In-Charge', 'Signature of the HOD', 'Signature of the Principal']
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		sigLabels.forEach((label, i) => {
			const cx = MARGIN + (i * sigWidth) + sigWidth / 2
			doc.setDrawColor(0, 0, 0)
			doc.line(MARGIN + (i * sigWidth) + 8, currentY, MARGIN + ((i + 1) * sigWidth) - 8, currentY)
			doc.text(label, cx, currentY + 4, { align: 'center' })
		})
	})

	// ========== SAVE ==========
	const semList = validSemesters.map(s => s.semester).join('-')
	const fileName = `consolidated_${data.program_code}_sem${semList}_${data.cia_round_name}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}
