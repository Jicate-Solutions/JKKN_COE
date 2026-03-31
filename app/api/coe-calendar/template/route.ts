import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET() {
	const wb = new ExcelJS.Workbook()

	// Sheet 1: Data entry template with one example row
	const dataSheet = wb.addWorksheet('Calendar Events')
	dataSheet.addRows([
		['Programme', 'Category', 'Event Title', 'From Date', 'To Date', 'Description'],
		['BOTH', 'CIA_I', 'CIA-I Commencement', '03-02-2026', '03-02-2026', 'Optional description'],
	])
	dataSheet.columns = [
		{ width: 12 }, { width: 18 }, { width: 40 }, { width: 14 }, { width: 14 }, { width: 30 },
	]

	// Sheet 2: Reference values
	const refSheet = wb.addWorksheet('Reference')
	refSheet.addRows([
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
	])
	refSheet.columns = [{ width: 14 }, { width: 50 }]

	const buffer = await wb.xlsx.writeBuffer()

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="coe-calendar-template.xlsx"',
		},
	})
}
