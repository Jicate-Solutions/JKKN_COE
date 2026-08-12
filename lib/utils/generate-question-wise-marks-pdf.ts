import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
// Digit-by-digit words ("28" → "TWO EIGHT") — shared converter, see service file.
import { numberToWords } from '@/services/post-exam/external-mark-entry-service'
import { getProgramDisplayName } from './program-name-mapper'

/**
 * Question-wise CIA mark sheet — A4 LANDSCAPE.
 *
 * One column per question from the round's question paper (ia_question_papers),
 * carrying its part, marks, course outcome and Bloom's level, then the component
 * total the questions add up to. A question a learner was never allowed to answer
 * (the unused half of an OR pair) prints "—" rather than a misleading 0.
 */

export interface QuestionWisePDFQuestion {
	id: string
	label: string                  // "6a"
	part_label: string | null      // "B"
	marks: number
	co_code: string | null         // "CO2"
	k_level: string | null         // "K3"
	is_choice_alternative: boolean
}

export interface QuestionWisePDFLearner {
	serial_number: number
	register_number: string
	student_name: string
	/** question id → mark; a missing key prints "—" (not answered / not allowed) */
	question_marks: Record<string, number | undefined>
	component_total: number
	total: number
}

export interface QuestionWisePDFData {
	institution_name: string
	institution_subtitle?: string
	institution_trust_line?: string
	institution_accreditation?: string
	institution_address?: string
	program_code: string
	program_name: string
	semester: number | string
	course_code: string
	course_name: string
	exam_session: string
	assessment_name: string
	cia_round_name: string
	paper_set_label?: string | null
	component_name: string
	component_max: number
	questions: QuestionWisePDFQuestion[]
	learners: QuestionWisePDFLearner[]
	logoImage?: string
	rightLogoImage?: string
}

// A4 landscape
const PAGE_WIDTH = 297
const PAGE_HEIGHT = 210
const MARGIN = 8

export function generateQuestionWiseMarksPDF(data: QuestionWisePDFData): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const tableWidth = PAGE_WIDTH - MARGIN * 2
	let currentY = MARGIN

	// ========== HEADER ==========
	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, 'PNG', MARGIN, currentY, 15, 15) } catch { /* logo optional */ }
	}
	if (data.logoImage) {
		try { doc.addImage(data.logoImage, 'PNG', PAGE_WIDTH - MARGIN - 15, currentY, 15, 15) } catch { /* logo optional */ }
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text((data.institution_name || 'J.K.K.NATARAJA EDUCATIONAL INSTITUTIONS').toUpperCase(), PAGE_WIDTH / 2, currentY + 4, { align: 'center' })

	let lineY = currentY + 9
	if (data.institution_subtitle) {
		doc.setFont('times', 'italic'); doc.setFontSize(9)
		doc.text(data.institution_subtitle, PAGE_WIDTH / 2, lineY, { align: 'center' }); lineY += 4
	}
	if (data.institution_trust_line) {
		doc.setFont('times', 'italic'); doc.setFontSize(8)
		doc.text(data.institution_trust_line, PAGE_WIDTH / 2, lineY, { align: 'center' }); lineY += 4
	}
	if (data.institution_accreditation) {
		doc.setFont('times', 'normal'); doc.setFontSize(8)
		doc.text(data.institution_accreditation, PAGE_WIDTH / 2, lineY, { align: 'center' }); lineY += 4
	}
	if (data.institution_address) {
		doc.setFont('times', 'bold'); doc.setFontSize(9)
		doc.text(data.institution_address, PAGE_WIDTH / 2, lineY, { align: 'center' }); lineY += 5
	}

	currentY = Math.max(currentY + 13, lineY)

	doc.setFont('times', 'bold'); doc.setFontSize(11)
	doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, PAGE_WIDTH / 2, currentY, { align: 'center' })
	currentY += 5
	doc.text('QUESTION-WISE INTERNAL MARK SHEET', PAGE_WIDTH / 2, currentY, { align: 'center' })
	currentY += 5

	doc.setFont('times', 'normal'); doc.setFontSize(9)
	const setSuffix = data.paper_set_label ? ` — Set ${data.paper_set_label}` : ''
	doc.text(`${data.assessment_name} — ${data.cia_round_name}${setSuffix}`, PAGE_WIDTH / 2, currentY, { align: 'center' })
	currentY += 6

	// ========== COURSE DETAILS ==========
	doc.setFont('times', 'bold'); doc.setFontSize(9)
	const displayProgramName = getProgramDisplayName(data.program_code, data.program_name)
	doc.text(`Program: ${data.program_code} - ${displayProgramName}`, MARGIN, currentY)
	doc.text(`Semester: ${data.semester}`, PAGE_WIDTH - MARGIN, currentY, { align: 'right' })
	currentY += 4.5

	doc.setFont('times', 'normal')
	doc.text(`Course: ${data.course_code} - ${data.course_name}`, MARGIN, currentY)
	doc.text(`${data.component_name} Max: ${data.component_max}`, PAGE_WIDTH - MARGIN, currentY, { align: 'right' })
	currentY += 6

	// ========== TABLE ==========
	const qCount = data.questions.length
	const snoW = 8
	const regW = 26
	const compW = 14
	const totalW = 12

	// Name and words give up their space first when there are many questions
	const fixed = snoW + regW + compW + totalW
	let nameW = 42
	let wordsW = 26
	let perQ = (tableWidth - fixed - nameW - wordsW) / Math.max(qCount, 1)
	if (perQ < 9) {
		nameW = 32
		wordsW = 20
		perQ = (tableWidth - fixed - nameW - wordsW) / Math.max(qCount, 1)
	}
	// Below this the sheet stops being readable — shrink the font instead
	const bodyFontSize = perQ < 8 ? 7 : perQ < 10 ? 8 : 9
	perQ = Math.max(perQ, 6)

	// Header cell: part, question number, marks, and CO / Bloom's tags
	const headRow: string[] = ['S.No', 'Reg No', 'Name of the Learner']
	for (const q of data.questions) {
		const lines: string[] = []
		lines.push(`${q.part_label ? `${q.part_label} ` : ''}Q${q.label}${q.is_choice_alternative ? ' (OR)' : ''}`)
		lines.push(`(${q.marks})`)
		const tags = [q.co_code, q.k_level].filter(Boolean).join('/')
		if (tags) lines.push(tags)
		headRow.push(lines.join('\n'))
	}
	headRow.push(data.component_name, 'Total', 'Marks in Words')

	const bodyRows = data.learners.map(l => {
		const row: (string | number)[] = [l.serial_number, l.register_number, l.student_name]
		for (const q of data.questions) {
			const mark = l.question_marks[q.id]
			// A question this learner never answered (OR alternative) is not a zero
			row.push(mark == null ? '—' : mark)
		}
		row.push(l.component_total)
		row.push(l.total)
		row.push(numberToWords(l.total))
		return row
	})

	const columnStyles: Record<number, any> = {
		0: { cellWidth: snoW, halign: 'center' },
		1: { cellWidth: regW, halign: 'center' },
		2: { cellWidth: nameW, halign: 'left' },
	}
	data.questions.forEach((_, i) => {
		columnStyles[3 + i] = { cellWidth: perQ, halign: 'center' }
	})
	columnStyles[3 + qCount] = { cellWidth: compW, halign: 'center', fontStyle: 'bold' }
	columnStyles[4 + qCount] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' }
	columnStyles[5 + qCount] = { cellWidth: wordsW, halign: 'left' }

	autoTable(doc, {
		head: [headRow],
		body: bodyRows,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: bodyFontSize,
			cellPadding: 1.2,
			lineColor: [0, 0, 0],
			lineWidth: 0.25,
			textColor: [0, 0, 0],
			valign: 'middle',
			minCellHeight: 6,
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fillColor: [235, 235, 235],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'middle',
			fontSize: Math.max(bodyFontSize - 1, 6),
			minCellHeight: 12,
		},
		columnStyles,
		didDrawPage: (hookData) => {
			const footerY = PAGE_HEIGHT - 5
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(128, 128, 128)
			doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, footerY)
			doc.text('— = question not attempted / OR alternative not applicable', PAGE_WIDTH / 2, footerY, { align: 'center' })
			doc.text(`Page ${hookData.pageNumber}`, PAGE_WIDTH - MARGIN, footerY, { align: 'right' })
			doc.setTextColor(0, 0, 0)
		},
	})

	// ========== SUMMARY + SIGNATURES ==========
	let finalY = (doc as any).lastAutoTable?.finalY || currentY + 50
	finalY += 6
	if (finalY + 26 > PAGE_HEIGHT - 10) {
		doc.addPage()
		finalY = MARGIN + 4
	}

	const entered = data.learners.filter(l => Object.keys(l.question_marks).length > 0).length
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text(
		`Total Learners: ${data.learners.length}    Marks Entered: ${entered}    Pending: ${data.learners.length - entered}    Questions: ${qCount}`,
		MARGIN,
		finalY
	)
	finalY += 14

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
		doc.setDrawColor(0, 0, 0)
		doc.line(MARGIN + (i * sigWidth) + 10, finalY, MARGIN + ((i + 1) * sigWidth) - 10, finalY)
		doc.text(label, centerX, finalY + 5, { align: 'center' })
	})

	const fileName = `${data.course_code}_${data.cia_round_name}_question_wise_marks_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}
