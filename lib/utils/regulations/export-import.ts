import XLSX from '@/lib/utils/excel-compat'
import type { Regulation } from '@/types/regulations'

/**
 * Export regulations to JSON format
 */
export function exportToJSON(items: Regulation[]): void {
	const exportData = items
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `regulations_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Export regulations to Excel format with styling
 */
export function exportToExcel(items: Regulation[]): void {
	const excelData = items.map((reg, index) => ({
		'S.No': index + 1,
		'Regulation Code': reg.regulation_code,
		'Year': reg.regulation_year,
		'Status': reg.status ? 'Active' : 'Inactive',
		'Min Internal': reg.minimum_internal,
		'Min External': reg.minimum_external,
		'Min Attendance': reg.minimum_attendance,
		'Min Total': reg.minimum_total,
		'Max Internal': reg.maximum_internal,
		'Max External': reg.maximum_external,
		'Max Total': reg.maximum_total,
		'Max QP Marks': reg.maximum_qp_marks,
		'Condonation Start': reg.condonation_range_start,
		'Condonation End': reg.condonation_range_end
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Define column widths
	const colWidths = [
		{ wch: 5 },   // S.No
		{ wch: 15 },  // Regulation Code
		{ wch: 8 },   // Year
		{ wch: 10 },  // Status
		{ wch: 12 },  // Min Internal
		{ wch: 12 },  // Min External
		{ wch: 15 },  // Min Attendance
		{ wch: 10 },  // Min Total
		{ wch: 12 },  // Max Internal
		{ wch: 12 },  // Max External
		{ wch: 10 },  // Max Total
		{ wch: 12 },  // Max QP Marks
		{ wch: 15 },  // Condonation Start
		{ wch: 15 }   // Condonation End
	]
	ws['!cols'] = colWidths

	// Apply header styling
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

	// Style headers (first row)
	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue

		ws[cellAddress].s = {
			font: {
				bold: true,
				name: 'Times New Roman',
				sz: 11
			},
			fill: {
				fgColor: { rgb: '16a34a' },
				bgColor: { rgb: '16a34a' },
				patternType: 'solid'
			},
			alignment: {
				horizontal: 'center',
				vertical: 'center'
			},
			border: {
				top: { style: 'thin', color: { rgb: '000000' } },
				bottom: { style: 'thin', color: { rgb: '000000' } },
				left: { style: 'thin', color: { rgb: '000000' } },
				right: { style: 'thin', color: { rgb: '000000' } }
			}
		}
	}

	// Apply data cell styling (Times New Roman font)
	for (let row = 1; row <= range.e.r; row++) {
		for (let col = range.s.c; col <= range.e.c; col++) {
			const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
			if (!ws[cellAddress]) continue

			if (!ws[cellAddress].s) ws[cellAddress].s = {}
			ws[cellAddress].s.font = {
				name: 'Times New Roman',
				sz: 11
			}
			ws[cellAddress].s.border = {
				top: { style: 'thin', color: { rgb: '000000' } },
				bottom: { style: 'thin', color: { rgb: '000000' } },
				left: { style: 'thin', color: { rgb: '000000' } },
				right: { style: 'thin', color: { rgb: '000000' } }
			}
		}
	}

	// Add worksheet to workbook
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Regulations')
	XLSX.writeFile(wb, `regulations_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Export Excel template for bulk import with sample data and styling
 */
export function exportTemplate(): void {
	const sampleData = [{
		'Regulation Code': 'R25',
		'Year': 2024,
		'Status': 'Active',
		'Min Internal': 14,
		'Min External': 26,
		'Min Attendance': 75,
		'Min Total': 40,
		'Max Internal': 40,
		'Max External': 60,
		'Max Total': 100,
		'Max QP Marks': 100,
		'Condonation Start': 65,
		'Condonation End': 74
	}]

	const ws = XLSX.utils.json_to_sheet(sampleData)

	// Define column widths
	const colWidths = [
		{ wch: 18 },  // Regulation Code
		{ wch: 10 },  // Year
		{ wch: 10 },  // Status
		{ wch: 12 },  // Min Internal
		{ wch: 12 },  // Min External
		{ wch: 15 },  // Min Attendance
		{ wch: 10 },  // Min Total
		{ wch: 12 },  // Max Internal
		{ wch: 12 },  // Max External
		{ wch: 10 },  // Max Total
		{ wch: 12 },  // Max QP Marks
		{ wch: 18 },  // Condonation Start
		{ wch: 18 }   // Condonation End
	]
	ws['!cols'] = colWidths

	// Apply header styling
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

	// Style headers (first row)
	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue

		ws[cellAddress].s = {
			font: {
				bold: true,
				name: 'Arial',
				sz: 11,
				color: { rgb: 'FFFFFF' }
			},
			fill: {
				fgColor: { rgb: '0066CC' },
				bgColor: { rgb: '0066CC' },
				patternType: 'solid'
			},
			alignment: {
				horizontal: 'center',
				vertical: 'center'
			},
			border: {
				top: { style: 'thin', color: { rgb: '000000' } },
				bottom: { style: 'thin', color: { rgb: '000000' } },
				left: { style: 'thin', color: { rgb: '000000' } },
				right: { style: 'thin', color: { rgb: '000000' } }
			}
		}
	}

	// Style sample data row
	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
		if (!ws[cellAddress]) continue

		ws[cellAddress].s = {
			font: {
				name: 'Arial',
				sz: 10,
				color: { rgb: '666666' },
				italic: true
			},
			fill: {
				fgColor: { rgb: 'F0F0F0' },
				bgColor: { rgb: 'F0F0F0' },
				patternType: 'solid'
			},
			border: {
				top: { style: 'thin', color: { rgb: '000000' } },
				bottom: { style: 'thin', color: { rgb: '000000' } },
				left: { style: 'thin', color: { rgb: '000000' } },
				right: { style: 'thin', color: { rgb: '000000' } }
			}
		}
	}

	// Add instructions as a comment in the first cell
	if (!ws.A1.c) ws.A1.c = []
	ws.A1.c.push({
		a: 'Template Instructions',
		t: 'This is a template for importing regulations data.\n\nInstructions:\n1. Replace the sample data with your actual data\n2. Keep the header row as is\n3. Status should be either "Active" or "Inactive"\n4. All numeric fields should contain numbers only\n5. Save the file and use the Import button to upload'
	})

	// Add worksheet to workbook
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Regulations Template')
	XLSX.writeFile(wb, `regulations_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Format boolean value for display
 */
export function formatBoolean(value: boolean): string {
	return value ? 'Active' : 'Inactive'
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	})
}
