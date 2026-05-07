import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawCvReportHeader, drawCvReportFooter, todayDateStr } from './generate-cv-report-header'

export interface CvExaminerValuationRow {
	serial_number: number
	course_code: string
	bundle_no: string
	pocket_no: string
	papers_valued: number
	band_0_10: number
	band_11_20: number
	band_21_25: number
	band_26_29: number
	above_30: number
	pass_count: number
	fail_count: number
	cumulative_total: number
}

export interface CvExaminerValuationInput {
	institution: { name: string; code: string }
	session: { name: string; code: string }
	board: { code: string; name: string }
	data: {
		board_name: string
		examiner_name: string
		examiner_designation: string
		course_level?: 'UG' | 'PG'
		rows: CvExaminerValuationRow[]
		totals: CvExaminerValuationRow
	}
	logoLeft?: string | null
	logoRight?: string | null
}

export async function downloadCvExaminerValuationPdf(input: CvExaminerValuationInput): Promise<void> {
	try {
		console.log('[cv-examiner-valuation-pdf] Starting PDF generation')
		const doc = new jsPDF('landscape', 'mm', 'a4')
		const pageWidth = doc.internal.pageSize.getWidth()
		const pageHeight = doc.internal.pageSize.getHeight()
		const margin = 8

		const level = input.data.course_level === 'PG' ? 'PG' : 'UG'
		const subtitle = `${level}-Valuation Report of the Examiner — ${input.data.board_name}`

		let y = drawCvReportHeader({
			doc,
			pageWidth,
			startY: margin,
			margin,
			logoLeft: input.logoLeft,
			logoRight: input.logoRight,
			sessionName: input.session.name,
			reportTitle: `${level}-VALUATION REPORT OF THE EXAMINER`,
			subtitle,
			dateText: todayDateStr(),
		})
		console.log('[cv-examiner-valuation-pdf] Header drawn at y:', y)

		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(`Name of the Board: ${input.data.board_name}`, margin, y + 2)
		doc.text(`Name of the Examiner: ${input.data.examiner_name}${input.data.examiner_designation ? ', ' + input.data.examiner_designation : ''}`, margin, y + 7)
		y += 12

		const isPG = level === 'PG'
		const head = [[
			'S.No',
			'Course Code',
			'Bundle No.',
			'Pocket No.',
			'No. of papers valued',
			'0-10 marks',
			'11-20 marks',
			isPG ? '21 to 30 marks' : '21 to 25 marks',
			isPG ? '31-39 marks' : '26-29 marks',
			isPG ? 'Above 40' : 'Above 30',
			'No. of Pass',
			'No. of Fail',
			'Cumulative Total',
		]]

		const body: any[] = input.data.rows.map(r => [
			String(r.serial_number ?? ''),
			String(r.course_code ?? ''),
			String(r.bundle_no ?? ''),
			String(r.pocket_no ?? ''),
			String(r.papers_valued ?? 0),
			r.band_0_10 ? String(r.band_0_10) : '-',
			r.band_11_20 ? String(r.band_11_20) : '-',
			r.band_21_25 ? String(r.band_21_25) : '-',
			r.band_26_29 ? String(r.band_26_29) : '-',
			r.above_30 ? String(r.above_30) : '-',
			String(r.pass_count ?? 0),
			String(r.fail_count ?? 0),
			String(r.cumulative_total ?? 0),
		])

		body.push([
			{ content: 'Grand total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
			{ content: String(input.data.totals.papers_valued), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.band_0_10 || '-'), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.band_11_20 || '-'), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.band_21_25 || '-'), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.band_26_29 || '-'), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.above_30 || '-'), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.pass_count), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.fail_count), styles: { fontStyle: 'bold' } },
			{ content: String(input.data.totals.cumulative_total), styles: { fontStyle: 'bold' } },
		])

		console.log('[cv-examiner-valuation-pdf] Creating table with', body.length, 'rows')
		autoTable(doc, {
			startY: y,
			head: [head[0]] as any,
			body,
			theme: 'grid',
			styles: { font: 'times', fontSize: 8.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 1.2, halign: 'center', valign: 'middle' },
			headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center', valign: 'middle', minCellHeight: 12 },
			margin: { left: margin, right: margin },
		})
		console.log('[cv-examiner-valuation-pdf] Table rendered')

		const finalY = (doc as any).lastAutoTable.finalY + 18

		const colWidth = (pageWidth - margin * 2) / 3
		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text('Name & Signature of the Examiner', margin + colWidth / 2, finalY, { align: 'center' })
		doc.text('Name & Signature of the Chief', margin + colWidth + colWidth / 2, finalY, { align: 'center' })
		doc.text('Signature of the CoE\nController of Examinations', margin + colWidth * 2 + colWidth / 2, finalY, { align: 'center' })

		drawCvReportFooter(doc, pageWidth, pageHeight, margin, 1, 1)
		console.log('[cv-examiner-valuation-pdf] Footer drawn')

		const fileName = `CV_ExaminerValuation_${input.board.code}_${(input.data.examiner_name || 'examiner').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
		const blob = doc.output('blob')
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = fileName
		a.click()
		URL.revokeObjectURL(url)
	} catch (error: any) {
		console.error('[cv-examiner-valuation-pdf] Error:', error)
		throw error
	}
}
