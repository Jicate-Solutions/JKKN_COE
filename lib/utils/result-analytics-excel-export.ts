import ExcelJS from 'exceljs'
import type {
	CollegeDashboardData,
	ProgramAnalysisDashboardData,
	SubjectAnalysisDashboardData,
	NAACCriterion26Data,
	NAACCriterion13Data,
	NAACCriterion27Data,
	NAADComplianceSummary,
	NAADStudentRecord
} from '@/types/result-analytics'

// Common styles
const headerStyle: Partial<ExcelJS.Style> = {
	font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
	fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } },
	alignment: { horizontal: 'center', vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

const subHeaderStyle: Partial<ExcelJS.Style> = {
	font: { bold: true, size: 10 },
	fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
	alignment: { horizontal: 'center', vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

const dataStyle: Partial<ExcelJS.Style> = {
	alignment: { vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

// Export College Dashboard to Excel
export async function exportCollegeDashboardToExcel(
	data: CollegeDashboardData,
	institutionName: string = 'Institution'
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Summary Sheet
	const summarySheet = workbook.addWorksheet('Summary')
	addCollegeSummarySheet(summarySheet, data, institutionName)

	// Trends Sheet
	const trendsSheet = workbook.addWorksheet('Trends')
	addTrendsSheet(trendsSheet, data.trends)

	// Gender Analysis Sheet
	const genderSheet = workbook.addWorksheet('Gender Analysis')
	addGenderAnalysisSheet(genderSheet, data.gender_wise)

	// Category Analysis Sheet
	const categorySheet = workbook.addWorksheet('Category Analysis')
	addCategoryAnalysisSheet(categorySheet, data.category_wise)

	// Top Performers Sheet
	const performersSheet = workbook.addWorksheet('Top Performers')
	addTopPerformersSheet(performersSheet, data.top_performers)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

// Export Program Analysis to Excel
export async function exportProgramAnalysisToExcel(
	data: ProgramAnalysisDashboardData,
	institutionName: string = 'Institution'
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Programs Overview Sheet
	const programsSheet = workbook.addWorksheet('Programs Overview')
	addProgramsOverviewSheet(programsSheet, data.programs, institutionName)

	// Degree Level Summary
	const degreeLevelSheet = workbook.addWorksheet('Degree Level Summary')
	addDegreeLevelSummarySheet(degreeLevelSheet, data.degree_level_summary)

	// Weak Programs Sheet
	const weakProgramsSheet = workbook.addWorksheet('Programs Needing Attention')
	addWeakProgramsSheet(weakProgramsSheet, data.weak_programs)

	// Top Programs Sheet
	const topProgramsSheet = workbook.addWorksheet('Top Performing Programs')
	addTopProgramsSheet(topProgramsSheet, data.top_programs)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

// Export Subject Analysis to Excel
export async function exportSubjectAnalysisToExcel(
	data: SubjectAnalysisDashboardData,
	institutionName: string = 'Institution'
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Failure Analysis Sheet
	const failureSheet = workbook.addWorksheet('Failure Analysis')
	addFailureAnalysisSheet(failureSheet, data.failure_analysis, institutionName)

	// Difficult Subjects Sheet
	const difficultSheet = workbook.addWorksheet('Difficult Subjects')
	addDifficultSubjectsSheet(difficultSheet, data.difficult_subjects)

	// Easy Subjects Sheet
	const easySheet = workbook.addWorksheet('Easy Subjects')
	addEasySubjectsSheet(easySheet, data.easy_subjects)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

// Export NAAC Criterion 2.6 Report
export async function exportNAACCriterion26ToExcel(
	data: NAACCriterion26Data,
	institutionName: string = 'Institution'
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Cover Sheet
	const coverSheet = workbook.addWorksheet('Cover')
	addNAACCoverSheet(coverSheet, data, institutionName)

	// Year-wise Results
	const yearWiseSheet = workbook.addWorksheet('Year-wise Pass Percentage')
	addYearWiseResultsSheet(yearWiseSheet, data.year_wise_results)

	// Program-wise Results
	const programWiseSheet = workbook.addWorksheet('Program-wise Results')
	addProgramWiseResultsSheet(programWiseSheet, data.program_wise_results)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

// Export NAAD Compliance Report
export async function exportNAADComplianceToExcel(
	summary: NAADComplianceSummary,
	records: NAADStudentRecord[],
	institutionName: string = 'Institution'
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Compliance Summary Sheet
	const summarySheet = workbook.addWorksheet('Compliance Summary')
	addNAADSummarySheet(summarySheet, summary, institutionName)

	// Student Records Sheet (NAAD Format)
	const recordsSheet = workbook.addWorksheet('Student Records')
	addNAADStudentRecordsSheet(recordsSheet, records)

	// Data Quality Issues
	const issuesSheet = workbook.addWorksheet('Data Quality Issues')
	addDataQualityIssuesSheet(issuesSheet, summary.data_quality_issues)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

// Helper functions for sheet creation
function addCollegeSummarySheet(sheet: ExcelJS.Worksheet, data: CollegeDashboardData, institutionName: string) {
	// Title
	sheet.mergeCells('A1:D1')
	const titleCell = sheet.getCell('A1')
	titleCell.value = `${institutionName} - Result Analytics Summary`
	titleCell.font = { bold: true, size: 16 }
	titleCell.alignment = { horizontal: 'center' }

	// Generated date
	sheet.mergeCells('A2:D2')
	sheet.getCell('A2').value = `Generated on: ${new Date().toLocaleDateString()}`
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	// Summary section
	sheet.getCell('A4').value = 'Key Performance Indicators'
	sheet.getCell('A4').font = { bold: true, size: 14 }

	const summaryData = [
		['Total Students', data.summary.total_students],
		['Appeared', data.summary.appeared],
		['Passed', data.summary.passed],
		['Failed', data.summary.failed],
		['Pass Rate', `${data.summary.pass_rate}%`],
		['Distinction Rate', `${data.summary.distinction_rate}%`],
		['Average CGPA', data.summary.average_cgpa]
	]

	let row = 5
	summaryData.forEach(([label, value]) => {
		sheet.getCell(`A${row}`).value = label
		sheet.getCell(`B${row}`).value = value
		row++
	})

	// Set column widths
	sheet.getColumn('A').width = 25
	sheet.getColumn('B').width = 20
	sheet.getColumn('C').width = 20
	sheet.getColumn('D').width = 20
}

function addTrendsSheet(sheet: ExcelJS.Worksheet, trends: CollegeDashboardData['trends']) {
	// Headers
	const headers = ['Academic Year', 'Pass Rate (%)', 'Total Students', 'Passed', 'Failed']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(1, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	// Data rows
	trends.forEach((trend, rowIndex) => {
		sheet.getCell(rowIndex + 2, 1).value = trend.academic_year
		sheet.getCell(rowIndex + 2, 2).value = trend.pass_rate
		sheet.getCell(rowIndex + 2, 3).value = trend.total_students
		sheet.getCell(rowIndex + 2, 4).value = trend.passed
		sheet.getCell(rowIndex + 2, 5).value = trend.failed
	})

	// Set column widths
	sheet.getColumn(1).width = 20
	sheet.getColumn(2).width = 15
	sheet.getColumn(3).width = 15
	sheet.getColumn(4).width = 15
	sheet.getColumn(5).width = 15
}

function addGenderAnalysisSheet(sheet: ExcelJS.Worksheet, genderData: CollegeDashboardData['gender_wise']) {
	const headers = ['Gender', 'Total', 'Passed', 'Failed', 'Pass Rate (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(1, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	genderData.forEach((item, rowIndex) => {
		sheet.getCell(rowIndex + 2, 1).value = item.gender
		sheet.getCell(rowIndex + 2, 2).value = item.total
		sheet.getCell(rowIndex + 2, 3).value = item.passed
		sheet.getCell(rowIndex + 2, 4).value = item.failed
		sheet.getCell(rowIndex + 2, 5).value = item.pass_rate
	})

	sheet.columns.forEach(col => col.width = 15)
}

function addCategoryAnalysisSheet(sheet: ExcelJS.Worksheet, categoryData: CollegeDashboardData['category_wise']) {
	const headers = ['Category', 'Total', 'Passed', 'Failed', 'Pass Rate (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(1, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	categoryData.forEach((item, rowIndex) => {
		sheet.getCell(rowIndex + 2, 1).value = item.category
		sheet.getCell(rowIndex + 2, 2).value = item.total
		sheet.getCell(rowIndex + 2, 3).value = item.passed
		sheet.getCell(rowIndex + 2, 4).value = item.failed
		sheet.getCell(rowIndex + 2, 5).value = item.pass_rate
	})

	sheet.columns.forEach(col => col.width = 15)
}

function addTopPerformersSheet(sheet: ExcelJS.Worksheet, performers: CollegeDashboardData['top_performers']) {
	const headers = ['Rank', 'Register No', 'Name', 'Program', 'CGPA', 'Percentage']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(1, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	performers.forEach((student, rowIndex) => {
		sheet.getCell(rowIndex + 2, 1).value = student.rank
		sheet.getCell(rowIndex + 2, 2).value = student.register_number
		sheet.getCell(rowIndex + 2, 3).value = student.name
		sheet.getCell(rowIndex + 2, 4).value = student.program_name
		sheet.getCell(rowIndex + 2, 5).value = student.cgpa
		sheet.getCell(rowIndex + 2, 6).value = student.percentage
	})

	sheet.getColumn(1).width = 8
	sheet.getColumn(2).width = 15
	sheet.getColumn(3).width = 30
	sheet.getColumn(4).width = 30
	sheet.getColumn(5).width = 10
	sheet.getColumn(6).width = 12
}

function addProgramsOverviewSheet(sheet: ExcelJS.Worksheet, programs: any[], institutionName: string) {
	sheet.mergeCells('A1:G1')
	sheet.getCell('A1').value = `${institutionName} - Program-wise Analysis`
	sheet.getCell('A1').font = { bold: true, size: 14 }
	sheet.getCell('A1').alignment = { horizontal: 'center' }

	const headers = ['Program Code', 'Program Name', 'Degree Level', 'Total Students', 'Passed', 'Pass Rate (%)', 'Avg CGPA']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	programs.forEach((prog, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = prog.program_code
		sheet.getCell(rowIndex + 4, 2).value = prog.program_name
		sheet.getCell(rowIndex + 4, 3).value = prog.degree_level
		sheet.getCell(rowIndex + 4, 4).value = prog.total_students
		sheet.getCell(rowIndex + 4, 5).value = prog.passed
		sheet.getCell(rowIndex + 4, 6).value = prog.pass_rate
		sheet.getCell(rowIndex + 4, 7).value = prog.average_cgpa
	})

	sheet.getColumn(1).width = 15
	sheet.getColumn(2).width = 40
	sheet.getColumn(3).width = 15
	sheet.getColumn(4).width = 15
	sheet.getColumn(5).width = 12
	sheet.getColumn(6).width = 15
	sheet.getColumn(7).width = 12
}

function addDegreeLevelSummarySheet(sheet: ExcelJS.Worksheet, summary: any[]) {
	const headers = ['Degree Level', 'Programs', 'Total Students', 'Passed', 'Avg Pass Rate (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(1, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	summary.forEach((item, rowIndex) => {
		sheet.getCell(rowIndex + 2, 1).value = item.degree_level
		sheet.getCell(rowIndex + 2, 2).value = item.program_count
		sheet.getCell(rowIndex + 2, 3).value = item.total_students
		sheet.getCell(rowIndex + 2, 4).value = item.passed
		sheet.getCell(rowIndex + 2, 5).value = item.average_pass_rate
	})

	sheet.columns.forEach(col => col.width = 18)
}

function addWeakProgramsSheet(sheet: ExcelJS.Worksheet, weakPrograms: any[]) {
	sheet.getCell('A1').value = 'Programs Requiring Attention (Pass Rate < 60%)'
	sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } }

	const headers = ['Program Name', 'Pass Rate (%)', 'Total Students', 'Failed', 'Suggested Action']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	weakPrograms.forEach((prog, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = prog.program_name
		sheet.getCell(rowIndex + 4, 2).value = prog.pass_rate
		sheet.getCell(rowIndex + 4, 3).value = prog.total_students
		sheet.getCell(rowIndex + 4, 4).value = prog.failed
		sheet.getCell(rowIndex + 4, 5).value = 'Review curriculum and teaching methods'
	})

	sheet.getColumn(1).width = 40
	sheet.getColumn(2).width = 15
	sheet.getColumn(3).width = 15
	sheet.getColumn(4).width = 12
	sheet.getColumn(5).width = 40
}

function addTopProgramsSheet(sheet: ExcelJS.Worksheet, topPrograms: any[]) {
	sheet.getCell('A1').value = 'Top Performing Programs (Pass Rate > 90%)'
	sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF16A34A' } }

	const headers = ['Program Name', 'Pass Rate (%)', 'Total Students', 'Distinction Rate (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	topPrograms.forEach((prog, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = prog.program_name
		sheet.getCell(rowIndex + 4, 2).value = prog.pass_rate
		sheet.getCell(rowIndex + 4, 3).value = prog.total_students
		sheet.getCell(rowIndex + 4, 4).value = prog.distinction_rate || 'N/A'
	})

	sheet.getColumn(1).width = 40
	sheet.getColumn(2).width = 15
	sheet.getColumn(3).width = 15
	sheet.getColumn(4).width = 18
}

function addFailureAnalysisSheet(sheet: ExcelJS.Worksheet, failureAnalysis: any, institutionName: string) {
	sheet.mergeCells('A1:E1')
	sheet.getCell('A1').value = `${institutionName} - Failure Analysis Report`
	sheet.getCell('A1').font = { bold: true, size: 14 }

	// Summary
	sheet.getCell('A3').value = 'Summary'
	sheet.getCell('A3').font = { bold: true, size: 12 }

	sheet.getCell('A4').value = 'Internal Failures'
	sheet.getCell('B4').value = failureAnalysis.internal_failures

	sheet.getCell('A5').value = 'External Failures'
	sheet.getCell('B5').value = failureAnalysis.external_failures

	sheet.getCell('A6').value = 'Both Internal & External'
	sheet.getCell('B6').value = failureAnalysis.both_failures

	sheet.columns.forEach(col => col.width = 20)
}

function addDifficultSubjectsSheet(sheet: ExcelJS.Worksheet, subjects: any[]) {
	sheet.getCell('A1').value = 'Difficult Subjects (High Failure Rate)'
	sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } }

	const headers = ['Subject Code', 'Subject Name', 'Difficulty Index', 'Failure Rate (%)', 'Total Attempted']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	subjects.forEach((subj, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = subj.course_code
		sheet.getCell(rowIndex + 4, 2).value = subj.course_title
		sheet.getCell(rowIndex + 4, 3).value = subj.difficulty_index
		sheet.getCell(rowIndex + 4, 4).value = subj.failure_rate
		sheet.getCell(rowIndex + 4, 5).value = subj.total_attempted
	})

	sheet.getColumn(1).width = 15
	sheet.getColumn(2).width = 40
	sheet.getColumn(3).width = 18
	sheet.getColumn(4).width = 15
	sheet.getColumn(5).width = 15
}

function addEasySubjectsSheet(sheet: ExcelJS.Worksheet, subjects: any[]) {
	sheet.getCell('A1').value = 'Easy Subjects (High Pass Rate)'
	sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF16A34A' } }

	const headers = ['Subject Code', 'Subject Name', 'Pass Rate (%)', 'Average Score', 'Total Attempted']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	subjects.forEach((subj, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = subj.course_code
		sheet.getCell(rowIndex + 4, 2).value = subj.course_title
		sheet.getCell(rowIndex + 4, 3).value = subj.pass_rate
		sheet.getCell(rowIndex + 4, 4).value = subj.average_score
		sheet.getCell(rowIndex + 4, 5).value = subj.total_attempted
	})

	sheet.getColumn(1).width = 15
	sheet.getColumn(2).width = 40
	sheet.getColumn(3).width = 15
	sheet.getColumn(4).width = 15
	sheet.getColumn(5).width = 15
}

function addNAACCoverSheet(sheet: ExcelJS.Worksheet, data: NAACCriterion26Data, institutionName: string) {
	sheet.mergeCells('A1:D1')
	sheet.getCell('A1').value = 'NAAC - Self Study Report'
	sheet.getCell('A1').font = { bold: true, size: 18 }
	sheet.getCell('A1').alignment = { horizontal: 'center' }

	sheet.mergeCells('A2:D2')
	sheet.getCell('A2').value = institutionName
	sheet.getCell('A2').font = { bold: true, size: 14 }
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	sheet.mergeCells('A4:D4')
	sheet.getCell('A4').value = `Criterion ${data.criterion_id}: ${data.criterion_title}`
	sheet.getCell('A4').font = { bold: true, size: 12 }

	sheet.mergeCells('A5:D5')
	sheet.getCell('A5').value = data.description
	sheet.getCell('A5').font = { italic: true }

	// Summary metrics
	sheet.getCell('A7').value = 'Summary Metrics'
	sheet.getCell('A7').font = { bold: true, size: 12 }

	sheet.getCell('A8').value = 'Average Pass Percentage'
	sheet.getCell('B8').value = `${data.average_pass_percentage}%`

	sheet.getCell('A9').value = 'Total Students Appeared'
	sheet.getCell('B9').value = data.total_students_appeared

	sheet.getCell('A10').value = 'Total Students Passed'
	sheet.getCell('B10').value = data.total_students_passed

	sheet.getCell('A12').value = 'Calculation Method'
	sheet.getCell('A12').font = { bold: true }
	sheet.mergeCells('A13:D13')
	sheet.getCell('A13').value = data.calculation_method

	sheet.columns.forEach(col => col.width = 25)
}

function addYearWiseResultsSheet(sheet: ExcelJS.Worksheet, results: NAACCriterion26Data['year_wise_results']) {
	sheet.getCell('A1').value = 'Year-wise Pass Percentage (Last 5 Years)'
	sheet.getCell('A1').font = { bold: true, size: 12 }

	const headers = ['Academic Year', 'Enrolled', 'Appeared', 'Passed', 'Pass Percentage (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	results.forEach((result, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = result.academic_year
		sheet.getCell(rowIndex + 4, 2).value = result.enrolled
		sheet.getCell(rowIndex + 4, 3).value = result.appeared
		sheet.getCell(rowIndex + 4, 4).value = result.passed
		sheet.getCell(rowIndex + 4, 5).value = result.pass_percentage
	})

	sheet.columns.forEach(col => col.width = 18)
}

function addProgramWiseResultsSheet(sheet: ExcelJS.Worksheet, results: NAACCriterion26Data['program_wise_results']) {
	sheet.getCell('A1').value = 'Program-wise Pass Percentage'
	sheet.getCell('A1').font = { bold: true, size: 12 }

	const headers = ['Program Name', 'Enrolled', 'Appeared', 'Passed', 'Pass Percentage (%)']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	results.forEach((result, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = result.program_name
		sheet.getCell(rowIndex + 4, 2).value = result.enrolled
		sheet.getCell(rowIndex + 4, 3).value = result.appeared
		sheet.getCell(rowIndex + 4, 4).value = result.passed
		sheet.getCell(rowIndex + 4, 5).value = result.pass_percentage
	})

	sheet.getColumn(1).width = 40
	sheet.getColumn(2).width = 12
	sheet.getColumn(3).width = 12
	sheet.getColumn(4).width = 12
	sheet.getColumn(5).width = 18
}

function addNAADSummarySheet(sheet: ExcelJS.Worksheet, summary: NAADComplianceSummary, institutionName: string) {
	sheet.mergeCells('A1:D1')
	sheet.getCell('A1').value = 'NAAD Compliance Summary Report'
	sheet.getCell('A1').font = { bold: true, size: 16 }
	sheet.getCell('A1').alignment = { horizontal: 'center' }

	sheet.mergeCells('A2:D2')
	sheet.getCell('A2').value = institutionName
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	// Compliance metrics
	sheet.getCell('A4').value = 'Compliance Metrics'
	sheet.getCell('A4').font = { bold: true, size: 12 }

	const metrics = [
		['Total Students', summary.total_students],
		['ABC Linked Students', summary.abc_linked_students],
		['Aadhaar Verified', summary.aadhaar_verified_students],
		['Results Uploaded to NAAD', summary.results_uploaded],
		['Pending Uploads', summary.pending_uploads],
		['', ''],
		['Overall Compliance', `${summary.compliance_percentage}%`],
		['Aadhaar Compliance', `${summary.aadhaar_compliance}%`],
		['ABC Compliance', `${summary.abc_compliance}%`],
		['Result Compliance', `${summary.result_compliance}%`]
	]

	metrics.forEach((metric, index) => {
		sheet.getCell(`A${5 + index}`).value = metric[0]
		sheet.getCell(`B${5 + index}`).value = metric[1]
		if (metric[0].includes('Compliance')) {
			sheet.getCell(`A${5 + index}`).font = { bold: true }
		}
	})

	sheet.getColumn(1).width = 25
	sheet.getColumn(2).width = 20
}

function addNAADStudentRecordsSheet(sheet: ExcelJS.Worksheet, records: NAADStudentRecord[]) {
	sheet.getCell('A1').value = 'Student Records for NAAD Upload'
	sheet.getCell('A1').font = { bold: true, size: 12 }

	const headers = [
		'Register No', 'Name', 'DOB', 'Gender', 'Aadhaar', 'ABC ID',
		'Program', 'Batch', 'CGPA', 'Result Status', 'NAAD Status'
	]

	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	records.forEach((record, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = record.register_number
		sheet.getCell(rowIndex + 4, 2).value = record.name
		sheet.getCell(rowIndex + 4, 3).value = record.date_of_birth ? new Date(record.date_of_birth).toLocaleDateString() : 'N/A'
		sheet.getCell(rowIndex + 4, 4).value = record.gender
		sheet.getCell(rowIndex + 4, 5).value = record.aadhaar_number ? '****' + record.aadhaar_number.slice(-4) : 'Missing'
		sheet.getCell(rowIndex + 4, 6).value = record.abc_id || 'Not Linked'
		sheet.getCell(rowIndex + 4, 7).value = record.program_name
		sheet.getCell(rowIndex + 4, 8).value = record.batch
		sheet.getCell(rowIndex + 4, 9).value = record.cgpa
		sheet.getCell(rowIndex + 4, 10).value = record.result_status
		sheet.getCell(rowIndex + 4, 11).value = record.naad_status.toUpperCase()

		// Color code NAAD status
		const statusCell = sheet.getCell(rowIndex + 4, 11)
		if (record.naad_status === 'ready') {
			statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF86EFAC' } }
		} else if (record.naad_status === 'error') {
			statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCA5A5' } }
		} else {
			statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
		}
	})

	sheet.getColumn(1).width = 15
	sheet.getColumn(2).width = 25
	sheet.getColumn(3).width = 12
	sheet.getColumn(4).width = 10
	sheet.getColumn(5).width = 15
	sheet.getColumn(6).width = 15
	sheet.getColumn(7).width = 30
	sheet.getColumn(8).width = 15
	sheet.getColumn(9).width = 10
	sheet.getColumn(10).width = 15
	sheet.getColumn(11).width = 12
}

function addDataQualityIssuesSheet(sheet: ExcelJS.Worksheet, issues: NAADComplianceSummary['data_quality_issues']) {
	sheet.getCell('A1').value = 'Data Quality Issues'
	sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } }

	const headers = ['Field', 'Issue', 'Affected Count', 'Severity']
	headers.forEach((header, index) => {
		const cell = sheet.getCell(3, index + 1)
		cell.value = header
		cell.style = headerStyle
	})

	issues.forEach((issue, rowIndex) => {
		sheet.getCell(rowIndex + 4, 1).value = issue.field
		sheet.getCell(rowIndex + 4, 2).value = issue.issue
		sheet.getCell(rowIndex + 4, 3).value = issue.affected_count
		sheet.getCell(rowIndex + 4, 4).value = issue.severity.toUpperCase()

		// Color code severity
		const severityCell = sheet.getCell(rowIndex + 4, 4)
		if (issue.severity === 'high') {
			severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCA5A5' } }
		} else if (issue.severity === 'medium') {
			severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
		} else {
			severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF86EFAC' } }
		}
	})

	sheet.getColumn(1).width = 25
	sheet.getColumn(2).width = 40
	sheet.getColumn(3).width = 18
	sheet.getColumn(4).width = 12
}
