import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawCvReportHeader, drawCvReportFooter, todayDateStr } from './generate-cv-report-header'

export interface CvPassPercentageInput {
	institution: { name: string; code: string }
	session: { name: string; code: string }
	board: { code: string; name: string }
	rows: Array<{
		semester: number | string
		course_code: string
		course_name: string
		total_students: number
		appeared: number
		passed: number
		pass_percentage: number
	}>
	logoLeft?: string | null
	logoRight?: string | null
}

export async function downloadCvPassPercentagePdf(input: CvPassPercentageInput): Promise<void> {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 8

	const subtitle = `${input.board.name.toUpperCase()} DEGREE EXAMINATIONS\n${input.session.name.toUpperCase()}`

	let y = drawCvReportHeader({
		doc,
		pageWidth,
		startY: margin,
		margin,
		logoLeft: input.logoLeft,
		logoRight: input.logoRight,
		sessionName: input.session.name,
		reportTitle: 'PASS PERCENTAGE REPORT OF',
		subtitle,
		dateText: todayDateStr(),
	})

	const totals = input.rows.reduce(
		(acc, r) => ({
			total: acc.total + (r.total_students || 0),
			appeared: acc.appeared + (r.appeared || 0),
			passed: acc.passed + (r.passed || 0),
		}),
		{ total: 0, appeared: 0, passed: 0 }
	)
	const totalPct = totals.appeared > 0 ? Math.round((totals.passed / totals.appeared) * 1000) / 10 : 0

	const head = [
		[
			{ content: 'Semester', rowSpan: 2 },
			{ content: 'Course Code', rowSpan: 2 },
			{ content: 'Name of the Course', rowSpan: 2 },
			{ content: 'Total Students', rowSpan: 2 },
			{ content: 'Students Strength', colSpan: 3 },
		],
		['Appeared', 'Passed', 'Pass %'],
	]

	const body = input.rows.map(r => [
		String(r.semester ?? ''),
		r.course_code,
		r.course_name,
		String(r.total_students),
		String(r.appeared),
		String(r.passed),
		`${r.pass_percentage}%`,
	])
	body.push([
		{ content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } } as any,
		{ content: String(totals.total), styles: { fontStyle: 'bold' } } as any,
		{ content: String(totals.appeared), styles: { fontStyle: 'bold' } } as any,
		{ content: String(totals.passed), styles: { fontStyle: 'bold' } } as any,
		{ content: `${totalPct}%`, styles: { fontStyle: 'bold' } } as any,
	])

	autoTable(doc, {
		startY: y + 2,
		head: head as any,
		body,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 1.5 },
		headStyles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center', valign: 'middle' },
		columnStyles: {
			0: { halign: 'center', cellWidth: 20 },
			1: { halign: 'center', cellWidth: 26 },
			2: { halign: 'left' },
			3: { halign: 'center', cellWidth: 22 },
			4: { halign: 'center', cellWidth: 20 },
			5: { halign: 'center', cellWidth: 20 },
			6: { halign: 'center', cellWidth: 20 },
		},
		margin: { left: margin, right: margin },
	})

	const finalY = (doc as any).lastAutoTable.finalY + 8

	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text('Declaration by the Board of Examiners', margin, finalY)

	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	const declText = doc.splitTextToSize(
		'We, the members of the Board of Examiners, have verified and approved the above results and hereby recommend them for publication.',
		pageWidth - margin * 2
	)
	doc.text(declText, margin, finalY + 5)

	const sigY = finalY + 5 + declText.length * 5 + 16

	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	doc.text('Signature of the Chief(s)', margin, sigY)
	doc.text('Signature of the Examiners', pageWidth - margin, sigY, { align: 'right' })

	// Lines for signatures
	doc.line(margin, sigY - 2, margin + 70, sigY - 2)
	doc.line(pageWidth - margin - 70, sigY - 2, pageWidth - margin, sigY - 2)

	drawCvReportFooter(doc, pageWidth, pageHeight, margin, 1, 1)

	const fileName = `CV_PassPercentage_${input.board.code}_${input.session.code}_${new Date().toISOString().split('T')[0]}.pdf`
	const blob = doc.output('blob')
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	a.click()
	URL.revokeObjectURL(url)
}
