import XLSX from '@/lib/utils/excel-compat'
import type { CourseMapping } from '@/types/course-mapping'

/**
 * Exports course mappings to JSON file
 * @param items - Array of course mappings to export
 */
export function exportToJSON(items: CourseMapping[]): void {
	const exportData = items.map(item => ({
		course_id: item.course_id,
		institution_code: item.institution_code,
		program_code: item.program_code,
		regulation_code: item.regulation_code,
		semester_code: item.semester_code,
		course_group: item.course_group || '',
		course_category: item.course_category || '',
		course_order: item.course_order || 0,
		internal_max_mark: item.internal_max_mark || 0,
		internal_pass_mark: item.internal_pass_mark || 0,
		internal_converted_mark: item.internal_converted_mark || 0,
		external_max_mark: item.external_max_mark || 0,
		external_pass_mark: item.external_pass_mark || 0,
		external_converted_mark: item.external_converted_mark || 0,
		total_pass_mark: item.total_pass_mark || 0,
		total_max_mark: item.total_max_mark || 0,
		annual_semester: item.annual_semester || false,
		registration_based: item.registration_based || false,
		is_active: item.is_active ?? true,
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `course_mappings_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Exports course mappings to Excel file with professional styling
 * @param items - Array of course mappings to export
 */
export function exportToExcel(items: CourseMapping[]): void {
	const excelData = items.map((item, index) => ({
		'S.No': index + 1,
		'Course ID': item.course_id,
		'Institution Code': item.institution_code,
		'Program Code': item.program_code,
		'Regulation Code': item.regulation_code,
		'Semester Code': item.semester_code,
		'Course Group': item.course_group || '-',
		'Course Category': item.course_category || '-',
		'Course Order': item.course_order || 0,
		'Internal Max': item.internal_max_mark || 0,
		'Internal Pass': item.internal_pass_mark || 0,
		'Internal Converted': item.internal_converted_mark || 0,
		'External Max': item.external_max_mark || 0,
		'External Pass': item.external_pass_mark || 0,
		'External Converted': item.external_converted_mark || 0,
		'Total Pass': item.total_pass_mark || 0,
		'Total Max': item.total_max_mark || 0,
		'Annual Semester': item.annual_semester ? 'Yes' : 'No',
		'Registration Based': item.registration_based ? 'Yes' : 'No',
		'Status': item.is_active ? 'Active' : 'Inactive',
		'Created': item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '-',
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths
	const colWidths = [
		{ wch: 5 },   // S.No
		{ wch: 36 },  // Course ID (UUID)
		{ wch: 15 },  // Institution Code
		{ wch: 12 },  // Program Code
		{ wch: 15 },  // Regulation Code
		{ wch: 12 },  // Semester Code
		{ wch: 15 },  // Course Group
		{ wch: 15 },  // Course Category
		{ wch: 10 },  // Course Order
		{ wch: 12 },  // Internal Max
		{ wch: 12 },  // Internal Pass
		{ wch: 16 },  // Internal Converted
		{ wch: 12 },  // External Max
		{ wch: 12 },  // External Pass
		{ wch: 16 },  // External Converted
		{ wch: 10 },  // Total Pass
		{ wch: 10 },  // Total Max
		{ wch: 14 },  // Annual Semester
		{ wch: 16 },  // Registration Based
		{ wch: 10 },  // Status
		{ wch: 12 },  // Created
	]
	ws['!cols'] = colWidths

	// Apply Times New Roman font to all cells
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	for (let R = range.s.r; R <= range.e.r; ++R) {
		for (let C = range.s.c; C <= range.e.c; ++C) {
			const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
			if (!ws[cellAddress]) continue

			ws[cellAddress].s = {
				font: {
					name: 'Times New Roman',
					sz: R === 0 ? 11 : 10,
					bold: R === 0
				},
				alignment: {
					horizontal: C === 0 ? 'center' : 'left',
					vertical: 'center'
				}
			}
		}
	}

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Course Mappings')
	XLSX.writeFile(wb, `course_mappings_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Exports a template Excel file with sample data and instructions
 */
export function exportTemplate(): void {
	// Sample data sheet
	const sampleData = [{
		'Course ID *': 'course-uuid-here',
		'Institution Code *': 'JKKN',
		'Program Code *': 'BCOM',
		'Regulation Code *': 'R21',
		'Semester Code *': 'SEM1',
		'Course Group': 'General',
		'Course Category': 'Core',
		'Course Order': 1,
		'Internal Max Mark': 40,
		'Internal Pass Mark': 14,
		'Internal Converted Mark': 25,
		'External Max Mark': 60,
		'External Pass Mark': 21,
		'External Converted Mark': 50,
		'Total Pass Mark': 35,
		'Total Max Mark': 75,
		'Annual Semester': 'No',
		'Registration Based': 'No',
		'Status': 'Active',
	}]

	// Instructions sheet
	const instructions = [
		{ Field: 'Course ID *', Description: 'UUID of the course (Required)', Example: 'abc-123-def-456' },
		{ Field: 'Institution Code *', Description: 'Code of the institution (Required)', Example: 'JKKN' },
		{ Field: 'Program Code *', Description: 'Code of the program (Required)', Example: 'BCOM, BBA, BSC' },
		{ Field: 'Regulation Code *', Description: 'Code of the regulation (Required)', Example: 'R21, R25' },
		{ Field: 'Semester Code *', Description: 'Code of the semester (Required)', Example: 'SEM1, SEM2' },
		{ Field: 'Course Group', Description: 'Group classification (Optional)', Example: 'General, Elective - I, Elective - II' },
		{ Field: 'Course Category', Description: 'Category of course (Optional)', Example: 'Core, Elective, Foundation' },
		{ Field: 'Course Order', Description: 'Display order (Optional, integer >= 0)', Example: '1, 2, 3' },
		{ Field: 'Internal Max Mark', Description: 'Maximum internal marks (Optional, 0-100)', Example: '40' },
		{ Field: 'Internal Pass Mark', Description: 'Passing internal marks (Optional, 0-100)', Example: '14' },
		{ Field: 'Internal Converted Mark', Description: 'Converted internal marks (Optional, 0-100)', Example: '25' },
		{ Field: 'External Max Mark', Description: 'Maximum external marks (Optional, 0-100)', Example: '60' },
		{ Field: 'External Pass Mark', Description: 'Passing external marks (Optional, 0-100)', Example: '21' },
		{ Field: 'External Converted Mark', Description: 'Converted external marks (Optional, 0-100)', Example: '50' },
		{ Field: 'Total Pass Mark', Description: 'Total passing marks (Optional, 0-100)', Example: '35' },
		{ Field: 'Total Max Mark', Description: 'Total maximum marks (Optional, 0-100)', Example: '75' },
		{ Field: 'Annual Semester', Description: 'Is annual semester (Optional)', Example: 'Yes, No, true, false' },
		{ Field: 'Registration Based', Description: 'Is registration based (Optional)', Example: 'Yes, No, true, false' },
		{ Field: 'Status', Description: 'Active or Inactive (Optional)', Example: 'Active, Inactive, true, false' },
	]

	// Create Sample Data sheet
	const wsSample = XLSX.utils.json_to_sheet(sampleData)

	// Set column widths for sample sheet
	const sampleColWidths = [
		{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
		{ wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
		{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
		{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
	]
	wsSample['!cols'] = sampleColWidths

	// Style header row in sample sheet
	const sampleRange = XLSX.utils.decode_range(wsSample['!ref'] || 'A1')
	const mandatoryFields = ['Course ID *', 'Institution Code *', 'Program Code *', 'Regulation Code *', 'Semester Code *']

	for (let col = sampleRange.s.c; col <= sampleRange.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!wsSample[cellAddress]) continue

		const cell = wsSample[cellAddress]
		const isMandatory = mandatoryFields.includes(cell.v as string)

		if (isMandatory) {
			cell.s = {
				font: { name: 'Times New Roman', color: { rgb: 'FF0000' }, bold: true },
				fill: { fgColor: { rgb: 'FFE6E6' } },
				alignment: { horizontal: 'center', vertical: 'center' }
			}
		} else {
			cell.s = {
				font: { name: 'Times New Roman', bold: true },
				fill: { fgColor: { rgb: 'F0F0F0' } },
				alignment: { horizontal: 'center', vertical: 'center' }
			}
		}
	}

	// Style data row in sample sheet (gray background)
	for (let col = sampleRange.s.c; col <= sampleRange.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
		if (!wsSample[cellAddress]) continue

		wsSample[cellAddress].s = {
			font: { name: 'Times New Roman' },
			fill: { fgColor: { rgb: 'F5F5F5' } },
			alignment: { horizontal: 'left', vertical: 'center' }
		}
	}

	// Create Instructions sheet
	const wsInstructions = XLSX.utils.json_to_sheet(instructions)

	// Set column widths for instructions sheet
	wsInstructions['!cols'] = [
		{ wch: 25 }, // Field
		{ wch: 50 }, // Description
		{ wch: 30 }, // Example
	]

	// Style instructions sheet
	const instructionsRange = XLSX.utils.decode_range(wsInstructions['!ref'] || 'A1')
	for (let R = instructionsRange.s.r; R <= instructionsRange.e.r; ++R) {
		for (let C = instructionsRange.s.c; C <= instructionsRange.e.c; ++C) {
			const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
			if (!wsInstructions[cellAddress]) continue

			wsInstructions[cellAddress].s = {
				font: {
					name: 'Times New Roman',
					bold: R === 0,
					sz: R === 0 ? 11 : 10
				},
				fill: { fgColor: { rgb: R === 0 ? 'D0E4F5' : 'FFFFFF' } },
				alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
			}
		}
	}

	// Create workbook
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, wsSample, 'Sample Data')
	XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

	XLSX.writeFile(wb, `course_mapping_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
