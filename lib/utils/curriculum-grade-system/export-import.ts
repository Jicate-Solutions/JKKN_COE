/**
 * Curriculum Grade System Export/Import Utilities
 *
 * This module contains functions for exporting curriculum grade systems to various
 * formats (JSON, Excel) and generating import templates with reference data.
 */

import XLSX from '@/lib/utils/excel-compat'
import type {
	CurriculumGradeSystem,
	Institution,
	Regulation,
	Grade,
} from '@/lib/utils/curriculum-grade-system/validation'

/**
 * Exports curriculum grade systems to JSON file
 * @param items - Array of curriculum grade systems
 */
export function exportToJSON(items: CurriculumGradeSystem[]): void {
	const exportData = items.map(item => ({
		institutions_code: item.institutions_code,
		grade_system_code: item.grade_system_code,
		grade: item.grade,
		grade_point: item.grade_point,
		classification: item.classification,
		min_cgpa: item.min_cgpa,
		max_cgpa: item.max_cgpa,
		description: item.description,
		regulation_code: item.regulation_code || '',
		is_active: item.is_active,
		created_at: item.created_at
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `curriculum_grade_system_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Exports curriculum grade systems to Excel file with professional styling
 * @param items - Array of curriculum grade systems
 */
export function exportToExcel(items: CurriculumGradeSystem[]): void {
	const excelData = items.map((r) => ({
		'Institution Code': r.institutions_code,
		'System Code': r.grade_system_code,
		'Grade': r.grade,
		'Grade Point': r.grade_point,
		'Classification': r.classification,
		'Min CGPA': r.min_cgpa,
		'Max CGPA': r.max_cgpa,
		'Description': r.description,
		'Regulation Code': r.regulation_code || '',
		'Status': r.is_active ? 'Active' : 'Inactive',
		'Created': new Date(r.created_at).toISOString().split('T')[0],
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths for better readability
	const colWidths = [
		{ wch: 20 }, // Institution Code
		{ wch: 15 }, // System Code
		{ wch: 10 }, // Grade
		{ wch: 12 }, // Grade Point
		{ wch: 20 }, // Classification
		{ wch: 10 }, // Min CGPA
		{ wch: 10 }, // Max CGPA
		{ wch: 40 }, // Description
		{ wch: 18 }, // Regulation Code
		{ wch: 10 }, // Status
		{ wch: 12 }  // Created
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Curriculum Grade System')
	XLSX.writeFile(wb, `curriculum_grade_system_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Generates and downloads import template with sample data and reference sheets
 * @param institutions - Array of institutions for reference
 * @param regulations - Array of regulations for reference
 * @param grades - Array of grades for reference
 */
export function exportTemplate(
	institutions: Institution[],
	regulations: Regulation[],
	grades: Grade[]
): void {
	// Create workbook
	const wb = XLSX.utils.book_new()

	// Sheet 1: Template with sample row
	const sample = [{
		'Institution Code': 'JKKN',
		'System Code': 'UG',
		'Grade ID': 'grade-id-here',
		'Regulation ID': '1',
		'Classification': 'First Class',
		'Min CGPA': '6.5',
		'Max CGPA': '7.5',
		'Description': 'Outstanding performance'
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths for template sheet
	const colWidths = [
		{ wch: 18 }, // Institution Code
		{ wch: 15 }, // System Code
		{ wch: 20 }, // Grade ID
		{ wch: 15 }, // Regulation ID
		{ wch: 20 }, // Classification
		{ wch: 10 }, // Min CGPA
		{ wch: 10 }, // Max CGPA
		{ wch: 40 }  // Description
	]
	ws['!cols'] = colWidths

	// Style the header row to make mandatory fields red
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Institution Code', 'System Code', 'Grade ID', 'Regulation ID', 'Min CGPA', 'Max CGPA', 'Description']

	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue

		const cell = ws[cellAddress]
		const isMandatory = mandatoryFields.includes(cell.v as string)

		if (isMandatory) {
			// Make mandatory field headers red with asterisk
			cell.v = cell.v + ' *'
			cell.s = {
				font: { color: { rgb: 'FF0000' }, bold: true },
				fill: { fgColor: { rgb: 'FFE6E6' } }
			}
		} else {
			// Regular field headers
			cell.s = {
				font: { bold: true },
				fill: { fgColor: { rgb: 'F0F0F0' } }
			}
		}
	}

	XLSX.utils.book_append_sheet(wb, ws, 'Template')

	// Sheet 2: Institution Code References
	const institutionReference = institutions.map(inst => ({
		'Institution Code': inst.institution_code,
		'Institution Name': inst.name || 'N/A'
	}))

	const wsInst = XLSX.utils.json_to_sheet(institutionReference)
	const instColWidths = [
		{ wch: 20 }, // Institution Code
		{ wch: 40 }  // Institution Name
	]
	wsInst['!cols'] = instColWidths

	XLSX.utils.book_append_sheet(wb, wsInst, 'Institutions Reference')

	// Sheet 3: Regulations Reference
	const regulationReference = regulations.map(reg => ({
		'Regulation ID': reg.id,
		'Regulation Code': reg.regulation_code,
		'Regulation Name': reg.name || 'N/A'
	}))

	const wsReg = XLSX.utils.json_to_sheet(regulationReference)
	const regColWidths = [
		{ wch: 15 }, // Regulation ID
		{ wch: 20 }, // Regulation Code
		{ wch: 40 }  // Regulation Name
	]
	wsReg['!cols'] = regColWidths

	XLSX.utils.book_append_sheet(wb, wsReg, 'Regulations Reference')

	// Sheet 4: Grades Reference
	const gradeReference = grades.map(g => ({
		'Grade ID': g.id,
		'Grade': g.grade,
		'Grade Point': g.grade_point
	}))

	const wsGrade = XLSX.utils.json_to_sheet(gradeReference)
	const gradeColWidths = [
		{ wch: 20 }, // Grade ID
		{ wch: 10 }, // Grade
		{ wch: 12 }  // Grade Point
	]
	wsGrade['!cols'] = gradeColWidths

	XLSX.utils.book_append_sheet(wb, wsGrade, 'Grades Reference')

	XLSX.writeFile(wb, `curriculum_grade_system_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
