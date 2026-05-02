import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface PendingCourse {
	course_offering_id: string
	course_code: string
	course_name: string
	course_category: string | null
	total_learners: number
	entered_count: number
	pending_count: number
	status: 'not_started' | 'partial'
}

interface PendingSemester {
	semester: number
	courses: PendingCourse[]
}

interface PendingProgram {
	program_code: string
	program_name?: string
	semesters: PendingSemester[]
}

interface PendingLearner {
	serial_number: number
	register_number: string
	student_name: string
}

interface PendingMarksPDFData {
	institution_name: string
	institution_subtitle?: string
	institution_trust_line?: string
	institution_accreditation?: string
	institution_address?: string
	exam_session: string
	assessment_name: string
	cia_round_name: string
	programs: PendingProgram[]
	learner_details?: {
		program_code: string
		semester: number
		course_code: string
		course_name: string
		learners: PendingLearner[]
	}[]
	logoImage?: string
	rightLogoImage?: string
}

const MARGIN = 10

function drawHeader(doc: jsPDF, data: PendingMarksPDFData, subtitle: string) {
	const pageWidth = doc.internal.pageSize.getWidth()
	let currentY = MARGIN

	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, 'PNG', MARGIN, currentY, 14, 14) } catch {}
	}
	if (data.logoImage) {
		try { doc.addImage(data.logoImage, 'PNG', pageWidth - MARGIN - 14, currentY, 14, 14) } catch {}
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text((data.institution_name || 'J.K.K.NATARAJA EDUCATIONAL INSTITUTIONS').toUpperCase(), pageWidth / 2, currentY + 3, { align: 'center' })

	let lineY = currentY + 7.5
	if (data.institution_subtitle) {
		doc.setFont('times', 'italic'); doc.setFontSize(8)
		doc.text(data.institution_subtitle, pageWidth / 2, lineY, { align: 'center' }); lineY += 3.5
	}
	if (data.institution_trust_line) {
		doc.setFont('times', 'italic'); doc.setFontSize(7)
		doc.text(data.institution_trust_line, pageWidth / 2, lineY, { align: 'center' }); lineY += 3.5
	}
	if (data.institution_accreditation) {
		doc.setFont('times', 'normal'); doc.setFontSize(7)
		doc.text(data.institution_accreditation, pageWidth / 2, lineY, { align: 'center' }); lineY += 3.5
	}
	if (data.institution_address) {
		doc.setFont('times', 'bold'); doc.setFontSize(8)
		doc.text(data.institution_address, pageWidth / 2, lineY, { align: 'center' }); lineY += 4
	}
	currentY = Math.max(currentY + 11, lineY)
	doc.setFontSize(10)
	doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 4.5
	doc.text(subtitle, pageWidth / 2, currentY, { align: 'center' })
	currentY += 4
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text(`Assessment: ${data.assessment_name} | ${data.cia_round_name}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 6

	return currentY
}

/**
 * Generate Pending Mark Entry PDF — Portrait A4
 * Page 1+: Summary table grouped by program + semester
 * Following pages: Detailed learner list per pending course
 */
export function generatePendingMarksPDF(data: PendingMarksPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth() // 210

	// ===== PAGE 1: SUMMARY =====
	let startY = drawHeader(doc, data, 'PENDING MARK ENTRY REPORT - SUMMARY')

	// Build summary table rows
	const summaryRows: any[][] = []
	let serialNo = 0

	for (const prog of data.programs) {
		for (const sem of prog.semesters) {
			for (const course of sem.courses) {
				serialNo++
				const pct = course.total_learners > 0
					? Math.round((course.entered_count / course.total_learners) * 100)
					: 0
				summaryRows.push([
					serialNo,
					prog.program_name || prog.program_code,
					sem.semester,
					course.course_code,
					course.course_name,
					course.total_learners,
					course.entered_count,
					course.pending_count,
					`${pct}%`,
					course.status === 'not_started' ? 'Not Started' : 'Partial',
				])
			}
		}
	}

	autoTable(doc, {
		startY,
		head: [['S.No', 'Program', 'Sem', 'Course Code', 'Course Name', 'Total', 'Entered', 'Pending', '%', 'Status']],
		body: summaryRows,
		styles: {
			font: 'times',
			fontSize: 7,
			cellPadding: 1.5,
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
		},
		headStyles: {
			fillColor: [41, 65, 148],
			textColor: [255, 255, 255],
			fontStyle: 'bold',
			fontSize: 7,
			halign: 'center',
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 10 },
			1: { cellWidth: 28 },
			2: { halign: 'center', cellWidth: 10 },
			3: { cellWidth: 22 },
			4: { cellWidth: 'auto' },
			5: { halign: 'center', cellWidth: 12 },
			6: { halign: 'center', cellWidth: 14 },
			7: { halign: 'center', cellWidth: 14 },
			8: { halign: 'center', cellWidth: 10 },
			9: { halign: 'center', cellWidth: 20 },
		},
		didParseCell: (hookData) => {
			if (hookData.section === 'body' && hookData.column.index === 9) {
				const val = hookData.cell.raw as string
				if (val === 'Not Started') {
					hookData.cell.styles.textColor = [220, 38, 38] // red
					hookData.cell.styles.fontStyle = 'bold'
				} else if (val === 'Partial') {
					hookData.cell.styles.textColor = [217, 119, 6] // amber
					hookData.cell.styles.fontStyle = 'bold'
				}
			}
		},
		margin: { left: MARGIN, right: MARGIN },
	})

	// Summary totals
	const totalCourses = summaryRows.length
	const notStarted = summaryRows.filter(r => r[9] === 'Not Started').length
	const partial = summaryRows.filter(r => r[9] === 'Partial').length
	const totalPending = summaryRows.reduce((sum, r) => sum + (r[7] as number), 0)

	const finalY = (doc as any).lastAutoTable?.finalY || startY + 20
	doc.setFont('times', 'bold')
	doc.setFontSize(8)
	doc.text(`Total Pending Courses: ${totalCourses} | Not Started: ${notStarted} | Partial: ${partial} | Total Pending Learners: ${totalPending}`, MARGIN, finalY + 5)

	// Generated timestamp
	doc.setFont('times', 'italic')
	doc.setFontSize(6)
	doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, MARGIN, doc.internal.pageSize.getHeight() - 5)

	// ===== DETAIL PAGES: Per-course learner list =====
	if (data.learner_details && data.learner_details.length > 0) {
		for (const detail of data.learner_details) {
			if (detail.learners.length === 0) continue

			doc.addPage()
			let detailY = drawHeader(doc, data, 'PENDING MARK ENTRY - LEARNER DETAILS')

			// Course info
			doc.setFont('times', 'bold')
			doc.setFontSize(9)
			doc.text(`Program: ${detail.program_code}  |  Semester: ${detail.semester}`, MARGIN, detailY)
			detailY += 4
			doc.text(`Course: ${detail.course_code} - ${detail.course_name}`, MARGIN, detailY)
			detailY += 3
			doc.setFont('times', 'normal')
			doc.setFontSize(8)
			doc.text(`Learners without marks: ${detail.learners.length}`, MARGIN, detailY)
			detailY += 4

			const detailRows = detail.learners.map(l => [l.serial_number, l.register_number, l.student_name])

			autoTable(doc, {
				startY: detailY,
				head: [['S.No', 'Register Number', 'Learner Name']],
				body: detailRows,
				styles: {
					font: 'times',
					fontSize: 8,
					cellPadding: 2,
					lineColor: [0, 0, 0],
					lineWidth: 0.2,
				},
				headStyles: {
					fillColor: [41, 65, 148],
					textColor: [255, 255, 255],
					fontStyle: 'bold',
					fontSize: 8,
					halign: 'center',
				},
				columnStyles: {
					0: { halign: 'center', cellWidth: 15 },
					1: { cellWidth: 45 },
					2: { cellWidth: 'auto' },
				},
				margin: { left: MARGIN, right: MARGIN },
			})
		}
	}

	const filename = `Pending_Mark_Entry_${data.exam_session.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}
