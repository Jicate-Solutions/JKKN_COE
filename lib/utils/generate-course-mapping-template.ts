import XLSX from '@/lib/utils/excel-compat'

interface ReferenceData {
	institutions: Array<{ code: string; name: string }>
	programs: Array<{ code: string; name: string }>
	regulations: Array<{ code: string; name: string }>
	batches: Array<{ code: string; name: string; year: number }>
	semesters: Array<{ code: string; name: string; number: number }>
	courses: Array<{ code: string; name: string; category: string; type: string }>
}

export function generateCourseMappingTemplate(referenceData: ReferenceData) {
	// Create workbook
	const wb = XLSX.utils.book_new()

	// ===== MAIN DATA SHEET =====
	const mainSheetData = [
		// Header row with instructions
		['COURSE MAPPING TEMPLATE - Fill in the data below'],
		['INSTRUCTIONS: Fill all required fields (*). Use codes from Reference sheets. Boolean fields: TRUE/FALSE. Course Group must be from REF - Course Groups sheet.'],
		[],
		// Column headers - 20 fields as per specification
		[
			'Institution Code*',
			'Program Code*',
			'Course Code*',
			'Batch Code*',
			'Regulation Code',
			'Course Group',
			'Semester Code',
			'Course Order',
			'Course Category',
			'Internal Max Mark',
			'Internal Pass Mark',
			'Internal Converted Mark',
			'External Max Mark',
			'External Pass Mark',
			'External Converted Mark',
			'Total Pass Mark',
			'Total Max Mark',
			'Annual Semester',
			'Registration Based',
			'Is Active'
		],
		// Example row
		[
			'JKKNCAS',
			'UEG',
			'21UMA101',
			'B21',
			'R21',
			'General',
			'Semester I',
			1,
			'Theory',
			20,
			10,
			20,
			80,
			40,
			80,
			50,
			100,
			'FALSE',
			'FALSE',
			'TRUE'
		],
		// Empty rows for data entry - 20 columns
		...Array(50).fill([
			'', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
		])
	]

	const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetData)

	// Set column widths - 20 columns
	mainSheet['!cols'] = [
		{ wch: 18 }, // Institution Code*
		{ wch: 15 }, // Program Code*
		{ wch: 15 }, // Course Code*
		{ wch: 12 }, // Batch Code*
		{ wch: 16 }, // Regulation Code
		{ wch: 18 }, // Course Group
		{ wch: 15 }, // Semester Code
		{ wch: 13 }, // Course Order
		{ wch: 16 }, // Course Category
		{ wch: 16 }, // Internal Max Mark
		{ wch: 17 }, // Internal Pass Mark
		{ wch: 20 }, // Internal Converted Mark
		{ wch: 16 }, // External Max Mark
		{ wch: 17 }, // External Pass Mark
		{ wch: 20 }, // External Converted Mark
		{ wch: 16 }, // Total Pass Mark
		{ wch: 15 }, // Total Max Mark
		{ wch: 16 }, // Annual Semester
		{ wch: 18 }, // Registration Based
		{ wch: 10 }  // Is Active
	]

	// Style header rows
	const headerStyle = {
		font: { bold: true, color: { rgb: "FFFFFF" } },
		fill: { fgColor: { rgb: "4472C4" } },
		alignment: { horizontal: "center", vertical: "center", wrapText: true }
	}

	const instructionStyle = {
		font: { italic: true, color: { rgb: "FF0000" } },
		fill: { fgColor: { rgb: "FFF2CC" } },
		alignment: { wrapText: true }
	}

	// Apply styles (Note: XLSX requires cell references)
	if (!mainSheet['A1']) mainSheet['A1'] = { t: 's', v: '' }
	mainSheet['A1'].s = { font: { bold: true, sz: 14 }, fill: { fgColor: { rgb: "DCE6F1" } } }

	if (!mainSheet['A2']) mainSheet['A2'] = { t: 's', v: '' }
	mainSheet['A2'].s = instructionStyle

	XLSX.utils.book_append_sheet(wb, mainSheet, 'Course Mapping Data')

	// ===== REFERENCE SHEET: INSTITUTIONS =====
	const institutionsData = [
		['Institution Code', 'Institution Name'],
		...referenceData.institutions.map(i => [i.code, i.name])
	]
	const institutionsSheet = XLSX.utils.aoa_to_sheet(institutionsData)
	institutionsSheet['!cols'] = [{ wch: 18 }, { wch: 50 }]
	XLSX.utils.book_append_sheet(wb, institutionsSheet, 'REF - Institutions')

	// ===== REFERENCE SHEET: PROGRAMS =====
	const programsData = [
		['Program Code', 'Program Name'],
		...referenceData.programs.map(p => [p.code, p.name])
	]
	const programsSheet = XLSX.utils.aoa_to_sheet(programsData)
	programsSheet['!cols'] = [{ wch: 15 }, { wch: 50 }]
	XLSX.utils.book_append_sheet(wb, programsSheet, 'REF - Programs')

	// ===== REFERENCE SHEET: REGULATIONS =====
	const regulationsData = [
		['Regulation Code', 'Regulation Name'],
		...referenceData.regulations.map(r => [r.code, r.name])
	]
	const regulationsSheet = XLSX.utils.aoa_to_sheet(regulationsData)
	regulationsSheet['!cols'] = [{ wch: 16 }, { wch: 50 }]
	XLSX.utils.book_append_sheet(wb, regulationsSheet, 'REF - Regulations')

	// ===== REFERENCE SHEET: BATCHES =====
	const batchesData = [
		['Batch Code', 'Batch Name', 'Batch Year'],
		...referenceData.batches.map(b => [b.code, b.name, b.year])
	]
	const batchesSheet = XLSX.utils.aoa_to_sheet(batchesData)
	batchesSheet['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }]
	XLSX.utils.book_append_sheet(wb, batchesSheet, 'REF - Batches')

	// ===== REFERENCE SHEET: SEMESTERS =====
	const semestersData = [
		['Semester Code', 'Semester Name', 'Semester Number'],
		...referenceData.semesters.map(s => [s.code, s.name, s.number])
	]
	const semestersSheet = XLSX.utils.aoa_to_sheet(semestersData)
	semestersSheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 16 }]
	XLSX.utils.book_append_sheet(wb, semestersSheet, 'REF - Semesters')

	// ===== REFERENCE SHEET: COURSES =====
	const coursesData = [
		['Course Code', 'Course Name', 'Course Category', 'Course Type'],
		...referenceData.courses.map(c => [c.code, c.name, c.category, c.type])
	]
	const coursesSheet = XLSX.utils.aoa_to_sheet(coursesData)
	coursesSheet['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 16 }, { wch: 15 }]
	XLSX.utils.book_append_sheet(wb, coursesSheet, 'REF - Courses')

	// ===== REFERENCE SHEET: COURSE GROUPS =====
	const courseGroupsData = [
		['Course Group'],
		['General'],
		['Elective - I'],
		['Elective - II'],
		['Elective - III'],
		['Elective - IV'],
		['Elective - V'],
		['Elective - VI']
	]
	const courseGroupsSheet = XLSX.utils.aoa_to_sheet(courseGroupsData)
	courseGroupsSheet['!cols'] = [{ wch: 20 }]
	XLSX.utils.book_append_sheet(wb, courseGroupsSheet, 'REF - Course Groups')

	// ===== INSTRUCTIONS SHEET =====
	const instructionsData = [
		['COURSE MAPPING TEMPLATE - INSTRUCTIONS'],
		[],
		['Required Fields (*)'],
		['1. Institution Code: Use exact code from "REF - Institutions" sheet'],
		['2. Program Code: Use exact code from "REF - Programs" sheet'],
		['3. Course Code: Use exact code from "REF - Courses" sheet'],
		['4. Batch Code: Use exact code from "REF - Batches" sheet'],
		[],
		['Optional Fields'],
		['- Regulation Code: Use exact code from "REF - Regulations" sheet (nullable)'],
		['- Course Group: Use exact value from "REF - Course Groups" sheet (General, Elective - I to VI)'],
		['- Semester Code: Use exact code from "REF - Semesters" sheet (nullable)'],
		['- Course Order: Numeric order within semester (e.g., 1, 2, 3...)'],
		['- Course Category: Category override from courses table'],
		['- Internal Max Mark: Maximum internal assessment marks (numeric, 2 decimals)'],
		['- Internal Pass Mark: Minimum passing marks for internal (numeric, 2 decimals)'],
		['- Internal Converted Mark: Converted internal marks (numeric, 2 decimals)'],
		['- External Max Mark: Maximum external exam marks (numeric, 2 decimals)'],
		['- External Pass Mark: Minimum passing marks for external (numeric, 2 decimals)'],
		['- External Converted Mark: Converted external marks (numeric, 2 decimals)'],
		['- Total Pass Mark: Total minimum passing marks (numeric, 2 decimals)'],
		['- Total Max Mark: Total maximum marks (numeric, 2 decimals)'],
		['- Annual Semester: TRUE or FALSE (default: FALSE)'],
		['- Registration Based: TRUE or FALSE (default: FALSE)'],
		['- Is Active: TRUE or FALSE (default: TRUE)'],
		[],
		['Data Validation Rules'],
		['✓ All codes must exist in respective reference sheets'],
		['✓ Course Group must be one of: General, Elective - I, Elective - II, Elective - III, Elective - IV, Elective - V, Elective - VI'],
		['✓ Numeric fields must be valid numbers with up to 2 decimal places'],
		['✓ Marks should be positive numbers'],
		['✓ Boolean fields (Annual Semester, Registration Based, Is Active) must be TRUE or FALSE'],
		['✓ No duplicate course mappings (same institution, program, course, batch, regulation, semester)'],
		[],
		['Foreign Key References (Auto-resolved by System)'],
		['• institutions_id → Looked up from institutions table using institution_code'],
		['• regulation_id → Looked up from regulations table using regulation_code'],
		['• program_id → Looked up from programs table using program_code'],
		['• course_id → Looked up from courses table using course_code'],
		['• batch_id → Looked up from batch table using batch_code'],
		[],
		['Common Errors to Avoid'],
		['✗ Using invalid codes not present in reference sheets'],
		['✗ Leaving required fields empty (Institution Code, Program Code, Course Code, Batch Code)'],
		['✗ Using invalid Course Group values (must be from REF - Course Groups sheet)'],
		['✗ Using negative numbers for marks'],
		['✗ Invalid boolean values (must be exactly TRUE or FALSE, case-insensitive)'],
		['✗ Creating duplicate mappings'],
		[],
		['Tips'],
		['• Copy codes directly from reference sheets to avoid typos'],
		['• Use Excel autofill for sequential course orders'],
		['• Keep reference sheets open while filling data'],
		['• Validate data before uploading'],
		['• Check for duplicate rows before submission'],
		['• Boolean fields accept: TRUE/FALSE, true/false, True/False']
	]
	const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData)
	instructionsSheet['!cols'] = [{ wch: 80 }]
	XLSX.utils.book_append_sheet(wb, instructionsSheet, 'INSTRUCTIONS')

	// Generate and download
	const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
	const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = window.URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = `Course_Mapping_Template_${new Date().toISOString().split('T')[0]}.xlsx`
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	window.URL.revokeObjectURL(url)
}
