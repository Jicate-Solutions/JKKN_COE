import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
	ReportTabKey,
	CourseOfferReportRow,
	CourseOfferReportSummary,
	ExamRegistrationReportRow,
	ExamRegistrationReportSummary,
	FeePaidReportRow,
	FeePaidReportSummary,
	InternalMarksReportRow,
	InternalMarksReportSummary,
	ExternalMarksReportRow,
	ExternalMarksReportSummary,
	FinalResultReportRow,
	FinalResultReportSummary,
	SemesterResultReportRow,
	SemesterResultReportSummary,
	ArrearReportRow,
	ArrearReportSummary,
	MissingDataReportRow,
	MissingDataReportSummary
} from '@/types/comprehensive-reports'

interface ReportPDFData {
	reportType: ReportTabKey
	reportTitle: string
	institutionName: string
	institutionCode: string
	sessionCode: string
	sessionName?: string
	programName?: string
	programCode?: string
	semester?: number
	logoImage?: string
	rightLogoImage?: string
	data: any[]
	summary: any
}

// Report title mapping
const REPORT_TITLES: Record<ReportTabKey, string> = {
	'course-offer': 'Course Offering Report',
	'exam-registration': 'Exam Registration Report',
	'fee-paid': 'Fee Paid List Report',
	'internal-marks': 'Internal Marks Report',
	'external-marks': 'External Marks Report',
	'final-result': 'Final Result Report',
	'semester-result': 'Semester Result Report',
	'arrear-report': 'Arrear/Backlog Report',
	'missing-data': 'Missing Data Report'
}

export function generateComprehensiveReportPDF(data: ReportPDFData): string {
	// Legal size Landscape with 0.5 inch (12.7mm) margins
	const doc = new jsPDF('landscape', 'mm', 'legal')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 12.7 // 0.5 inch in mm
	const contentWidth = pageWidth - (2 * margin)

	// Helper function to add header to each page
	const addHeader = () => {
		let currentY = margin

		// College Logo (left side)
		if (data.logoImage) {
			try {
				const logoSize = 22
				doc.addImage(data.logoImage, 'PNG', margin, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add logo to PDF:', e)
			}
		}

		// College Logo (right side - JKKN text logo)
		if (data.rightLogoImage) {
			try {
				const logoSize = 22
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add right logo to PDF:', e)
			}
		}

		// College name and details (centered)
		doc.setFont('times', 'bold')
		doc.setFontSize(16)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 6, { align: 'center' })

		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 12, { align: 'center' })

		currentY += 18

		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })

		currentY += 8

		// Report Title
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.text(data.reportTitle || REPORT_TITLES[data.reportType], pageWidth / 2, currentY, { align: 'center' })

		currentY += 7

		// Session and filters info
		doc.setFont('times', 'bold')
		doc.setFontSize(11)
		doc.text('EXAMINATION SESSION:', margin + 10, currentY)

		doc.setFont('times', 'normal')
		doc.setFontSize(11)
		const sessionText = data.sessionName || data.sessionCode
		doc.text(sessionText, margin + 60, currentY)

		// Add program and semester if available
		if (data.programCode) {
			doc.setFont('times', 'bold')
			doc.text('PROGRAM:', margin + 140, currentY)
			doc.setFont('times', 'normal')
			doc.text(data.programCode, margin + 165, currentY)
		}

		if (data.semester) {
			doc.setFont('times', 'bold')
			doc.text('SEMESTER:', margin + 220, currentY)
			doc.setFont('times', 'normal')
			doc.text(data.semester.toString(), margin + 245, currentY)
		}

		currentY += 5

		// Horizontal line
		doc.setLineWidth(0.5)
		doc.setDrawColor(0, 0, 0)
		doc.line(margin, currentY, pageWidth - margin, currentY)

		return currentY + 5
	}

	// Add initial header
	let startY = addHeader()

	// Generate table based on report type
	switch (data.reportType) {
		case 'course-offer':
			generateCourseOfferTable(doc, data.data as CourseOfferReportRow[], data.summary as CourseOfferReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'exam-registration':
			generateExamRegistrationTable(doc, data.data as ExamRegistrationReportRow[], data.summary as ExamRegistrationReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'fee-paid':
			generateFeePaidTable(doc, data.data as FeePaidReportRow[], data.summary as FeePaidReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'internal-marks':
			generateInternalMarksTable(doc, data.data as InternalMarksReportRow[], data.summary as InternalMarksReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'external-marks':
			generateExternalMarksTable(doc, data.data as ExternalMarksReportRow[], data.summary as ExternalMarksReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'final-result':
			generateFinalResultTable(doc, data.data as FinalResultReportRow[], data.summary as FinalResultReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'semester-result':
			generateSemesterResultTable(doc, data.data as SemesterResultReportRow[], data.summary as SemesterResultReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'arrear-report':
			generateArrearTable(doc, data.data as ArrearReportRow[], data.summary as ArrearReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
		case 'missing-data':
			generateMissingDataTable(doc, data.data as MissingDataReportRow[], data.summary as MissingDataReportSummary, startY, margin, contentWidth, pageWidth, pageHeight, addHeader)
			break
	}

	// Save the PDF
	const fileName = `${data.reportType}_${data.sessionCode.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}

// =====================================================
// TABLE GENERATORS
// =====================================================

function generateCourseOfferTable(
	doc: jsPDF,
	rows: CourseOfferReportRow[],
	summary: CourseOfferReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Courses', summary.total_courses.toString()],
		['Total Programs', summary.total_programs.toString()],
		['Total Enrolled', summary.total_enrolled.toString()]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.course_title,
		row.course_category || '-',
		row.credits.toString(),
		row.enrolled_count.toString(),
		row.faculty_name || '-'
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Program', 'Sem', 'Course Code', 'Course Title', 'Category', 'Credits', 'Enrolled', 'Faculty']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 25 },
			2: { halign: 'center', cellWidth: 12 },
			3: { halign: 'center', cellWidth: 30 },
			4: { halign: 'left', cellWidth: 80 },
			5: { halign: 'center', cellWidth: 25 },
			6: { halign: 'center', cellWidth: 18 },
			7: { halign: 'center', cellWidth: 20 },
			8: { halign: 'left', cellWidth: 50 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateExamRegistrationTable(
	doc: jsPDF,
	rows: ExamRegistrationReportRow[],
	summary: ExamRegistrationReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Registrations', summary.total_registrations.toString()],
		['Regular', summary.regular_count.toString()],
		['Arrear', summary.arrear_count.toString()],
		['Pending', summary.pending_count.toString()],
		['Approved', summary.approved_count.toString()]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.is_regular ? 'Regular' : 'Arrear',
		row.attempt_number.toString(),
		row.registration_status,
		row.fee_paid ? 'Yes' : 'No'
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course Code', 'Type', 'Attempt', 'Status', 'Fee Paid']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 30 },
			2: { halign: 'left', cellWidth: 60 },
			3: { halign: 'center', cellWidth: 20 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 28 },
			6: { halign: 'center', cellWidth: 20 },
			7: { halign: 'center', cellWidth: 18 },
			8: { halign: 'center', cellWidth: 25 },
			9: { halign: 'center', cellWidth: 20 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateFeePaidTable(
	doc: jsPDF,
	rows: FeePaidReportRow[],
	summary: FeePaidReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Learners', summary.total_learners.toString()],
		['Fee Paid', summary.paid_count.toString()],
		['Fee Pending', summary.unpaid_count.toString()],
		['Total Collected', `₹${summary.total_amount_collected.toLocaleString()}`],
		['Total Pending', `₹${summary.total_amount_pending.toLocaleString()}`]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 50 } },
		margin: { left: margin, right: margin },
		tableWidth: 110
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		`₹${row.fee_amount.toLocaleString()}`,
		row.fee_paid ? 'Paid' : 'Pending',
		row.payment_date ? new Date(row.payment_date).toLocaleDateString('en-GB') : '-',
		row.payment_transaction_id || '-'
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Amount', 'Status', 'Date', 'Transaction ID']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 55 },
			3: { halign: 'center', cellWidth: 18 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 22 },
			6: { halign: 'right', cellWidth: 22 },
			7: { halign: 'center', cellWidth: 18 },
			8: { halign: 'center', cellWidth: 22 },
			9: { halign: 'center', cellWidth: 35 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateInternalMarksTable(
	doc: jsPDF,
	rows: InternalMarksReportRow[],
	summary: InternalMarksReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Records', summary.total_records.toString()],
		['Pass', summary.pass_count.toString()],
		['Fail', summary.fail_count.toString()],
		['Missing', summary.missing_count.toString()],
		['Average Marks', summary.average_marks.toFixed(2)],
		['Highest', summary.highest_marks.toString()],
		['Lowest', summary.lowest_marks.toString()]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.internal_marks !== null ? row.internal_marks.toString() : '-',
		row.internal_max.toString(),
		row.internal_percentage !== null ? `${row.internal_percentage.toFixed(1)}%` : '-',
		row.is_internal_pass === true ? 'Pass' : row.is_internal_pass === false ? 'Fail' : 'N/A'
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Marks', 'Max', '%', 'Status']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 60 },
			3: { halign: 'center', cellWidth: 20 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 28 },
			6: { halign: 'center', cellWidth: 18 },
			7: { halign: 'center', cellWidth: 15 },
			8: { halign: 'center', cellWidth: 18 },
			9: { halign: 'center', cellWidth: 18 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateExternalMarksTable(
	doc: jsPDF,
	rows: ExternalMarksReportRow[],
	summary: ExternalMarksReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Records', summary.total_records.toString()],
		['Pass', summary.pass_count.toString()],
		['Fail', summary.fail_count.toString()],
		['Absent', summary.absent_count.toString()],
		['Missing', summary.missing_count.toString()],
		['Average Marks', summary.average_marks.toFixed(2)]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.is_absent ? 'AB' : (row.external_marks !== null ? row.external_marks.toString() : '-'),
		row.external_max.toString(),
		row.external_percentage !== null ? `${row.external_percentage.toFixed(1)}%` : '-',
		row.is_absent ? 'Absent' : (row.is_external_pass === true ? 'Pass' : row.is_external_pass === false ? 'Fail' : 'N/A')
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Marks', 'Max', '%', 'Status']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 12 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 60 },
			3: { halign: 'center', cellWidth: 20 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 28 },
			6: { halign: 'center', cellWidth: 18 },
			7: { halign: 'center', cellWidth: 15 },
			8: { halign: 'center', cellWidth: 18 },
			9: { halign: 'center', cellWidth: 18 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateFinalResultTable(
	doc: jsPDF,
	rows: FinalResultReportRow[],
	summary: FinalResultReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Records', summary.total_records.toString()],
		['Pass', summary.pass_count.toString()],
		['Fail', summary.fail_count.toString()],
		['Absent', summary.absent_count.toString()],
		['Distinction', summary.distinction_count.toString()],
		['First Class', summary.first_class_count.toString()],
		['Pass %', `${summary.pass_percentage.toFixed(2)}%`],
		['Average %', `${summary.average_percentage.toFixed(2)}%`]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.internal_marks.toString(),
		row.external_marks.toString(),
		row.total_marks.toString(),
		`${row.percentage.toFixed(1)}%`,
		row.letter_grade,
		row.grade_point.toFixed(1),
		row.pass_status
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Prog', 'Sem', 'Course', 'Int', 'Ext', 'Total', '%', 'Grade', 'GP', 'Result']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 8, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 1.5 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 9, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 10 },
			1: { halign: 'center', cellWidth: 26 },
			2: { halign: 'left', cellWidth: 50 },
			3: { halign: 'center', cellWidth: 15 },
			4: { halign: 'center', cellWidth: 10 },
			5: { halign: 'center', cellWidth: 22 },
			6: { halign: 'center', cellWidth: 12 },
			7: { halign: 'center', cellWidth: 12 },
			8: { halign: 'center', cellWidth: 14 },
			9: { halign: 'center', cellWidth: 14 },
			10: { halign: 'center', cellWidth: 14 },
			11: { halign: 'center', cellWidth: 12 },
			12: { halign: 'center', cellWidth: 16 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateSemesterResultTable(
	doc: jsPDF,
	rows: SemesterResultReportRow[],
	summary: SemesterResultReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Learners', summary.total_learners.toString()],
		['Pass', summary.pass_count.toString()],
		['Fail', summary.fail_count.toString()],
		['Pending', summary.pending_count.toString()],
		['Published', summary.published_count.toString()],
		['Distinction', summary.distinction_count.toString()],
		['First Class', summary.first_class_count.toString()],
		['With Backlogs', summary.with_backlogs_count.toString()],
		['Avg SGPA', summary.average_sgpa.toFixed(2)],
		['Avg CGPA', summary.average_cgpa.toFixed(2)]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.total_credits_registered.toString(),
		row.total_credits_earned.toString(),
		row.sgpa.toFixed(2),
		row.cgpa.toFixed(2),
		`${row.percentage.toFixed(1)}%`,
		row.total_backlogs.toString(),
		row.result_class || row.result_status
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Reg Cr', 'Earned', 'SGPA', 'CGPA', '%', 'Arrears', 'Result']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 10 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 55 },
			3: { halign: 'center', cellWidth: 20 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 16 },
			6: { halign: 'center', cellWidth: 16 },
			7: { halign: 'center', cellWidth: 16 },
			8: { halign: 'center', cellWidth: 16 },
			9: { halign: 'center', cellWidth: 16 },
			10: { halign: 'center', cellWidth: 16 },
			11: { halign: 'center', cellWidth: 28 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateArrearTable(
	doc: jsPDF,
	rows: ArrearReportRow[],
	summary: ArrearReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Backlogs', summary.total_backlogs.toString()],
		['Cleared', summary.cleared_count.toString()],
		['Pending', summary.pending_count.toString()],
		['Registered for Exam', summary.registered_for_exam_count.toString()]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.original_semester.toString(),
		row.course_code,
		row.credits.toString(),
		row.failure_reason,
		row.attempt_count.toString(),
		row.is_cleared ? 'Cleared' : 'Pending',
		row.priority_level
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Cr', 'Reason', 'Attempts', 'Status', 'Priority']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 10 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 55 },
			3: { halign: 'center', cellWidth: 18 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 25 },
			6: { halign: 'center', cellWidth: 12 },
			7: { halign: 'center', cellWidth: 25 },
			8: { halign: 'center', cellWidth: 18 },
			9: { halign: 'center', cellWidth: 20 },
			10: { halign: 'center', cellWidth: 20 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

function generateMissingDataTable(
	doc: jsPDF,
	rows: MissingDataReportRow[],
	summary: MissingDataReportSummary,
	startY: number,
	margin: number,
	contentWidth: number,
	pageWidth: number,
	pageHeight: number,
	addHeader: () => number
) {
	// Summary section
	const summaryData = [
		['Total Missing', summary.total_missing.toString()],
		['Missing Internal Only', summary.missing_internal_only.toString()],
		['Missing External Only', summary.missing_external_only.toString()],
		['Missing Both', summary.missing_both.toString()],
		['Missing Attendance', summary.missing_attendance.toString()]
	]

	autoTable(doc, {
		startY: startY,
		head: [['Summary Statistics', '']],
		body: summaryData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 11, fillColor: [220, 220, 220], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right', cellWidth: 40 } },
		margin: { left: margin, right: margin },
		tableWidth: 100
	})

	startY = (doc as any).lastAutoTable.finalY + 8

	// Data table
	const tableData = rows.map((row, index) => [
		(index + 1).toString(),
		row.register_number,
		row.learner_name,
		row.program_code,
		row.semester.toString(),
		row.course_code,
		row.has_internal ? 'Yes' : 'No',
		row.has_external ? 'Yes' : 'No',
		row.has_attendance ? 'Yes' : 'No',
		row.missing_type.toUpperCase()
	])

	autoTable(doc, {
		startY: startY,
		head: [['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Internal', 'External', 'Attendance', 'Missing']],
		body: tableData,
		theme: 'grid',
		styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2 },
		headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: [240, 240, 240], halign: 'center', textColor: [0, 0, 0] },
		columnStyles: {
			0: { halign: 'center', cellWidth: 10 },
			1: { halign: 'center', cellWidth: 28 },
			2: { halign: 'left', cellWidth: 60 },
			3: { halign: 'center', cellWidth: 20 },
			4: { halign: 'center', cellWidth: 12 },
			5: { halign: 'center', cellWidth: 28 },
			6: { halign: 'center', cellWidth: 20 },
			7: { halign: 'center', cellWidth: 20 },
			8: { halign: 'center', cellWidth: 22 },
			9: { halign: 'center', cellWidth: 22 }
		},
		margin: { left: margin, right: margin },
		didDrawPage: (data) => addFooter(doc, pageWidth, pageHeight, margin)
	})
}

// Helper to add footer
function addFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number) {
	const currentPageNumber = doc.internal.pages.length - 1

	// Page number (centered)
	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	doc.setTextColor(0, 0, 0)
	doc.text(`Page ${currentPageNumber}`, pageWidth / 2, pageHeight - margin + 10, { align: 'center' })

	// Date & time (right-aligned)
	doc.setFont('times', 'italic')
	doc.setFontSize(9)
	doc.setTextColor(80, 80, 80)
	const timestamp = new Date().toLocaleString('en-GB', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	})
	doc.text(`Generated on: ${timestamp}`, pageWidth - margin, pageHeight - margin + 10, { align: 'right' })
}
