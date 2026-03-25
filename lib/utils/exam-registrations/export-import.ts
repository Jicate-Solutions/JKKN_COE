import XLSX from '@/lib/utils/excel-compat'
import type { ExamRegistration } from '@/types/exam-registrations'

/**
 * Export exam registrations to JSON format
 */
export function exportToJSON(items: ExamRegistration[]): void {
	const exportData = items.map(item => ({
		id: item.id,
		institution_code: item.institution?.institution_code || '',
		institution_name: item.institution?.name || '',
		student_register_no: item.stu_register_no || '',
		student_name: item.student_name || `${item.student?.first_name || ''} ${item.student?.last_name || ''}`.trim(),
		student_roll_number: item.student?.roll_number || '',
		session_code: item.examination_session?.session_code || '',
		session_name: item.examination_session?.session_name || '',
		course_code: item.course_offering?.course_code || '',
		course_name: item.course_offering?.course_name || '',
		registration_date: item.registration_date,
		registration_status: item.registration_status,
		is_regular: item.is_regular,
		attempt_number: item.attempt_number,
		fee_paid: item.fee_paid,
		fee_amount: item.fee_amount,
		payment_date: item.payment_date,
		payment_transaction_id: item.payment_transaction_id,
		remarks: item.remarks,
		approved_by: item.approved_by_faculty?.faculty_name || '',
		approved_date: item.approved_date,
		created_at: item.created_at,
		updated_at: item.updated_at
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `exam-registrations_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Export exam registrations to Excel format
 */
export function exportToExcel(items: ExamRegistration[]): void {
	const excelData = items.map((item) => ({
		'Registration ID': item.id,
		'Institution Code': item.institution?.institution_code || '',
		'Institution Name': item.institution?.name || '',
		'Student Register No': item.stu_register_no || '',
		'Student Name': item.student_name || `${item.student?.first_name || ''} ${item.student?.last_name || ''}`.trim(),
		'Student Roll No': item.student?.roll_number || '',
		'Session Code': item.examination_session?.session_code || '',
		'Session Name': item.examination_session?.session_name || '',
		'Course Code': item.course_offering?.course_code || '',
		'Course Name': item.course_offering?.course_name || '',
		'Registration Date': item.registration_date,
		'Status': item.registration_status,
		'Regular Student': item.is_regular ? 'Yes' : 'No',
		'Attempt Number': item.attempt_number,
		'Fee Paid': item.fee_paid ? 'Yes' : 'No',
		'Fee Amount': item.fee_amount || '',
		'Payment Date': item.payment_date || '',
		'Transaction ID': item.payment_transaction_id || '',
		'Remarks': item.remarks || '',
		'Approved By': item.approved_by_faculty?.faculty_name || '',
		'Approved Date': item.approved_date || '',
		'Created At': new Date(item.created_at).toISOString().split('T')[0],
		'Updated At': item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : ''
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths for better readability
	const colWidths = [
		{ wch: 25 }, // Registration ID
		{ wch: 15 }, // Institution Code
		{ wch: 30 }, // Institution Name
		{ wch: 20 }, // Student Register No
		{ wch: 25 }, // Student Name
		{ wch: 15 }, // Student Roll No
		{ wch: 15 }, // Session Code
		{ wch: 30 }, // Session Name
		{ wch: 15 }, // Course Code
		{ wch: 30 }, // Course Name
		{ wch: 15 }, // Registration Date
		{ wch: 12 }, // Status
		{ wch: 15 }, // Regular Student
		{ wch: 15 }, // Attempt Number
		{ wch: 10 }, // Fee Paid
		{ wch: 12 }, // Fee Amount
		{ wch: 15 }, // Payment Date
		{ wch: 20 }, // Transaction ID
		{ wch: 30 }, // Remarks
		{ wch: 25 }, // Approved By
		{ wch: 15 }, // Approved Date
		{ wch: 12 }, // Created At
		{ wch: 12 }  // Updated At
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Exam Registrations')
	XLSX.writeFile(wb, `exam-registrations_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Reference data types for template export
 */
export interface TemplateReferenceData {
	institutions: Array<{ id: string; institution_code: string; name?: string }>
	examinationSessions: Array<{ id: string; session_code: string; session_name?: string; institutions_id: string }>
	courseOfferings: Array<{ id: string; course_code: string; course_name?: string; institutions_id: string }>
}

/**
 * Export Excel template for bulk import with dropdown validation
 * Includes data validations, conditional formatting for invalid values, and reference codes sheet
 * Follows excel-import-export skill pattern
 */
export async function exportTemplate(referenceData?: TemplateReferenceData): Promise<void> {
	const wb = XLSX.utils.book_new()

	// ═══════════════════════════════════════════════════════════════
	// Sheet 1: Template with empty row for user to fill
	// Note: Use * to mark required fields in headers
	// ═══════════════════════════════════════════════════════════════
	const sample = [{
		'Institution Code *': '',
		'Student Register No *': '',
		'Student Name': '',
		'Session Code *': '',
		'Course Code *': '',
		'Registration Date': new Date().toISOString().split('T')[0],
		'Status *': 'Pending',
		'Regular Student': 'Yes',
		'Attempt Number': '1',
		'Fee Paid': 'No',
		'Fee Amount': '',
		'Payment Date': '',
		'Transaction ID': '',
		'Remarks': '',
		'Approved By': '',
		'Approved Date': ''
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths for readability
	const colWidths = [
		{ wch: 20 }, // A: Institution Code
		{ wch: 22 }, // B: Student Register No
		{ wch: 25 }, // C: Student Name
		{ wch: 30 }, // D: Session Code
		{ wch: 18 }, // E: Course Code
		{ wch: 18 }, // F: Registration Date
		{ wch: 15 }, // G: Status
		{ wch: 18 }, // H: Regular Student
		{ wch: 18 }, // I: Attempt Number
		{ wch: 12 }, // J: Fee Paid
		{ wch: 15 }, // K: Fee Amount
		{ wch: 15 }, // L: Payment Date
		{ wch: 20 }, // M: Transaction ID
		{ wch: 30 }, // N: Remarks
		{ wch: 20 }, // O: Approved By
		{ wch: 15 }  // P: Approved Date
	]
	ws['!cols'] = colWidths

	// ═══════════════════════════════════════════════════════════════
	// ADD DATA VALIDATIONS (DROPDOWN LISTS + CONDITIONAL FORMATTING)
	// excel-compat handles the 255 char limit automatically:
	// - Short lists: inline dropdown + conditional formatting
	// - Long lists: hidden sheet reference + conditional formatting
	// ═══════════════════════════════════════════════════════════════
	const validations: any[] = []

	// Column A: Institution Code dropdown (if reference data provided)
	if (referenceData?.institutions && referenceData.institutions.length > 0) {
		const instCodes = referenceData.institutions.map(i => i.institution_code).filter(Boolean)
		if (instCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'A2:A1000',
				formula1: `"${instCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Institution',
				error: 'Please select a valid institution code from the dropdown list',
			})
		}
	}

	// Column D: Session Code dropdown (if reference data provided)
	if (referenceData?.examinationSessions && referenceData.examinationSessions.length > 0) {
		const sessionCodes = referenceData.examinationSessions.map(s => s.session_code).filter(Boolean)
		if (sessionCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'D2:D1000',
				formula1: `"${sessionCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Session',
				error: 'Please select a valid session code from the dropdown list',
			})
		}
	}

	// Column E: Course Code dropdown (if reference data provided)
	if (referenceData?.courseOfferings && referenceData.courseOfferings.length > 0) {
		const courseCodes = referenceData.courseOfferings.map(c => c.course_code).filter(Boolean)
		if (courseCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'E2:E1000',
				formula1: `"${courseCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Course',
				error: 'Please select a valid course code from the dropdown list',
			})
		}
	}

	// Column G: Status dropdown (enum values - always short, fits inline)
	const statusValues = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed']
	validations.push({
		type: 'list',
		sqref: 'G2:G1000',
		formula1: `"${statusValues.join(',')}"`,
		showDropDown: true,
		showErrorMessage: true,
		errorTitle: 'Invalid Status',
		error: 'Select: Pending, Approved, Rejected, Cancelled, or Completed',
	})

	// Column H: Regular Student dropdown (Yes/No)
	validations.push({
		type: 'list',
		sqref: 'H2:H1000',
		formula1: '"Yes,No"',
		showDropDown: true,
		showErrorMessage: true,
		errorTitle: 'Invalid Value',
		error: 'Select: Yes or No',
	})

	// Column J: Fee Paid dropdown (Yes/No)
	validations.push({
		type: 'list',
		sqref: 'J2:J1000',
		formula1: '"Yes,No"',
		showDropDown: true,
		showErrorMessage: true,
		errorTitle: 'Invalid Value',
		error: 'Select: Yes or No',
	})

	// Attach validations to worksheet
	// excel-compat will process these and:
	// 1. Create dropdowns (if < 255 chars) or use hidden sheet reference
	// 2. ALWAYS add conditional formatting to highlight invalid values in red
	ws['!dataValidation'] = validations

	XLSX.utils.book_append_sheet(wb, ws, 'Template')

	// ═══════════════════════════════════════════════════════════════
	// Sheet 2: Reference Codes (for user documentation)
	// Use section separators with ═══ for visual grouping
	// ═══════════════════════════════════════════════════════════════
	const referenceDataRows: any[] = []

	// Institution codes section
	referenceDataRows.push({ 'Type': '═══ INSTITUTION CODES ═══', 'Code': '', 'Name/Description': '' })
	if (referenceData?.institutions && referenceData.institutions.length > 0) {
		referenceData.institutions.forEach(inst => {
			referenceDataRows.push({
				'Type': 'Institution',
				'Code': inst.institution_code,
				'Name/Description': inst.name || 'N/A'
			})
		})
	} else {
		referenceDataRows.push({
			'Type': 'Institution',
			'Code': '(Load from system)',
			'Name/Description': 'Institution codes will be loaded when reference data is provided'
		})
	}

	// Session codes section
	referenceDataRows.push({ 'Type': '═══ EXAMINATION SESSION CODES ═══', 'Code': '', 'Name/Description': '' })
	if (referenceData?.examinationSessions && referenceData.examinationSessions.length > 0) {
		referenceData.examinationSessions.forEach(session => {
			referenceDataRows.push({
				'Type': 'Session',
				'Code': session.session_code,
				'Name/Description': session.session_name || 'N/A'
			})
		})
	} else {
		referenceDataRows.push({
			'Type': 'Session',
			'Code': '(Load from system)',
			'Name/Description': 'Session codes will be loaded when reference data is provided'
		})
	}

	// Course codes section
	referenceDataRows.push({ 'Type': '═══ COURSE CODES ═══', 'Code': '', 'Name/Description': '' })
	if (referenceData?.courseOfferings && referenceData.courseOfferings.length > 0) {
		referenceData.courseOfferings.forEach(course => {
			referenceDataRows.push({
				'Type': 'Course',
				'Code': course.course_code,
				'Name/Description': course.course_name || 'N/A'
			})
		})
	} else {
		referenceDataRows.push({
			'Type': 'Course',
			'Code': '(Load from system)',
			'Name/Description': 'Course codes will be loaded when reference data is provided'
		})
	}

	// Status values section
	referenceDataRows.push({ 'Type': '═══ STATUS VALUES ═══', 'Code': '', 'Name/Description': '' })
	statusValues.forEach(status => {
		referenceDataRows.push({
			'Type': 'Status',
			'Code': status,
			'Name/Description': `Registration is ${status.toLowerCase()}`
		})
	})

	// Boolean values section
	referenceDataRows.push({ 'Type': '═══ YES/NO VALUES ═══', 'Code': '', 'Name/Description': '' })
	;['Yes', 'No'].forEach(val => {
		referenceDataRows.push({
			'Type': 'Boolean',
			'Code': val,
			'Name/Description': val === 'Yes' ? 'True / Affirmative' : 'False / Negative'
		})
	})

	const wsRef = XLSX.utils.json_to_sheet(referenceDataRows)
	wsRef['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 50 }]
	XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')

	// ═══════════════════════════════════════════════════════════════
	// Sheet 3: Instructions
	// ═══════════════════════════════════════════════════════════════
	const instructions = [
		{ 'Field': 'Institution Code *', 'Description': 'The unique code for the institution (must exist in system). Select from dropdown.', 'Example': 'JKKNCAS' },
		{ 'Field': 'Student Register No *', 'Description': 'Learner registration number from MyJKKN (must exist in learners_profiles)', 'Example': '24JUGEN6001' },
		{ 'Field': 'Student Name', 'Description': 'Full name of the learner (optional - auto-filled from MyJKKN if not provided)', 'Example': 'John Doe' },
		{ 'Field': 'Session Code *', 'Description': 'Examination session code (must exist in system and belong to selected institution). Select from dropdown.', 'Example': 'JKKNCAS-NOV-DEC-2025' },
		{ 'Field': 'Course Code *', 'Description': 'Course offering code (must exist in system and belong to selected institution). Select from dropdown.', 'Example': '24UENS03' },
		{ 'Field': 'Registration Date', 'Description': 'Date of registration (YYYY-MM-DD format). Defaults to today if not provided.', 'Example': '2024-01-15' },
		{ 'Field': 'Status *', 'Description': 'Registration status. Select from dropdown: Pending, Approved, Rejected, Cancelled, or Completed', 'Example': 'Pending' },
		{ 'Field': 'Regular Student', 'Description': 'Is this a regular student? Select from dropdown: Yes or No. Defaults to Yes.', 'Example': 'Yes' },
		{ 'Field': 'Attempt Number', 'Description': 'Exam attempt number (1-10). Defaults to 1 if not provided.', 'Example': '1' },
		{ 'Field': 'Fee Paid', 'Description': 'Has fee been paid? Select from dropdown: Yes or No. Defaults to No.', 'Example': 'No' },
		{ 'Field': 'Fee Amount', 'Description': 'Fee amount in currency (0-999,999.99). Optional.', 'Example': '5000' },
		{ 'Field': 'Payment Date', 'Description': 'Date of payment (YYYY-MM-DD format). Optional.', 'Example': '2024-01-16' },
		{ 'Field': 'Transaction ID', 'Description': 'Payment transaction ID. Optional.', 'Example': 'TXN123456' },
		{ 'Field': 'Remarks', 'Description': 'Additional remarks or notes (max 500 characters). Optional.', 'Example': 'Early registration' },
		{ 'Field': 'Approved By', 'Description': 'Faculty code who approved (if applicable). Optional.', 'Example': 'FAC001' },
		{ 'Field': 'Approved Date', 'Description': 'Date of approval (YYYY-MM-DD format). Optional.', 'Example': '2024-01-17' }
	]

	const wsInstructions = XLSX.utils.json_to_sheet(instructions)
	wsInstructions['!cols'] = [
		{ wch: 25 }, // Field
		{ wch: 80 }, // Description
		{ wch: 25 }  // Example
	]
	XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

	// IMPORTANT: await is required - XLSX.writeFile is async (ExcelJS)
	await XLSX.writeFile(wb, `exam-registrations_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Format boolean value for display
 */
export function formatBoolean(value: boolean): string {
	return value ? 'Yes' : 'No'
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | null): string {
	if (!dateString) return ''
	try {
		return new Date(dateString).toISOString().split('T')[0]
	} catch {
		return dateString
	}
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number | null): string {
	if (amount === null || amount === undefined) return ''
	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 2
	}).format(amount)
}
