import ExcelJS from 'exceljs'

export interface CourseReferenceData {
	institutions: Array<{ institution_code: string }>
	regulations: Array<{ regulation_code: string }>
	boards?: Array<{ board_code: string; board_name?: string }>
}

/**
 * Generates a Course Master Excel template with:
 * - Sheet 1: Course Master (with headers, sample data, and dropdown validations)
 * - Sheet 2: Reference Data (lookup values for user reference)
 * - Hidden _ValidCodes sheet (for dropdown list sources)
 */
export function generateCourseTemplate(referenceData: CourseReferenceData): ExcelJS.Workbook {
	const workbook = new ExcelJS.Workbook()

	// ==================== SHEET 1: Course Master ====================
	// Column layout (45 columns):
	//  1 Institution Code*     2 Regulation Code*      3 Board Code
	//  4 Course Code*          5 Course Name*          6 Display Code*
	//  7 Course Category*      8 Course Type           9 Course Part Master
	// 10 Credit               11 Split Credit         12 Theory Credit
	// 13 Practical Credit     14 QP Code*             15 E Code Name
	// 16 Exam Duration Hours  17 Evaluation Type*     18 Result Type*
	// 19 Self Study Course    20 Outside Class Course 21 Open Book
	// 22 Online Course        23 Dummy Number Not Req 24 Annual Course
	// 25 Multiple QP Set      26 No of QP Setter      27 No of Scrutinizer
	// 28 Fee Exception        29 Has Hall Ticket      30 Syllabus PDF URL
	// 31 Description          32 Class Hours*         33 Theory Hours*
	// 34 Practical Hours*     35 Internal Max Mark*   36 Internal Pass Mark*
	// 37 Internal Conv Mark*  38 External Max Mark*   39 External Pass Mark*
	// 40 External Conv Mark*  41 Total Pass Mark*     42 Total Max Mark*
	// 43 Annual Semester*     44 Registration Based*  45 Status
	const courseMasterHeaders = [
		'Institution Code*',        //  1
		'Regulation Code*',         //  2
		'Board Code',               //  3
		'Course Code*',             //  4
		'Course Name*',             //  5
		'Display Code*',            //  6
		'Course Category*',         //  7
		'Course Type',              //  8
		'Course Part Master',       //  9
		'Credit',                   // 10
		'Split Credit',             // 11
		'Theory Credit',            // 12
		'Practical Credit',         // 13
		'QP Code*',                 // 14
		'E Code Name',              // 15
		'Exam Duration Hours',      // 16
		'Evaluation Type*',         // 17
		'Result Type*',             // 18
		'Self Study Course',        // 19
		'Outside Class Course',     // 20
		'Open Book',                // 21
		'Online Course',            // 22
		'Dummy Number Not Required',// 23
		'Annual Course',            // 24
		'Multiple QP Set',          // 25
		'No of QP Setter',          // 26
		'No of Scrutinizer',        // 27
		'Fee Exception',            // 28
		'Has Hall Ticket',          // 29
		'Syllabus PDF URL',         // 30
		'Description',              // 31
		'Class Hours*',             // 32
		'Theory Hours*',            // 33
		'Practical Hours*',         // 34
		'Internal Max Mark*',       // 35
		'Internal Pass Mark*',      // 36
		'Internal Converted Mark*', // 37
		'External Max Mark*',       // 38
		'External Pass Mark*',      // 39
		'External Converted Mark*', // 40
		'Total Pass Mark*',         // 41
		'Total Max Mark*',          // 42
		'Annual Semester*',         // 43
		'Registration Based*',      // 44
		'Status',                   // 45
	]

	const sampleRow = [
		referenceData.institutions[0]?.institution_code || 'JKKN',
		referenceData.regulations[0]?.regulation_code || 'R2021',
		referenceData.boards?.[0]?.board_code || '',  // Board Code (optional)
		'CS101',                         // Course Code*
		'Programming in C',              // Course Name*
		'PGC101',                        // Display Code*
		'Theory',                        // Course Category*
		'Core',                          // Course Type
		'Part I',                        // Course Part Master
		3.00,                            // Credit
		'FALSE',                         // Split Credit
		3.00,                            // Theory Credit
		0.00,                            // Practical Credit
		'QP-2025-CS101',                 // QP Code*
		'English',                       // E Code Name
		3,                               // Exam Duration Hours
		'CA + ESE',                      // Evaluation Type*
		'Mark',                          // Result Type*
		'FALSE',                         // Self Study Course
		'FALSE',                         // Outside Class Course
		'FALSE',                         // Open Book
		'FALSE',                         // Online Course
		'TRUE',                          // Dummy Number Not Required
		'FALSE',                         // Annual Course
		'FALSE',                         // Multiple QP Set
		2,                               // No of QP Setter
		1,                               // No of Scrutinizer
		'FALSE',                         // Fee Exception
		'TRUE',                          // Has Hall Ticket
		'https://example.com/syllabus.pdf', // Syllabus PDF URL
		'Introductory C course for UG students', // Description
		45,                              // Class Hours*
		30,                              // Theory Hours*
		15,                              // Practical Hours*
		40,                              // Internal Max Mark*
		16,                              // Internal Pass Mark*
		25,                              // Internal Converted Mark*
		60,                              // External Max Mark*
		24,                              // External Pass Mark*
		75,                              // External Converted Mark*
		40,                              // Total Pass Mark*
		100,                             // Total Max Mark*
		'FALSE',                         // Annual Semester*
		'FALSE',                         // Registration Based*
		'TRUE',                          // Status (active)
	]

	// Create Course Master worksheet
	const courseMasterSheet = workbook.addWorksheet('Course Master')

	// Add headers
	courseMasterSheet.addRow(courseMasterHeaders)

	// Style header row
	const headerRow = courseMasterSheet.getRow(1)
	headerRow.font = { bold: true }
	headerRow.fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FFE0E0E0' }
	}

	// Add sample data row
	courseMasterSheet.addRow(sampleRow)

	// Set column widths
	const columnWidths = [
		18,  //  1 Institution Code*
		18,  //  2 Regulation Code*
		15,  //  3 Board Code
		15,  //  4 Course Code*
		30,  //  5 Course Name*
		15,  //  6 Display Code*
		18,  //  7 Course Category*
		15,  //  8 Course Type
		20,  //  9 Course Part Master
		10,  // 10 Credit
		15,  // 11 Split Credit
		15,  // 12 Theory Credit
		17,  // 13 Practical Credit
		18,  // 14 QP Code*
		15,  // 15 E Code Name
		15,  // 16 Exam Duration Hours
		17,  // 17 Evaluation Type*
		15,  // 18 Result Type*
		18,  // 19 Self Study Course
		20,  // 20 Outside Class Course
		12,  // 21 Open Book
		15,  // 22 Online Course
		25,  // 23 Dummy Number Not Required
		15,  // 24 Annual Course
		17,  // 25 Multiple QP Set
		17,  // 26 No of QP Setter
		18,  // 27 No of Scrutinizer
		15,  // 28 Fee Exception
		17,  // 29 Has Hall Ticket
		30,  // 30 Syllabus PDF URL
		40,  // 31 Description
		15,  // 32 Class Hours*
		15,  // 33 Theory Hours*
		17,  // 34 Practical Hours*
		20,  // 35 Internal Max Mark*
		20,  // 36 Internal Pass Mark*
		25,  // 37 Internal Converted Mark*
		20,  // 38 External Max Mark*
		20,  // 39 External Pass Mark*
		25,  // 40 External Converted Mark*
		18,  // 41 Total Pass Mark*
		18,  // 42 Total Max Mark*
		18,  // 43 Annual Semester*
		20,  // 44 Registration Based*
		10,  // 45 Status
	]

	courseMasterSheet.columns = columnWidths.map((width, index) => ({
		key: courseMasterHeaders[index],
		width
	}))

	// ==================== DATA VALIDATIONS (DROPDOWNS) ====================
	const VALIDATION_ROWS = 100

	// Helper: apply inline dropdown (for short fixed enum lists)
	const addInlineDropdown = (
		colNumber: number,
		values: string[],
		errorTitle: string,
		errorMsg: string
	) => {
		const formula = `"${values.join(',')}"`
		for (let row = 2; row <= VALIDATION_ROWS; row++) {
			courseMasterSheet.getCell(row, colNumber).dataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: [formula],
				showErrorMessage: true,
				errorTitle,
				error: errorMsg,
				errorStyle: 'warning'
			}
		}
	}

	// Hidden sheet for dynamic/long dropdown lists
	const validCodesSheet = workbook.addWorksheet('_ValidCodes')
	validCodesSheet.state = 'hidden'
	let validCodesCol = 1

	// Helper: dropdown from hidden sheet reference (for dynamic/long lists)
	const addSheetDropdown = (
		colNumber: number,
		values: string[],
		errorTitle: string,
		errorMsg: string
	) => {
		if (values.length === 0) return
		const colLetter = String.fromCharCode(64 + validCodesCol)
		values.forEach((val, idx) => {
			validCodesSheet.getCell(idx + 1, validCodesCol).value = val
		})
		const ref = `'_ValidCodes'!$${colLetter}$1:$${colLetter}$${values.length}`
		for (let row = 2; row <= VALIDATION_ROWS; row++) {
			courseMasterSheet.getCell(row, colNumber).dataValidation = {
				type: 'list',
				allowBlank: true,
				formulae: [ref],
				showErrorMessage: true,
				errorTitle,
				error: errorMsg,
				errorStyle: 'warning'
			}
		}
		validCodesCol++
	}

	// --- Database-sourced dropdowns (hidden sheet — length unpredictable) ---

	// Col 1: Institution Code
	const instCodes = referenceData.institutions.map(i => i.institution_code)
	addSheetDropdown(1, instCodes, 'Invalid Institution', 'Select from the dropdown or check Reference Data sheet')

	// Col 2: Regulation Code
	const regCodes = referenceData.regulations.map(r => r.regulation_code)
	addSheetDropdown(2, regCodes, 'Invalid Regulation', 'Select from the dropdown or check Reference Data sheet')

	// Col 3: Board Code (optional)
	const boardCodes = (referenceData.boards || []).map(b => b.board_code)
	addSheetDropdown(3, boardCodes, 'Invalid Board', 'Select from the dropdown or check Reference Data sheet')

	// --- Enum dropdowns (inline — all under 255 chars) ---

	// Col 7: Course Category
	addInlineDropdown(7, [
		'Theory', 'Practical', 'Project', 'Theory + Practical', 'Theory + Project',
		'Field Work', 'Community Service', 'Group Project', 'Non Academic'
	], 'Invalid Category', 'Select: Theory, Practical, Project, etc.')

	// Col 8: Course Type (use hidden sheet)
	addSheetDropdown(8, [
		'Ability Enhancement', 'Additional Credit course', 'Advance learner course',
		'Audit Course', 'Bridge course', 'Core Practical', 'Core',
		'Discipline Specific elective Practical', 'Discipline Specific elective',
		'Elective Practical', 'Elective', 'English',
		'Extra Disciplinary Elective Practical', 'Extra Disciplinary',
		'Foundation Course', 'Generic Elective Practical', 'Generic Elective',
		'Internship', 'Language', 'Naanmuthalvan', 'Non Academic',
		'Non Major Elective Practical', 'Non Major Elective',
		'Practical', 'Project', 'Skill Enhancement Practical', 'Skill Enhancement',
		'Humanities, Social Sciences & Management Courses',
		'Basic Science Courses',
		'Engineering Science Courses',
		'Employability Enhancement Courses',
		'Professional Core Courses',
		'Programme Core',
		'Programme Elective',
		'Open Elective Courses',
		'Mandatory Courses',
		'Engineering Science (General)',
		'Basic Science',
		'Humanities',
		'Skill Development',
		'Self Learning',
		'Project Work',
		'Internship cum Project Work',
		'Lab Integrated Theory',
		'Department Intro Course',
		'Total Contact Period'
	], 'Invalid Course Type', 'Select from the dropdown or check Reference Data sheet')

	// Col 9: Course Part Master
	addInlineDropdown(9, ['Part I', 'Part II', 'Part III', 'Part IV', 'Part V'],
		'Invalid Part', 'Select: Part I through Part V')

	// Col 15: E Code Name
	addInlineDropdown(15, ['None', 'Tamil', 'English', 'French', 'Malayalam', 'Hindi', 'Computer Science', 'Mathematics'],
		'Invalid E Code', 'Select from the dropdown list')

	// Col 17: Evaluation Type
	addInlineDropdown(17, ['CIA', 'ESE', 'CIA + ESE', 'CA', 'CA + ESE'],
		'Invalid Evaluation Type', 'Select: CIA, ESE, CIA + ESE, CA, or CA + ESE')

	// Col 18: Result Type
	addInlineDropdown(18, ['Mark', 'Status', 'comment', 'credit'],
		'Invalid Result Type', 'Select: Mark, Status, comment, or credit')

	// --- Boolean dropdowns (TRUE/FALSE) ---
	const booleanColumns = [
		11,  // Split Credit
		19,  // Self Study Course
		20,  // Outside Class Course
		21,  // Open Book
		22,  // Online Course
		23,  // Dummy Number Not Required
		24,  // Annual Course
		25,  // Multiple QP Set
		28,  // Fee Exception
		29,  // Has Hall Ticket
		43,  // Annual Semester
		44,  // Registration Based
		45,  // Status
	]
	for (const col of booleanColumns) {
		addInlineDropdown(col, ['TRUE', 'FALSE'], 'Invalid Value', 'Select: TRUE or FALSE')
	}

	// ==================== SHEET 2: Reference Data ====================
	const referenceSheet = workbook.addWorksheet('Reference Data')

	const referenceRows: (string | number)[][] = []

	const addSection = (title: string) => {
		referenceRows.push(['', '', ''])
		referenceRows.push([title, '', ''])
	}

	const addTableHeaders = (col1: string, col2: string, col3: string) => {
		referenceRows.push([col1, col2, col3])
	}

	// INSTITUTION CODES Section
	addSection('═══ INSTITUTION CODES ═══')
	addTableHeaders('Category', 'Code', 'Description')
	referenceData.institutions.forEach(inst => {
		referenceRows.push(['Institution', inst.institution_code, `Institution: ${inst.institution_code}`])
	})
	if (referenceData.institutions.length === 0) {
		referenceRows.push(['Institution', 'JKKN', 'Example Institution'])
	}

	// REGULATION CODES Section
	addSection('═══ REGULATION CODES ═══')
	addTableHeaders('Category', 'Code', 'Description')
	referenceData.regulations.forEach(reg => {
		referenceRows.push(['Regulation', reg.regulation_code, `Regulation: ${reg.regulation_code}`])
	})
	if (referenceData.regulations.length === 0) {
		referenceRows.push(['Regulation', 'R2021', 'Example Regulation'])
	}

	// BOARD CODES Section
	addSection('═══ BOARD CODES ═══')
	addTableHeaders('Category', 'Code', 'Description')
	const boardsList = referenceData.boards || []
	boardsList.forEach(board => {
		const desc = board.board_name ? `${board.board_code} - ${board.board_name}` : `Board: ${board.board_code}`
		referenceRows.push(['Board', board.board_code, desc])
	})
	if (boardsList.length === 0) {
		referenceRows.push(['Board', '(none)', 'No boards configured for this institution — field is optional'])
	}

	// COURSE CATEGORY Section
	addSection('═══ COURSE CATEGORY ═══')
	addTableHeaders('Category', 'Value', 'Description')
	const courseCategories: [string, string][] = [
		['Theory', 'Theory-based course'],
		['Practical', 'Practical/Lab-based course'],
		['Project', 'Project-based course'],
		['Theory + Practical', 'Combined theory and practical'],
		['Theory + Project', 'Combined theory and project'],
		['Field Work', 'Field work or internship'],
		['Community Service', 'Community service activity'],
		['Group Project', 'Group project work'],
		['Non Academic', 'Non-academic activity']
	]
	courseCategories.forEach(([value, desc]) => {
		referenceRows.push(['Course Category', value, desc])
	})

	// COURSE TYPE Section
	addSection('═══ COURSE TYPE ═══')
	addTableHeaders('Category', 'Value', 'Description')
	const courseTypes: [string, string][] = [
		['Ability Enhancement', 'Ability enhancement course'],
		['Additional Credit course', 'Additional credit course'],
		['Advance learner course', 'Advanced learner course'],
		['Audit Course', 'Audit course (no grade)'],
		['Bridge course', 'Bridge/Remedial course'],
		['Core Practical', 'Core practical/lab course'],
		['Core', 'Core/Compulsory course'],
		['Discipline Specific elective Practical', 'DSE practical course'],
		['Discipline Specific elective', 'Discipline specific elective'],
		['Elective Practical', 'Elective practical course'],
		['Elective', 'General elective course'],
		['English', 'English language course'],
		['Extra Disciplinary Elective Practical', 'Extra disciplinary practical'],
		['Extra Disciplinary', 'Extra disciplinary elective'],
		['Foundation Course', 'Foundation/Introductory course'],
		['Generic Elective Practical', 'Generic elective practical'],
		['Generic Elective', 'Generic elective course'],
		['Internship', 'Internship/Industry training'],
		['Language', 'Language course'],
		['Naanmuthalvan', 'Naanmuthalvan program'],
		['Non Academic', 'Non-academic activity'],
		['Non Major Elective Practical', 'Non-major elective practical'],
		['Non Major Elective', 'Non-major elective course'],
		['Practical', 'Standalone practical course'],
		['Project', 'Project-based course'],
		['Skill Enhancement Practical', 'Skill enhancement practical'],
		['Skill Enhancement', 'Skill enhancement course'],
		['Humanities, Social Sciences & Management Courses', 'Humanities, social sciences and management'],
		['Basic Science Courses', 'Basic science course group'],
		['Engineering Science Courses', 'Engineering science course group'],
		['Employability Enhancement Courses', 'Employability enhancement course group'],
		['Professional Core Courses', 'Professional core course group'],
		['Programme Core', 'Programme core course'],
		['Programme Elective', 'Programme elective course'],
		['Open Elective Courses', 'Open elective course group'],
		['Mandatory Courses', 'Mandatory course group'],
		['Engineering Science (General)', 'General engineering science'],
		['Basic Science', 'Basic science'],
		['Humanities', 'Humanities'],
		['Skill Development', 'Skill development course'],
		['Self Learning', 'Self learning course'],
		['Project Work', 'Project work'],
		['Internship cum Project Work', 'Internship cum project work'],
		['Lab Integrated Theory', 'Lab integrated theory course'],
		['Department Intro Course', 'Department introduction course'],
		['Total Contact Period', 'Total contact period']
	]
	courseTypes.forEach(([value, desc]) => {
		referenceRows.push(['Course Type', value, desc])
	})

	// COURSE PART MASTER Section
	addSection('═══ COURSE PART MASTER ═══')
	addTableHeaders('Category', 'Value', 'Description')
	const courseParts: [string, string][] = [
		['Part I', 'First part'], ['Part II', 'Second part'],
		['Part III', 'Third part'], ['Part IV', 'Fourth part'], ['Part V', 'Fifth part']
	]
	courseParts.forEach(([value, desc]) => {
		referenceRows.push(['Part Master', value, desc])
	})

	// EVALUATION TYPE Section
	addSection('═══ EVALUATION TYPE ═══')
	addTableHeaders('Category', 'Value', 'Description')
	;([['CIA', 'Continuous Internal Assessment only'], ['ESE', 'End Semester Examination only'], ['CIA + ESE', 'Combined CIA and ESE'], ['CA', 'Continuous Assessment only'], ['CA + ESE', 'Combined CA and ESE']] as [string, string][])
		.forEach(([value, desc]) => { referenceRows.push(['Evaluation Type', value, desc]) })

	// RESULT TYPE Section
	addSection('═══ RESULT TYPE ═══')
	addTableHeaders('Category', 'Value', 'Description')
	;([['Mark', 'Numeric marks'], ['Status', 'Pass/Fail status only'], ['comment', 'Comment/Grade description'], ['credit', 'Credit-only course']] as [string, string][])
		.forEach(([value, desc]) => { referenceRows.push(['Result Type', value, desc]) })

	// E CODE NAME Section
	addSection('═══ E CODE NAME ═══')
	addTableHeaders('Category', 'Value', 'Description')
	;([
		['None', 'No language code'], ['Tamil', 'Tamil language'], ['English', 'English language'],
		['French', 'French language'], ['Malayalam', 'Malayalam language'], ['Hindi', 'Hindi language'],
		['Computer Science', 'Computer Science elective'], ['Mathematics', 'Mathematics elective']
	] as [string, string][]).forEach(([value, desc]) => { referenceRows.push(['E Code Name', value, desc]) })

	// BOOLEAN FIELDS Section
	addSection('═══ BOOLEAN FIELDS ═══')
	addTableHeaders('Category', 'Value', 'Description')
	referenceRows.push(['Boolean', 'TRUE', 'Yes/Active/Enabled (case-insensitive)'])
	referenceRows.push(['Boolean', 'FALSE', 'No/Inactive/Disabled (case-insensitive)'])

	// NOTES Section
	addSection('═══ IMPORTANT NOTES ═══')
	referenceRows.push(['', '• Fields marked with * are MANDATORY', ''])
	referenceRows.push(['', '• Use EXACT values from the lists above (case-sensitive)', ''])
	referenceRows.push(['', '• Institution and Regulation codes MUST exist in database', ''])
	referenceRows.push(['', '• Boolean fields: Use TRUE or FALSE only (case-insensitive)', ''])
	referenceRows.push(['', '• Course Code: Only letters, numbers, hyphens (-), and underscores (_)', ''])
	referenceRows.push(['', '• Credits: Numbers between 0 and 99', ''])
	referenceRows.push(['', '• If Split Credit = TRUE, both Theory and Practical credits required', ''])
	referenceRows.push(['', '• URLs: Must start with http:// or https://', ''])

	// Add all rows to reference sheet
	referenceRows.forEach(row => {
		referenceSheet.addRow(row)
	})

	// Set column widths for Reference Data sheet
	referenceSheet.columns = [
		{ width: 25 },
		{ width: 35 },
		{ width: 50 },
	]

	return workbook
}

/**
 * Converts workbook to buffer for downloading
 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as ArrayBuffer
}
