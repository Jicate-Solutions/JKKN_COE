/**
 * NAAD ABC Consolidated CSV Export Utility
 *
 * This utility generates NAAD/ABC-compliant CSV exports with the consolidated format
 * (one row per student per semester with all subjects in columns).
 *
 * Column Mapping:
 * - ORG_NAME: institutions.name
 * - ACADEMIC_COURSE_ID: program_code
 * - COURSE_NAME: program_name
 * - STREAM: blank
 * - SESSION: batch_name
 * - REGN_NO: stu_reg_number
 * - RROLL: blank
 * - CNAME: student_name
 * - GENDER: M/F/O
 * - DOB: DD/MM/YYYY
 * - FNAME: father_name
 * - MNAME: mother_name
 * - SEM: semester
 * - TOT_CREDIT: semester_results.total_credits_earned
 * - TOT_CREDIT_POINTS: semester_results.total_credit_points
 * - CGPA: semester_results.cgpa
 * - ABC_ACCOUNT_ID: aadhar_number
 * - TERM_TYPE: "SEMESTER"
 * - DEPARTMENT: department
 * - SUBnNM through SUBn_REMARKS: Course-wise marks with Theory/Practical logic
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Subject marks structure for each subject column
 */
export interface NAADSubjectData {
	/** Course/Subject name (SUBnNM) */
	name: string
	/** Course/Subject code (SUBn) */
	code: string
	/** Total maximum marks (SUBnMAX) */
	maxMarks: number
	/** Total minimum/pass marks (SUBnMIN) */
	minMarks: number
	/** Course category: Theory or Practical */
	category: 'Theory' | 'Practical' | string
	/** Theory max marks (if Theory course) */
	theoryMax: number | null
	/** Theory min marks (if Theory course) */
	theoryMin: number | null
	/** Theory marks obtained (if Theory course) */
	theoryMarks: number | null
	/** Practical max marks (if Practical course) */
	practicalMax: number | null
	/** Practical min marks (if Practical course) */
	practicalMin: number | null
	/** Practical marks obtained (if Practical course) */
	practicalMarks: number | null
	/** Practical CE marks (if Practical course) */
	practicalCEMarks: number | null
	/** Internal/CE max marks */
	ceMax: number
	/** Internal/CE min marks */
	ceMin: number
	/** Internal/CE marks obtained */
	ceMarks: number
	/** Total marks obtained */
	totalMarks: number
	/** Letter grade (AAA = U, else grade) */
	grade: string
	/** Grade points */
	gradePoints: number
	/** Credits */
	credit: number
	/** Credit points (credit * grade_points) */
	creditPoints: number
	/** Pass status (Pass=P, Absent/Reappear=U) */
	remarks: string
	/** Viva marks (blank for now) */
	vivaMarks: string
}

/**
 * Student row data for NAAD ABC export
 */
export interface NAADABCStudentRow {
	// Organization & Course Info
	orgName: string
	academicCourseId: string
	courseName: string
	stream: string
	session: string

	// Student Personal Info
	regnNo: string
	rroll: string
	cname: string
	gender: 'M' | 'F' | 'O'
	dob: string
	fname: string
	mname: string
	photo: string

	// Result Info
	mrksRecStatus: string
	result: string
	year: string
	csvMonth: string
	month: string
	percent: string
	doi: string
	certNo: string
	sem: string
	examType: string
	totCredit: string
	totCreditPoints: string
	cgpa: string
	abcAccountId: string
	termType: string
	totGrade: string
	department: string

	// Subjects (up to 14)
	subjects: NAADSubjectData[]
}

/**
 * Export configuration
 */
export interface NAADABCExportConfig {
	institutionId?: string
	examinationSessionId?: string
	programId?: string
	semester?: number
	includeEmptySubjects?: boolean
	maxSubjects?: number
}

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

/**
 * Base columns (before subject columns)
 */
export const NAAD_ABC_BASE_COLUMNS = [
	'ORG_NAME',
	'ACADEMIC_COURSE_ID',
	'COURSE_NAME',
	'STREAM',
	'SESSION',
	'REGN_NO',
	'RROLL',
	'CNAME',
	'GENDER',
	'DOB',
	'FNAME',
	'MNAME',
	'PHOTO',
	'MRKS_REC_STATUS',
	'RESULT',
	'YEAR',
	'CSV_MONTH',
	'MONTH',
	'PERCENT',
	'DOI',
	'CERT_NO',
	'SEM',
	'EXAM_TYPE',
	'TOT_CREDIT',
	'TOT_CREDIT_POINTS',
	'CGPA',
	'ABC_ACCOUNT_ID',
	'TERM_TYPE',
	'TOT_GRADE',
	'DEPARTMENT'
] as const

/**
 * Column suffixes for each subject
 * Pattern: SUBn + suffix
 */
export const NAAD_ABC_SUBJECT_SUFFIXES = [
	'NM',           // Subject name
	'',             // Subject code
	'MAX',          // Total max marks
	'MIN',          // Total min marks
	'_TH_MAX',      // Theory max (if Theory)
	'_VV_MRKS',     // Viva marks
	'_PR_CE_MRKS',  // Practical CE marks (if Practical)
	'_TH_MIN',      // Theory min (if Theory)
	'_PR_MAX',      // Practical max (if Practical)
	'_PR_MIN',      // Practical min (if Practical)
	'_CE_MAX',      // Internal/CE max
	'_CE_MIN',      // Internal/CE min
	'_TH_MRKS',     // Theory marks (if Theory)
	'_PR_MRKS',     // Practical marks (if Practical)
	'_CE_MRKS',     // Internal/CE marks
	'_TOT',         // Total marks obtained
	'_GRADE',       // Letter grade
	'_GRADE_POINTS', // Grade points
	'_CREDIT',      // Credits
	'_CREDIT_POINTS', // Credit points
	'_REMARKS'      // Pass status remarks
] as const

/**
 * Generate column headers for a specific subject number
 */
export function getSubjectColumns(subjectNumber: number): string[] {
	const prefix = `SUB${subjectNumber}`
	return NAAD_ABC_SUBJECT_SUFFIXES.map(suffix => `${prefix}${suffix}`)
}

/**
 * Generate all column headers for the CSV
 * @param maxSubjects Maximum number of subjects to include (default 14)
 */
export function getAllNAADABCColumns(maxSubjects: number = 14): string[] {
	const columns = [...NAAD_ABC_BASE_COLUMNS]

	for (let i = 1; i <= maxSubjects; i++) {
		columns.push(...getSubjectColumns(i))
	}

	return columns
}

// =============================================================================
// DATA CONVERSION
// =============================================================================

/**
 * Convert subject data to CSV row values
 */
export function subjectToCSVValues(subject: NAADSubjectData | null): string[] {
	if (!subject) {
		// Return empty values for missing subject
		return NAAD_ABC_SUBJECT_SUFFIXES.map(() => '')
	}

	const isTheory = subject.category === 'Theory'
	const isPractical = subject.category === 'Practical'

	return [
		subject.name.toUpperCase(),
		subject.code.toUpperCase(),
		subject.maxMarks?.toString() || '',
		subject.minMarks?.toString() || '',
		isTheory ? (subject.theoryMax?.toString() || subject.maxMarks?.toString() || '') : '',
		subject.vivaMarks || '',
		isPractical ? (subject.practicalCEMarks?.toString() || subject.ceMarks?.toString() || '') : '',
		isTheory ? (subject.theoryMin?.toString() || subject.minMarks?.toString() || '') : '',
		isPractical ? (subject.practicalMax?.toString() || subject.maxMarks?.toString() || '') : '',
		isPractical ? (subject.practicalMin?.toString() || subject.minMarks?.toString() || '') : '',
		subject.ceMax?.toString() || '',
		subject.ceMin?.toString() || '',
		isTheory ? (subject.theoryMarks?.toString() || '') : '',
		isPractical ? (subject.practicalMarks?.toString() || '') : '',
		subject.ceMarks?.toString() || '',
		subject.totalMarks?.toString() || '',
		// Grade: if AAA then U, else grade
		subject.grade === 'AAA' ? 'U' : subject.grade,
		subject.gradePoints?.toString() || '',
		subject.credit?.toString() || '',
		subject.creditPoints?.toString() || '',
		subject.remarks || ''
	]
}

/**
 * Convert student row data to CSV row values
 * @param student Student row data
 * @param maxSubjects Maximum number of subjects to include
 */
export function studentRowToCSV(student: NAADABCStudentRow, maxSubjects: number = 14): string[] {
	const values: string[] = [
		student.orgName.toUpperCase(),
		student.academicCourseId.toUpperCase(),
		student.courseName.toUpperCase(),
		student.stream,
		student.session,
		student.regnNo,
		student.rroll,
		student.cname.toUpperCase(),
		student.gender,
		student.dob,
		student.fname.toUpperCase(),
		student.mname.toUpperCase(),
		student.photo,
		student.mrksRecStatus,
		student.result,
		student.year,
		student.csvMonth,
		student.month,
		student.percent,
		student.doi,
		student.certNo,
		student.sem,
		student.examType,
		student.totCredit,
		student.totCreditPoints,
		student.cgpa,
		student.abcAccountId,
		student.termType,
		student.totGrade,
		student.department.toUpperCase()
	]

	// Add subject columns
	for (let i = 0; i < maxSubjects; i++) {
		const subject = student.subjects[i] || null
		values.push(...subjectToCSVValues(subject))
	}

	return values
}

/**
 * Generate CSV content from student data
 */
export function generateNAADABCCSV(
	students: NAADABCStudentRow[],
	maxSubjects: number = 14
): string {
	const headers = getAllNAADABCColumns(maxSubjects)
	const lines: string[] = []

	// Add header row
	lines.push(headers.join(','))

	// Add data rows
	for (const student of students) {
		const values = studentRowToCSV(student, maxSubjects)
		// Escape fields that might contain commas or quotes
		const escapedValues = values.map(field => {
			if (field.includes(',') || field.includes('"') || field.includes('\n')) {
				return `"${field.replace(/"/g, '""')}"`
			}
			return field
		})
		lines.push(escapedValues.join(','))
	}

	return lines.join('\n')
}

// =============================================================================
// PASS STATUS HELPERS
// =============================================================================

/**
 * Convert pass status to NAAD remarks format
 * Pass = P, Absent = U, Reappear = U, Fail = F
 */
export function passStatusToRemarks(passStatus: string | null): string {
	if (!passStatus) return ''

	const status = passStatus.toLowerCase().trim()
	switch (status) {
		case 'pass':
			return 'P'
		case 'absent':
		case 'reappear':
			return 'U'
		case 'fail':
			return 'F'
		case 'withheld':
			return 'W'
		case 'expelled':
			return 'E'
		default:
			return status.substring(0, 1).toUpperCase()
	}
}

/**
 * Convert letter grade to NAAD format
 * AAA grade should be shown as U
 */
export function gradeToNAADFormat(letterGrade: string | null): string {
	if (!letterGrade) return ''
	if (letterGrade === 'AAA') return 'U'
	return letterGrade
}

// =============================================================================
// SAMPLE DATA GENERATOR
// =============================================================================

/**
 * Generate sample student data for testing
 */
export function generateSampleNAADABCData(): NAADABCStudentRow[] {
	const sampleSubjects: NAADSubjectData[] = [
		{
			name: 'TAMIL LITERATURE',
			code: 'TAM101',
			maxMarks: 100,
			minMarks: 40,
			category: 'Theory',
			theoryMax: 100,
			theoryMin: 40,
			theoryMarks: 65,
			practicalMax: null,
			practicalMin: null,
			practicalMarks: null,
			practicalCEMarks: null,
			ceMax: 25,
			ceMin: 10,
			ceMarks: 18,
			totalMarks: 83,
			grade: 'A',
			gradePoints: 8,
			credit: 4,
			creditPoints: 32,
			remarks: 'P',
			vivaMarks: ''
		},
		{
			name: 'ENGLISH LITERATURE',
			code: 'ENG101',
			maxMarks: 100,
			minMarks: 40,
			category: 'Theory',
			theoryMax: 100,
			theoryMin: 40,
			theoryMarks: 58,
			practicalMax: null,
			practicalMin: null,
			practicalMarks: null,
			practicalCEMarks: null,
			ceMax: 25,
			ceMin: 10,
			ceMarks: 20,
			totalMarks: 78,
			grade: 'B+',
			gradePoints: 7,
			credit: 4,
			creditPoints: 28,
			remarks: 'P',
			vivaMarks: ''
		},
		{
			name: 'HISTORY OF INDIA',
			code: 'HIS101',
			maxMarks: 100,
			minMarks: 40,
			category: 'Theory',
			theoryMax: 100,
			theoryMin: 40,
			theoryMarks: 72,
			practicalMax: null,
			practicalMin: null,
			practicalMarks: null,
			practicalCEMarks: null,
			ceMax: 25,
			ceMin: 10,
			ceMarks: 22,
			totalMarks: 94,
			grade: 'O',
			gradePoints: 10,
			credit: 5,
			creditPoints: 50,
			remarks: 'P',
			vivaMarks: ''
		},
		{
			name: 'COMPUTER PRACTICAL',
			code: 'COM101P',
			maxMarks: 100,
			minMarks: 40,
			category: 'Practical',
			theoryMax: null,
			theoryMin: null,
			theoryMarks: null,
			practicalMax: 100,
			practicalMin: 40,
			practicalMarks: 68,
			practicalCEMarks: 18,
			ceMax: 25,
			ceMin: 10,
			ceMarks: 18,
			totalMarks: 86,
			grade: 'A+',
			gradePoints: 9,
			credit: 3,
			creditPoints: 27,
			remarks: 'P',
			vivaMarks: ''
		},
		{
			name: 'ENVIRONMENTAL STUDIES',
			code: 'ENV101',
			maxMarks: 100,
			minMarks: 40,
			category: 'Theory',
			theoryMax: 100,
			theoryMin: 40,
			theoryMarks: 55,
			practicalMax: null,
			practicalMin: null,
			practicalMarks: null,
			practicalCEMarks: null,
			ceMax: 25,
			ceMin: 10,
			ceMarks: 16,
			totalMarks: 71,
			grade: 'B',
			gradePoints: 6,
			credit: 2,
			creditPoints: 12,
			remarks: 'P',
			vivaMarks: ''
		}
	]

	return [
		{
			orgName: 'JKKN ARTS AND SCIENCE COLLEGE',
			academicCourseId: 'BA-HIST',
			courseName: 'BACHELOR OF ARTS HISTORY',
			stream: '',
			session: '2024-25',
			regnNo: '21BA101',
			rroll: '',
			cname: 'ARUN KUMAR K',
			gender: 'M',
			dob: '15/06/2003',
			fname: 'KUMAR VELU',
			mname: 'LAKSHMI DEVI',
			photo: '',
			mrksRecStatus: '',
			result: 'NOV24',
			year: '2024',
			csvMonth: '',
			month: 'NOV',
			percent: '82.40',
			doi: '',
			certNo: '',
			sem: '1',
			examType: '',
			totCredit: '18',
			totCreditPoints: '149.00',
			cgpa: '8.28',
			abcAccountId: '100000000001',
			termType: 'SEMESTER',
			totGrade: '',
			department: 'HISTORY',
			subjects: sampleSubjects
		},
		{
			orgName: 'JKKN ARTS AND SCIENCE COLLEGE',
			academicCourseId: 'BA-HIST',
			courseName: 'BACHELOR OF ARTS HISTORY',
			stream: '',
			session: '2024-25',
			regnNo: '21BA102',
			rroll: '',
			cname: 'PRIYA SHARMA',
			gender: 'F',
			dob: '22/09/2003',
			fname: 'RAJESH SHARMA',
			mname: 'SUNITA SHARMA',
			photo: '',
			mrksRecStatus: '',
			result: 'NOV24',
			year: '2024',
			csvMonth: '',
			month: 'NOV',
			percent: '78.20',
			doi: '',
			certNo: '',
			sem: '1',
			examType: '',
			totCredit: '18',
			totCreditPoints: '136.00',
			cgpa: '7.56',
			abcAccountId: '100000000002',
			termType: 'SEMESTER',
			totGrade: '',
			department: 'HISTORY',
			subjects: sampleSubjects.map(s => ({
				...s,
				totalMarks: s.totalMarks - 5,
				grade: s.grade === 'O' ? 'A+' : s.grade
			}))
		}
	]
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Generate sample CSV for testing
 */
export function getSampleNAADABCCSV(): string {
	const sampleData = generateSampleNAADABCData()
	return generateNAADABCCSV(sampleData, 7) // 7 subjects max for sample
}

/**
 * Download CSV as file (browser only)
 */
export function downloadNAADABCCSV(
	students: NAADABCStudentRow[],
	filename: string = 'naad_abc_export.csv',
	maxSubjects: number = 14
): void {
	const csvContent = generateNAADABCCSV(students, maxSubjects)
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
	const link = document.createElement('a')
	const url = URL.createObjectURL(blob)

	link.setAttribute('href', url)
	link.setAttribute('download', filename)
	link.style.visibility = 'hidden'
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

export const NAAD_ABC_EXPORT_DOCUMENTATION = {
	title: 'NAAD ABC Consolidated Export Format',
	version: '1.0',
	lastUpdated: '2024-12-23',

	description: `
    This format generates one row per student per semester with all subjects
    pivoted into columns (SUB1-SUB14). Subjects are ordered by course_mapping.course_order.
  `,

	columnGroups: {
		organization: ['ORG_NAME', 'ACADEMIC_COURSE_ID', 'COURSE_NAME', 'STREAM', 'SESSION'],
		student: ['REGN_NO', 'RROLL', 'CNAME', 'GENDER', 'DOB', 'FNAME', 'MNAME', 'PHOTO'],
		result: [
			'MRKS_REC_STATUS', 'RESULT', 'YEAR', 'CSV_MONTH', 'MONTH', 'PERCENT',
			'DOI', 'CERT_NO', 'SEM', 'EXAM_TYPE', 'TOT_CREDIT', 'TOT_CREDIT_POINTS',
			'CGPA', 'ABC_ACCOUNT_ID', 'TERM_TYPE', 'TOT_GRADE', 'DEPARTMENT'
		],
		subject: [
			'SUBnNM', 'SUBn', 'SUBnMAX', 'SUBnMIN', 'SUBn_TH_MAX', 'SUBn_VV_MRKS',
			'SUBn_PR_CE_MRKS', 'SUBn_TH_MIN', 'SUBn_PR_MAX', 'SUBn_PR_MIN',
			'SUBn_CE_MAX', 'SUBn_CE_MIN', 'SUBn_TH_MRKS', 'SUBn_PR_MRKS',
			'SUBn_CE_MRKS', 'SUBn_TOT', 'SUBn_GRADE', 'SUBn_GRADE_POINTS',
			'SUBn_CREDIT', 'SUBn_CREDIT_POINTS', 'SUBn_REMARKS'
		]
	},

	theoryPracticalLogic: {
		theory: [
			'SUBn_TH_MAX - filled with total_max_mark',
			'SUBn_TH_MIN - filled with total_pass_mark',
			'SUBn_TH_MRKS - filled with external_marks_obtained'
		],
		practical: [
			'SUBn_PR_MAX - filled with total_max_mark',
			'SUBn_PR_MIN - filled with total_pass_mark',
			'SUBn_PR_MRKS - filled with external_marks_obtained',
			'SUBn_PR_CE_MRKS - filled with internal_marks_obtained'
		]
	},

	gradeMapping: {
		'AAA': 'U (Unsuccessful)',
		'O': 'Outstanding (10 points)',
		'A+': 'Excellent (9 points)',
		'A': 'Very Good (8 points)',
		'B+': 'Good (7 points)',
		'B': 'Above Average (6 points)',
		'C': 'Average (5 points)',
		'P': 'Pass (4 points)',
		'F': 'Fail (0 points)'
	},

	passStatusMapping: {
		'Pass': 'P',
		'Absent': 'U',
		'Reappear': 'U',
		'Fail': 'F',
		'Withheld': 'W',
		'Expelled': 'E'
	}
}
