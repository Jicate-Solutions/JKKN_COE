import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
	CollegeDashboardData,
	ProgramAnalysisDashboardData,
	SubjectAnalysisDashboardData,
	NAACCriterion26Data,
	NAADComplianceSummary,
	NAADStudentRecord
} from '@/types/result-analytics'

// PDF Configuration
const PDF_CONFIG = {
	margins: { top: 20, right: 15, bottom: 20, left: 15 },
	colors: {
		primary: [30, 64, 175] as [number, number, number], // Blue
		secondary: [107, 114, 128] as [number, number, number], // Gray
		success: [22, 163, 74] as [number, number, number], // Green
		danger: [220, 38, 38] as [number, number, number], // Red
		warning: [234, 179, 8] as [number, number, number], // Yellow
		headerBg: [30, 64, 175] as [number, number, number],
		headerText: [255, 255, 255] as [number, number, number]
	},
	fonts: {
		title: 18,
		subtitle: 14,
		heading: 12,
		body: 10,
		small: 8
	}
}

// Common PDF Helper Functions
function addHeader(doc: jsPDF, title: string, subtitle?: string, institutionName?: string) {
	const pageWidth = doc.internal.pageSize.getWidth()

	// Header background
	doc.setFillColor(...PDF_CONFIG.colors.primary)
	doc.rect(0, 0, pageWidth, 35, 'F')

	// Institution name
	if (institutionName) {
		doc.setTextColor(255, 255, 255)
		doc.setFontSize(PDF_CONFIG.fonts.subtitle)
		doc.setFont('helvetica', 'bold')
		doc.text(institutionName, pageWidth / 2, 12, { align: 'center' })
	}

	// Title
	doc.setTextColor(255, 255, 255)
	doc.setFontSize(PDF_CONFIG.fonts.title)
	doc.setFont('helvetica', 'bold')
	doc.text(title, pageWidth / 2, institutionName ? 24 : 18, { align: 'center' })

	// Subtitle
	if (subtitle) {
		doc.setFontSize(PDF_CONFIG.fonts.small)
		doc.setFont('helvetica', 'normal')
		doc.text(subtitle, pageWidth / 2, 32, { align: 'center' })
	}

	// Reset text color
	doc.setTextColor(0, 0, 0)

	return 45 // Return starting Y position after header
}

function addFooter(doc: jsPDF) {
	const pageCount = doc.getNumberOfPages()
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i)

		// Footer line
		doc.setDrawColor(...PDF_CONFIG.colors.secondary)
		doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15)

		// Page number
		doc.setFontSize(PDF_CONFIG.fonts.small)
		doc.setTextColor(...PDF_CONFIG.colors.secondary)
		doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' })

		// Generated date
		doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, pageHeight - 8)

		// System name
		doc.text('JKKN COE System', pageWidth - 15, pageHeight - 8, { align: 'right' })
	}
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
	doc.setFontSize(PDF_CONFIG.fonts.heading)
	doc.setFont('helvetica', 'bold')
	doc.setTextColor(...PDF_CONFIG.colors.primary)
	doc.text(title, 15, y)

	// Underline
	doc.setDrawColor(...PDF_CONFIG.colors.primary)
	doc.line(15, y + 2, 15 + doc.getTextWidth(title), y + 2)

	doc.setTextColor(0, 0, 0)
	return y + 10
}

function addKPIBox(doc: jsPDF, x: number, y: number, width: number, label: string, value: string | number, color: [number, number, number]) {
	// Box background
	doc.setFillColor(...color)
	doc.roundedRect(x, y, width, 25, 3, 3, 'F')

	// Value
	doc.setTextColor(255, 255, 255)
	doc.setFontSize(PDF_CONFIG.fonts.subtitle)
	doc.setFont('helvetica', 'bold')
	doc.text(String(value), x + width / 2, y + 10, { align: 'center' })

	// Label
	doc.setFontSize(PDF_CONFIG.fonts.small)
	doc.setFont('helvetica', 'normal')
	doc.text(label, x + width / 2, y + 18, { align: 'center' })

	doc.setTextColor(0, 0, 0)
}

// Export College Dashboard to PDF
export function exportCollegeDashboardToPDF(
	data: CollegeDashboardData,
	institutionName: string = 'Institution'
): jsPDF {
	const doc = new jsPDF('p', 'mm', 'a4')
	let y = addHeader(doc, 'Result Analytics Report', 'College Dashboard Summary', institutionName)

	// KPI Boxes
	const boxWidth = 42
	const startX = 15

	addKPIBox(doc, startX, y, boxWidth, 'Total Students', data.summary.total_students, PDF_CONFIG.colors.primary)
	addKPIBox(doc, startX + boxWidth + 5, y, boxWidth, 'Passed', data.summary.passed, PDF_CONFIG.colors.success)
	addKPIBox(doc, startX + (boxWidth + 5) * 2, y, boxWidth, 'Failed', data.summary.failed, PDF_CONFIG.colors.danger)
	addKPIBox(doc, startX + (boxWidth + 5) * 3, y, boxWidth, 'Pass Rate', `${data.summary.pass_rate}%`, PDF_CONFIG.colors.primary)

	y += 35

	// Gender-wise Analysis
	y = addSectionTitle(doc, 'Gender-wise Analysis', y)

	autoTable(doc, {
		startY: y,
		head: [['Gender', 'Total', 'Passed', 'Failed', 'Pass Rate (%)']],
		body: data.gender_wise.map(g => [g.gender, g.total, g.passed, g.failed, g.pass_rate]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 }
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Category-wise Analysis
	y = addSectionTitle(doc, 'Category-wise Analysis', y)

	autoTable(doc, {
		startY: y,
		head: [['Category', 'Total', 'Passed', 'Failed', 'Pass Rate (%)']],
		body: data.category_wise.map(c => [c.category, c.total, c.passed, c.failed, c.pass_rate]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 }
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Check if we need a new page
	if (y > 200) {
		doc.addPage()
		y = 20
	}

	// Top Performers
	y = addSectionTitle(doc, 'Top Performers', y)

	autoTable(doc, {
		startY: y,
		head: [['Rank', 'Register No', 'Name', 'Program', 'CGPA']],
		body: data.top_performers.slice(0, 10).map(s => [s.rank, s.register_number, s.name, s.program_name, s.cgpa]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 },
		columnStyles: {
			2: { cellWidth: 50 },
			3: { cellWidth: 50 }
		}
	})

	addFooter(doc)
	return doc
}

// Export Program Analysis to PDF
export function exportProgramAnalysisToPDF(
	data: ProgramAnalysisDashboardData,
	institutionName: string = 'Institution'
): jsPDF {
	const doc = new jsPDF('p', 'mm', 'a4')
	let y = addHeader(doc, 'Program-wise Analysis Report', 'Performance by Program', institutionName)

	// Programs Overview
	y = addSectionTitle(doc, 'Programs Overview', y)

	autoTable(doc, {
		startY: y,
		head: [['Program Code', 'Program Name', 'Level', 'Students', 'Pass Rate (%)']],
		body: data.programs.map(p => [p.program_code, p.program_name, p.degree_level, p.total_students, p.pass_rate]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 },
		columnStyles: {
			1: { cellWidth: 60 }
		}
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Degree Level Summary
	y = addSectionTitle(doc, 'Degree Level Summary', y)

	autoTable(doc, {
		startY: y,
		head: [['Degree Level', 'Programs', 'Total Students', 'Passed', 'Avg Pass Rate (%)']],
		body: data.degree_level_summary.map(d => [d.degree_level, d.program_count, d.total_students, d.passed, d.average_pass_rate]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 }
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Programs Needing Attention
	if (data.weak_programs.length > 0) {
		if (y > 220) {
			doc.addPage()
			y = 20
		}

		y = addSectionTitle(doc, 'Programs Needing Attention (Pass Rate < 60%)', y)

		autoTable(doc, {
			startY: y,
			head: [['Program Name', 'Pass Rate (%)', 'Students', 'Failed']],
			body: data.weak_programs.map(p => [p.program_name, p.pass_rate, p.total_students, p.failed]),
			headStyles: { fillColor: PDF_CONFIG.colors.danger, textColor: PDF_CONFIG.colors.headerText },
			alternateRowStyles: { fillColor: [254, 242, 242] },
			margin: { left: 15, right: 15 }
		})
	}

	addFooter(doc)
	return doc
}

// Export Subject Analysis to PDF
export function exportSubjectAnalysisToPDF(
	data: SubjectAnalysisDashboardData,
	institutionName: string = 'Institution'
): jsPDF {
	const doc = new jsPDF('p', 'mm', 'a4')
	let y = addHeader(doc, 'Subject-wise Analysis Report', 'Performance by Subject', institutionName)

	// Failure Analysis Summary
	y = addSectionTitle(doc, 'Failure Analysis Summary', y)

	const boxWidth = 55
	const startX = 25
	addKPIBox(doc, startX, y, boxWidth, 'Internal Failures', data.failure_analysis.internal_failures, PDF_CONFIG.colors.warning)
	addKPIBox(doc, startX + boxWidth + 10, y, boxWidth, 'External Failures', data.failure_analysis.external_failures, PDF_CONFIG.colors.danger)
	addKPIBox(doc, startX + (boxWidth + 10) * 2, y, boxWidth, 'Both', data.failure_analysis.both_failures, [139, 69, 19])

	y += 35

	// Difficult Subjects
	y = addSectionTitle(doc, 'Difficult Subjects (High Failure Rate)', y)

	autoTable(doc, {
		startY: y,
		head: [['Subject Code', 'Subject Name', 'Difficulty Index', 'Failure Rate (%)']],
		body: data.difficult_subjects.slice(0, 10).map(s => [s.course_code, s.course_title, s.difficulty_index, s.failure_rate]),
		headStyles: { fillColor: PDF_CONFIG.colors.danger, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [254, 242, 242] },
		margin: { left: 15, right: 15 },
		columnStyles: {
			1: { cellWidth: 70 }
		}
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Easy Subjects
	if (y > 200) {
		doc.addPage()
		y = 20
	}

	y = addSectionTitle(doc, 'Easy Subjects (High Pass Rate)', y)

	autoTable(doc, {
		startY: y,
		head: [['Subject Code', 'Subject Name', 'Pass Rate (%)', 'Avg Score']],
		body: data.easy_subjects.slice(0, 10).map(s => [s.course_code, s.course_title, s.pass_rate, s.average_score]),
		headStyles: { fillColor: PDF_CONFIG.colors.success, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [240, 253, 244] },
		margin: { left: 15, right: 15 },
		columnStyles: {
			1: { cellWidth: 70 }
		}
	})

	addFooter(doc)
	return doc
}

// Export NAAC Criterion 2.6 Report to PDF
export function exportNAACCriterion26ToPDF(
	data: NAACCriterion26Data,
	institutionName: string = 'Institution'
): jsPDF {
	const doc = new jsPDF('p', 'mm', 'a4')

	// Cover page
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	// Header
	doc.setFillColor(...PDF_CONFIG.colors.primary)
	doc.rect(0, 0, pageWidth, 60, 'F')

	doc.setTextColor(255, 255, 255)
	doc.setFontSize(24)
	doc.setFont('helvetica', 'bold')
	doc.text('NAAC', pageWidth / 2, 25, { align: 'center' })
	doc.setFontSize(14)
	doc.text('Self Study Report', pageWidth / 2, 35, { align: 'center' })
	doc.setFontSize(12)
	doc.text(institutionName, pageWidth / 2, 50, { align: 'center' })

	// Criterion info
	doc.setTextColor(0, 0, 0)
	doc.setFontSize(16)
	doc.setFont('helvetica', 'bold')
	doc.text(`Criterion ${data.criterion_id}`, pageWidth / 2, 90, { align: 'center' })

	doc.setFontSize(14)
	doc.text(data.criterion_title, pageWidth / 2, 100, { align: 'center' })

	doc.setFontSize(10)
	doc.setFont('helvetica', 'normal')
	doc.text(data.description, pageWidth / 2, 115, { align: 'center', maxWidth: 150 })

	// Summary metrics
	doc.setFontSize(12)
	doc.setFont('helvetica', 'bold')
	doc.text('Key Metrics', pageWidth / 2, 145, { align: 'center' })

	const boxWidth = 50
	const startX = (pageWidth - boxWidth * 3 - 20) / 2
	addKPIBox(doc, startX, 155, boxWidth, 'Avg Pass %', `${data.average_pass_percentage}%`, PDF_CONFIG.colors.success)
	addKPIBox(doc, startX + boxWidth + 10, 155, boxWidth, 'Total Appeared', data.total_students_appeared, PDF_CONFIG.colors.primary)
	addKPIBox(doc, startX + (boxWidth + 10) * 2, 155, boxWidth, 'Total Passed', data.total_students_passed, PDF_CONFIG.colors.success)

	// New page for tables
	doc.addPage()
	let y = 20

	// Year-wise Pass Percentage
	y = addSectionTitle(doc, 'Year-wise Pass Percentage (Last 5 Years)', y)

	autoTable(doc, {
		startY: y,
		head: [['Academic Year', 'Enrolled', 'Appeared', 'Passed', 'Pass Percentage (%)']],
		body: data.year_wise_results.map(r => [r.academic_year, r.enrolled, r.appeared, r.passed, r.pass_percentage]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 }
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Program-wise Pass Percentage
	y = addSectionTitle(doc, 'Program-wise Pass Percentage', y)

	autoTable(doc, {
		startY: y,
		head: [['Program Name', 'Enrolled', 'Appeared', 'Passed', 'Pass %']],
		body: data.program_wise_results.map(r => [r.program_name, r.enrolled, r.appeared, r.passed, r.pass_percentage]),
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 },
		columnStyles: {
			0: { cellWidth: 70 }
		}
	})

	// Calculation method
	y = (doc as any).lastAutoTable.finalY + 15

	if (y < 250) {
		doc.setFontSize(PDF_CONFIG.fonts.small)
		doc.setFont('helvetica', 'italic')
		doc.setTextColor(...PDF_CONFIG.colors.secondary)
		doc.text(`Calculation Method: ${data.calculation_method}`, 15, y, { maxWidth: 180 })
	}

	addFooter(doc)
	return doc
}

// Export NAAD Compliance Report to PDF
export function exportNAADComplianceToPDF(
	summary: NAADComplianceSummary,
	records: NAADStudentRecord[],
	institutionName: string = 'Institution'
): jsPDF {
	const doc = new jsPDF('p', 'mm', 'a4')
	let y = addHeader(doc, 'NAAD Compliance Report', 'National Academic Depository', institutionName)

	// Compliance KPIs
	const boxWidth = 42
	const startX = 15

	addKPIBox(doc, startX, y, boxWidth, 'Total Students', summary.total_students, PDF_CONFIG.colors.primary)
	addKPIBox(doc, startX + boxWidth + 5, y, boxWidth, 'ABC Linked', summary.abc_linked_students, summary.abc_compliance >= 80 ? PDF_CONFIG.colors.success : PDF_CONFIG.colors.warning)
	addKPIBox(doc, startX + (boxWidth + 5) * 2, y, boxWidth, 'Aadhaar Verified', summary.aadhaar_verified_students, summary.aadhaar_compliance >= 80 ? PDF_CONFIG.colors.success : PDF_CONFIG.colors.warning)
	addKPIBox(doc, startX + (boxWidth + 5) * 3, y, boxWidth, 'Compliance', `${summary.compliance_percentage}%`, summary.compliance_percentage >= 80 ? PDF_CONFIG.colors.success : summary.compliance_percentage >= 50 ? PDF_CONFIG.colors.warning : PDF_CONFIG.colors.danger)

	y += 35

	// Compliance Breakdown
	y = addSectionTitle(doc, 'Compliance Breakdown', y)

	autoTable(doc, {
		startY: y,
		head: [['Metric', 'Count', 'Percentage', 'Status']],
		body: [
			['Aadhaar Compliance', summary.aadhaar_verified_students, `${summary.aadhaar_compliance}%`, summary.aadhaar_compliance >= 80 ? 'Good' : 'Needs Attention'],
			['ABC ID Compliance', summary.abc_linked_students, `${summary.abc_compliance}%`, summary.abc_compliance >= 80 ? 'Good' : 'Needs Attention'],
			['Result Compliance', summary.results_uploaded, `${summary.result_compliance}%`, summary.result_compliance >= 80 ? 'Good' : 'Needs Attention'],
			['Pending Uploads', summary.pending_uploads, '-', summary.pending_uploads > 0 ? 'Action Required' : 'Complete']
		],
		headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
		alternateRowStyles: { fillColor: [245, 245, 245] },
		margin: { left: 15, right: 15 },
		didParseCell: (data) => {
			if (data.column.index === 3 && data.section === 'body') {
				const status = data.cell.raw as string
				if (status === 'Good' || status === 'Complete') {
					data.cell.styles.textColor = PDF_CONFIG.colors.success
				} else {
					data.cell.styles.textColor = PDF_CONFIG.colors.danger
				}
			}
		}
	})

	y = (doc as any).lastAutoTable.finalY + 15

	// Data Quality Issues
	if (summary.data_quality_issues.length > 0) {
		y = addSectionTitle(doc, 'Data Quality Issues', y)

		autoTable(doc, {
			startY: y,
			head: [['Field', 'Issue', 'Affected Count', 'Severity']],
			body: summary.data_quality_issues.map(i => [i.field, i.issue, i.affected_count, i.severity.toUpperCase()]),
			headStyles: { fillColor: PDF_CONFIG.colors.danger, textColor: PDF_CONFIG.colors.headerText },
			alternateRowStyles: { fillColor: [254, 242, 242] },
			margin: { left: 15, right: 15 },
			didParseCell: (data) => {
				if (data.column.index === 3 && data.section === 'body') {
					const severity = (data.cell.raw as string).toLowerCase()
					if (severity === 'high') {
						data.cell.styles.textColor = PDF_CONFIG.colors.danger
					} else if (severity === 'medium') {
						data.cell.styles.textColor = PDF_CONFIG.colors.warning
					} else {
						data.cell.styles.textColor = PDF_CONFIG.colors.success
					}
				}
			}
		})
	}

	// Student records summary (first 20)
	if (records.length > 0) {
		doc.addPage()
		y = 20

		y = addSectionTitle(doc, 'Student Records Summary', y)

		autoTable(doc, {
			startY: y,
			head: [['Reg No', 'Name', 'Program', 'Aadhaar', 'ABC ID', 'Status']],
			body: records.slice(0, 20).map(r => [
				r.register_number,
				r.name.length > 20 ? r.name.substring(0, 20) + '...' : r.name,
				r.program_name.length > 25 ? r.program_name.substring(0, 25) + '...' : r.program_name,
				r.aadhaar_number ? 'Yes' : 'No',
				r.abc_id ? 'Yes' : 'No',
				r.naad_status.toUpperCase()
			]),
			headStyles: { fillColor: PDF_CONFIG.colors.headerBg, textColor: PDF_CONFIG.colors.headerText },
			alternateRowStyles: { fillColor: [245, 245, 245] },
			margin: { left: 15, right: 15 },
			styles: { fontSize: 8 },
			didParseCell: (data) => {
				if (data.column.index === 5 && data.section === 'body') {
					const status = (data.cell.raw as string).toLowerCase()
					if (status === 'ready' || status === 'uploaded') {
						data.cell.styles.textColor = PDF_CONFIG.colors.success
					} else if (status === 'error') {
						data.cell.styles.textColor = PDF_CONFIG.colors.danger
					} else {
						data.cell.styles.textColor = PDF_CONFIG.colors.warning
					}
				}
			}
		})

		if (records.length > 20) {
			y = (doc as any).lastAutoTable.finalY + 5
			doc.setFontSize(PDF_CONFIG.fonts.small)
			doc.setTextColor(...PDF_CONFIG.colors.secondary)
			doc.text(`Showing 20 of ${records.length} records. Export to Excel for complete data.`, 15, y)
		}
	}

	addFooter(doc)
	return doc
}

// Utility function to download PDF
export function downloadPDF(doc: jsPDF, filename: string) {
	doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`)
}
