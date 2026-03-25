/**
 * NAAD (National Academic Depository) CSV Format Type Definitions
 *
 * This file defines TypeScript interfaces for the NAAD CSV export format
 * used for uploading academic records to the National Academic Depository.
 *
 * The format supports up to 14 subjects per student record with detailed
 * mark breakdowns including Theory, Practical, CE (Continuous Evaluation),
 * grades, and credits for each subject.
 *
 * Integration with Academic Bank of Credits (ABC) is supported through
 * ABC_ACCOUNT_ID and AADHAAR_NAME fields.
 *
 * @see https://nad.digilocker.gov.in/ - National Academic Depository Portal
 * @see https://abc.gov.in/ - Academic Bank of Credits Portal
 */

// =============================================================================
// ORGANIZATION & COURSE INFORMATION
// =============================================================================

/**
 * Organization (Institution) details in the NAAD format
 */
export interface NAADOrganization {
	/** Full name of the educational institution */
	ORG_NAME: string

	/** Unique identifier for the academic course/program */
	ACADEMIC_COURSE_ID: string

	/** Name of the course/program (e.g., "B.A HISTORY") */
	COURSE_NAME: string

	/** Stream/Specialization (e.g., "HISTORY", "ECONOMICS") */
	STREAM: string

	/** Academic session (e.g., "2024-25") */
	SESSION: string
}

// =============================================================================
// STUDENT PERSONAL INFORMATION
// =============================================================================

/**
 * Student personal information in NAAD format
 */
export interface NAADStudentInfo {
	/** Student's registration number */
	REGN_NO: string

	/** Student's full name (as per academic records) */
	CNAME: string

	/** Gender (M/F/O) */
	GENDER: 'M' | 'F' | 'O'

	/** Date of Birth (DD/MM/YYYY format) */
	DOB: string

	/** Father's name */
	FNAME: string

	/** Mother's name */
	MNAME: string

	/** Academic Bank of Credits Account ID (12-digit) */
	ABC_ACCOUNT_ID: string

	/** Name as per Aadhaar card */
	AADHAAR_NAME: string
}

// =============================================================================
// RESULT INFORMATION
// =============================================================================

/**
 * Overall result information for a semester
 */
export interface NAADResultInfo {
	/** Overall result status (PASS/FAIL/PROMOTED) */
	RESULT: 'PASS' | 'FAIL' | 'PROMOTED' | 'WITHHELD' | 'ABSENT'

	/** Examination year (YYYY format) */
	YEAR: string

	/** Examination month (1-12 or JAN-DEC) */
	MONTH: string

	/** Overall percentage scored */
	PERCENT: string

	/** Cumulative Grade Point Average (0.00 - 10.00) */
	CGPA: string

	/** Semester number (1-8 for UG, 1-4 for PG typically) */
	SEM: string

	/** Type of examination */
	EXAM_TYPE: 'REGULAR' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'ARREAR'
}

// =============================================================================
// SUBJECT/COURSE MARKS STRUCTURE
// =============================================================================

/**
 * Detailed marks structure for a single subject
 * This interface represents all mark components for one subject
 */
export interface NAADSubjectMarks {
	/** Subject/Course code */
	SUB_CODE: string

	/** Subject/Course name */
	SUB_NAME: string

	/** Theory marks obtained */
	THEORY: string

	/** Practical marks obtained */
	PRACTICAL: string

	/** Maximum theory marks */
	MAX_THEORY: string

	/** Maximum practical marks */
	MAX_PRACTICAL: string

	/** Continuous Evaluation/Internal Assessment marks */
	CE: string

	/** Maximum CE/Internal marks */
	MAX_CE: string

	/** Total marks obtained (Theory + Practical + CE) */
	TOTAL: string

	/** Maximum total marks */
	MAX_MARKS: string

	/** Letter grade (O, A+, A, B+, B, C, D, F) */
	GRADE: string

	/** Grade point (10, 9, 8, 7, 6, 5, 4, 0) */
	GRADE_POINT: string

	/** Credits assigned to the subject */
	CREDIT: string

	/** Credit points earned (Grade Point x Credits) */
	CREDIT_POINT: string

	/** Subject pass status */
	STATUS: 'PASS' | 'FAIL' | 'ABSENT' | 'RA' | 'WH'
}

/**
 * Generic subject field naming pattern used in NAAD CSV
 * Fields follow pattern: SUBn_FIELDNAME where n is 1-14
 */
export type NAADSubjectFieldPrefix =
	| 'SUB1' | 'SUB2' | 'SUB3' | 'SUB4' | 'SUB5'
	| 'SUB6' | 'SUB7' | 'SUB8' | 'SUB9' | 'SUB10'
	| 'SUB11' | 'SUB12' | 'SUB13' | 'SUB14'

/**
 * Field suffixes for each subject in NAAD format
 */
export type NAADSubjectFieldSuffix =
	| 'SUB_CODE' | 'SUB_NAME' | 'THEORY' | 'PRACTICAL'
	| 'MAX_THEORY' | 'MAX_PRACTICAL' | 'CE' | 'MAX_CE'
	| 'TOTAL' | 'MAX_MARKS' | 'GRADE' | 'GRADE_POINT'
	| 'CREDIT' | 'CREDIT_POINT' | 'STATUS'

// =============================================================================
// COMPLETE NAAD CSV ROW STRUCTURE
// =============================================================================

/**
 * Complete NAAD CSV row structure representing a single student's semester result
 *
 * The format contains:
 * - Organization details (5 fields)
 * - Student personal info (8 fields)
 * - Result summary (7 fields)
 * - Up to 14 subjects with 15 fields each (210 fields)
 *
 * Total possible columns: ~230
 */
export interface NAADCSVRow extends NAADOrganization, NAADStudentInfo, NAADResultInfo {
	// Subject 1
	SUB1_SUB_CODE?: string
	SUB1_SUB_NAME?: string
	SUB1_THEORY?: string
	SUB1_PRACTICAL?: string
	SUB1_MAX_THEORY?: string
	SUB1_MAX_PRACTICAL?: string
	SUB1_CE?: string
	SUB1_MAX_CE?: string
	SUB1_TOTAL?: string
	SUB1_MAX_MARKS?: string
	SUB1_GRADE?: string
	SUB1_GRADE_POINT?: string
	SUB1_CREDIT?: string
	SUB1_CREDIT_POINT?: string
	SUB1_STATUS?: string

	// Subject 2
	SUB2_SUB_CODE?: string
	SUB2_SUB_NAME?: string
	SUB2_THEORY?: string
	SUB2_PRACTICAL?: string
	SUB2_MAX_THEORY?: string
	SUB2_MAX_PRACTICAL?: string
	SUB2_CE?: string
	SUB2_MAX_CE?: string
	SUB2_TOTAL?: string
	SUB2_MAX_MARKS?: string
	SUB2_GRADE?: string
	SUB2_GRADE_POINT?: string
	SUB2_CREDIT?: string
	SUB2_CREDIT_POINT?: string
	SUB2_STATUS?: string

	// Subject 3
	SUB3_SUB_CODE?: string
	SUB3_SUB_NAME?: string
	SUB3_THEORY?: string
	SUB3_PRACTICAL?: string
	SUB3_MAX_THEORY?: string
	SUB3_MAX_PRACTICAL?: string
	SUB3_CE?: string
	SUB3_MAX_CE?: string
	SUB3_TOTAL?: string
	SUB3_MAX_MARKS?: string
	SUB3_GRADE?: string
	SUB3_GRADE_POINT?: string
	SUB3_CREDIT?: string
	SUB3_CREDIT_POINT?: string
	SUB3_STATUS?: string

	// Subject 4
	SUB4_SUB_CODE?: string
	SUB4_SUB_NAME?: string
	SUB4_THEORY?: string
	SUB4_PRACTICAL?: string
	SUB4_MAX_THEORY?: string
	SUB4_MAX_PRACTICAL?: string
	SUB4_CE?: string
	SUB4_MAX_CE?: string
	SUB4_TOTAL?: string
	SUB4_MAX_MARKS?: string
	SUB4_GRADE?: string
	SUB4_GRADE_POINT?: string
	SUB4_CREDIT?: string
	SUB4_CREDIT_POINT?: string
	SUB4_STATUS?: string

	// Subject 5
	SUB5_SUB_CODE?: string
	SUB5_SUB_NAME?: string
	SUB5_THEORY?: string
	SUB5_PRACTICAL?: string
	SUB5_MAX_THEORY?: string
	SUB5_MAX_PRACTICAL?: string
	SUB5_CE?: string
	SUB5_MAX_CE?: string
	SUB5_TOTAL?: string
	SUB5_MAX_MARKS?: string
	SUB5_GRADE?: string
	SUB5_GRADE_POINT?: string
	SUB5_CREDIT?: string
	SUB5_CREDIT_POINT?: string
	SUB5_STATUS?: string

	// Subject 6
	SUB6_SUB_CODE?: string
	SUB6_SUB_NAME?: string
	SUB6_THEORY?: string
	SUB6_PRACTICAL?: string
	SUB6_MAX_THEORY?: string
	SUB6_MAX_PRACTICAL?: string
	SUB6_CE?: string
	SUB6_MAX_CE?: string
	SUB6_TOTAL?: string
	SUB6_MAX_MARKS?: string
	SUB6_GRADE?: string
	SUB6_GRADE_POINT?: string
	SUB6_CREDIT?: string
	SUB6_CREDIT_POINT?: string
	SUB6_STATUS?: string

	// Subject 7
	SUB7_SUB_CODE?: string
	SUB7_SUB_NAME?: string
	SUB7_THEORY?: string
	SUB7_PRACTICAL?: string
	SUB7_MAX_THEORY?: string
	SUB7_MAX_PRACTICAL?: string
	SUB7_CE?: string
	SUB7_MAX_CE?: string
	SUB7_TOTAL?: string
	SUB7_MAX_MARKS?: string
	SUB7_GRADE?: string
	SUB7_GRADE_POINT?: string
	SUB7_CREDIT?: string
	SUB7_CREDIT_POINT?: string
	SUB7_STATUS?: string

	// Subject 8
	SUB8_SUB_CODE?: string
	SUB8_SUB_NAME?: string
	SUB8_THEORY?: string
	SUB8_PRACTICAL?: string
	SUB8_MAX_THEORY?: string
	SUB8_MAX_PRACTICAL?: string
	SUB8_CE?: string
	SUB8_MAX_CE?: string
	SUB8_TOTAL?: string
	SUB8_MAX_MARKS?: string
	SUB8_GRADE?: string
	SUB8_GRADE_POINT?: string
	SUB8_CREDIT?: string
	SUB8_CREDIT_POINT?: string
	SUB8_STATUS?: string

	// Subject 9
	SUB9_SUB_CODE?: string
	SUB9_SUB_NAME?: string
	SUB9_THEORY?: string
	SUB9_PRACTICAL?: string
	SUB9_MAX_THEORY?: string
	SUB9_MAX_PRACTICAL?: string
	SUB9_CE?: string
	SUB9_MAX_CE?: string
	SUB9_TOTAL?: string
	SUB9_MAX_MARKS?: string
	SUB9_GRADE?: string
	SUB9_GRADE_POINT?: string
	SUB9_CREDIT?: string
	SUB9_CREDIT_POINT?: string
	SUB9_STATUS?: string

	// Subject 10
	SUB10_SUB_CODE?: string
	SUB10_SUB_NAME?: string
	SUB10_THEORY?: string
	SUB10_PRACTICAL?: string
	SUB10_MAX_THEORY?: string
	SUB10_MAX_PRACTICAL?: string
	SUB10_CE?: string
	SUB10_MAX_CE?: string
	SUB10_TOTAL?: string
	SUB10_MAX_MARKS?: string
	SUB10_GRADE?: string
	SUB10_GRADE_POINT?: string
	SUB10_CREDIT?: string
	SUB10_CREDIT_POINT?: string
	SUB10_STATUS?: string

	// Subject 11
	SUB11_SUB_CODE?: string
	SUB11_SUB_NAME?: string
	SUB11_THEORY?: string
	SUB11_PRACTICAL?: string
	SUB11_MAX_THEORY?: string
	SUB11_MAX_PRACTICAL?: string
	SUB11_CE?: string
	SUB11_MAX_CE?: string
	SUB11_TOTAL?: string
	SUB11_MAX_MARKS?: string
	SUB11_GRADE?: string
	SUB11_GRADE_POINT?: string
	SUB11_CREDIT?: string
	SUB11_CREDIT_POINT?: string
	SUB11_STATUS?: string

	// Subject 12
	SUB12_SUB_CODE?: string
	SUB12_SUB_NAME?: string
	SUB12_THEORY?: string
	SUB12_PRACTICAL?: string
	SUB12_MAX_THEORY?: string
	SUB12_MAX_PRACTICAL?: string
	SUB12_CE?: string
	SUB12_MAX_CE?: string
	SUB12_TOTAL?: string
	SUB12_MAX_MARKS?: string
	SUB12_GRADE?: string
	SUB12_GRADE_POINT?: string
	SUB12_CREDIT?: string
	SUB12_CREDIT_POINT?: string
	SUB12_STATUS?: string

	// Subject 13
	SUB13_SUB_CODE?: string
	SUB13_SUB_NAME?: string
	SUB13_THEORY?: string
	SUB13_PRACTICAL?: string
	SUB13_MAX_THEORY?: string
	SUB13_MAX_PRACTICAL?: string
	SUB13_CE?: string
	SUB13_MAX_CE?: string
	SUB13_TOTAL?: string
	SUB13_MAX_MARKS?: string
	SUB13_GRADE?: string
	SUB13_GRADE_POINT?: string
	SUB13_CREDIT?: string
	SUB13_CREDIT_POINT?: string
	SUB13_STATUS?: string

	// Subject 14
	SUB14_SUB_CODE?: string
	SUB14_SUB_NAME?: string
	SUB14_THEORY?: string
	SUB14_PRACTICAL?: string
	SUB14_MAX_THEORY?: string
	SUB14_MAX_PRACTICAL?: string
	SUB14_CE?: string
	SUB14_MAX_CE?: string
	SUB14_TOTAL?: string
	SUB14_MAX_MARKS?: string
	SUB14_GRADE?: string
	SUB14_GRADE_POINT?: string
	SUB14_CREDIT?: string
	SUB14_CREDIT_POINT?: string
	SUB14_STATUS?: string
}

// =============================================================================
// NAAD CSV COLUMN DEFINITIONS
// =============================================================================

/**
 * Complete list of NAAD CSV column headers in order
 */
export const NAAD_CSV_COLUMNS = [
	// Organization & Course (5 columns)
	'ORG_NAME',
	'ACADEMIC_COURSE_ID',
	'COURSE_NAME',
	'STREAM',
	'SESSION',

	// Student Personal Info (8 columns)
	'REGN_NO',
	'CNAME',
	'GENDER',
	'DOB',
	'FNAME',
	'MNAME',
	'ABC_ACCOUNT_ID',
	'AADHAAR_NAME',

	// Result Info (7 columns)
	'RESULT',
	'YEAR',
	'MONTH',
	'PERCENT',
	'CGPA',
	'SEM',
	'EXAM_TYPE',

	// Subject 1-14 columns follow...
] as const

/**
 * Column suffixes for each subject (15 columns per subject)
 */
export const NAAD_SUBJECT_COLUMN_SUFFIXES = [
	'SUB_CODE',
	'SUB_NAME',
	'THEORY',
	'PRACTICAL',
	'MAX_THEORY',
	'MAX_PRACTICAL',
	'CE',
	'MAX_CE',
	'TOTAL',
	'MAX_MARKS',
	'GRADE',
	'GRADE_POINT',
	'CREDIT',
	'CREDIT_POINT',
	'STATUS'
] as const

/**
 * Generates all subject column names for a given subject number (1-14)
 */
export function getNAADSubjectColumns(subjectNumber: number): string[] {
	const prefix = `SUB${subjectNumber}_`
	return NAAD_SUBJECT_COLUMN_SUFFIXES.map(suffix => `${prefix}${suffix}`)
}

/**
 * Generates complete list of all NAAD CSV columns including all 14 subjects
 */
export function getAllNAADColumns(): string[] {
	const baseColumns = [...NAAD_CSV_COLUMNS]
	for (let i = 1; i <= 14; i++) {
		baseColumns.push(...getNAADSubjectColumns(i))
	}
	return baseColumns
}

// =============================================================================
// NAAD GRADE MAPPING
// =============================================================================

/**
 * Standard NAAD grade to grade point mapping
 */
export const NAAD_GRADE_POINTS: Record<string, number> = {
	'O': 10,
	'A+': 9,
	'A': 8,
	'B+': 7,
	'B': 6,
	'C': 5,
	'D': 4,
	'F': 0,
	'AB': 0,  // Absent
	'RA': 0,  // Re-Appear
	'WH': 0   // Withheld
}

/**
 * Grade point to letter grade reverse mapping
 */
export const NAAD_GRADE_POINT_TO_LETTER: Record<number, string> = {
	10: 'O',
	9: 'A+',
	8: 'A',
	7: 'B+',
	6: 'B',
	5: 'C',
	4: 'D',
	0: 'F'
}

/**
 * NAAD grade descriptions
 */
export const NAAD_GRADE_DESCRIPTIONS: Record<string, string> = {
	'O': 'Outstanding',
	'A+': 'Excellent',
	'A': 'Very Good',
	'B+': 'Good',
	'B': 'Above Average',
	'C': 'Average',
	'D': 'Pass',
	'F': 'Fail',
	'AB': 'Absent',
	'RA': 'Re-Appear',
	'WH': 'Withheld'
}

// =============================================================================
// PARSED NAAD RECORD (NORMALIZED STRUCTURE)
// =============================================================================

/**
 * Normalized/parsed NAAD record with subjects as an array
 * This is the recommended structure for internal processing
 */
export interface NAADParsedRecord {
	// Organization Info
	organization: {
		name: string
		academicCourseId: string
		courseName: string
		stream: string
		session: string
	}

	// Student Info
	student: {
		registrationNumber: string
		name: string
		gender: 'M' | 'F' | 'O'
		dateOfBirth: Date
		fatherName: string
		motherName: string
		abcAccountId: string
		aadhaarName: string
	}

	// Result Info
	result: {
		status: 'PASS' | 'FAIL' | 'PROMOTED' | 'WITHHELD' | 'ABSENT'
		year: number
		month: number
		percentage: number
		cgpa: number
		semester: number
		examType: 'REGULAR' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'ARREAR'
	}

	// Subjects as normalized array
	subjects: NAADParsedSubject[]

	// Computed aggregates
	aggregates: {
		totalCredits: number
		totalCreditPoints: number
		sgpa: number
		subjectsCount: number
		passedCount: number
		failedCount: number
	}
}

/**
 * Normalized subject structure
 */
export interface NAADParsedSubject {
	index: number  // 1-14
	code: string
	name: string
	marks: {
		theory: number | null
		practical: number | null
		ce: number | null
		total: number
	}
	maxMarks: {
		theory: number | null
		practical: number | null
		ce: number | null
		total: number
	}
	grade: string
	gradePoint: number
	credit: number
	creditPoint: number
	status: 'PASS' | 'FAIL' | 'ABSENT' | 'RA' | 'WH'
}

// =============================================================================
// NAAD CSV PARSER UTILITIES
// =============================================================================

/**
 * Configuration for NAAD CSV parsing
 */
export interface NAADParserConfig {
	/** Skip rows with empty registration numbers */
	skipEmptyRegNo: boolean

	/** Date format for DOB parsing (default: 'DD/MM/YYYY') */
	dateFormat: string

	/** Handle missing subject data gracefully */
	allowPartialSubjects: boolean

	/** Validate ABC Account ID format */
	validateAbcId: boolean

	/** Trim whitespace from all string fields */
	trimStrings: boolean
}

/**
 * Default NAAD parser configuration
 */
export const DEFAULT_NAAD_PARSER_CONFIG: NAADParserConfig = {
	skipEmptyRegNo: true,
	dateFormat: 'DD/MM/YYYY',
	allowPartialSubjects: true,
	validateAbcId: false,
	trimStrings: true
}

/**
 * NAAD CSV validation result
 */
export interface NAADValidationResult {
	isValid: boolean
	errors: NAADValidationError[]
	warnings: NAADValidationWarning[]
	stats: {
		totalRows: number
		validRows: number
		invalidRows: number
		missingAbcIds: number
		incompleteSubjects: number
	}
}

/**
 * NAAD validation error
 */
export interface NAADValidationError {
	row: number
	column: string
	value: string
	message: string
	severity: 'error'
}

/**
 * NAAD validation warning
 */
export interface NAADValidationWarning {
	row: number
	column: string
	value: string
	message: string
	severity: 'warning'
}

// =============================================================================
// NAAD EXPORT CONFIGURATION
// =============================================================================

/**
 * Configuration for generating NAAD-compliant CSV exports
 */
export interface NAADExportConfig {
	/** Institution/Organization name */
	organizationName: string

	/** Academic course ID */
	academicCourseId: string

	/** Course/Program name */
	courseName: string

	/** Stream/Specialization */
	stream: string

	/** Academic session (e.g., "2024-25") */
	session: string

	/** Semester number */
	semester: number

	/** Examination year */
	examYear: number

	/** Examination month (1-12) */
	examMonth: number

	/** Examination type */
	examType: 'REGULAR' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'ARREAR'

	/** Include ABC Account ID (requires ABC integration) */
	includeAbcId: boolean

	/** Include Aadhaar name mapping */
	includeAadhaarName: boolean
}

/**
 * NAAD export statistics
 */
export interface NAADExportStats {
	totalRecords: number
	passedRecords: number
	failedRecords: number
	withAbcId: number
	withoutAbcId: number
	averageCgpa: number
	averagePercentage: number
	exportedAt: string
	exportedBy: string
}

// =============================================================================
// HELPER FUNCTIONS (TYPE GUARDS)
// =============================================================================

/**
 * Type guard to check if a value is a valid NAAD result status
 */
export function isValidNAADResultStatus(value: string): value is NAADResultInfo['RESULT'] {
	return ['PASS', 'FAIL', 'PROMOTED', 'WITHHELD', 'ABSENT'].includes(value)
}

/**
 * Type guard to check if a value is a valid NAAD exam type
 */
export function isValidNAADExamType(value: string): value is NAADResultInfo['EXAM_TYPE'] {
	return ['REGULAR', 'SUPPLEMENTARY', 'IMPROVEMENT', 'ARREAR'].includes(value)
}

/**
 * Type guard to check if a value is a valid NAAD gender
 */
export function isValidNAADGender(value: string): value is NAADStudentInfo['GENDER'] {
	return ['M', 'F', 'O'].includes(value)
}

/**
 * Validate ABC Account ID format (12 digits)
 */
export function isValidAbcAccountId(value: string): boolean {
	return /^\d{12}$/.test(value)
}

/**
 * Parse NAAD date format (DD/MM/YYYY) to Date object
 */
export function parseNAADDate(dateStr: string): Date | null {
	const parts = dateStr.split('/')
	if (parts.length !== 3) return null

	const [day, month, year] = parts.map(p => parseInt(p, 10))
	if (isNaN(day) || isNaN(month) || isNaN(year)) return null

	const date = new Date(year, month - 1, day)
	return isNaN(date.getTime()) ? null : date
}

/**
 * Format Date to NAAD date format (DD/MM/YYYY)
 */
export function formatNAADDate(date: Date): string {
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = date.getFullYear()
	return `${day}/${month}/${year}`
}

// =============================================================================
// NAAD OFFICIAL UPLOAD FORMAT (PER-SUBJECT ROW STRUCTURE)
// =============================================================================

/**
 * Official NAAD Upload Format - One Row Per Student Per Subject
 *
 * This is the standardized format for uploading to National Academic Depository.
 * Unlike the consolidated format (14 subjects per row), this format has
 * one row per student per subject, making it more compatible with official NAAD portal.
 *
 * File Requirements (Mandatory):
 * - One Excel sheet per Program + Semester
 * - Column names must be exact, fixed, and in the same order
 * - No merged cells
 * - Date format: DD-MM-YYYY
 * - Text fields in UPPERCASE
 * - Numeric fields without symbols
 * - No extra spaces or special characters
 */
export interface NAADUploadRow {
	/** Academic Bank of Credits ID (12-digit numeric) */
	ABC_ID: string

	/** Student's full name in UPPERCASE */
	STUDENT_NAME: string

	/** Father's name in UPPERCASE */
	FATHER_NAME: string

	/** Mother's name in UPPERCASE */
	MOTHER_NAME: string

	/** Date of Birth in DD-MM-YYYY format */
	DATE_OF_BIRTH: string

	/** Gender (MALE/FEMALE/OTHER) */
	GENDER: 'MALE' | 'FEMALE' | 'OTHER'

	/** Full program name in UPPERCASE (e.g., "BACHELOR OF ARTS HISTORY") */
	PROGRAM_NAME: string

	/** Program code (e.g., "BA-HIST") */
	PROGRAM_CODE: string

	/** Semester number as string (e.g., "1", "2") */
	SEMESTER: string

	/** Student enrollment number */
	ENROLLMENT_NUMBER: string

	/** Student roll number */
	ROLL_NUMBER: string

	/** Institution name in UPPERCASE */
	INSTITUTION_NAME: string

	/** Institution code */
	INSTITUTION_CODE: string

	/** Affiliating university name in UPPERCASE */
	UNIVERSITY_NAME: string

	/** Academic year (e.g., "2023-24") */
	ACADEMIC_YEAR: string

	/** Examination session (e.g., "MAY 2024", "NOVEMBER 2024") */
	EXAM_SESSION: string

	/** Subject/Course code */
	SUBJECT_CODE: string

	/** Subject/Course name in UPPERCASE */
	SUBJECT_NAME: string

	/** Maximum marks for the subject */
	MAX_MARKS: string

	/** Marks obtained by the student */
	MARKS_OBTAINED: string

	/** Result status - PASS or FAIL only */
	RESULT_STATUS: 'PASS' | 'FAIL'

	/** Semester Grade Point Average (repeated for all subjects) */
	SGPA: string

	/** Cumulative Grade Point Average (repeated for all subjects) */
	CGPA: string

	/** Result declaration date in DD-MM-YYYY format */
	RESULT_DATE: string
}

/**
 * Official NAAD Upload column headers in exact order
 */
export const NAAD_UPLOAD_COLUMNS = [
	'ABC_ID',
	'STUDENT_NAME',
	'FATHER_NAME',
	'MOTHER_NAME',
	'DATE_OF_BIRTH',
	'GENDER',
	'PROGRAM_NAME',
	'PROGRAM_CODE',
	'SEMESTER',
	'ENROLLMENT_NUMBER',
	'ROLL_NUMBER',
	'INSTITUTION_NAME',
	'INSTITUTION_CODE',
	'UNIVERSITY_NAME',
	'ACADEMIC_YEAR',
	'EXAM_SESSION',
	'SUBJECT_CODE',
	'SUBJECT_NAME',
	'MAX_MARKS',
	'MARKS_OBTAINED',
	'RESULT_STATUS',
	'SGPA',
	'CGPA',
	'RESULT_DATE'
] as const

/**
 * Type for column names
 */
export type NAADUploadColumnName = typeof NAAD_UPLOAD_COLUMNS[number]

/**
 * Configuration for generating NAAD Upload Excel files
 */
export interface NAADUploadExportConfig {
	/** Program name (e.g., "B.A. History") */
	programName: string

	/** Program code */
	programCode: string

	/** Semester number */
	semester: number

	/** Academic year (e.g., "2023-24") */
	academicYear: string

	/** Exam session (e.g., "MAY 2024") */
	examSession: string

	/** Institution name */
	institutionName: string

	/** Institution code */
	institutionCode: string

	/** University name */
	universityName: string

	/** Result declaration date */
	resultDate: Date
}

/**
 * Student data for NAAD upload generation
 */
export interface NAADUploadStudentData {
	abcId: string
	name: string
	fatherName: string
	motherName: string
	dateOfBirth: Date
	gender: 'MALE' | 'FEMALE' | 'OTHER'
	enrollmentNumber: string
	rollNumber: string
	sgpa: number
	cgpa: number
	subjects: NAADUploadSubjectData[]
}

/**
 * Subject data for NAAD upload
 */
export interface NAADUploadSubjectData {
	code: string
	name: string
	maxMarks: number
	marksObtained: number
	isPassed: boolean
}

/**
 * Generates NAAD upload rows from student data
 * One row per student per subject
 */
export function generateNAADUploadRows(
	config: NAADUploadExportConfig,
	students: NAADUploadStudentData[]
): NAADUploadRow[] {
	const rows: NAADUploadRow[] = []

	for (const student of students) {
		for (const subject of student.subjects) {
			rows.push({
				ABC_ID: student.abcId,
				STUDENT_NAME: student.name.toUpperCase(),
				FATHER_NAME: student.fatherName.toUpperCase(),
				MOTHER_NAME: student.motherName.toUpperCase(),
				DATE_OF_BIRTH: formatNAADUploadDate(student.dateOfBirth),
				GENDER: student.gender,
				PROGRAM_NAME: config.programName.toUpperCase(),
				PROGRAM_CODE: config.programCode.toUpperCase(),
				SEMESTER: String(config.semester),
				ENROLLMENT_NUMBER: student.enrollmentNumber,
				ROLL_NUMBER: student.rollNumber,
				INSTITUTION_NAME: config.institutionName.toUpperCase(),
				INSTITUTION_CODE: config.institutionCode.toUpperCase(),
				UNIVERSITY_NAME: config.universityName.toUpperCase(),
				ACADEMIC_YEAR: config.academicYear,
				EXAM_SESSION: config.examSession.toUpperCase(),
				SUBJECT_CODE: subject.code.toUpperCase(),
				SUBJECT_NAME: subject.name.toUpperCase(),
				MAX_MARKS: String(subject.maxMarks),
				MARKS_OBTAINED: String(subject.marksObtained),
				RESULT_STATUS: subject.isPassed ? 'PASS' : 'FAIL',
				SGPA: student.sgpa.toFixed(2),
				CGPA: student.cgpa.toFixed(2),
				RESULT_DATE: formatNAADUploadDate(config.resultDate)
			})
		}
	}

	return rows
}

/**
 * Format Date to NAAD upload date format (DD-MM-YYYY)
 * Note: Uses hyphens instead of slashes
 */
export function formatNAADUploadDate(date: Date): string {
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = date.getFullYear()
	return `${day}-${month}-${year}`
}

/**
 * Parse NAAD upload date format (DD-MM-YYYY) to Date object
 */
export function parseNAADUploadDate(dateStr: string): Date | null {
	const parts = dateStr.split('-')
	if (parts.length !== 3) return null

	const [day, month, year] = parts.map(p => parseInt(p, 10))
	if (isNaN(day) || isNaN(month) || isNaN(year)) return null

	const date = new Date(year, month - 1, day)
	return isNaN(date.getTime()) ? null : date
}

/**
 * Validates a NAAD upload row for compliance
 */
export function validateNAADUploadRow(row: NAADUploadRow): {
	isValid: boolean
	errors: string[]
} {
	const errors: string[] = []

	// ABC ID validation (12 digits)
	if (!/^\d{12}$/.test(row.ABC_ID)) {
		errors.push('ABC_ID must be exactly 12 digits')
	}

	// Required string fields
	const requiredFields: (keyof NAADUploadRow)[] = [
		'STUDENT_NAME', 'FATHER_NAME', 'MOTHER_NAME', 'PROGRAM_NAME',
		'PROGRAM_CODE', 'ENROLLMENT_NUMBER', 'ROLL_NUMBER', 'INSTITUTION_NAME',
		'INSTITUTION_CODE', 'UNIVERSITY_NAME', 'SUBJECT_CODE', 'SUBJECT_NAME'
	]

	for (const field of requiredFields) {
		if (!row[field] || row[field].trim() === '') {
			errors.push(`${field} is required and cannot be empty`)
		}
	}

	// Date format validation (DD-MM-YYYY)
	const dateRegex = /^\d{2}-\d{2}-\d{4}$/
	if (!dateRegex.test(row.DATE_OF_BIRTH)) {
		errors.push('DATE_OF_BIRTH must be in DD-MM-YYYY format')
	}
	if (!dateRegex.test(row.RESULT_DATE)) {
		errors.push('RESULT_DATE must be in DD-MM-YYYY format')
	}

	// Gender validation
	if (!['MALE', 'FEMALE', 'OTHER'].includes(row.GENDER)) {
		errors.push('GENDER must be MALE, FEMALE, or OTHER')
	}

	// Result status validation
	if (!['PASS', 'FAIL'].includes(row.RESULT_STATUS)) {
		errors.push('RESULT_STATUS must be PASS or FAIL')
	}

	// Numeric field validation
	if (isNaN(Number(row.MAX_MARKS)) || Number(row.MAX_MARKS) <= 0) {
		errors.push('MAX_MARKS must be a positive number')
	}
	if (isNaN(Number(row.MARKS_OBTAINED)) || Number(row.MARKS_OBTAINED) < 0) {
		errors.push('MARKS_OBTAINED must be a non-negative number')
	}
	if (Number(row.MARKS_OBTAINED) > Number(row.MAX_MARKS)) {
		errors.push('MARKS_OBTAINED cannot exceed MAX_MARKS')
	}

	// SGPA/CGPA validation (0.00 to 10.00)
	const sgpa = Number(row.SGPA)
	const cgpa = Number(row.CGPA)
	if (isNaN(sgpa) || sgpa < 0 || sgpa > 10) {
		errors.push('SGPA must be between 0.00 and 10.00')
	}
	if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
		errors.push('CGPA must be between 0.00 and 10.00')
	}

	// Academic year format (YYYY-YY)
	if (!/^\d{4}-\d{2}$/.test(row.ACADEMIC_YEAR)) {
		errors.push('ACADEMIC_YEAR must be in YYYY-YY format (e.g., 2023-24)')
	}

	// Uppercase validation for text fields
	const uppercaseFields: (keyof NAADUploadRow)[] = [
		'STUDENT_NAME', 'FATHER_NAME', 'MOTHER_NAME', 'PROGRAM_NAME',
		'INSTITUTION_NAME', 'UNIVERSITY_NAME', 'SUBJECT_NAME', 'EXAM_SESSION'
	]

	for (const field of uppercaseFields) {
		if (row[field] && row[field] !== row[field].toUpperCase()) {
			errors.push(`${field} must be in UPPERCASE`)
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	}
}

/**
 * Sample data generator for testing NAAD upload format
 */
export function generateSampleNAADUploadData(
	config: NAADUploadExportConfig,
	studentCount: number = 5
): NAADUploadRow[] {
	const sampleStudents: NAADUploadStudentData[] = []

	const sampleSubjects: NAADUploadSubjectData[] = [
		{ code: 'HIST201', name: 'MODERN INDIAN HISTORY', maxMarks: 100, marksObtained: 75, isPassed: true },
		{ code: 'HIST202', name: 'HISTORY OF MEDIEVAL INDIA', maxMarks: 100, marksObtained: 68, isPassed: true },
		{ code: 'HIST203', name: 'WORLD HISTORY', maxMarks: 100, marksObtained: 72, isPassed: true },
		{ code: 'ENG201', name: 'ENGLISH LITERATURE', maxMarks: 100, marksObtained: 65, isPassed: true },
		{ code: 'TAM201', name: 'TAMIL LITERATURE', maxMarks: 100, marksObtained: 78, isPassed: true }
	]

	const sampleNames = [
		{ name: 'ARUN KUMAR', father: 'KUMAR VELU', mother: 'LAKSHMI DEVI' },
		{ name: 'PRIYA SHARMA', father: 'RAJESH SHARMA', mother: 'SUNITA SHARMA' },
		{ name: 'KARTHIK RAJAN', father: 'RAJAN SUNDARAM', mother: 'MEENA RAJAN' },
		{ name: 'DIVYA KRISHNAN', father: 'KRISHNAN NAIR', mother: 'RADHA KRISHNAN' },
		{ name: 'SURESH BABU', father: 'BABU PILLAI', mother: 'GEETHA BABU' }
	]

	for (let i = 0; i < Math.min(studentCount, sampleNames.length); i++) {
		const sample = sampleNames[i]
		sampleStudents.push({
			abcId: `${100000000000 + i}`,
			name: sample.name,
			fatherName: sample.father,
			motherName: sample.mother,
			dateOfBirth: new Date(2002, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
			gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
			enrollmentNumber: `ENR2021${String(i + 1).padStart(4, '0')}`,
			rollNumber: `${config.programCode.replace(/[^A-Z0-9]/g, '')}${config.semester}${String(i + 1).padStart(3, '0')}`,
			sgpa: 7.5 + Math.random() * 1.5,
			cgpa: 7.2 + Math.random() * 1.8,
			subjects: sampleSubjects.map(s => ({
				...s,
				marksObtained: Math.floor(50 + Math.random() * 45),
				isPassed: true
			}))
		})
	}

	return generateNAADUploadRows(config, sampleStudents)
}

// =============================================================================
// COMPARISON OF BOTH FORMATS
// =============================================================================

/**
 * NAAD Format Types Summary:
 *
 * 1. CONSOLIDATED FORMAT (NAADCSVRow):
 *    - One row per student per semester
 *    - Up to 14 subjects in single row
 *    - ~230 columns total
 *    - Used for: Internal processing, analytics, bulk exports
 *
 * 2. OFFICIAL UPLOAD FORMAT (NAADUploadRow):
 *    - One row per student per subject
 *    - 24 columns per row
 *    - SGPA/CGPA repeated for each subject
 *    - Used for: Direct upload to NAAD portal
 *
 * Conversion between formats is possible using the helper functions.
 */

/**
 * Converts consolidated format to upload format
 */
export function convertToUploadFormat(
	consolidated: NAADCSVRow,
	config: Omit<NAADUploadExportConfig, 'programName' | 'programCode' | 'semester' | 'academicYear'>
): NAADUploadRow[] {
	const rows: NAADUploadRow[] = []

	// Extract subjects from consolidated format
	for (let i = 1; i <= 14; i++) {
		const codeKey = `SUB${i}_SUB_CODE` as keyof NAADCSVRow
		const nameKey = `SUB${i}_SUB_NAME` as keyof NAADCSVRow
		const maxMarksKey = `SUB${i}_MAX_MARKS` as keyof NAADCSVRow
		const totalKey = `SUB${i}_TOTAL` as keyof NAADCSVRow
		const statusKey = `SUB${i}_STATUS` as keyof NAADCSVRow

		const subjectCode = consolidated[codeKey]
		if (!subjectCode || subjectCode === '') continue

		rows.push({
			ABC_ID: consolidated.ABC_ACCOUNT_ID || '',
			STUDENT_NAME: consolidated.CNAME?.toUpperCase() || '',
			FATHER_NAME: consolidated.FNAME?.toUpperCase() || '',
			MOTHER_NAME: consolidated.MNAME?.toUpperCase() || '',
			DATE_OF_BIRTH: consolidated.DOB?.replace(/\//g, '-') || '',
			GENDER: consolidated.GENDER === 'M' ? 'MALE' : consolidated.GENDER === 'F' ? 'FEMALE' : 'OTHER',
			PROGRAM_NAME: consolidated.COURSE_NAME?.toUpperCase() || '',
			PROGRAM_CODE: consolidated.ACADEMIC_COURSE_ID || '',
			SEMESTER: consolidated.SEM || '',
			ENROLLMENT_NUMBER: consolidated.REGN_NO || '',
			ROLL_NUMBER: consolidated.REGN_NO || '',
			INSTITUTION_NAME: consolidated.ORG_NAME?.toUpperCase() || '',
			INSTITUTION_CODE: config.institutionCode,
			UNIVERSITY_NAME: config.universityName.toUpperCase(),
			ACADEMIC_YEAR: consolidated.SESSION || '',
			EXAM_SESSION: `${consolidated.MONTH} ${consolidated.YEAR}`.toUpperCase(),
			SUBJECT_CODE: (consolidated[codeKey] as string)?.toUpperCase() || '',
			SUBJECT_NAME: (consolidated[nameKey] as string)?.toUpperCase() || '',
			MAX_MARKS: (consolidated[maxMarksKey] as string) || '100',
			MARKS_OBTAINED: (consolidated[totalKey] as string) || '0',
			RESULT_STATUS: (consolidated[statusKey] as string) === 'PASS' ? 'PASS' : 'FAIL',
			SGPA: consolidated.CGPA || '0.00', // Using CGPA as SGPA approximation
			CGPA: consolidated.CGPA || '0.00',
			RESULT_DATE: formatNAADUploadDate(config.resultDate)
		})
	}

	return rows
}
