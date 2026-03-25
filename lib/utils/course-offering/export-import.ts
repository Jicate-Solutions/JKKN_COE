/**
 * Course Offering Export/Import Utilities
 *
 * This module contains functions for exporting course offerings to various formats
 * (JSON, Excel) and generating import templates with reference data.
 */

import XLSX from '@/lib/utils/excel-compat'
import type {
	CourseOffering,
	Institution,
	Course,
	ExaminationSession,
	Program,
} from '@/types/course-offering'

/**
 * Exports course offerings to JSON file
 * @param items - Array of course offerings
 * @param institutions - Array of institutions for reference
 * @param courses - Array of courses for reference
 * @param sessions - Array of examination sessions for reference
 * @param programs - Array of programs for reference
 */
export function exportToJSON(
	items: CourseOffering[],
	institutions: Institution[],
	courses: Course[],
	sessions: ExaminationSession[],
	programs: Program[]
): void {
	const exportData = items.map(item => {
		const institution = institutions.find(i => i.id === item.institutions_id)
		const course = courses.find(c => c.id === item.course_id)
		const session = sessions.find(s => s.id === item.examination_session_id)
		const program = programs.find(p => p.id === item.program_id)

		return {
			institution_code: institution?.institution_code || item.institution_code || '',
			course_code: course?.course_code || item.course_code || '',
			session_code: session?.session_code || item.session_code || '',
			program_code: program?.program_code || item.program_code || '',
			semester_code: (item as any).semester_code || '',
			section: item.section || '',
			max_enrollment: item.max_enrollment || '',
			enrolled_count: item.enrolled_count,
			is_active: item.is_active,
			created_at: item.created_at
		}
	})

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `course_offerings_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Exports course offerings to Excel file with professional styling
 * @param items - Array of course offerings
 * @param institutions - Array of institutions for reference
 * @param courses - Array of courses for reference
 * @param sessions - Array of examination sessions for reference
 * @param programs - Array of programs for reference
 */
export function exportToExcel(
	items: CourseOffering[],
	institutions: Institution[],
	courses: Course[],
	sessions: ExaminationSession[],
	programs: Program[]
): void {
	const excelData = items.map((r) => {
		const institution = institutions.find(i => i.id === r.institutions_id)
		const session = sessions.find(s => s.id === r.examination_session_id)
		const program = programs.find(p => p.id === r.program_id)

		return {
			'Institution Code': r.institution_code || institution?.institution_code || 'N/A',
			'Institution Name': institution?.institution_name || 'N/A',
			'Course Code': r.course_code || 'N/A',
			'Course Title': r.course_title || 'N/A',
			'Session Code': r.session_code || session?.session_code || 'N/A',
			'Session Name': session?.session_name || 'N/A',
			'Program Code': r.program_code || program?.program_code || 'N/A',
			'Program Name': program?.program_name || 'N/A',
			'Semester Code': (r as any).semester_code || 'N/A',
			'Section': r.section || '-',
			'Max Enrollment': r.max_enrollment ?? '-',
			'Enrolled Count': r.enrolled_count,
			'Status': r.is_active ? 'Active' : 'Inactive',
			'Created': new Date(r.created_at).toISOString().split('T')[0],
		}
	})

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths for better readability
	const colWidths = [
		{ wch: 18 }, // Institution Code
		{ wch: 25 }, // Institution Name
		{ wch: 15 }, // Course Code
		{ wch: 35 }, // Course Title
		{ wch: 20 }, // Session Code
		{ wch: 25 }, // Session Name
		{ wch: 20 }, // Program Code
		{ wch: 30 }, // Program Name
		{ wch: 20 }, // Semester Code
		{ wch: 10 }, // Section
		{ wch: 15 }, // Max Enrollment
		{ wch: 15 }, // Enrolled Count
		{ wch: 10 }, // Status
		{ wch: 12 }  // Created
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Course Offerings')
	XLSX.writeFile(wb, `course_offerings_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Semester type for template reference
 */
export interface TemplateSemester {
	id: string
	semester_name: string
	semester_code?: string
	semester_number?: number
	semester_order?: number
	program_code?: string
	program_name?: string
}

/**
 * Options for template export - allows filtering reference data by institution
 */
export interface TemplateExportOptions {
	/** If true, filter reference data by the selected institutions */
	filterByInstitution?: boolean
	/** Current institution ID for filtering sessions */
	currentInstitutionId?: string
}

/**
 * Generates and downloads import template with sample data and reference sheets
 * @param institutions - Array of institutions for reference (filtered by context)
 * @param courses - Array of courses for reference
 * @param sessions - Array of examination sessions for reference (should be filtered by institution)
 * @param programs - Array of programs for reference (filtered by institution via MyJKKN)
 * @param semesters - Array of semesters from MyJKKN API for reference (filtered by institution/program)
 * @param options - Optional settings for template export
 */
export async function exportTemplate(
	institutions: Institution[],
	courses: Course[],
	sessions: ExaminationSession[],
	programs: Program[],
	semesters?: TemplateSemester[],
	options?: TemplateExportOptions
): Promise<void> {
	const wb = XLSX.utils.book_new()

	// Sheet 1: Template with empty row for user to fill
	// Only required fields: Institution Code, Course Code, Session Code, Program Code, Semester Name
	// Semester Name allows end users to select by name (e.g., "Semester I")
	// System will find semester_code and semester_order from MyJKKN API
	const sample = [{
		'Institution Code *': '',
		'Course Code *': '',
		'Session Code *': '',
		'Program Code *': '',
		'Semester Name *': '',
		'Status': 'Active'
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths
	const colWidths = [
		{ wch: 20 }, // Institution Code
		{ wch: 18 }, // Course Code
		{ wch: 22 }, // Session Code
		{ wch: 20 }, // Program Code
		{ wch: 20 }, // Semester Name
		{ wch: 12 }  // Status
	]
	ws['!cols'] = colWidths

	// ═══════════════════════════════════════════════════════════════
	// ADD DATA VALIDATIONS (DROPDOWN LISTS)
	// excel-compat handles long lists (>255 chars) using hidden _ValidCodes sheet
	// ═══════════════════════════════════════════════════════════════
	const validations: any[] = []

	// Column A: Institution Code dropdown
	const activeInstitutions = institutions.filter(i => i.is_active !== false)
	const instCodes = activeInstitutions.map(i => i.institution_code).filter(Boolean)
	if (instCodes.length > 0) {
		validations.push({
			type: 'list',
			sqref: 'A2:A1000',
			formula1: `"${instCodes.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Institution',
			error: 'Please select from the dropdown list',
		})
	}

	// Column B: Course Code dropdown
	const activeCourses = courses.filter(c => c.is_active !== false)
	const courseCodes = activeCourses.map(c => c.course_code).filter(Boolean)
	if (courseCodes.length > 0) {
		validations.push({
			type: 'list',
			sqref: 'B2:B1000',
			formula1: `"${courseCodes.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Course',
			error: 'Please select from the dropdown list',
		})
	}

	// Column C: Session Code dropdown
	const activeSessions = sessions.filter(s => s.is_active !== false)
	const sessionCodes = activeSessions.map(s => s.session_code).filter(Boolean)
	if (sessionCodes.length > 0) {
		validations.push({
			type: 'list',
			sqref: 'C2:C1000',
			formula1: `"${sessionCodes.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Session',
			error: 'Please select from the dropdown list',
		})
	}

	// Column D: Program Code dropdown
	const activePrograms = programs.filter(p => p.is_active !== false)
	const programCodes = activePrograms.map(p => p.program_code).filter(Boolean)
	if (programCodes.length > 0) {
		validations.push({
			type: 'list',
			sqref: 'D2:D1000',
			formula1: `"${programCodes.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Program',
			error: 'Please select from the dropdown list',
		})
	}

	// Column E: Semester Name dropdown
	if (semesters && semesters.length > 0) {
		// Get unique semester names
		const semesterNames = Array.from(new Set(semesters.map(s => s.semester_name).filter(Boolean)))
		if (semesterNames.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'E2:E1000',
				formula1: `"${semesterNames.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Semester',
				error: 'Please select from the dropdown list',
			})
		}
	}

	// Column F: Status dropdown
	validations.push({
		type: 'list',
		sqref: 'F2:F1000',
		formula1: '"Active,Inactive"',
		showDropDown: true,
		showErrorMessage: true,
		errorTitle: 'Invalid Status',
		error: 'Select: Active or Inactive',
	})

	// Attach validations to worksheet
	ws['!dataValidation'] = validations

	XLSX.utils.book_append_sheet(wb, ws, 'Template')

	// Sheet 2: Combined Reference Data (Single Sheet)
	// All reference data is now filtered by institution context (passed from page)
	const referenceData: any[] = []

	console.log('[exportTemplate] Received data:', {
		institutions: institutions.length,
		courses: courses.length,
		sessions: sessions.length,
		programs: programs.length,
		semesters: semesters?.length ?? 0
	})

	// Add Institution Codes (already filtered by institution context from page)
	// Note: activeInstitutions, activeSessions, activePrograms, activeCourses are reused from data validation section
	if (activeInstitutions.length > 0) {
		referenceData.push({ 'Type': '═══ INSTITUTION CODES ═══', 'Code': '', 'Name': '', 'Institution': '' })
		activeInstitutions.forEach(item => {
			referenceData.push({
				'Type': 'Institution',
				'Code': item.institution_code,
				'Name': item.institution_name || 'N/A',
				'Institution': '-'
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Institution': '' }) // Empty row separator
	}

	// Add Session Codes (already filtered by institution context from page)
	// Sessions are now institution-specific
	if (activeSessions.length > 0) {
		referenceData.push({ 'Type': '═══ SESSION CODES ═══', 'Code': '', 'Name': '', 'Institution': '' })
		activeSessions.forEach(item => {
			// Get institution code for this session
			const sessionInst = institutions.find(i => i.id === (item as any).institutions_id)
			referenceData.push({
				'Type': 'Session',
				'Code': item.session_code,
				'Name': item.session_name || 'N/A',
				'Institution': sessionInst?.institution_code || '-'
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Institution': '' }) // Empty row separator
	}

	// Add Program Codes (already filtered by institution via MyJKKN from page)
	// Sort by program_order for consistent display
	const sortedActivePrograms = [...activePrograms].sort((a, b) => {
		const orderA = (a as any).program_order ?? 999
		const orderB = (b as any).program_order ?? 999
		return orderA - orderB
	})
	if (sortedActivePrograms.length > 0) {
		referenceData.push({ 'Type': '═══ PROGRAM CODES ═══', 'Code': '', 'Name': '', 'Institution': '' })
		sortedActivePrograms.forEach(item => {
			referenceData.push({
				'Type': 'Program',
				'Code': item.program_code,
				'Name': item.program_name || 'N/A',
				'Institution': '-' // Programs are already filtered by institution
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Institution': '' }) // Empty row separator
	}

	// Add Course Codes (Code only, no title) - filtered by institution from page
	if (activeCourses.length > 0) {
		referenceData.push({ 'Type': '═══ COURSE CODES ═══', 'Code': '', 'Name': '', 'Institution': '' })
		activeCourses.forEach(item => {
			// Get institution code for this course
			const courseInst = institutions.find(i => i.id === (item as any).institutions_id)
			referenceData.push({
				'Type': 'Course',
				'Code': item.course_code,
				'Name': '', // Empty name for courses as requested
				'Institution': courseInst?.institution_code || '-'
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Institution': '' }) // Empty row separator
	}

	// Add Semester Names (from MyJKKN API) - Already filtered by institution/program from page
	// Sort by semester_order or semester_number for consistent display
	if (semesters && semesters.length > 0) {
		referenceData.push({ 'Type': '═══ SEMESTER NAMES ═══', 'Code': '', 'Name': '', 'Institution': '' })

		// Get unique semesters with their order, keyed by semester_name
		const semesterMap = new Map<string, { name: string; order: number }>()
		semesters.forEach(sem => {
			if (sem.semester_name && !semesterMap.has(sem.semester_name)) {
				// Use semester_order if available, otherwise semester_number, otherwise extract from name
				const order = sem.semester_order ?? sem.semester_number ?? (parseInt(sem.semester_name.replace(/\D/g, '')) || 999)
				semesterMap.set(sem.semester_name, { name: sem.semester_name, order })
			}
		})

		// Convert to array and sort by semester_order
		const sortedSemesters = Array.from(semesterMap.values()).sort((a, b) => a.order - b.order)

		// Add sorted semesters
		sortedSemesters.forEach(sem => {
			referenceData.push({
				'Type': 'Semester',
				'Code': sem.name, // Semester Name is what users should enter
				'Name': '', // No program name needed for unique list
				'Institution': '-' // Already filtered by institution
			})
		})
	}

	// Add Status Values
	referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Institution': '' }) // Empty row separator
	referenceData.push({ 'Type': '═══ STATUS VALUES ═══', 'Code': '', 'Name': '', 'Institution': '' })
	;['Active', 'Inactive'].forEach(status => {
		referenceData.push({
			'Type': 'Status',
			'Code': status,
			'Name': status === 'Active' ? 'Course offering is active' : 'Course offering is inactive',
			'Institution': '-'
		})
	})

	// Create reference sheet if we have data
	if (referenceData.length > 0) {
		const wsRef = XLSX.utils.json_to_sheet(referenceData)
		const refColWidths = [
			{ wch: 28 }, // Type
			{ wch: 25 }, // Code (Semester Name)
			{ wch: 35 }, // Name (Program Name)
			{ wch: 15 }  // Institution
		]
		wsRef['!cols'] = refColWidths
		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')
	}

	// Use await since XLSX.writeFile is async (ExcelJS under the hood)
	await XLSX.writeFile(wb, `course_offerings_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
