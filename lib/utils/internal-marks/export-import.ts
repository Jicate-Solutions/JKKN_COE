/**
 * Internal Marks Export/Import Utilities
 *
 * This module contains functions for exporting internal marks to various formats
 * (JSON, Excel) and generating import templates with reference data.
 */

import XLSX from '@/lib/utils/excel-compat'

// Types for internal marks export/import
export interface InternalMarkExport {
	register_no: string
	student_name: string
	course_code: string
	course_name: string
	program_name: string
	session_name: string
	assignment_marks: number | null
	quiz_marks: number | null
	mid_term_marks: number | null
	presentation_marks: number | null
	attendance_marks: number | null
	lab_marks: number | null
	project_marks: number | null
	seminar_marks: number | null
	viva_marks: number | null
	other_marks: number | null
	test_1_mark: number | null
	test_2_mark: number | null
	test_3_mark: number | null
	total_internal_marks: number | null
	max_internal_marks: number | null
	internal_percentage: number | null
	marks_status: string
	remarks: string | null
}

export interface Institution {
	id: string
	name: string
	institution_code: string
}

export interface Session {
	id: string
	session_name: string
	session_code: string
}

export interface Program {
	id: string
	program_code: string
	program_name: string
}

export interface Course {
	id: string
	course_code: string
	course_name: string
	internal_max_mark?: number
}

/**
 * Exports internal marks to JSON file
 */
export function exportToJSON(items: InternalMarkExport[]): void {
	const exportData = items.map(item => ({
		register_no: item.register_no || '',
		student_name: item.student_name || '',
		course_code: item.course_code || '',
		course_name: item.course_name || '',
		program_name: item.program_name || '',
		session_name: item.session_name || '',
		assignment_marks: item.assignment_marks,
		quiz_marks: item.quiz_marks,
		mid_term_marks: item.mid_term_marks,
		presentation_marks: item.presentation_marks,
		attendance_marks: item.attendance_marks,
		lab_marks: item.lab_marks,
		project_marks: item.project_marks,
		seminar_marks: item.seminar_marks,
		viva_marks: item.viva_marks,
		other_marks: item.other_marks,
		test_1_mark: item.test_1_mark,
		test_2_mark: item.test_2_mark,
		test_3_mark: item.test_3_mark,
		total_internal_marks: item.total_internal_marks,
		max_internal_marks: item.max_internal_marks,
		internal_percentage: item.internal_percentage,
		marks_status: item.marks_status || 'Draft',
		remarks: item.remarks || ''
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `internal_marks_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Exports internal marks to Excel file with professional styling
 */
export function exportToExcel(
	items: InternalMarkExport[],
	institutionCode?: string
): void {
	const excelData = items.map(item => ({
		'Register No': item.register_no || 'N/A',
		'Student Name': item.student_name || '',
		'Course Code': item.course_code || '',
		'Course Name': item.course_name || '',
		'Program': item.program_name || '',
		'Session': item.session_name || '',
		'Assignment': item.assignment_marks ?? '',
		'Quiz': item.quiz_marks ?? '',
		'Mid Term': item.mid_term_marks ?? '',
		'Presentation': item.presentation_marks ?? '',
		'Attendance': item.attendance_marks ?? '',
		'Lab': item.lab_marks ?? '',
		'Project': item.project_marks ?? '',
		'Seminar': item.seminar_marks ?? '',
		'Viva': item.viva_marks ?? '',
		'Test 1': item.test_1_mark ?? '',
		'Test 2': item.test_2_mark ?? '',
		'Test 3': item.test_3_mark ?? '',
		'Other': item.other_marks ?? '',
		'Total': item.total_internal_marks ?? 0,
		'Max': item.max_internal_marks ?? 100,
		'Percentage': item.internal_percentage ?? 0,
		'Status': item.marks_status || 'Draft',
		'Remarks': item.remarks || ''
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths for better readability
	const colWidths = [
		{ wch: 15 }, // Register No
		{ wch: 25 }, // Student Name
		{ wch: 12 }, // Course Code
		{ wch: 30 }, // Course Name
		{ wch: 20 }, // Program
		{ wch: 15 }, // Session
		{ wch: 10 }, // Assignment
		{ wch: 8 },  // Quiz
		{ wch: 10 }, // Mid Term
		{ wch: 12 }, // Presentation
		{ wch: 10 }, // Attendance
		{ wch: 8 },  // Lab
		{ wch: 10 }, // Project
		{ wch: 10 }, // Seminar
		{ wch: 8 },  // Viva
		{ wch: 8 },  // Test 1
		{ wch: 8 },  // Test 2
		{ wch: 8 },  // Test 3
		{ wch: 8 },  // Other
		{ wch: 8 },  // Total
		{ wch: 8 },  // Max
		{ wch: 10 }, // Percentage
		{ wch: 10 }, // Status
		{ wch: 25 }  // Remarks
	]
	ws['!cols'] = colWidths

	// Style header row
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue
		ws[cellAddress].s = {
			font: { bold: true, color: { rgb: 'FFFFFF' } },
			fill: { fgColor: { rgb: '4472C4' } },
			alignment: { horizontal: 'center', vertical: 'center' }
		}
	}

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Internal Marks')

	const fileName = `internal_marks_export_${institutionCode || 'all'}_${new Date().toISOString().split('T')[0]}.xlsx`
	XLSX.writeFile(wb, fileName)
}

/**
 * Generates and downloads import template with sample data and reference sheets
 */
export function exportTemplate(
	institutions: Institution[],
	sessions: Session[],
	programs: Program[],
	courses: Course[]
): void {
	const wb = XLSX.utils.book_new()

	// Sheet 1: Template with sample rows
	const templateData = [
		{
			'Institution Code *': 'CAS',
			'Register No *': 'STU001',
			'Course Code *': 'CS101',
			'Session Code': 'APR2024',
			'Program Code': 'BCA',
			'Assignment Marks': 8,
			'Quiz Marks': 9,
			'Mid Term Marks': 35,
			'Presentation Marks': '',
			'Attendance Marks': 5,
			'Lab Marks': '',
			'Project Marks': '',
			'Seminar Marks': '',
			'Viva Marks': '',
			'Test 1 Mark': '',
			'Test 2 Mark': '',
			'Test 3 Mark': '',
			'Other Marks': '',
			'Max Internal Marks *': 100,
			'Remarks': 'Good performance'
		},
		{
			'Institution Code *': 'CAS',
			'Register No *': 'STU002',
			'Course Code *': 'CS101',
			'Session Code': 'APR2024',
			'Program Code': 'BCA',
			'Assignment Marks': 7,
			'Quiz Marks': 8,
			'Mid Term Marks': 30,
			'Presentation Marks': '',
			'Attendance Marks': 4,
			'Lab Marks': '',
			'Project Marks': '',
			'Seminar Marks': '',
			'Viva Marks': '',
			'Test 1 Mark': '',
			'Test 2 Mark': '',
			'Test 3 Mark': '',
			'Other Marks': '',
			'Max Internal Marks *': 100,
			'Remarks': ''
		}
	]

	const ws = XLSX.utils.json_to_sheet(templateData)

	// Set column widths
	ws['!cols'] = [
		{ wch: 18 }, // Institution Code
		{ wch: 15 }, // Register No
		{ wch: 15 }, // Course Code
		{ wch: 15 }, // Session Code
		{ wch: 15 }, // Program Code
		{ wch: 16 }, // Assignment Marks
		{ wch: 12 }, // Quiz Marks
		{ wch: 15 }, // Mid Term Marks
		{ wch: 18 }, // Presentation Marks
		{ wch: 16 }, // Attendance Marks
		{ wch: 12 }, // Lab Marks
		{ wch: 14 }, // Project Marks
		{ wch: 14 }, // Seminar Marks
		{ wch: 12 }, // Viva Marks
		{ wch: 12 }, // Test 1 Mark
		{ wch: 12 }, // Test 2 Mark
		{ wch: 12 }, // Test 3 Mark
		{ wch: 12 }, // Other Marks
		{ wch: 18 }, // Max Internal Marks
		{ wch: 25 }  // Remarks
	]

	// Style the header row - mandatory fields in red
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Institution Code *', 'Register No *', 'Course Code *', 'Max Internal Marks *']

	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue

		const cell = ws[cellAddress]
		const isMandatory = mandatoryFields.includes(cell.v as string)

		if (isMandatory) {
			cell.s = {
				font: { color: { rgb: 'FF0000' }, bold: true },
				fill: { fgColor: { rgb: 'FFE6E6' } }
			}
		} else {
			cell.s = {
				font: { bold: true },
				fill: { fgColor: { rgb: 'F0F0F0' } }
			}
		}
	}

	XLSX.utils.book_append_sheet(wb, ws, 'Internal Marks Template')

	// Sheet 2: Combined Reference Data
	const referenceData: any[] = []

	// Column Reference
	referenceData.push({ 'Type': 'COLUMN REFERENCE', 'Code': '', 'Name': '', 'Note': '' })
	const columnInfo = [
		{ col: 'Institution Code *', req: 'Yes', desc: 'Institution code (e.g., CAS, AHS, COE)' },
		{ col: 'Register No *', req: 'Yes', desc: 'Student registration number' },
		{ col: 'Course Code *', req: 'Yes', desc: 'Course code from courses table' },
		{ col: 'Session Code', req: 'No', desc: 'Examination session code' },
		{ col: 'Program Code', req: 'No', desc: 'Program code from programs table' },
		{ col: 'Assignment Marks', req: 'No', desc: 'Assignment marks (0-100)' },
		{ col: 'Quiz Marks', req: 'No', desc: 'Quiz marks (0-100)' },
		{ col: 'Mid Term Marks', req: 'No', desc: 'Mid term exam marks (0-100)' },
		{ col: 'Presentation Marks', req: 'No', desc: 'Presentation marks (0-100)' },
		{ col: 'Attendance Marks', req: 'No', desc: 'Attendance marks (0-100)' },
		{ col: 'Lab Marks', req: 'No', desc: 'Lab/practical marks (0-100)' },
		{ col: 'Project Marks', req: 'No', desc: 'Project marks (0-100)' },
		{ col: 'Seminar Marks', req: 'No', desc: 'Seminar marks (0-100)' },
		{ col: 'Viva Marks', req: 'No', desc: 'Viva marks (0-100)' },
		{ col: 'Test 1/2/3 Mark', req: 'No', desc: 'Internal test marks (0-100)' },
		{ col: 'Other Marks', req: 'No', desc: 'Other assessment marks (0-100)' },
		{ col: 'Max Internal Marks *', req: 'Yes', desc: 'Maximum internal marks for the course' },
		{ col: 'Remarks', req: 'No', desc: 'Any additional remarks' }
	]
	columnInfo.forEach(info => {
		referenceData.push({
			'Type': 'Column',
			'Code': info.col,
			'Name': info.req,
			'Note': info.desc
		})
	})
	referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Note': '' })

	// Institution Codes
	if (institutions.length > 0) {
		referenceData.push({ 'Type': 'INSTITUTION CODES', 'Code': '', 'Name': '', 'Note': '' })
		institutions.forEach(inst => {
			referenceData.push({
				'Type': 'Institution',
				'Code': inst.institution_code,
				'Name': inst.name,
				'Note': ''
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Note': '' })
	}

	// Session Codes
	if (sessions.length > 0) {
		referenceData.push({ 'Type': 'SESSION CODES', 'Code': '', 'Name': '', 'Note': '' })
		sessions.forEach(session => {
			referenceData.push({
				'Type': 'Session',
				'Code': session.session_code,
				'Name': session.session_name,
				'Note': ''
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Note': '' })
	}

	// Program Codes
	if (programs.length > 0) {
		referenceData.push({ 'Type': 'PROGRAM CODES', 'Code': '', 'Name': '', 'Note': '' })
		programs.forEach(prog => {
			referenceData.push({
				'Type': 'Program',
				'Code': prog.program_code,
				'Name': prog.program_name,
				'Note': ''
			})
		})
		referenceData.push({ 'Type': '', 'Code': '', 'Name': '', 'Note': '' })
	}

	// Course Codes
	if (courses.length > 0) {
		referenceData.push({ 'Type': 'COURSE CODES', 'Code': '', 'Name': '', 'Note': '' })
		courses.forEach(course => {
			referenceData.push({
				'Type': 'Course',
				'Code': course.course_code,
				'Name': course.course_name,
				'Note': `Max: ${course.internal_max_mark || 100}`
			})
		})
	}

	if (referenceData.length > 0) {
		const wsRef = XLSX.utils.json_to_sheet(referenceData)
		wsRef['!cols'] = [
			{ wch: 18 }, // Type
			{ wch: 25 }, // Code
			{ wch: 40 }, // Name
			{ wch: 35 }  // Note
		]

		// Style section headers
		const refRange = XLSX.utils.decode_range(wsRef['!ref'] || 'A1')
		for (let row = refRange.s.r; row <= refRange.e.r; row++) {
			const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 })
			if (wsRef[cellAddress] && String(wsRef[cellAddress].v).endsWith('CODES') || String(wsRef[cellAddress]?.v).endsWith('REFERENCE')) {
				wsRef[cellAddress].s = {
					font: { bold: true, color: { rgb: '1F2937' } },
					fill: { fgColor: { rgb: 'DBEAFE' } }
				}
			}
		}

		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')
	}

	XLSX.writeFile(wb, `internal_marks_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Parse import file and return standardized rows
 */
export async function parseImportFile(file: File): Promise<any[]> {
	const fileName = file.name.toLowerCase()

	if (fileName.endsWith('.json')) {
		const text = await file.text()
		return JSON.parse(text)
	}

	if (fileName.endsWith('.csv')) {
		const text = await file.text()
		const lines = text.split('\n').filter(line => line.trim())
		if (lines.length < 2) {
			throw new Error('CSV file must have at least a header row and one data row')
		}
		const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
		return lines.slice(1).map(line => {
			const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
			const row: Record<string, string> = {}
			headers.forEach((header, index) => {
				row[header] = values[index] || ''
			})
			return row
		})
	}

	// Excel file
	const data = await file.arrayBuffer()
	const workbook = await XLSX.read(data)
	if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
		throw new Error('The Excel file has no sheets. Please check the file.')
	}
	const sheet = workbook.Sheets[workbook.SheetNames[0]]
	if (!sheet) {
		throw new Error('Could not read the first sheet. Please check the file.')
	}
	return XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
}

/**
 * Map raw import row to standardized format
 */
export function mapImportRow(row: any, index: number): {
	rowNumber: number
	institution_code: string
	register_no: string
	course_code: string
	session_code: string
	program_code: string
	assignment_marks: number | null
	quiz_marks: number | null
	mid_term_marks: number | null
	presentation_marks: number | null
	attendance_marks: number | null
	lab_marks: number | null
	project_marks: number | null
	seminar_marks: number | null
	viva_marks: number | null
	other_marks: number | null
	test_1_mark: number | null
	test_2_mark: number | null
	test_3_mark: number | null
	max_internal_marks: number
	remarks: string
	errors: string[]
	status: 'valid' | 'error'
} {
	const parseMarks = (value: any): number | null => {
		if (value === '' || value === null || value === undefined) return null
		const num = parseInt(String(value), 10)
		return isNaN(num) ? null : num
	}

	// Helper to get value by flexible key matching (handles whitespace, case variations)
	const getValue = (keys: string[]): any => {
		// First try exact match
		for (const key of keys) {
			if (row[key] !== undefined) return row[key]
		}
		// Then try trimmed keys from row
		const rowKeys = Object.keys(row)
		for (const key of keys) {
			const normalizedKey = key.toLowerCase().replace(/\s+/g, ' ').trim()
			for (const rowKey of rowKeys) {
				const normalizedRowKey = rowKey.toLowerCase().replace(/\s+/g, ' ').trim()
				if (normalizedRowKey === normalizedKey) {
					return row[rowKey]
				}
				// Also check if rowKey contains the key (partial match for flexible column names)
				if (normalizedRowKey.includes(normalizedKey) || normalizedKey.includes(normalizedRowKey)) {
					return row[rowKey]
				}
			}
		}
		return undefined
	}

	// Debug: Log row keys on first row to help diagnose column matching issues
	if (index === 0) {
		console.log('Excel row keys:', Object.keys(row))
		console.log('Excel row values:', row)
	}

	const institution_code = String(getValue(['Institution Code *', 'Institution Code', 'institution_code']) || '').trim().toUpperCase()
	const register_no = String(getValue(['Register No *', 'Register No', 'register_no']) || '').trim()
	const course_code = String(getValue(['Course Code *', 'Course Code', 'course_code']) || '').trim()
	const session_code = String(getValue(['Session Code', 'session_code']) || '').trim()
	const program_code = String(getValue(['Program Code', 'program_code']) || '').trim()

	const assignment_marks = parseMarks(getValue(['Assignment Marks', 'assignment_marks']))
	const quiz_marks = parseMarks(getValue(['Quiz Marks', 'quiz_marks']))
	const mid_term_marks = parseMarks(getValue(['Mid Term Marks', 'mid_term_marks']))
	const presentation_marks = parseMarks(getValue(['Presentation Marks', 'presentation_marks']))
	const attendance_marks = parseMarks(getValue(['Attendance Marks', 'attendance_marks']))
	const lab_marks = parseMarks(getValue(['Lab Marks', 'lab_marks']))
	const project_marks = parseMarks(getValue(['Project Marks', 'project_marks']))
	const seminar_marks = parseMarks(getValue(['Seminar Marks', 'seminar_marks']))
	const viva_marks = parseMarks(getValue(['Viva Marks', 'viva_marks']))
	const other_marks = parseMarks(getValue(['Other Marks', 'other_marks']))
	const test_1_mark = parseMarks(getValue(['Test 1 Mark', 'test_1_mark', 'Test 1 Marks', 'Test1 Mark', 'Test1Mark']))
	const test_2_mark = parseMarks(getValue(['Test 2 Mark', 'test_2_mark', 'Test 2 Marks', 'Test2 Mark', 'Test2Mark']))
	const test_3_mark = parseMarks(getValue(['Test 3 Mark', 'test_3_mark', 'Test 3 Marks', 'Test3 Mark', 'Test3Mark']))

	// Also check for total_internal_marks in case user provides it directly
	const total_internal_marks_provided = parseMarks(getValue(['Total Internal Marks', 'total_internal_marks', 'Total Marks']))

	const maxMarksStr = String(getValue(['Max Internal Marks *', 'Max Internal Marks', 'max_internal_marks']) || '100').trim()
	const max_internal_marks = parseFloat(maxMarksStr)
	const remarks = String(getValue(['Remarks', 'remarks']) || '').trim()

	// Validation
	const errors: string[] = []

	if (!institution_code) errors.push('Institution Code is required')
	if (!register_no) errors.push('Register No is required')
	if (!course_code) errors.push('Course Code is required')
	if (isNaN(max_internal_marks) || max_internal_marks <= 0) errors.push('Max Internal Marks must be a positive number')

	// Validate marks ranges
	const validateMarksRange = (name: string, value: number | null) => {
		if (value !== null) {
			if (value < 0) errors.push(`${name} cannot be negative`)
			if (value > 100) errors.push(`${name} cannot exceed 100`)
		}
	}

	validateMarksRange('Assignment Marks', assignment_marks)
	validateMarksRange('Quiz Marks', quiz_marks)
	validateMarksRange('Mid Term Marks', mid_term_marks)
	validateMarksRange('Presentation Marks', presentation_marks)
	validateMarksRange('Attendance Marks', attendance_marks)
	validateMarksRange('Lab Marks', lab_marks)
	validateMarksRange('Project Marks', project_marks)
	validateMarksRange('Seminar Marks', seminar_marks)
	validateMarksRange('Viva Marks', viva_marks)
	validateMarksRange('Test 1 Mark', test_1_mark)
	validateMarksRange('Test 2 Mark', test_2_mark)
	validateMarksRange('Test 3 Mark', test_3_mark)
	validateMarksRange('Other Marks', other_marks)

	// Check if at least one marks type is provided (or total_internal_marks directly)
	const hasAnyMarks = assignment_marks !== null || quiz_marks !== null || mid_term_marks !== null ||
		presentation_marks !== null || attendance_marks !== null || lab_marks !== null ||
		project_marks !== null || seminar_marks !== null || viva_marks !== null || other_marks !== null ||
		test_1_mark !== null || test_2_mark !== null || test_3_mark !== null ||
		total_internal_marks_provided !== null

	if (!hasAnyMarks) {
		// Log available keys for debugging
		console.log('No marks found in row. Available columns:', Object.keys(row))
		errors.push('At least one marks type must be provided')
	}

	return {
		rowNumber: index + 2,
		institution_code,
		register_no,
		course_code,
		session_code,
		program_code,
		assignment_marks,
		quiz_marks,
		mid_term_marks,
		presentation_marks,
		attendance_marks,
		lab_marks,
		project_marks,
		seminar_marks,
		viva_marks,
		other_marks,
		test_1_mark,
		test_2_mark,
		test_3_mark,
		max_internal_marks: isNaN(max_internal_marks) ? 100 : max_internal_marks,
		remarks,
		errors,
		status: errors.length === 0 ? 'valid' : 'error'
	}
}
