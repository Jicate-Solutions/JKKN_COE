import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PassPercentageReport } from '@/types/pass-percentage'

// UG degree types
const UG_DEGREES = 'BA / B.Sc / B.Com / B.Com CA / BBA / BCA DEGREE EXAMINATIONS'
// PG degree types
const PG_DEGREES = 'MA / M.Sc / M.Com / MCA / MBA DEGREE EXAMINATIONS'

interface PdfOptions {
	report: PassPercentageReport
	logoImage?: string
	rightLogoImage?: string
}

interface MultiBoardPdfOptions {
	reports: PassPercentageReport[]
	logoImage?: string
	rightLogoImage?: string
}

function buildReportTitle(report: PassPercentageReport): { title: string; degreeSubtitle: string } {
	if (report.report_type === 'board' && report.board) {
		const boardType = report.board.board_type?.toUpperCase() || 'UG'
		const boardName = report.board.board_name?.toUpperCase() || ''
		const title = `PASS PERCENTAGE REPORT OF ${boardType} ${boardName} BOARD`
		const degreeSubtitle = boardType === 'PG' ? `(${PG_DEGREES})` : `(${UG_DEGREES})`
		return { title, degreeSubtitle }
	}
	return {
		title: 'PASS PERCENTAGE REPORT',
		degreeSubtitle: ''
	}
}

function generatePdfContent(
	doc: jsPDF,
	report: PassPercentageReport,
	logoImage?: string,
	rightLogoImage?: string,
	isFirstBoard: boolean = true
) {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 10

	let currentY = margin

	const { title, degreeSubtitle } = buildReportTitle(report)

	// ─── HEADER ──────────────────────────────────────────
	const addHeader = () => {
		currentY = margin

		// College Logo (left side) - 16x16mm
		if (logoImage) {
			try {
				doc.addImage(logoImage, 'PNG', margin, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}

		// College Logo (right side) - 16x16mm
		if (rightLogoImage) {
			try {
				doc.addImage(rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		// Text area between logos: margin+17 to pageWidth-margin-17
		const textLeft = margin + 17
		const textRight = pageWidth - margin - 17
		const textCenter = pageWidth / 2
		const textMaxWidth = textRight - textLeft

		// Institution name — font 12 bold
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', textCenter, currentY + 4, { align: 'center', maxWidth: textMaxWidth })

		// Accreditation — font 6.5 italic (fits within logos)
		doc.setFont('times', 'italic')
		doc.setFontSize(6.5)
		doc.setTextColor(0, 0, 0)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', textCenter, currentY + 8.5, { align: 'center', maxWidth: textMaxWidth })

		currentY += 12

		// Address — font 9 bold italic
		doc.setFont('times', 'bolditalic')
		doc.setFontSize(9)
		doc.setTextColor(0, 0, 0)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', textCenter, currentY, { align: 'center' })

		currentY += 6

		// Report title — font 11 bold
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text(title, pageWidth / 2, currentY, { align: 'center' })
		currentY += 5

		// Degree subtitle (if board-wise)
		if (degreeSubtitle) {
			doc.setFont('times', 'normal')
			doc.setFontSize(9)
			doc.text(degreeSubtitle, pageWidth / 2, currentY, { align: 'center' })
			currentY += 5
		}

		// Session info
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(`SEMESTER EXAMINATION - ${report.session.name}`, pageWidth / 2, currentY, { align: 'center' })
		currentY += 7
	}

	// ─── COURSE TABLES ───────────────────────────────────
	addHeader()

	report.courses.forEach((course, courseIdx) => {
		// Check if we need a new page
		if (currentY > pageHeight - 50) {
			doc.addPage()
			addHeader()
		}

		// Course section header
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setTextColor(0, 0, 0)
		doc.text(`${course.course_name} (${course.course_code})`, margin, currentY)
		currentY += 2

		// Table data
		const tableData = course.programs.map(prog => [
			String(prog.semester),
			prog.program_name,
			String(prog.total_students),
			prog.appeared > 0 ? String(prog.appeared) : '-',
			String(prog.passed),
			String(prog.pass_percentage)
		])

		// Sub total
		const totalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
		const totalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
		const totalPas = course.programs.reduce((s, p) => s + p.passed, 0)
		const subPct = totalApp > 0 ? Math.round((totalPas / totalApp) * 100) : 0

		tableData.push(['', 'Sub Total', String(totalStu), String(totalApp), String(totalPas), String(subPct)])

		autoTable(doc, {
			startY: currentY,
			head: [[
				{ content: 'Semester', rowSpan: 2, styles: { valign: 'middle' } },
				{ content: 'Name of the Programme', rowSpan: 2, styles: { valign: 'middle' } },
				{ content: 'Students Strength', colSpan: 4, styles: { halign: 'center' } },
			], [
				'Total\nStudents',
				'Appeared',
				'Passed',
				'Pass %'
			]],
			body: tableData,
			margin: { left: margin, right: margin },
			styles: {
				font: 'times',
				fontSize: 9,
				textColor: [0, 0, 0],
				cellPadding: 2,
				lineWidth: 0.2,
				lineColor: [0, 0, 0],
				fillColor: [255, 255, 255],
			},
			headStyles: {
				fillColor: [255, 255, 255],
				textColor: [0, 0, 0],
				fontStyle: 'bold',
				halign: 'center',
				fontSize: 10,
				lineWidth: 0.2,
				lineColor: [0, 0, 0],
			},
			columnStyles: {
				0: { halign: 'center', cellWidth: 20 },
				1: { halign: 'left' },
				2: { halign: 'center', cellWidth: 25 },
				3: { halign: 'center', cellWidth: 25 },
				4: { halign: 'center', cellWidth: 22 },
				5: { halign: 'center', cellWidth: 22 },
			},
			didParseCell: (data) => {
				if (data.section === 'body' && data.row.index === tableData.length - 1) {
					data.cell.styles.fontStyle = 'bold'
				}
			},
			theme: 'grid',
		})

		currentY = (doc as any).lastAutoTable.finalY + 5
	})

	// ─── COURSE SUMMARY TABLE ────────────────────────────
	if (currentY > pageHeight - 60) {
		doc.addPage()
		addHeader()
	}

	currentY += 3
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.setTextColor(0, 0, 0)
	doc.text('COURSE-WISE SUMMARY', margin, currentY)
	currentY += 2

	const courseSummaryData = report.courses.map(course => {
		const cTotalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
		const cTotalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
		const cTotalPas = course.programs.reduce((s, p) => s + p.passed, 0)
		const cPct = cTotalApp > 0 ? Math.round((cTotalPas / cTotalApp) * 100) : 0
		return [
			String(course.semester),
			course.course_code,
			course.course_name,
			String(cTotalStu),
			String(cTotalApp),
			String(cTotalPas),
			String(cPct)
		]
	})

	autoTable(doc, {
		startY: currentY,
		head: [[
			{ content: 'Semester', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Course Code', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Name of the Course', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Students Strength', colSpan: 4, styles: { halign: 'center' } },
		], [
			'Total\nStudents',
			'Appeared',
			'Passed',
			'Pass %'
		]],
		body: courseSummaryData,
		margin: { left: margin, right: margin },
		styles: {
			font: 'times',
			fontSize: 9,
			textColor: [0, 0, 0],
			cellPadding: 2,
			lineWidth: 0.2,
			lineColor: [0, 0, 0],
			fillColor: [255, 255, 255],
		},
		headStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			halign: 'center',
			fontSize: 10,
			lineWidth: 0.2,
			lineColor: [0, 0, 0],
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 18 },
			1: { halign: 'center', cellWidth: 25 },
			2: { halign: 'left' },
			3: { halign: 'center', cellWidth: 22 },
			4: { halign: 'center', cellWidth: 22 },
			5: { halign: 'center', cellWidth: 20 },
			6: { halign: 'center', cellWidth: 18 },
		},
		theme: 'grid',
	})

	currentY = (doc as any).lastAutoTable.finalY + 5

	// ─── SIGNATURES (after last course) ──────────────────
	// Check if enough space, otherwise new page
	if (currentY > pageHeight - 45) {
		doc.addPage()
		currentY = margin + 10
	}

	currentY += 20

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(0, 0, 0)

	const sigY = currentY
	const colWidth = (pageWidth - 2 * margin) / 4

	const signatures = [
		'Signature of the\nBoard Chairman',
		'Signature of the\nCoE',
		'Signature of the\nPrincipal',
		'Signature of the\nUniversity Nominee'
	]

	signatures.forEach((sig, i) => {
		const x = margin + colWidth * i + colWidth / 2
		const lines = sig.split('\n')
		lines.forEach((line, lineIdx) => {
			doc.text(line, x, sigY + (lineIdx * 4), { align: 'center' })
		})
	})
}

// ─── Single board PDF ────────────────────────────────────
export function generatePassPercentagePDF(options: PdfOptions): string {
	const { report, logoImage, rightLogoImage } = options

	const doc = new jsPDF('portrait', 'mm', 'a4')

	generatePdfContent(doc, report, logoImage, rightLogoImage, true)

	// Footer: date/time + page numbers
	addFooter(doc, report.generated_at)

	const label = report.board?.board_code || report.program?.program_code || 'report'
	const fileName = `pass-percentage-${label}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(fileName)
	return fileName
}

// ─── Multiple boards in single PDF ──────────────────────
export function generateMultiBoardPassPercentagePDF(options: MultiBoardPdfOptions): string {
	const { reports, logoImage, rightLogoImage } = options

	const doc = new jsPDF('portrait', 'mm', 'a4')

	reports.forEach((report, idx) => {
		if (idx > 0) {
			doc.addPage()
		}
		generatePdfContent(doc, report, logoImage, rightLogoImage, idx === 0)
	})

	// Footer: date/time + page numbers
	const generatedAt = reports[0]?.generated_at || new Date().toISOString()
	addFooter(doc, generatedAt)

	const fileName = `pass-percentage-all-boards-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(fileName)
	return fileName
}

// ─── Program-wise PDF content (per-program with course rows) ─────
function generateProgramPdfContent(
	doc: jsPDF,
	report: PassPercentageReport,
	logoImage?: string,
	rightLogoImage?: string,
) {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 10
	let currentY = margin

	const programName = report.program?.program_name || report.program?.program_code || ''
	const programCode = report.program?.program_code || ''

	const addHeader = () => {
		currentY = margin

		if (logoImage) {
			try { doc.addImage(logoImage, 'PNG', margin, currentY, 16, 16) } catch { /* */ }
		}
		if (rightLogoImage) {
			try { doc.addImage(rightLogoImage, 'PNG', pageWidth - margin - 16, currentY, 16, 16) } catch { /* */ }
		}

		const textCenter = pageWidth / 2
		const textMaxWidth = pageWidth - 2 * margin - 34

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
		doc.text('PASS PERCENTAGE REPORT', textCenter, currentY, { align: 'center' })
		currentY += 5

		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(`SEMESTER EXAMINATION - ${report.session.name}`, textCenter, currentY, { align: 'center' })
		currentY += 7
	}

	addHeader()

	// Program header
	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text(`${programName} (${programCode})`, margin, currentY)
	currentY += 2

	// Course rows table
	const sortedCourses = [...report.courses].sort((a, b) => {
		if (a.semester !== b.semester) return a.semester - b.semester
		const orderA = (a as any).course_order ?? 999
		const orderB = (b as any).course_order ?? 999
		if (orderA !== orderB) return orderA - orderB
		return a.course_code.localeCompare(b.course_code)
	})

	const tableData = sortedCourses.map(course => {
		const totalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
		const totalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
		const totalPas = course.programs.reduce((s, p) => s + p.passed, 0)
		const pct = totalApp > 0 ? Math.round((totalPas / totalApp) * 100) : 0
		return [
			String(course.semester),
			course.course_code,
			course.course_name,
			String(totalStu),
			totalApp > 0 ? String(totalApp) : '-',
			String(totalPas),
			String(pct)
		]
	})

	// Grand total
	const grandTotal = sortedCourses.reduce((acc, c) => {
		c.programs.forEach(p => { acc.stu += p.total_students; acc.app += p.appeared; acc.pas += p.passed })
		return acc
	}, { stu: 0, app: 0, pas: 0 })
	const grandPct = grandTotal.app > 0 ? Math.round((grandTotal.pas / grandTotal.app) * 100) : 0
	tableData.push(['', '', 'Sub Total', String(grandTotal.stu), String(grandTotal.app), String(grandTotal.pas), String(grandPct)])

	autoTable(doc, {
		startY: currentY,
		head: [[
			{ content: 'Sem', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Course Code', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Name of the Course', rowSpan: 2, styles: { valign: 'middle' } },
			{ content: 'Students Strength', colSpan: 4, styles: { halign: 'center' } },
		], [
			'Total\nStudents',
			'Appeared',
			'Passed',
			'Pass %'
		]],
		body: tableData,
		margin: { left: margin, right: margin },
		styles: {
			font: 'times',
			fontSize: 9,
			textColor: [0, 0, 0],
			cellPadding: 2,
			lineWidth: 0.2,
			lineColor: [0, 0, 0],
			fillColor: [255, 255, 255],
		},
		headStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			halign: 'center',
			fontSize: 10,
			lineWidth: 0.2,
			lineColor: [0, 0, 0],
		},
		columnStyles: {
			0: { halign: 'center', cellWidth: 14 },
			1: { halign: 'center', cellWidth: 25 },
			2: { halign: 'left' },
			3: { halign: 'center', cellWidth: 22 },
			4: { halign: 'center', cellWidth: 22 },
			5: { halign: 'center', cellWidth: 20 },
			6: { halign: 'center', cellWidth: 18 },
		},
		didParseCell: (data) => {
			if (data.section === 'body' && data.row.index === tableData.length - 1) {
				data.cell.styles.fontStyle = 'bold'
			}
		},
		theme: 'grid',
	})

	currentY = (doc as any).lastAutoTable.finalY + 5

	// Signatures
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
		'Signature of the\nUniversity Nominee'
	]
	signatures.forEach((sig, i) => {
		const x = margin + colWidth * i + colWidth / 2
		const lines = sig.split('\n')
		lines.forEach((line, lineIdx) => {
			doc.text(line, x, currentY + (lineIdx * 4), { align: 'center' })
		})
	})
}

// ─── Single program PDF ─────────────────────────────────
export function generateProgramPassPercentagePDF(options: PdfOptions): string {
	const { report, logoImage, rightLogoImage } = options
	const doc = new jsPDF('portrait', 'mm', 'a4')
	generateProgramPdfContent(doc, report, logoImage, rightLogoImage)
	addFooter(doc, report.generated_at)
	const label = report.program?.program_code || 'program'
	const fileName = `pass-percentage-${label}-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(fileName)
	return fileName
}

// ─── Multiple programs in single PDF ────────────────────
export function generateMultiProgramPassPercentagePDF(options: MultiBoardPdfOptions): string {
	const { reports, logoImage, rightLogoImage } = options
	const doc = new jsPDF('portrait', 'mm', 'a4')
	reports.forEach((report, idx) => {
		if (idx > 0) doc.addPage()
		generateProgramPdfContent(doc, report, logoImage, rightLogoImage)
	})
	const generatedAt = reports[0]?.generated_at || new Date().toISOString()
	addFooter(doc, generatedAt)
	const fileName = `pass-percentage-all-programs-${new Date().toISOString().slice(0, 10)}.pdf`
	doc.save(fileName)
	return fileName
}

// ─── Footer helper ───────────────────────────────────────
function addFooter(doc: jsPDF, generatedAt: string) {
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 10
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
