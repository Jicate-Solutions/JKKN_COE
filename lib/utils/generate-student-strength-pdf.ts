import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { StudentStrengthReport, ProgramStrengthRow, SubtotalRow, YearCount } from '@/types/student-strength-report'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function formatCount(n: number): string {
	return n === 0 ? '-' : String(n)
}


function programRowToTableRow(
	row: ProgramStrengthRow,
	maxYear: number,
	hasAided: boolean
): string[] {
	const cells: string[] = [String(row.s_no), `${row.program_code} - ${row.program_name}`]
	for (let y = 1; y <= maxYear; y++) {
		const yc = row.year_counts[y] || { aided: 0, sf: 0, total: 0 }
		if (hasAided) {
			cells.push(formatCount(yc.aided), formatCount(yc.sf), formatCount(yc.total))
		} else {
			cells.push(formatCount(yc.sf), formatCount(yc.total))
		}
	}
	return cells
}

function subtotalRowToTableRow(
	label: string,
	sub: SubtotalRow,
	maxYear: number,
	hasAided: boolean
): string[] {
	const cells: string[] = ['', label]
	for (let y = 1; y <= maxYear; y++) {
		const yc = sub.year_counts[y] || { aided: 0, sf: 0, total: 0 }
		if (hasAided) {
			cells.push(String(yc.aided), String(yc.sf), String(yc.total))
		} else {
			cells.push(String(yc.sf), String(yc.total))
		}
	}
	return cells
}

export function generateStudentStrengthPDF(
	report: StudentStrengthReport,
	logoImage?: string,
	rightLogoImage?: string
): Blob {
	const { has_aided, max_year, ug_rows, pg_rows, ug_subtotal, pg_subtotal, grand_total } = report

	// Portrait A4
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const margin = 10
	let currentY = 8

	// ── Header (matching hall ticket style) ─────────────────────────────────
	// Left logo
	if (logoImage) {
		try {
			doc.addImage(logoImage, 'PNG', margin, currentY, 16, 16)
		} catch { /* skip if logo fails */ }
	}
	// Right logo
	if (rightLogoImage) {
		try {
			doc.addImage(rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
		} catch { /* skip if logo fails */ }
	}

	// College name
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

	// Accreditation (2 lines matching hall ticket)
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

	// Address
	currentY += 13
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Report title
	doc.setFontSize(11)
	doc.text('STUDENT STRENGTH REPORT', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.text(`Exam Session: ${report.exam_session_name}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 4


	// ── Build table headers ──────────────────────────────────────────────────
	// Row 1 spans: S.NO | PROGRAMME NAME | I YEAR (spans cols) | II YEAR (spans cols) ...
	// Row 2: blank | blank | AIDED | SF | TOTAL | AIDED | SF | TOTAL ...
	const colsPerYear = has_aided ? 3 : 2 // AIDED+SF+TOTAL or SF+TOTAL

	const head1: Array<{ content: string; colSpan?: number; styles?: Record<string, unknown> }> = [
		{ content: 'S.NO', styles: { valign: 'middle' } },
		{ content: 'PROGRAMME CODE & NAME', styles: { valign: 'middle' } },
	]
	for (let y = 1; y <= max_year; y++) {
		head1.push({ content: `${ROMAN[y]} YEAR`, colSpan: colsPerYear })
	}

	const head2: string[] = ['', '']
	for (let y = 1; y <= max_year; y++) {
		if (has_aided) {
			head2.push('AIDED', 'SF', 'TOTAL')
		} else {
			head2.push('SF', 'TOTAL')
		}
	}

	// ── Build table body ─────────────────────────────────────────────────────
	const body: string[][] = []

	// UG label row
	body.push([{ content: 'UNDERGRADUATE PROGRAMMES', colSpan: 2 + max_year * colsPerYear, styles: { fontStyle: 'bold', fillColor: [210, 210, 210], textColor: [0, 0, 0] } } as unknown as string])

	for (const row of ug_rows) {
		body.push(programRowToTableRow(row, max_year, has_aided))
	}

	const ugSubRow = subtotalRowToTableRow('', ug_subtotal, max_year, has_aided)
	body.push(ugSubRow)

	// PG label row
	body.push([{ content: 'POSTGRADUATE PROGRAMMES', colSpan: 2 + max_year * colsPerYear, styles: { fontStyle: 'bold', fillColor: [210, 210, 210], textColor: [0, 0, 0] } } as unknown as string])

	for (const row of pg_rows) {
		body.push(programRowToTableRow(row, max_year, has_aided))
	}

	const pgSubRow = subtotalRowToTableRow('', pg_subtotal, max_year, has_aided)
	pgSubRow[1] = ''
	body.push(pgSubRow)

	// Summary rows
	const ugTotalRow = subtotalRowToTableRow('TOTAL UG STUDENTS', ug_subtotal, max_year, has_aided)
	ugTotalRow[0] = ''
	body.push(ugTotalRow)

	const pgTotalRow = subtotalRowToTableRow('TOTAL PG STUDENTS', pg_subtotal, max_year, has_aided)
	pgTotalRow[0] = ''
	body.push(pgTotalRow)

	const grandRow = subtotalRowToTableRow('GRAND TOTAL', grand_total, max_year, has_aided)
	grandRow[0] = ''
	body.push(grandRow)

	// ── Column widths ────────────────────────────────────────────────────────
	const contentWidth = pageWidth - 20 // 10mm margin each side
	const snoWidth = 10
	const nameWidth = 65 // wider to accommodate code + name
	const dataWidth = contentWidth - snoWidth - nameWidth
	const colWidth = dataWidth / (max_year * colsPerYear)

	const columnStyles: Record<number, { cellWidth: number; halign: string }> = {
		0: { cellWidth: snoWidth, halign: 'center' },
		1: { cellWidth: nameWidth, halign: 'left' },
	}
	for (let i = 2; i < 2 + max_year * colsPerYear; i++) {
		columnStyles[i] = { cellWidth: colWidth, halign: 'center' }
	}

	autoTable(doc, {
		startY: currentY + 3,
		head: [head1, head2],
		body,
		theme: 'grid',
		styles: {
			fontSize: 7,
			cellPadding: 1.5,
			overflow: 'linebreak',
			font: 'times',
			textColor: [0, 0, 0],
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
		},
		headStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			halign: 'center',
			valign: 'middle',
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
		},
		columnStyles,
		didParseCell: (data) => {
			// Bold subtotal and grand total rows
			const rowText = data.row.raw as unknown[]
			if (Array.isArray(rowText)) {
				// rowText[1] may be a colSpan object on section-label rows — guard before string ops
				const raw = rowText[1]
				const label = typeof raw === 'string' ? raw : ''
				if (label.includes('TOTAL') || label.includes('GRAND')) {
					data.cell.styles.fontStyle = 'bold'
					data.cell.styles.fillColor = [230, 230, 230]
				}
			}
		},
		margin: { left: 10, right: 10 },
	})

	return doc.output('blob')
}
