import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
// Digit-by-digit words ("28" → "TWO EIGHT") — shared converter, see service file.
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'
import { getProgramDisplayName } from './program-name-mapper'

interface LearnerMark {
	serial_number: number
	register_number: string
	student_name: string
	component_marks: Record<string, number>
	total: number
}

interface ComponentDef {
	code: string
	name: string
	max_marks: number
}

interface InternalMarksPDFData {
	institution_name: string
	institution_subtitle?: string         // e.g. "(An Autonomous Institution)"
	institution_trust_line?: string       // e.g. "Managed by ... Trust"
	institution_accreditation?: string    // affiliation/accreditation line
	institution_address?: string          // postal address line
	program_code: string
	program_name: string
	semester: number | string
	course_code: string
	course_name: string
	internal_max_mark: number             // legacy: course-level max (e.g. 50). Not displayed; "Assessment Mark" is summed from components.
	exam_session: string
	assessment_name: string
	cia_round_name: string
	components: ComponentDef[]
	learners: LearnerMark[]
	logoImage?: string
	rightLogoImage?: string
}

// A4 portrait dimensions
const A4_WIDTH = 210
const A4_HEIGHT = 297
const MARGIN = 10

/**
 * Generates Internal Mark Entry Sheet PDF — Portrait A4, Times New Roman, auto-fit columns
 */
export function generateInternalMarksPDF(data: InternalMarksPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = A4_WIDTH
	const pageHeight = A4_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2
	let currentY = MARGIN

	// ========== HEADER ==========

	// College Logo (left side) — rightLogoImage goes left
	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, 'PNG', MARGIN, currentY, 16, 16) } catch {}
	}
	// College Logo (right side) — logoImage goes right
	if (data.logoImage) {
		try { doc.addImage(data.logoImage, 'PNG', pageWidth - MARGIN - 16, currentY, 16, 16) } catch {}
	}

	// Institution name (uppercase, bold, large)
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text((data.institution_name || 'J.K.K.NATARAJA EDUCATIONAL INSTITUTIONS').toUpperCase(), pageWidth / 2, currentY + 4, { align: 'center' })

	let lineY = currentY + 9

	// Optional subtitle (e.g. "(An Autonomous Institution)")
	if (data.institution_subtitle) {
		doc.setFont('times', 'italic')
		doc.setFontSize(9)
		doc.text(data.institution_subtitle, pageWidth / 2, lineY, { align: 'center' })
		lineY += 4
	}

	// Optional trust line (e.g. "Managed by ... Trust")
	if (data.institution_trust_line) {
		doc.setFont('times', 'italic')
		doc.setFontSize(8)
		doc.text(data.institution_trust_line, pageWidth / 2, lineY, { align: 'center' })
		lineY += 4
	}

	// Accreditation/affiliation
	if (data.institution_accreditation) {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(data.institution_accreditation, pageWidth / 2, lineY, { align: 'center' })
		lineY += 4
	}

	// Address
	if (data.institution_address) {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(data.institution_address, pageWidth / 2, lineY, { align: 'center' })
		lineY += 5
	}

	currentY = Math.max(currentY + 14, lineY)

	// Exam session
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Title
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text('INTERNAL MARK ENTRY SHEET', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Assessment + CIA round
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.text(`${data.assessment_name} \u2014 ${data.cia_round_name}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 6

	// ========== COURSE DETAILS ==========
	doc.setFont('times', 'bold')
	doc.setFontSize(9)

	// Row 1: Program & Semester
	const displayProgramName = getProgramDisplayName(data.program_code, data.program_name)
	doc.text(`Program: ${data.program_code} - ${displayProgramName}`, MARGIN, currentY)
	doc.text(`Semester: ${data.semester}`, pageWidth - MARGIN, currentY, { align: 'right' })
	currentY += 4.5

	// Row 2: Course & Max Mark
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const courseText = `Course: ${data.course_code} - ${data.course_name}`
	const courseLines = doc.splitTextToSize(courseText, tableWidth - 50)
	doc.text(courseLines, MARGIN, currentY)
	// Assessment Mark = sum of component max marks for this round.
	const assessmentMax = data.components.reduce((s, c) => s + (c.max_marks || 0), 0)
	doc.text(`Assessment Mark: ${assessmentMax}`, pageWidth - MARGIN, currentY, { align: 'right' })
	currentY += courseLines.length > 1 ? courseLines.length * 4 : 4.5

	currentY += 2

	// ========== MARKS TABLE — auto-fit to A4 width ==========
	const compCount = data.components.length
	const totalCols = 3 + compCount + 2 // sno + reg + name + components + total + words

	// Calculate column widths to fit exactly in A4
	// Fixed columns: S.No(8), RegNo(25), Name(auto), Total(12), Words(auto)
	const snoW = 8
	const regW = 32
	const totalW = 12
	// Component columns: divide remaining space
	const compMinW = 12
	const wordsMinW = 22
	const nameMinW = 30

	// Available space for name + components + words
	const fixedUsed = snoW + regW + totalW
	const remaining = tableWidth - fixedUsed
	const compTotalW = Math.min(compCount * 16, remaining * 0.35)
	const compW = compCount > 0 ? compTotalW / compCount : 0
	const afterComp = remaining - compTotalW
	const nameW = Math.max(nameMinW, afterComp * 0.6)
	const wordsW = Math.max(wordsMinW, afterComp * 0.4)

	// Build head
	const headRow = ['S.No', 'Reg No', 'Name of the Student']
	data.components.forEach(c => headRow.push(`${c.name}\n(${c.max_marks})`))
	headRow.push('Total', 'Marks in Words')

	// Build body
	const bodyRows = data.learners.map(learner => {
		const row: (string | number)[] = [
			learner.serial_number,
			learner.register_number,
			learner.student_name,
		]
		data.components.forEach(c => {
			const mark = learner.component_marks[c.code]
			// Option B: treat "not entered" the same as "entered as 0".
			row.push(mark != null ? mark : 0)
		})
		row.push(learner.total)
		row.push(numberToWords(learner.total))
		return row
	})

	// Column styles
	const columnStyles: Record<number, any> = {
		0: { cellWidth: snoW, halign: 'center' },
		1: { cellWidth: regW, halign: 'center' },
		2: { cellWidth: nameW, halign: 'left' },
	}
	data.components.forEach((_, i) => {
		columnStyles[3 + i] = { cellWidth: compW, halign: 'center' }
	})
	columnStyles[3 + compCount] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' }
	columnStyles[4 + compCount] = { cellWidth: wordsW, halign: 'left' }

	autoTable(doc, {
		head: [headRow],
		body: bodyRows,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 10,
			cellPadding: 2,
			lineColor: [0, 0, 0],
			lineWidth: 0.3,
			textColor: [0, 0, 0],
			valign: 'middle',
			minCellHeight: 8,
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fillColor: [240, 240, 240],
			textColor: [0, 0, 0],
			halign: 'center',
			fontSize: 10,
			minCellHeight: 10,
		},
		columnStyles,
		didDrawPage: (hookData) => {
			// Footer
			const footerY = pageHeight - 6
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(128, 128, 128)
			doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, footerY)
			doc.text(`Page ${hookData.pageNumber}`, pageWidth - MARGIN, footerY, { align: 'right' })
			doc.setTextColor(0, 0, 0)
		},
	})

	// ========== SUMMARY ==========
	const finalY = (doc as any).lastAutoTable?.finalY || currentY + 50
	currentY = finalY + 6

	if (currentY + 30 > pageHeight - 12) {
		doc.addPage()
		currentY = MARGIN
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	// Option B: every learner row counts as entered (missing components → 0).
	doc.text(`Total Learners: ${data.learners.length}    Marks Entered: ${data.learners.length}    Pending: 0`, MARGIN, currentY)
	currentY += 14

	// ========== SIGNATURE SECTION ==========
	const sigWidth = tableWidth / 3
	const sigLabels = [
		'Signature of the Subject In-Charge',
		'Signature of the HOD',
		'Signature of the Principal',
	]

	doc.setFont('times', 'normal')
	doc.setFontSize(9)

	sigLabels.forEach((label, i) => {
		const centerX = MARGIN + (i * sigWidth) + sigWidth / 2
		const lineX1 = MARGIN + (i * sigWidth) + 8
		const lineX2 = MARGIN + ((i + 1) * sigWidth) - 8

		doc.setDrawColor(0, 0, 0)
		doc.line(lineX1, currentY, lineX2, currentY)
		doc.text(label, centerX, currentY + 5, { align: 'center' })
	})

	// ========== SAVE ==========
	const fileName = `${data.course_code}_${data.cia_round_name}_internal_marks_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

/**
 * Generate multi-course internal marks PDF — one page per course, single PDF file
 * Skips courses with no marks entered
 */
export function generateMultiCourseInternalMarksPDF(courses: InternalMarksPDFData[]): string {
	// Filter out courses with no marks
	const withMarks = courses.filter(c => c.learners.some(l => l.total > 0))
	if (withMarks.length === 0) return ''

	if (withMarks.length === 1) {
		return generateInternalMarksPDF(withMarks[0])
	}

	// For multiple courses, generate first course normally then add pages
	// We'll use generateInternalMarksPDF for the first, then manually append
	// Actually, rebuild a single doc with all courses

	const jsPDFModule = require('jspdf')
	const autoTableModule = require('jspdf-autotable')
	const doc = new jsPDFModule.default('portrait', 'mm', 'a4') as jsPDF
	const pageWidth = A4_WIDTH
	const pageHeight = A4_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2

	withMarks.forEach((data, courseIdx) => {
		if (courseIdx > 0) doc.addPage()

		let currentY = MARGIN

		// ── HEADER ──
		if (data.rightLogoImage) {
			try { doc.addImage(data.rightLogoImage, 'PNG', MARGIN, currentY, 16, 16) } catch {}
		}
		if (data.logoImage) {
			try { doc.addImage(data.logoImage, 'PNG', pageWidth - MARGIN - 16, currentY, 16, 16) } catch {}
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text((data.institution_name || 'J.K.K.NATARAJA EDUCATIONAL INSTITUTIONS').toUpperCase(), pageWidth / 2, currentY + 4, { align: 'center' })

		let lineY = currentY + 9
		if (data.institution_subtitle) {
			doc.setFont('times', 'italic'); doc.setFontSize(9)
			doc.text(data.institution_subtitle, pageWidth / 2, lineY, { align: 'center' }); lineY += 4
		}
		if (data.institution_trust_line) {
			doc.setFont('times', 'italic'); doc.setFontSize(8)
			doc.text(data.institution_trust_line, pageWidth / 2, lineY, { align: 'center' }); lineY += 4
		}
		if (data.institution_accreditation) {
			doc.setFont('times', 'normal'); doc.setFontSize(8)
			doc.text(data.institution_accreditation, pageWidth / 2, lineY, { align: 'center' }); lineY += 4
		}
		if (data.institution_address) {
			doc.setFont('times', 'bold'); doc.setFontSize(9)
			doc.text(data.institution_address, pageWidth / 2, lineY, { align: 'center' }); lineY += 5
		}
		currentY = Math.max(currentY + 14, lineY)
		doc.setFontSize(11)
		doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, { align: 'center' })
		currentY += 5
		doc.text('INTERNAL MARK ENTRY SHEET', pageWidth / 2, currentY, { align: 'center' })
		currentY += 5
		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.text(`${data.assessment_name} \u2014 ${data.cia_round_name}`, pageWidth / 2, currentY, { align: 'center' })
		currentY += 6

		// ── COURSE DETAILS ──
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		const displayProgramName = getProgramDisplayName(data.program_code, data.program_name)
	doc.text(`Program: ${data.program_code} - ${displayProgramName}`, MARGIN, currentY)
		doc.text(`Semester: ${data.semester}`, pageWidth - MARGIN, currentY, { align: 'right' })
		currentY += 4.5
		doc.setFont('times', 'normal')
		const courseLines = doc.splitTextToSize(`Course: ${data.course_code} - ${data.course_name}`, tableWidth - 50)
		doc.text(courseLines, MARGIN, currentY)
		const assessmentMax = data.components.reduce((s, c) => s + (c.max_marks || 0), 0)
		doc.text(`Assessment Mark: ${assessmentMax}`, pageWidth - MARGIN, currentY, { align: 'right' })
		currentY += courseLines.length > 1 ? courseLines.length * 4 : 4.5
		currentY += 2

		// ── TABLE ──
		const compCount = data.components.length
		const snoW = 8, regW = 32, totalW = 12, wordsMinW = 22, nameMinW = 30
		const fixedUsed = snoW + regW + totalW
		const remaining = tableWidth - fixedUsed
		const compTotalW = Math.min(compCount * 16, remaining * 0.35)
		const compW = compCount > 0 ? compTotalW / compCount : 0
		const afterComp = remaining - compTotalW
		const nameW = Math.max(nameMinW, afterComp * 0.6)
		const wordsW = Math.max(wordsMinW, afterComp * 0.4)

		const headRow = ['S.No', 'Reg No', 'Name of the Student']
		data.components.forEach(c => headRow.push(`${c.name}\n(${c.max_marks})`))
		headRow.push('Total', 'Marks in Words')

		const bodyRows = data.learners.map(l => {
			const row: (string | number)[] = [l.serial_number, l.register_number, l.student_name]
			data.components.forEach(c => { const m = l.component_marks[c.code]; row.push(m != null ? m : 0) })
			row.push(l.total)
			row.push(numberToWords(l.total))
			return row
		})

		const columnStyles: Record<number, any> = { 0: { cellWidth: snoW, halign: 'center' }, 1: { cellWidth: regW, halign: 'center' }, 2: { cellWidth: nameW } }
		data.components.forEach((_, i) => { columnStyles[3 + i] = { cellWidth: compW, halign: 'center' } })
		columnStyles[3 + compCount] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' }
		columnStyles[4 + compCount] = { cellWidth: wordsW }

		autoTableModule.default(doc, {
			head: [headRow], body: bodyRows, startY: currentY,
			margin: { left: MARGIN, right: MARGIN }, tableWidth,
			theme: 'grid',
			styles: { font: 'times', fontSize: 10, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0], valign: 'middle', minCellHeight: 8, overflow: 'linebreak' },
			headStyles: { font: 'times', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center', fontSize: 10, minCellHeight: 10 },
			columnStyles,
			didDrawPage: (hookData: any) => {
				doc.setFont('times', 'normal'); doc.setFontSize(7); doc.setTextColor(128, 128, 128)
				doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, pageHeight - 6)
				doc.text(`Page ${hookData.pageNumber}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' })
				doc.setTextColor(0, 0, 0)
			},
		})

		// ── SUMMARY + SIGNATURES ──
		const finalY = (doc as any).lastAutoTable?.finalY || currentY + 50
		currentY = finalY + 6
		if (currentY + 35 > pageHeight - 12) { doc.addPage(); currentY = MARGIN }

		doc.setFont('times', 'bold'); doc.setFontSize(9)
		// Option B: every learner row counts as entered (missing components → 0).
		doc.text(`Total Learners: ${data.learners.length}    Marks Entered: ${data.learners.length}    Pending: 0`, MARGIN, currentY)
		currentY += 14

		const sigWidth = tableWidth / 3
		const sigLabels = ['Signature of the Subject In-Charge', 'Signature of the HOD', 'Signature of the Principal']
		doc.setFont('times', 'normal'); doc.setFontSize(9)
		sigLabels.forEach((label, i) => {
			const cx = MARGIN + (i * sigWidth) + sigWidth / 2
			doc.setDrawColor(0, 0, 0)
			doc.line(MARGIN + (i * sigWidth) + 8, currentY, MARGIN + ((i + 1) * sigWidth) - 8, currentY)
			doc.text(label, cx, currentY + 5, { align: 'center' })
		})
	})

	const fileName = `internal_marks_report_${withMarks[0].cia_round_name}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}
