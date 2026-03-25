/**
 * NAAD Excel Template Generator
 *
 * This utility generates NAAD-compliant Excel templates for uploading
 * student examination results to the National Academic Depository.
 *
 * Usage:
 * - generateNAADExcelTemplate() - Returns sample data as arrays
 * - Use with xlsx library to create actual Excel files
 */

import {
	NAAD_UPLOAD_COLUMNS,
	NAADUploadRow,
	NAADUploadExportConfig,
	generateSampleNAADUploadData,
	formatNAADUploadDate
} from '@/types/naad-csv-format'

/**
 * Excel template configuration
 */
export interface NAADExcelTemplateConfig {
	programName: string
	programCode: string
	semester: number
	academicYear: string
	examSession: string
	institutionName: string
	institutionCode: string
	universityName: string
	resultDate: Date
	includesSampleData?: boolean
	sampleStudentCount?: number
}

/**
 * Default configuration for B.A. History II semester
 */
export const DEFAULT_NAAD_TEMPLATE_CONFIG: NAADExcelTemplateConfig = {
	programName: 'BACHELOR OF ARTS HISTORY',
	programCode: 'BA-HIST',
	semester: 2,
	academicYear: '2023-24',
	examSession: 'MAY 2024',
	institutionName: 'JKKN ARTS AND SCIENCE COLLEGE',
	institutionCode: 'JKKNASC',
	universityName: 'PERIYAR UNIVERSITY',
	resultDate: new Date(2024, 5, 15), // June 15, 2024
	includesSampleData: true,
	sampleStudentCount: 5
}

/**
 * Sheet naming convention for NAAD Excel files
 * Format: PROGRAM_CODE_SEM_SEMESTER
 */
export function getNAADSheetName(programCode: string, semester: number): string {
	const cleanCode = programCode.replace(/[^A-Z0-9]/g, '').toUpperCase()
	return `${cleanCode}_SEM_${semester}`
}

/**
 * Generate NAAD Excel template data as arrays
 * First row contains headers, subsequent rows contain data
 */
export function generateNAADExcelTemplate(
	config: NAADExcelTemplateConfig = DEFAULT_NAAD_TEMPLATE_CONFIG
): {
	sheetName: string
	headers: string[]
	rows: string[][]
	metadata: {
		programName: string
		semester: number
		academicYear: string
		generatedAt: string
		totalRows: number
	}
} {
	const exportConfig: NAADUploadExportConfig = {
		programName: config.programName,
		programCode: config.programCode,
		semester: config.semester,
		academicYear: config.academicYear,
		examSession: config.examSession,
		institutionName: config.institutionName,
		institutionCode: config.institutionCode,
		universityName: config.universityName,
		resultDate: config.resultDate
	}

	const headers = [...NAAD_UPLOAD_COLUMNS] as string[]

	let sampleRows: NAADUploadRow[] = []
	if (config.includesSampleData !== false) {
		sampleRows = generateSampleNAADUploadData(
			exportConfig,
			config.sampleStudentCount || 5
		)
	}

	// Convert NAADUploadRow objects to string arrays
	const rows: string[][] = sampleRows.map(row => [
		row.ABC_ID,
		row.STUDENT_NAME,
		row.FATHER_NAME,
		row.MOTHER_NAME,
		row.DATE_OF_BIRTH,
		row.GENDER,
		row.PROGRAM_NAME,
		row.PROGRAM_CODE,
		row.SEMESTER,
		row.ENROLLMENT_NUMBER,
		row.ROLL_NUMBER,
		row.INSTITUTION_NAME,
		row.INSTITUTION_CODE,
		row.UNIVERSITY_NAME,
		row.ACADEMIC_YEAR,
		row.EXAM_SESSION,
		row.SUBJECT_CODE,
		row.SUBJECT_NAME,
		row.MAX_MARKS,
		row.MARKS_OBTAINED,
		row.RESULT_STATUS,
		row.SGPA,
		row.CGPA,
		row.RESULT_DATE
	])

	return {
		sheetName: getNAADSheetName(config.programCode, config.semester),
		headers,
		rows,
		metadata: {
			programName: config.programName,
			semester: config.semester,
			academicYear: config.academicYear,
			generatedAt: new Date().toISOString(),
			totalRows: rows.length
		}
	}
}

/**
 * Sample data for 5 students with 5 subjects each (25 rows total)
 * This is ready for NAAD upload
 */
export function getSampleNAADData(): NAADUploadRow[] {
	return generateSampleNAADUploadData(
		{
			programName: 'BACHELOR OF ARTS HISTORY',
			programCode: 'BA-HIST',
			semester: 2,
			academicYear: '2023-24',
			examSession: 'MAY 2024',
			institutionName: 'JKKN ARTS AND SCIENCE COLLEGE',
			institutionCode: 'JKKNASC',
			universityName: 'PERIYAR UNIVERSITY',
			resultDate: new Date(2024, 5, 15)
		},
		5
	)
}

/**
 * Format sample data as CSV string
 * For quick copy-paste or testing
 */
export function getSampleNAADDataAsCSV(): string {
	const template = generateNAADExcelTemplate()
	const csvLines: string[] = []

	// Add header row
	csvLines.push(template.headers.join(','))

	// Add data rows
	for (const row of template.rows) {
		// Escape fields that might contain commas
		const escapedRow = row.map(field => {
			if (field.includes(',') || field.includes('"')) {
				return `"${field.replace(/"/g, '""')}"`
			}
			return field
		})
		csvLines.push(escapedRow.join(','))
	}

	return csvLines.join('\n')
}

/**
 * NAAD Template Documentation
 */
export const NAAD_TEMPLATE_DOCUMENTATION = {
	title: 'NAAD (National Academic Depository) Excel Template',
	version: '1.0',
	lastUpdated: '2024',

	fileRequirements: [
		'One Excel sheet per Program + Semester',
		'Column names must be exact, fixed, and in the same order',
		'No merged cells',
		'Date format: DD-MM-YYYY',
		'Text fields in UPPERCASE',
		'Numeric fields without symbols',
		'No extra spaces or special characters'
	],

	dataRules: [
		'One row per student per subject',
		'SGPA and CGPA repeated for all subjects of the same student',
		'RESULT_STATUS must be PASS or FAIL only',
		'Program and semester must match the sheet name',
		'ABC_ID must be exactly 12 digits',
		'GENDER must be MALE, FEMALE, or OTHER',
		'Dates must be in DD-MM-YYYY format'
	],

	columns: [
		{ name: 'ABC_ID', description: 'Academic Bank of Credits ID (12 digits)', required: true },
		{ name: 'STUDENT_NAME', description: 'Full name in UPPERCASE', required: true },
		{ name: 'FATHER_NAME', description: "Father's name in UPPERCASE", required: true },
		{ name: 'MOTHER_NAME', description: "Mother's name in UPPERCASE", required: true },
		{ name: 'DATE_OF_BIRTH', description: 'DOB in DD-MM-YYYY format', required: true },
		{ name: 'GENDER', description: 'MALE / FEMALE / OTHER', required: true },
		{ name: 'PROGRAM_NAME', description: 'Full program name', required: true },
		{ name: 'PROGRAM_CODE', description: 'Program code', required: true },
		{ name: 'SEMESTER', description: 'Semester number', required: true },
		{ name: 'ENROLLMENT_NUMBER', description: 'Enrollment number', required: true },
		{ name: 'ROLL_NUMBER', description: 'Roll number', required: true },
		{ name: 'INSTITUTION_NAME', description: 'Institution name', required: true },
		{ name: 'INSTITUTION_CODE', description: 'Institution code', required: true },
		{ name: 'UNIVERSITY_NAME', description: 'University name', required: true },
		{ name: 'ACADEMIC_YEAR', description: 'Academic year (YYYY-YY)', required: true },
		{ name: 'EXAM_SESSION', description: 'Exam session (e.g., MAY 2024)', required: true },
		{ name: 'SUBJECT_CODE', description: 'Subject/course code', required: true },
		{ name: 'SUBJECT_NAME', description: 'Subject name in UPPERCASE', required: true },
		{ name: 'MAX_MARKS', description: 'Maximum marks', required: true },
		{ name: 'MARKS_OBTAINED', description: 'Marks obtained', required: true },
		{ name: 'RESULT_STATUS', description: 'PASS or FAIL only', required: true },
		{ name: 'SGPA', description: 'Semester GPA (0.00-10.00)', required: true },
		{ name: 'CGPA', description: 'Cumulative GPA (0.00-10.00)', required: true },
		{ name: 'RESULT_DATE', description: 'Result date (DD-MM-YYYY)', required: true }
	]
}

/**
 * Generate HTML table preview of the template
 * Useful for displaying in UI before download
 */
export function generateNAADTemplatePreviewHTML(
	config: NAADExcelTemplateConfig = DEFAULT_NAAD_TEMPLATE_CONFIG,
	maxRows: number = 10
): string {
	const template = generateNAADExcelTemplate(config)
	const displayRows = template.rows.slice(0, maxRows)

	let html = `
<div class="naad-template-preview">
  <h3>${template.sheetName}</h3>
  <p>Program: ${template.metadata.programName} | Semester: ${template.metadata.semester} | Year: ${template.metadata.academicYear}</p>
  <table border="1" cellpadding="4" cellspacing="0">
    <thead>
      <tr style="background-color: #f0f0f0;">
        ${template.headers.map(h => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${displayRows.map(row => `
        <tr>
          ${row.map(cell => `<td>${cell}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  ${template.rows.length > maxRows ? `<p>... and ${template.rows.length - maxRows} more rows</p>` : ''}
</div>`

	return html
}
