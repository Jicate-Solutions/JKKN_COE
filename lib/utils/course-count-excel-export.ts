import ExcelJS from 'exceljs'
import type {
	CourseCountReportData,
	ProgramCourseCount,
	BoardCourseCount,
	CourseCountExcelOptions
} from '@/types/course-count-report'

// Common styles
const headerStyle: Partial<ExcelJS.Style> = {
	font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
	fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } },
	alignment: { horizontal: 'center', vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

const subHeaderStyle: Partial<ExcelJS.Style> = {
	font: { bold: true, size: 10 },
	fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
	alignment: { horizontal: 'left', vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

const dataStyle: Partial<ExcelJS.Style> = {
	alignment: { vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

const totalRowStyle: Partial<ExcelJS.Style> = {
	font: { bold: true },
	fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
	alignment: { vertical: 'middle' },
	border: {
		top: { style: 'thin' },
		left: { style: 'thin' },
		bottom: { style: 'thin' },
		right: { style: 'thin' }
	}
}

/**
 * Export course count report to Excel (Program-wise view)
 */
export async function exportCourseCountProgramWise(
	data: CourseCountReportData
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Summary Sheet
	const summarySheet = workbook.addWorksheet('Summary')
	addSummarySheet(summarySheet, data)

	// Detailed Program-wise Sheet
	const detailedSheet = workbook.addWorksheet('Program-wise Report')
	addProgramWiseSheet(detailedSheet, data)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

/**
 * Export course count report to Excel (Board-wise view)
 */
export async function exportCourseCountBoardWise(
	data: CourseCountReportData
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	// Summary Sheet
	const summarySheet = workbook.addWorksheet('Summary')
	addSummarySheet(summarySheet, data)

	// Detailed Board-wise Sheet
	const detailedSheet = workbook.addWorksheet('Board-wise Report')
	addBoardWiseSheet(detailedSheet, data)

	const buffer = await workbook.xlsx.writeBuffer()
	return buffer as Buffer
}

/**
 * Add summary sheet
 */
function addSummarySheet(sheet: ExcelJS.Worksheet, data: CourseCountReportData) {
	// Title
	sheet.mergeCells('A1:F1')
	const titleCell = sheet.getCell('A1')
	titleCell.value = `${data.metadata.institution_name} - Course Count Report`
	titleCell.font = { bold: true, size: 16 }
	titleCell.alignment = { horizontal: 'center' }

	// Session info
	sheet.mergeCells('A2:F2')
	sheet.getCell('A2').value = `Examination Session: ${data.metadata.session_name} (${data.metadata.session_code})`
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	// Generated date
	sheet.mergeCells('A3:F3')
	sheet.getCell('A3').value = `Generated on: ${new Date().toLocaleDateString()}`
	sheet.getCell('A3').alignment = { horizontal: 'center' }

	// Summary section
	sheet.getCell('A5').value = 'Summary Statistics'
	sheet.getCell('A5').font = { bold: true, size: 12 }

	const summaryData = [
		['Total Programs', data.summary.total_programs],
		['Total Courses', data.summary.total_courses],
		['Regular Learner Count', data.summary.total_regular],
		['Arrear Learner Count', data.summary.total_arrear],
		['Grand Total', data.summary.grand_total]
	]

	let row = 6
	summaryData.forEach(([label, value]) => {
		const labelCell = sheet.getCell(`A${row}`)
		labelCell.value = label
		labelCell.font = { bold: true }
		labelCell.border = dataStyle.border

		const valueCell = sheet.getCell(`B${row}`)
		valueCell.value = value
		valueCell.alignment = { horizontal: 'center' }
		valueCell.border = dataStyle.border
		row++
	})

	// Set column widths
	sheet.getColumn('A').width = 25
	sheet.getColumn('B').width = 15
}

/**
 * Add program-wise detailed sheet
 */
function addProgramWiseSheet(sheet: ExcelJS.Worksheet, data: CourseCountReportData) {
	// Title
	sheet.mergeCells('A1:F1')
	const titleCell = sheet.getCell('A1')
	titleCell.value = 'Course Count Report (Program-wise)'
	titleCell.font = { bold: true, size: 14 }
	titleCell.alignment = { horizontal: 'center' }

	// Session info
	sheet.mergeCells('A2:F2')
	sheet.getCell('A2').value = `Examination Session: ${data.metadata.session_name}`
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	let currentRow = 4
	let sno = 1

	data.program_wise.forEach((program, programIndex) => {
		// Program header row
		sheet.mergeCells(`A${currentRow}:F${currentRow}`)
		const programCell = sheet.getCell(`A${currentRow}`)
		programCell.value = `${programIndex + 1}. ${program.program_code} - ${program.program_name}`
		programCell.style = subHeaderStyle
		currentRow++

		// Table header
		const headers = ['S.No', 'Course Code', 'Course Title', 'Regular', 'Arrears', 'Total']
		headers.forEach((header, index) => {
			const cell = sheet.getCell(currentRow, index + 1)
			cell.value = header
			cell.style = headerStyle
		})
		currentRow++

		// Course rows
		program.courses.forEach((course) => {
			sheet.getCell(currentRow, 1).value = sno++
			sheet.getCell(currentRow, 1).style = dataStyle
			sheet.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 2).value = course.course_code
			sheet.getCell(currentRow, 2).style = dataStyle
			sheet.getCell(currentRow, 2).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 3).value = course.course_title
			sheet.getCell(currentRow, 3).style = dataStyle

			sheet.getCell(currentRow, 4).value = course.regular_count
			sheet.getCell(currentRow, 4).style = dataStyle
			sheet.getCell(currentRow, 4).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 5).value = course.arrear_count
			sheet.getCell(currentRow, 5).style = dataStyle
			sheet.getCell(currentRow, 5).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 6).value = course.total_count
			sheet.getCell(currentRow, 6).style = dataStyle
			sheet.getCell(currentRow, 6).alignment = { horizontal: 'center', vertical: 'middle' }

			currentRow++
		})

		// Program total row
		sheet.getCell(currentRow, 1).value = ''
		sheet.getCell(currentRow, 1).style = totalRowStyle

		sheet.getCell(currentRow, 2).value = ''
		sheet.getCell(currentRow, 2).style = totalRowStyle

		sheet.getCell(currentRow, 3).value = 'Program Total'
		sheet.getCell(currentRow, 3).style = totalRowStyle

		sheet.getCell(currentRow, 4).value = program.program_total_regular
		sheet.getCell(currentRow, 4).style = totalRowStyle
		sheet.getCell(currentRow, 4).alignment = { horizontal: 'center', vertical: 'middle' }

		sheet.getCell(currentRow, 5).value = program.program_total_arrear
		sheet.getCell(currentRow, 5).style = totalRowStyle
		sheet.getCell(currentRow, 5).alignment = { horizontal: 'center', vertical: 'middle' }

		sheet.getCell(currentRow, 6).value = program.program_total
		sheet.getCell(currentRow, 6).style = totalRowStyle
		sheet.getCell(currentRow, 6).alignment = { horizontal: 'center', vertical: 'middle' }

		currentRow += 2 // Add space between programs
	})

	// Grand Total row
	currentRow++
	sheet.mergeCells(`A${currentRow}:C${currentRow}`)
	sheet.getCell(`A${currentRow}`).value = 'Grand Total'
	sheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 }
	sheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
	sheet.getCell(`A${currentRow}`).border = dataStyle.border

	sheet.getCell(currentRow, 4).value = data.summary.total_regular
	sheet.getCell(currentRow, 4).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 4).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
	sheet.getCell(currentRow, 4).border = dataStyle.border

	sheet.getCell(currentRow, 5).value = data.summary.total_arrear
	sheet.getCell(currentRow, 5).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 5).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
	sheet.getCell(currentRow, 5).border = dataStyle.border

	sheet.getCell(currentRow, 6).value = data.summary.grand_total
	sheet.getCell(currentRow, 6).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 6).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
	sheet.getCell(currentRow, 6).border = dataStyle.border

	// Set column widths
	sheet.getColumn(1).width = 8  // S.No
	sheet.getColumn(2).width = 15 // Course Code
	sheet.getColumn(3).width = 50 // Course Title
	sheet.getColumn(4).width = 12 // Regular
	sheet.getColumn(5).width = 12 // Arrears
	sheet.getColumn(6).width = 12 // Total
}

/**
 * Add board-wise detailed sheet
 */
function addBoardWiseSheet(sheet: ExcelJS.Worksheet, data: CourseCountReportData) {
	// Title
	sheet.mergeCells('A1:F1')
	const titleCell = sheet.getCell('A1')
	titleCell.value = 'Course Count Report (Board-wise)'
	titleCell.font = { bold: true, size: 14 }
	titleCell.alignment = { horizontal: 'center' }

	// Session info
	sheet.mergeCells('A2:F2')
	sheet.getCell('A2').value = `Examination Session: ${data.metadata.session_name}`
	sheet.getCell('A2').alignment = { horizontal: 'center' }

	let currentRow = 4
	let globalSno = 1

	data.board_wise.forEach((board) => {
		// Board header row
		sheet.mergeCells(`A${currentRow}:F${currentRow}`)
		const boardCell = sheet.getCell(`A${currentRow}`)
		boardCell.value = `Board: ${board.board_code} - ${board.board_name}`
		boardCell.font = { bold: true, size: 12 }
		boardCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
		boardCell.border = dataStyle.border
		currentRow++

		board.programs.forEach((program, programIndex) => {
			// Program header row within board
			sheet.mergeCells(`A${currentRow}:F${currentRow}`)
			const programCell = sheet.getCell(`A${currentRow}`)
			programCell.value = `  ${programIndex + 1}. ${program.program_code} - ${program.program_name}`
			programCell.style = subHeaderStyle
			currentRow++

			// Table header
			const headers = ['S.No', 'Course Code', 'Course Title', 'Regular', 'Arrears', 'Total']
			headers.forEach((header, index) => {
				const cell = sheet.getCell(currentRow, index + 1)
				cell.value = header
				cell.style = headerStyle
			})
			currentRow++

			// Course rows
			program.courses.forEach((course) => {
				sheet.getCell(currentRow, 1).value = globalSno++
				sheet.getCell(currentRow, 1).style = dataStyle
				sheet.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' }

				sheet.getCell(currentRow, 2).value = course.course_code
				sheet.getCell(currentRow, 2).style = dataStyle
				sheet.getCell(currentRow, 2).alignment = { horizontal: 'center', vertical: 'middle' }

				sheet.getCell(currentRow, 3).value = course.course_title
				sheet.getCell(currentRow, 3).style = dataStyle

				sheet.getCell(currentRow, 4).value = course.regular_count
				sheet.getCell(currentRow, 4).style = dataStyle
				sheet.getCell(currentRow, 4).alignment = { horizontal: 'center', vertical: 'middle' }

				sheet.getCell(currentRow, 5).value = course.arrear_count
				sheet.getCell(currentRow, 5).style = dataStyle
				sheet.getCell(currentRow, 5).alignment = { horizontal: 'center', vertical: 'middle' }

				sheet.getCell(currentRow, 6).value = course.total_count
				sheet.getCell(currentRow, 6).style = dataStyle
				sheet.getCell(currentRow, 6).alignment = { horizontal: 'center', vertical: 'middle' }

				currentRow++
			})

			// Program total row
			sheet.getCell(currentRow, 3).value = 'Program Total'
			sheet.getCell(currentRow, 3).style = totalRowStyle

			sheet.getCell(currentRow, 4).value = program.program_total_regular
			sheet.getCell(currentRow, 4).style = totalRowStyle
			sheet.getCell(currentRow, 4).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 5).value = program.program_total_arrear
			sheet.getCell(currentRow, 5).style = totalRowStyle
			sheet.getCell(currentRow, 5).alignment = { horizontal: 'center', vertical: 'middle' }

			sheet.getCell(currentRow, 6).value = program.program_total
			sheet.getCell(currentRow, 6).style = totalRowStyle
			sheet.getCell(currentRow, 6).alignment = { horizontal: 'center', vertical: 'middle' }

			currentRow += 1
		})

		// Board total row
		sheet.mergeCells(`A${currentRow}:C${currentRow}`)
		sheet.getCell(`A${currentRow}`).value = `Board Total (${board.board_code})`
		sheet.getCell(`A${currentRow}`).font = { bold: true }
		sheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
		sheet.getCell(`A${currentRow}`).border = dataStyle.border

		sheet.getCell(currentRow, 4).value = board.board_total_regular
		sheet.getCell(currentRow, 4).font = { bold: true }
		sheet.getCell(currentRow, 4).alignment = { horizontal: 'center' }
		sheet.getCell(currentRow, 4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
		sheet.getCell(currentRow, 4).border = dataStyle.border

		sheet.getCell(currentRow, 5).value = board.board_total_arrear
		sheet.getCell(currentRow, 5).font = { bold: true }
		sheet.getCell(currentRow, 5).alignment = { horizontal: 'center' }
		sheet.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
		sheet.getCell(currentRow, 5).border = dataStyle.border

		sheet.getCell(currentRow, 6).value = board.board_total
		sheet.getCell(currentRow, 6).font = { bold: true }
		sheet.getCell(currentRow, 6).alignment = { horizontal: 'center' }
		sheet.getCell(currentRow, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } }
		sheet.getCell(currentRow, 6).border = dataStyle.border

		currentRow += 2 // Add space between boards
	})

	// Grand Total row
	currentRow++
	sheet.mergeCells(`A${currentRow}:C${currentRow}`)
	sheet.getCell(`A${currentRow}`).value = 'Grand Total'
	sheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 }
	sheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } }
	sheet.getCell(`A${currentRow}`).border = dataStyle.border

	sheet.getCell(currentRow, 4).value = data.summary.total_regular
	sheet.getCell(currentRow, 4).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 4).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } }
	sheet.getCell(currentRow, 4).border = dataStyle.border

	sheet.getCell(currentRow, 5).value = data.summary.total_arrear
	sheet.getCell(currentRow, 5).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 5).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } }
	sheet.getCell(currentRow, 5).border = dataStyle.border

	sheet.getCell(currentRow, 6).value = data.summary.grand_total
	sheet.getCell(currentRow, 6).font = { bold: true, size: 12 }
	sheet.getCell(currentRow, 6).alignment = { horizontal: 'center' }
	sheet.getCell(currentRow, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } }
	sheet.getCell(currentRow, 6).border = dataStyle.border

	// Set column widths
	sheet.getColumn(1).width = 8  // S.No
	sheet.getColumn(2).width = 15 // Course Code
	sheet.getColumn(3).width = 50 // Course Title
	sheet.getColumn(4).width = 12 // Regular
	sheet.getColumn(5).width = 12 // Arrears
	sheet.getColumn(6).width = 12 // Total
}

/**
 * Download Excel file helper (for browser)
 */
export function downloadExcel(buffer: Buffer, filename: string) {
	const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
	const url = window.URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	window.URL.revokeObjectURL(url)
}
