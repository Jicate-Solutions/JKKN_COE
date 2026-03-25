import XLSX from '@/lib/utils/excel-compat'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { GeneratedCourseData, Institution, ExaminationSession } from '@/types/exam_timetable'

/**
 * Exports generated courses to JSON file
 * @param courses - Array of generated course data
 */
export function exportToJSON(courses: GeneratedCourseData[]): void {
	const exportData = courses.map(course => ({
		course_code: course.course_code,
		course_title: course.course_title,
		program_name: course.program_name,
		exam_date: course.exam_date,
		session: course.session,
		exam_time: course.exam_time,
		duration_minutes: course.duration_minutes,
		is_published: course.is_published,
		instructions: course.instructions || '',
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `exam_timetable_${new Date().toISOString().split('T')[0]}.json`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Exports generated courses to Excel file with professional styling
 * @param courses - Array of generated course data
 */
export function exportToExcel(courses: GeneratedCourseData[]): void {
	const excelData = courses.map((course) => ({
		'Course Code': course.course_code,
		'Course Name': course.course_title,
		'Program': course.program_name,
		'Regular Students': course.regular_count,
		'Arrear Students': course.arrear_count,
		'Exam Date': course.exam_date,
		'Session (FN/AN)': course.session,
		'Exam Time': course.exam_time,
		'Duration (Minutes)': course.duration_minutes,
		'Published': course.is_published ? 'Yes' : 'No',
		'Instructions': course.instructions || '',
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths
	const colWidths = [
		{ wch: 15 }, // Course Code
		{ wch: 35 }, // Course Name
		{ wch: 30 }, // Program
		{ wch: 16 }, // Regular Students
		{ wch: 16 }, // Arrear Students
		{ wch: 15 }, // Exam Date
		{ wch: 12 }, // Session
		{ wch: 12 }, // Exam Time
		{ wch: 18 }, // Duration
		{ wch: 10 }, // Published
		{ wch: 30 }  // Instructions
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Exam Timetable')
	XLSX.writeFile(wb, `exam_timetable_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * Exports generated courses to PDF file with metadata
 * @param courses - Array of generated course data
 * @param selectedInstitution - Selected institution (optional)
 * @param selectedSession - Selected examination session (optional)
 */
export function exportToPDF(
	courses: GeneratedCourseData[],
	selectedInstitution?: Institution,
	selectedSession?: ExaminationSession
): void {
	const doc = new jsPDF('landscape')

	// Add title
	doc.setFontSize(16)
	doc.setFont('helvetica', 'bold')
	doc.text('Examination Timetable', 14, 15)

	// Add metadata
	doc.setFontSize(10)
	doc.setFont('helvetica', 'normal')
	const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
	doc.text(`Generated on: ${today}`, 14, 22)

	// Add institution name if provided
	if (selectedInstitution) {
		doc.text(`Institution: ${selectedInstitution.institution_name}`, 14, 28)
	}

	// Add session name if provided
	if (selectedSession) {
		doc.text(`Session: ${selectedSession.session_name}`, 14, 34)
	}

	// Prepare table data
	const tableData = courses.map((course) => [
		course.course_code,
		course.course_title,
		course.program_name,
		`${course.regular_count} | ${course.arrear_count}`,
		course.exam_date,
		course.session,
		course.exam_time,
		course.duration_minutes.toString(),
		course.is_published ? 'Yes' : 'No',
	])

	// Add table using autoTable
	autoTable(doc, {
		head: [[
			'Course Code',
			'Course Name',
			'Program',
			'Students (R|A)',
			'Exam Date',
			'Session',
			'Time',
			'Duration (min)',
			'Published'
		]],
		body: tableData,
		startY: selectedInstitution && selectedSession ? 40 : selectedInstitution || selectedSession ? 34 : 28,
		styles: {
			fontSize: 8,
			cellPadding: 2,
		},
		headStyles: {
			fillColor: [59, 130, 246], // Blue color
			textColor: 255,
			fontStyle: 'bold',
			halign: 'center',
		},
		columnStyles: {
			0: { cellWidth: 25 },  // Course Code
			1: { cellWidth: 60 },  // Course Name
			2: { cellWidth: 50 },  // Program
			3: { cellWidth: 25, halign: 'center' },  // Students
			4: { cellWidth: 25 },  // Exam Date
			5: { cellWidth: 15, halign: 'center' },  // Session
			6: { cellWidth: 18, halign: 'center' },  // Time
			7: { cellWidth: 20, halign: 'center' },  // Duration
			8: { cellWidth: 18, halign: 'center' },  // Published
		},
		alternateRowStyles: {
			fillColor: [245, 247, 250],
		},
		margin: { top: 40, left: 14, right: 14 },
	})

	// Save the PDF
	doc.save(`exam_timetable_${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Exports a template Excel file with sample data, session reference, and instructions
 */
export function exportTemplate(): void {
	const wb = XLSX.utils.book_new()

	// Sheet 1: Template with sample row
	const sample = [{
		'Course Code': 'CS101',
		'Course Name': 'Introduction to Computer Science',
		'Program': 'B.Sc Computer Science',
		'Regular Students': '45',
		'Arrear Students': '5',
		'Exam Date': '2025-04-15',
		'Session (FN/AN)': 'FN',
		'Exam Time': '10:00',
		'Duration (Minutes)': '180',
		'Published': 'No',
		'Instructions': 'Calculators are allowed'
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths for template sheet
	const colWidths = [
		{ wch: 15 }, // Course Code
		{ wch: 35 }, // Course Name
		{ wch: 30 }, // Program
		{ wch: 16 }, // Regular Students
		{ wch: 16 }, // Arrear Students
		{ wch: 15 }, // Exam Date
		{ wch: 15 }, // Session
		{ wch: 12 }, // Exam Time
		{ wch: 18 }, // Duration
		{ wch: 10 }, // Published
		{ wch: 30 }  // Instructions
	]
	ws['!cols'] = colWidths

	// Style the header row to make mandatory fields red
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Exam Date', 'Session (FN/AN)', 'Exam Time', 'Duration (Minutes)']

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

	// Sheet 2: Session Options
	const sessionReference = [
		{ 'Session Code': 'FN', 'Session Name': 'Forenoon', 'Typical Time': '10:00 AM - 1:00 PM' },
		{ 'Session Code': 'AN', 'Session Name': 'Afternoon', 'Typical Time': '2:00 PM - 5:00 PM' }
	]

	const wsSession = XLSX.utils.json_to_sheet(sessionReference)
	wsSession['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 25 }]
	XLSX.utils.book_append_sheet(wb, wsSession, 'Session Reference')

	// Sheet 3: Instructions
	const instructions = [
		{ 'Field': 'Exam Date', 'Format': 'YYYY-MM-DD', 'Example': '2025-04-15', 'Required': 'Yes' },
		{ 'Field': 'Session (FN/AN)', 'Format': 'FN or AN', 'Example': 'FN', 'Required': 'Yes' },
		{ 'Field': 'Exam Time', 'Format': 'HH:MM (24-hour)', 'Example': '10:00', 'Required': 'Yes' },
		{ 'Field': 'Duration (Minutes)', 'Format': 'Number', 'Example': '180', 'Required': 'Yes' },
		{ 'Field': 'Published', 'Format': 'Yes/No', 'Example': 'No', 'Required': 'No' },
		{ 'Field': 'Instructions', 'Format': 'Text', 'Example': 'Calculators allowed', 'Required': 'No' }
	]

	const wsInstructions = XLSX.utils.json_to_sheet(instructions)
	wsInstructions['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }]
	XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

	XLSX.writeFile(wb, `exam_timetable_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
