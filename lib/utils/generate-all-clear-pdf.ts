import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─────────────────────────────────────────────────────────────
// All Clear Report PDF
// Matches the Pass Percentage Report letterhead / signatures / footer.
// ─────────────────────────────────────────────────────────────

export interface AllClearSemesterRow {
	semester: number
	total_learners: number
	all_clear: number
	all_clear_pct: number
	regular_total: number
	regular_all_clear: number
	regular_all_clear_pct: number
}

export interface AllClearReportData {
	institution: { id: string; name: string; code: string }
	session: { id: string; name: string; code: string; exam_type_name: string }
	program: { program_code: string; program_name: string }
	summary: {
		total_learners: number
		all_clear: number
		all_clear_pct: number
		regular_total: number
		regular_all_clear: number
		regular_all_clear_pct: number
	}
	semesters: AllClearSemesterRow[]
	generated_at: string
}

export type AllClearViewMode = 'program' | 'program_semester' | 'regular'

interface AllClearPdfOptions {
	reports: AllClearReportData[]
	viewMode: AllClearViewMode
	logoImage?: string
	rightLogoImage?: string
}

const MODE_TITLE: Record<AllClearViewMode, string> = {
	program: 'ALL CLEAR REPORT (PROGRAMME-WISE)',
	program_semester: 'ALL CLEAR REPORT (PROGRAMME & SEMESTER-WISE)',
	regular: 'REGULAR PAPER ALL CLEAR REPORT',
}

const margin = 10

// 1 → I, 2 → II, 3 → III …
function toRoman(n: number): string {
	if (!n || n < 1) return String(n)
	const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
	let r = ''
	let num = n
	for (const [v, s] of map) {
		while (num >= v) { r += s; num -= v }
	}
	return r
}

// ─── Shared letterhead ───────────────────────────────────────
function addHeader(
	doc: jsPDF,
	report: AllClearReportData,
	title: string,
	logoImage?: string,
	rightLogoImage?: string
): number {
	const pageWidth = doc.internal.pageSize.getWidth()
	let currentY = margin

	if (logoImage) {
		try { doc.addImage(logoImage, 'PNG', margin, currentY, 16, 16) } catch { /* ignore */ }
	}
	if (rightLogoImage) {
		try { doc.addImage(rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16) } catch { /* ignore */ }
	}

	const textLeft = margin + 17
	const textRight = pageWidth - margin - 17
	const textCenter = pageWidth / 2
	const textMaxWidth = textRight - textLeft

	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', textCenter, currentY + 4, { align: 'center', maxWidth: textMaxWidth })

	doc.setFont('times', 'italic')
	doc.setFontSize(6.5)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', textCenter, currentY + 8.5, { align: 'center', maxWidth: textMaxWidth })

	currentY += 12

	doc.setFont('times', 'bolditalic')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', textCenter, currentY, { align: 'center' })

	currentY += 6

	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	const titleLines = doc.splitTextToSize(title, pageWidth - 2 * margin)
	doc.text(titleLines, textCenter, currentY, { align: 'center' })
	currentY += titleLines.length * 5

	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`${(report.session.exam_type_name || 'SEMESTER EXAMINATION').toUpperCase()} - ${report.session.name}`, textCenter, currentY, { align: 'center' })
	currentY += 7

	return currentY
}

// ─── Signatures (official 4-column, same as Pass % report) ───
function addSignatures(doc: jsPDF, startY: number): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	let currentY = startY

	if (currentY > pageHeight - 45) {
		doc.addPage()
		currentY = margin + 10
	}
	currentY += 20

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)

	const colWidth = (pageWidth - 2 * margin) / 4
	const signatures = [
		'Signature of the\nBoard Chairman',
		'Signature of the\nCoE',
		'Signature of the\nPrincipal',
		'Signature of the\nUniversity Nominee',
	]
	signatures.forEach((sig, i) => {
		const x = margin + colWidth * i + colWidth / 2
		sig.split('\n').forEach((line, lineIdx) => {
			doc.text(line, x, currentY + lineIdx * 4, { align: 'center' })
		})
	})
}

function addFooter(doc: jsPDF, generatedAt: string): void {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const totalPages = doc.getNumberOfPages()
	const dateStr = new Date(generatedAt).toLocaleDateString()
	const timeStr = new Date(generatedAt).toLocaleTimeString()

	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.setTextColor(0, 0, 0)
		doc.text(`Generated: ${dateStr} ${timeStr}`, margin, pageHeight - 8)
		doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
	}
}

const tableStyles = {
	styles: {
		font: 'times' as const,
		fontSize: 9,
		textColor: [0, 0, 0] as [number, number, number],
		cellPadding: 2,
		lineWidth: 0.2,
		lineColor: [0, 0, 0] as [number, number, number],
		fillColor: [255, 255, 255] as [number, number, number],
	},
	headStyles: {
		fillColor: [255, 255, 255] as [number, number, number],
		textColor: [0, 0, 0] as [number, number, number],
		fontStyle: 'bold' as const,
		halign: 'center' as const,
		fontSize: 10,
		lineWidth: 0.2,
		lineColor: [0, 0, 0] as [number, number, number],
	},
}

// ─── Programme-wise & Regular: one table, one row per programme ──
function renderProgrammeTable(
	doc: jsPDF,
	reports: AllClearReportData[],
	viewMode: AllClearViewMode,
	startY: number
): number {
	const pageWidth = doc.internal.pageSize.getWidth()
	const regular = viewMode === 'regular'

	const body = reports.map((r, i) => regular
		? [String(i + 1), r.program.program_code, r.program.program_name, String(r.summary.regular_total), String(r.summary.regular_all_clear), String(r.summary.regular_all_clear_pct)]
		: [String(i + 1), r.program.program_code, r.program.program_name, String(r.summary.total_learners), String(r.summary.all_clear), String(r.summary.all_clear_pct)]
	)

	// Grand total row
	const gTotal = reports.reduce((a, r) => {
		a.total += regular ? r.summary.regular_total : r.summary.total_learners
		a.clear += regular ? r.summary.regular_all_clear : r.summary.all_clear
		return a
	}, { total: 0, clear: 0 })
	const gPct = gTotal.total > 0 ? Math.round((gTotal.clear / gTotal.total) * 100) : 0
	body.push(['', '', 'Grand Total', String(gTotal.total), String(gTotal.clear), String(gPct)])

	autoTable(doc, {
		startY,
		head: [[
			'S.No',
			'Code',
			'Name of the Programme',
			'No. of Students\nRegistered',
			'No. of Students\nPassed',
			regular ? 'Pass %' : 'All Clear %',
		]],
		body,
		margin: { left: margin, right: margin },
		...tableStyles,
		columnStyles: {
			0: { halign: 'center', cellWidth: 14 },
			1: { halign: 'center', cellWidth: 24 },
			2: { halign: 'left' },
			3: { halign: 'center', cellWidth: 28 },
			4: { halign: 'center', cellWidth: 26 },
			5: { halign: 'center', cellWidth: 26 },
		},
		didParseCell: (data) => {
			if (data.section === 'body' && data.row.index === body.length - 1) {
				data.cell.styles.fontStyle = 'bold'
			}
		},
		theme: 'grid',
	})

	return (doc as any).lastAutoTable.finalY + 5
}

// 1 → Year I, 3 → Year II … (Sem 1&2 → Year I, 3&4 → Year II)
function yearLabel(sem: number): string {
	return `Year ${toRoman(Math.ceil(sem / 2))} (Sem ${toRoman(sem)})`
}

// ─── Regular Paper All Clear: one row per programme × year/semester ──
function renderRegularSemesterTable(
	doc: jsPDF,
	reports: AllClearReportData[],
	startY: number
): number {
	const body: any[] = []

	reports.forEach((r, i) => {
		const sems = r.semesters.filter(s => s.regular_total > 0)

		if (sems.length === 0) {
			body.push([
				String(i + 1),
				r.program.program_code,
				r.program.program_name,
				'—',
				String(r.summary.regular_total),
				String(r.summary.regular_all_clear),
				String(r.summary.regular_all_clear_pct),
			])
			return
		}

		sems.forEach((s, si) => {
			if (si === 0) {
				body.push([
					{ content: String(i + 1), rowSpan: sems.length, styles: { valign: 'middle', halign: 'center' } },
					{ content: r.program.program_code, rowSpan: sems.length, styles: { valign: 'middle', halign: 'center' } },
					{ content: r.program.program_name, rowSpan: sems.length, styles: { valign: 'middle', halign: 'left' } },
					yearLabel(s.semester),
					String(s.regular_total),
					String(s.regular_all_clear),
					String(s.regular_all_clear_pct),
				])
			} else {
				body.push([
					yearLabel(s.semester),
					String(s.regular_total),
					String(s.regular_all_clear),
					String(s.regular_all_clear_pct),
				])
			}
		})
	})

	// Grand total row
	const gTotal = reports.reduce((a, r) => {
		a.total += r.summary.regular_total
		a.clear += r.summary.regular_all_clear
		return a
	}, { total: 0, clear: 0 })
	const gPct = gTotal.total > 0 ? Math.round((gTotal.clear / gTotal.total) * 100) : 0
	body.push([
		{ content: 'Grand Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
		{ content: String(gTotal.total), styles: { fontStyle: 'bold' } },
		{ content: String(gTotal.clear), styles: { fontStyle: 'bold' } },
		{ content: String(gPct), styles: { fontStyle: 'bold' } },
	])

	autoTable(doc, {
		startY,
		head: [[
			'S.No',
			'Code',
			'Name of the Programme',
			'Year',
			'No. of Students\nRegistered',
			'No. of Students\nPassed',
			'Pass %',
		]],
		body,
		margin: { left: margin, right: margin },
		...tableStyles,
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 18 },
			2: { halign: 'left' },
			3: { halign: 'center', cellWidth: 34 },
			4: { halign: 'center', cellWidth: 26 },
			5: { halign: 'center', cellWidth: 24 },
			6: { halign: 'center', cellWidth: 18 },
		},
		theme: 'grid',
	})

	return (doc as any).lastAutoTable.finalY + 5
}

// ─── Programme & Semester-wise: per-programme block with sem rows ──
function renderProgrammeSemesterTables(
	doc: jsPDF,
	reports: AllClearReportData[],
	title: string,
	logoImage: string | undefined,
	rightLogoImage: string | undefined,
	startY: number
): number {
	const pageHeight = doc.internal.pageSize.getHeight()
	let currentY = startY

	reports.forEach(r => {
		if (currentY > pageHeight - 50) {
			doc.addPage()
			currentY = addHeader(doc, r, title, logoImage, rightLogoImage)
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setTextColor(0, 0, 0)
		doc.text(`${r.program.program_name} (${r.program.program_code})`, margin, currentY)
		currentY += 2

		const body = r.semesters.map((s, i) => [
			String(i + 1),
			toRoman(s.semester),
			String(s.total_learners),
			String(s.all_clear),
			String(s.all_clear_pct),
		])
		body.push(['', 'Sub Total', String(r.summary.total_learners), String(r.summary.all_clear), String(r.summary.all_clear_pct)])

		autoTable(doc, {
			startY: currentY,
			head: [['S.No', 'Semester', 'No. of Students Registered', 'No. of Students Passed', 'All Clear %']],
			body,
			margin: { left: margin, right: margin },
			...tableStyles,
			columnStyles: {
				0: { halign: 'center', cellWidth: 14 },
				1: { halign: 'center', cellWidth: 28 },
				2: { halign: 'center' },
				3: { halign: 'center' },
				4: { halign: 'center', cellWidth: 30 },
			},
			didParseCell: (data) => {
				if (data.section === 'body' && data.row.index === body.length - 1) {
					data.cell.styles.fontStyle = 'bold'
				}
			},
			theme: 'grid',
		})

		currentY = (doc as any).lastAutoTable.finalY + 6
	})

	return currentY
}

// ─── Main export ─────────────────────────────────────────────
export function generateAllClearPDF(options: AllClearPdfOptions): string {
	const { reports, viewMode, logoImage, rightLogoImage } = options
	if (reports.length === 0) throw new Error('No report data')

	const doc = new jsPDF('portrait', 'mm', 'a4')
	const title = MODE_TITLE[viewMode]

	let currentY = addHeader(doc, reports[0], title, logoImage, rightLogoImage)

	if (viewMode === 'program_semester') {
		currentY = renderProgrammeSemesterTables(doc, reports, title, logoImage, rightLogoImage, currentY)
	} else if (viewMode === 'regular') {
		currentY = renderRegularSemesterTable(doc, reports, currentY)
	} else {
		currentY = renderProgrammeTable(doc, reports, viewMode, currentY)
	}

	addSignatures(doc, currentY)
	addFooter(doc, reports[0].generated_at)

	const fileName = `all-clear-${viewMode}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(fileName)
	return fileName
}
