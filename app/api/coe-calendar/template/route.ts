import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
	const wb = XLSX.utils.book_new()

	// Sheet 1: Data entry template with one example row
	const dataRows = [
		['Programme', 'Category', 'Event Title', 'From Date', 'To Date', 'Description'],
		['BOTH', 'CIA_I', 'CIA-I Commencement', '03-02-2026', '03-02-2026', 'Optional description'],
	]
	const dataSheet = XLSX.utils.aoa_to_sheet(dataRows)
	dataSheet['!cols'] = [
		{ wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
	]
	XLSX.utils.book_append_sheet(wb, dataSheet, 'Calendar Events')

	// Sheet 2: Reference values
	const refRows = [
		['Field', 'Valid Values'],
		['Programme', 'UG'],
		['Programme', 'PG'],
		['Programme', 'BOTH'],
		['', ''],
		['Category', 'CIA_I — Continuous Internal Assessment I'],
		['Category', 'CIA_II — Continuous Internal Assessment II'],
		['Category', 'MODEL_EXAM — Model Examination'],
		['Category', 'PRACTICAL_EXAM — Practical Examination'],
		['Category', 'SEMESTER_THEORY — Semester Theory Examination'],
		['Category', 'GENERAL — General Academic Event'],
		['', ''],
		['Date Format', 'DD-MM-YYYY (e.g. 03-02-2026)'],
	]
	const refSheet = XLSX.utils.aoa_to_sheet(refRows)
	refSheet['!cols'] = [{ wch: 14 }, { wch: 50 }]
	XLSX.utils.book_append_sheet(wb, refSheet, 'Reference')

	const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="coe-calendar-template.xlsx"',
		},
	})
}
