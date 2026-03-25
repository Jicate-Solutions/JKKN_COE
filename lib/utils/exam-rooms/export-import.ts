import XLSX from '@/lib/utils/excel-compat'
import type { Exam-rooms } from '@/types/exam-rooms'

// Export to JSON
export function exportToJSON(items: Exam-rooms[]): void {
	const exportData = items.map(item => ({
		// TODO: Map fields for export
		...item
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `exam-rooms_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// Export to Excel
export function exportToExcel(items: Exam-rooms[]): void {
	const excelData = items.map((item) => ({
		// TODO: Map fields for Excel export with readable column names
		'ID': item.id,
		'Created': new Date(item.created_at).toISOString().split('T')[0],
		'Status': item.is_active ? 'Active' : 'Inactive',
		// Add more fields...
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths
	const colWidths = [
		{ wch: 20 }, // ID
		{ wch: 12 }, // Created
		{ wch: 10 }, // Status
		// Add more widths...
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Exam-roomss')
	XLSX.writeFile(wb, `exam-rooms_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// Export template
export function exportTemplate(): void {
	const sample = [{
		// TODO: Add sample data for template
		'Field 1': 'Sample value',
		'Field 2': 'Sample value',
		// Add more fields...
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths
	const colWidths = [
		{ wch: 20 },
		{ wch: 20 },
		// Add more widths...
	]
	ws['!cols'] = colWidths

	// Style header row
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Field 1'] // TODO: List mandatory fields

	for (let col = range.s.c; col <= range.e.c; col++) {
		const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
		if (!ws[cellAddress]) continue

		const cell = ws[cellAddress]
		const isMandatory = mandatoryFields.includes(cell.v as string)

		if (isMandatory) {
			cell.v = cell.v + ' *'
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

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Template')
	XLSX.writeFile(wb, `exam-rooms_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
