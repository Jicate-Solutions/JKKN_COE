import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawCvReportHeader, drawCvReportFooter, todayDateStr } from './generate-cv-report-header'

export interface CvPanelExaminerRow {
	serial_number: number
	examiner_name: string
	examiner_designation: string
	examiner_institution: string
	course_code: string
	bundle_no: string
	pocket_no: string
	papers_session: string
	cumulative_total: number
}

export interface CvPanelChief {
	chief_name: string
	chief_designation: string
	rows: CvPanelExaminerRow[]
}

export interface CvPanelOfExaminersInput {
	institution: { name: string; code: string }
	session: { name: string; code: string }
	board: { code: string; name: string }
	data: {
		board_name: string
		valuation_from_date: string | null
		valuation_to_date: string | null
		chiefs: CvPanelChief[]
	}
	logoLeft?: string | null
	logoRight?: string | null
}

export async function downloadCvPanelOfExaminersPdf(input: CvPanelOfExaminersInput): Promise<void> {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8

	const reportTitle = `${input.data.board_name} - Valuation - Panel of Examiners`
	const dateText = input.data.valuation_from_date && input.data.valuation_to_date
		? `${formatDate(input.data.valuation_from_date)} - ${formatDate(input.data.valuation_to_date)}`
		: todayDateStr()

	const head = [[
		'S.No',
		'Name of the Internal/External Examiner',
		'Course code',
		'Allocated Bundle No.',
		'Pocket No.',
		'No. of papers / session',
		'Cumulative total',
	]]

	const chiefs = input.data.chiefs || []
	const totalChiefs = chiefs.length

	for (let chiefIdx = 0; chiefIdx < totalChiefs; chiefIdx++) {
		const chief = chiefs[chiefIdx]

		// Add header for each chief
		let y = drawCvReportHeader({
			doc,
			pageWidth,
			startY: margin,
			margin,
			logoLeft: input.logoLeft,
			logoRight: input.logoRight,
			sessionName: input.session.name,
			reportTitle: reportTitle.toUpperCase(),
			subtitle: null,
			dateText,
		})

		// Chief name and designation
		if (chief.chief_name) {
			doc.setFont('times', 'bold')
			doc.setFontSize(10)
			const chiefLine = `Name of the Chief: ${chief.chief_name}${chief.chief_designation ? ', ' + chief.chief_designation : ''}`
			const lines = doc.splitTextToSize(chiefLine, pageWidth - margin * 2)
			doc.text(lines, margin, y + 2)
			y += 2 + lines.length * 5
		}

		// Valuation date
		if (input.data.valuation_from_date || input.data.valuation_to_date) {
			doc.setFont('times', 'normal')
			doc.setFontSize(10)
			const valuationLabel = input.data.valuation_from_date && input.data.valuation_to_date
				? `Valuation Date: ${formatDate(input.data.valuation_from_date)} - ${formatDate(input.data.valuation_to_date)}`
				: `Valuation Date: ${formatDate(input.data.valuation_from_date || input.data.valuation_to_date || '')}`
			doc.text(valuationLabel, margin, y + 2)
			y += 6
		} else {
			y += 2
		}

		// Build table body for this chief
		const body = chief.rows.map(r => [
			String(r.serial_number ?? ''),
			formatExaminerCell(r),
			String(r.course_code ?? ''),
			String(r.bundle_no ?? ''),
			String(r.pocket_no ?? ''),
			String(r.papers_session ?? ''),
			String(r.cumulative_total ?? ''),
		])

		autoTable(doc, {
			startY: y,
			head,
			body,
			theme: 'grid',
			styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 1.5, valign: 'middle' },
			headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center' },
			columnStyles: {
				0: { halign: 'center', cellWidth: 12 },
				1: { halign: 'left', cellWidth: 90 },
				2: { halign: 'center', cellWidth: 28 },
				3: { halign: 'center', cellWidth: 30 },
				4: { halign: 'center', cellWidth: 18 },
				5: { halign: 'center' },
				6: { halign: 'center', cellWidth: 28 },
			},
			margin: { left: margin, right: margin },
		})

		const finalY = (doc as any).lastAutoTable.finalY + 18

		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text('Signature of the Chairman', margin + 30, finalY, { align: 'center' })
		doc.text('Signature of the CoE', pageWidth - margin - 30, finalY, { align: 'center' })

		drawCvReportFooter(doc, pageWidth, pageHeight, margin, chiefIdx + 1, totalChiefs)

		// Add new page if not the last chief
		if (chiefIdx < totalChiefs - 1) {
			doc.addPage('landscape')
		}
	}

	const fileName = `CV_PanelOfExaminers_${input.board.code}_${input.session.code}_${new Date().toISOString().split('T')[0]}.pdf`
	const blob = doc.output('blob')
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	a.click()
	URL.revokeObjectURL(url)
}

function formatExaminerCell(r: CvPanelExaminerRow): string {
	const parts = [r.examiner_name]
	if (r.examiner_designation) parts.push(r.examiner_designation)
	if (r.examiner_institution) parts.push(r.examiner_institution)
	return parts.filter(Boolean).join(', ')
}

function formatDate(d: string): string {
	try {
		const date = new Date(d)
		if (isNaN(date.getTime())) return d
		return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
	} catch { return d }
}
