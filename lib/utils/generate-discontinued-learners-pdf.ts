import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DiscontinuedLearnerRow } from '@/types/discontinued-learners'

/**
 * Discontinued Learners list - A4 portrait, one section per programme (each on
 * a fresh page, sorted by register number) and a programme-wise summary with
 * the grand total at the end. Plain list: no institution letterhead.
 */

export interface DiscontinuedLearnersPdfOptions {
	current_session_name: string
	current_session_code: string
	data: DiscontinuedLearnerRow[]
}

const REPORT_TITLE = 'DISCONTINUED LEARNERS LIST'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function toRoman(n: number | null): string { return n ? (ROMAN[n] || String(n)) : '-' }

/** Draws the page title and returns the y just below it */
function drawHeader(doc: jsPDF, pageWidth: number, margin: number, opts: DiscontinuedLearnersPdfOptions): number {
	doc.setTextColor(0, 0, 0)
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.text(`${REPORT_TITLE} - ${opts.current_session_name}`, pageWidth / 2, margin + 4, { align: 'center' })
	return headerBottom(margin)
}

/** Where drawHeader ends, so the table margin can be set before a page exists */
function headerBottom(margin: number): number {
	return margin + 7
}

export function generateDiscontinuedLearnersPdf(opts: DiscontinuedLearnersPdfOptions): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8
	const tableTop = headerBottom(margin) + 7

	// ── Group by programme, keeping the order the report arrived in ──
	const groups = new Map<string, { code: string; name: string | null; rows: DiscontinuedLearnerRow[] }>()
	for (const row of opts.data) {
		const code = row.program_code || 'NOT MAPPED'
		if (!groups.has(code)) groups.set(code, { code, name: row.program_name, rows: [] })
		groups.get(code)!.rows.push(row)
	}
	for (const group of groups.values()) {
		group.rows.sort((a, b) => a.register_number.localeCompare(b.register_number))
	}

	const tableStyles = {
		font: 'times',
		fontSize: 8,
		cellPadding: 1.3,
		lineColor: [0, 0, 0] as [number, number, number],
		lineWidth: 0.2,
		textColor: [0, 0, 0] as [number, number, number],
		valign: 'middle' as const,
	}
	const headStyles = {
		fillColor: [255, 255, 255] as [number, number, number],
		textColor: [0, 0, 0] as [number, number, number],
		fontStyle: 'bold' as const,
		halign: 'center' as const,
		lineColor: [0, 0, 0] as [number, number, number],
		lineWidth: 0.2,
	}

	let first = true
	for (const group of groups.values()) {
		if (!first) doc.addPage()
		first = false

		autoTable(doc, {
			startY: tableTop,
			margin: { top: tableTop, left: margin, right: margin, bottom: margin + 8 },
			theme: 'grid',
			styles: tableStyles,
			headStyles,
			head: [[
				'S.No',
				'Register No',
				'Name of the Learner',
				'Batch',
				'Previous\nAttended\nSemester',
				'Previous\nPapers',
				'Pending\nArrears',
				'Current Session Status',
			]],
			body: group.rows.map((r, i) => [
				String(i + 1),
				r.register_number,
				r.student_name,
				r.batch_year ? String(r.batch_year) : '-',
				toRoman(r.previous_semester),
				String(r.previous_papers),
				r.pending_arrears > 0 ? String(r.pending_arrears) : '-',
				r.current_status,
			]),
			columnStyles: {
				0: { cellWidth: 9, halign: 'center' },
				1: { cellWidth: 27, halign: 'center' },
				2: { cellWidth: 60, halign: 'left' },
				3: { cellWidth: 13, halign: 'center' },
				4: { cellWidth: 16, halign: 'center' },
				5: { cellWidth: 14, halign: 'center' },
				6: { cellWidth: 14, halign: 'center' },
				7: { cellWidth: 41, halign: 'left' },
			},
			didDrawPage: () => {
				const y = drawHeader(doc, pageWidth, margin, opts)
				doc.setFont('times', 'bold')
				doc.setFontSize(9.5)
				doc.text(`Program : ${group.code}${group.name ? ` - ${group.name}` : ''}`, margin, y + 3)
				doc.text(`Total : ${group.rows.length}`, pageWidth - margin, y + 3, { align: 'right' })
			},
		})
	}

	// ── Programme-wise summary + grand total ──
	if (groups.size > 0) {
		doc.addPage()
		autoTable(doc, {
			startY: tableTop,
			margin: { top: tableTop, left: margin + 25, right: margin + 25, bottom: margin + 8 },
			theme: 'grid',
			styles: { ...tableStyles, fontSize: 9 },
			headStyles,
			head: [['S.No', 'Program Code', 'Program Name', 'Discontinued Learners']],
			body: [...groups.values()].map((g, i) => [String(i + 1), g.code, g.name || '', String(g.rows.length)]),
			foot: [['', '', 'GRAND TOTAL', String(opts.data.length)]],
			footStyles: { ...headStyles, halign: 'center' },
			showFoot: 'lastPage',
			columnStyles: {
				0: { cellWidth: 12, halign: 'center' },
				1: { cellWidth: 28, halign: 'center' },
				2: { halign: 'left' },
				3: { cellWidth: 32, halign: 'center' },
			},
			didDrawPage: () => {
				const y = drawHeader(doc, pageWidth, margin, opts)
				doc.setFont('times', 'bold')
				doc.setFontSize(9.5)
				doc.text('PROGRAM WISE SUMMARY', pageWidth / 2, y + 3, { align: 'center' })
			},
		})

		const endY = (doc as any).lastAutoTable?.finalY ?? tableTop
		if (endY + 28 < pageHeight - margin - 8) {
			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			doc.text('Controller of Examinations', pageWidth - margin - 25, endY + 26, { align: 'right' })
		}
	}

	// ── Footer ──
	const totalPages = doc.getNumberOfPages()
	const now = new Date()
	const generated = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
	for (let p = 1; p <= totalPages; p++) {
		doc.setPage(p)
		doc.setFont('times', 'normal')
		doc.setFontSize(7)
		doc.setTextColor(100, 100, 100)
		doc.text(`Generated: ${generated}`, margin, pageHeight - margin)
		doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - margin, { align: 'right' })
		doc.setTextColor(0, 0, 0)
	}

	const filename = `discontinued-learners-${opts.current_session_code}-${now.toISOString().slice(0, 10)}.pdf`
	doc.save(filename)
	return filename
}
