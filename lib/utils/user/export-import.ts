/**
 * User Export/Import Utilities
 *
 * This module contains functions for exporting users to various formats
 * (JSON, Excel) and generating import templates with reference data.
 */

import XLSX from '@/lib/utils/excel-compat'
import type { User } from '@/types/user'

/**
 * Exports users to JSON file
 * @param users - Array of users
 */
export function exportToJSON(users: User[]): void {
	const json = JSON.stringify(users, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = window.URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `users_${new Date().toISOString().split('T')[0]}.json`
	a.click()
	window.URL.revokeObjectURL(url)
}

/**
 * Exports users to Excel file with professional styling
 * @param users - Array of users
 */
export function exportToExcel(users: User[]): void {
	const rows = users.map(u => ({
		'Institution Code': u.institution_code || '',
		'Full Name': u.full_name,
		'Email': u.email,
		'Phone Number': u.phone_number || u.phone || '',
		'Role': u.role || 'user',
		'Status': u.is_active ? 'Active' : 'Inactive',
		'Verified': u.is_verified ? 'Yes' : 'No',
		'Created': new Date(u.created_at).toLocaleDateString('en-US')
	}))
	const ws = XLSX.utils.json_to_sheet(rows)

	// Set column widths for better readability
	const colWidths = [
		{ wch: 20 }, // Institution Code
		{ wch: 25 }, // Full Name
		{ wch: 30 }, // Email
		{ wch: 15 }, // Phone Number
		{ wch: 15 }, // Role
		{ wch: 10 }, // Status
		{ wch: 10 }, // Verified
		{ wch: 12 }  // Created
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Users')
	XLSX.writeFile(wb, `users_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Generates and downloads import template with sample data
 */
export function exportTemplate(): void {
	const sample = [{
		'Institution Code *': 'JKKN',
		'Full Name *': 'John Doe',
		'Email *': 'john@example.com',
		'Phone Number': '9876543210',
		'Role': 'user',
		'Status': 'Active'
	}]
	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths
	const colWidths = [
		{ wch: 20 }, // Institution Code
		{ wch: 25 }, // Full Name
		{ wch: 30 }, // Email
		{ wch: 15 }, // Phone Number
		{ wch: 15 }, // Role
		{ wch: 10 }  // Status
	]
	ws['!cols'] = colWidths

	// Style the header row to make mandatory fields red
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Institution Code *', 'Full Name *', 'Email *']

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

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Template')
	XLSX.writeFile(wb, `users_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
