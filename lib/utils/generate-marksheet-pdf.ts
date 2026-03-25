/**
 * Marksheet PDF Generator
 *
 * Generates LEGAL size, landscape orientation PDFs for student marksheets
 * with dynamic header layout based on course_order → column_group mapping.
 *
 * Paper: LEGAL (355.6mm × 215.9mm)
 * Orientation: Landscape (355.6mm width × 215.9mm height)
 */

import jsPDF from 'jspdf'
import autoTable, { RowInput, CellDef } from 'jspdf-autotable'
import {
	buildMarksheetHeaderStructure,
	getColumnGroup,
	COURSE_SUB_COLUMN_WIDTHS,
	TOTAL_COURSE_WIDTH,
	FIXED_COLUMN_WIDTHS,
	type CourseColumn,
	type ColumnGroup,
	type MarksheetHeaderStructure,
	type CourseMarkData,
	type StudentMarksheetRow
} from './marksheet-column-groups'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface MarksheetCourse {
	courseCode: string
	courseName: string
	displayCode?: string
	courseId: string
	semester: number
	courseOrder: number
	credit: number
	internalMax: number
	externalMax: number
	totalMax: number
}

export interface MarksheetStudent {
	regNo: string
	rollNo?: string
	firstName: string
	lastName: string
	courseMarks: Array<{
		courseCode: string
		semester: number
		internalMarks: number | null
		externalMarks: number | null
		totalMarks: number | null
		isPass: boolean
		result: 'P' | 'F' | 'A' | 'W' | 'RA' // Pass, Fail, Absent, Withheld, Re-Appear
		gradePoints: number | null
		letterGrade: string
	}>
	sgpa: number | null
	cgpa: number | null
	overallResult: 'PASS' | 'FAIL' | 'RA'
	totalBacklogs: number
}

export interface MarksheetData {
	institution: {
		name: string
		code: string
		address?: string
		affiliatedTo?: string
	}
	examination: {
		sessionName: string
		sessionCode: string
		monthYear: string
	}
	program: {
		name: string
		code: string
		degreeName?: string
		degreeCode?: string
	}
	semester: number
	batch: string
	section?: string
	courses: MarksheetCourse[]
	students: MarksheetStudent[]
	logoImage?: string
	rightLogoImage?: string
	watermarkImage?: string
}

export interface MarksheetPDFOptions {
	showSno?: boolean
	showRollNo?: boolean
	showWatermark?: boolean
	fontSize?: number
	headerFontSize?: number
	compactMode?: boolean
}

// ============================================================
// CONSTANTS
// ============================================================

// LEGAL paper in landscape (mm)
const LEGAL_WIDTH = 355.6
const LEGAL_HEIGHT = 215.9
const MARGIN = 6
const CONTENT_WIDTH = LEGAL_WIDTH - (2 * MARGIN)

// Colors
const COLORS = {
	headerBg: [41, 65, 148] as [number, number, number],      // Dark blue
	headerText: [255, 255, 255] as [number, number, number],  // White
	subHeaderBg: [230, 236, 250] as [number, number, number], // Light blue
	subHeaderText: [41, 65, 148] as [number, number, number], // Dark blue
	rowAlt: [248, 250, 252] as [number, number, number],      // Light gray
	pass: [34, 139, 34] as [number, number, number],          // Green
	fail: [220, 53, 69] as [number, number, number],          // Red
	border: [200, 200, 200] as [number, number, number]       // Gray
}

// ============================================================
// PDF GENERATOR CLASS
// ============================================================

export class MarksheetPDFGenerator {
	private doc: jsPDF
	private data: MarksheetData
	private options: MarksheetPDFOptions
	private headerStructure: MarksheetHeaderStructure
	private currentY: number = MARGIN

	constructor(data: MarksheetData, options: MarksheetPDFOptions = {}) {
		this.doc = new jsPDF({
			orientation: 'landscape',
			unit: 'mm',
			format: 'legal'
		})
		this.data = data
		this.options = {
			showSno: true,
			showRollNo: false,
			showWatermark: false,
			fontSize: 6,
			headerFontSize: 7,
			compactMode: true,
			...options
		}

		// Build header structure from courses
		this.headerStructure = buildMarksheetHeaderStructure(
			data.courses.map(c => ({
				courseCode: c.displayCode || c.courseCode,
				courseName: c.courseName,
				courseId: c.courseId,
				semester: c.semester,
				courseOrder: c.courseOrder,
				credit: c.credit,
				internalMax: c.internalMax,
				externalMax: c.externalMax,
				totalMax: c.totalMax
			}))
		)
	}

	/**
	 * Generate the complete PDF
	 */
	public generate(): string {
		this.addHeader()
		this.addMarksheetTable()
		this.addFooter()
		return this.doc.output('datauristring')
	}

	/**
	 * Download the PDF
	 */
	public download(filename: string = 'marksheet.pdf'): void {
		this.generate()
		this.doc.save(filename)
	}

	/**
	 * Add institution header
	 */
	private addHeader(): void {
		this.currentY = MARGIN

		// Left logo
		if (this.data.logoImage) {
			try {
				this.doc.addImage(this.data.logoImage, 'PNG', MARGIN, this.currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add left logo:', e)
			}
		}

		// Right logo
		if (this.data.rightLogoImage) {
			try {
				this.doc.addImage(this.data.rightLogoImage, 'PNG', LEGAL_WIDTH - MARGIN - 16, this.currentY, 16, 16)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		// Institution name
		this.doc.setFont('times', 'bold')
		this.doc.setFontSize(12)
		this.doc.setTextColor(0, 0, 0)
		this.doc.text(this.data.institution.name.toUpperCase(), LEGAL_WIDTH / 2, this.currentY + 5, { align: 'center' })

		// Affiliated to
		if (this.data.institution.affiliatedTo) {
			this.doc.setFont('times', 'normal')
			this.doc.setFontSize(8)
			this.doc.text(this.data.institution.affiliatedTo, LEGAL_WIDTH / 2, this.currentY + 10, { align: 'center' })
		}

		// Address
		if (this.data.institution.address) {
			this.doc.setFontSize(7)
			this.doc.text(this.data.institution.address, LEGAL_WIDTH / 2, this.currentY + 14, { align: 'center' })
		}

		this.currentY += 18

		// Examination title
		this.doc.setFont('times', 'bold')
		this.doc.setFontSize(10)
		this.doc.text('END SEMESTER EXAMINATIONS - ' + this.data.examination.monthYear.toUpperCase(), LEGAL_WIDTH / 2, this.currentY, { align: 'center' })

		this.currentY += 4

		// Session info
		this.doc.setFontSize(8)
		this.doc.text(`Session: ${this.data.examination.sessionName}`, LEGAL_WIDTH / 2, this.currentY, { align: 'center' })

		this.currentY += 5

		// Program and semester info
		this.doc.setFont('times', 'normal')
		this.doc.setFontSize(8)
		const degreeText = this.data.program.degreeName ? `${this.data.program.degreeName} - ` : ''
		const programInfo = `${degreeText}${this.data.program.name} | Semester: ${this.toRoman(this.data.semester)} | Batch: ${this.data.batch}`
		this.doc.text(programInfo, LEGAL_WIDTH / 2, this.currentY, { align: 'center' })

		this.currentY += 6

		// Title: MARKSHEET
		this.doc.setFont('times', 'bold')
		this.doc.setFontSize(11)
		this.doc.setTextColor(...COLORS.headerBg)
		this.doc.text('MARKSHEET', LEGAL_WIDTH / 2, this.currentY, { align: 'center' })
		this.doc.setTextColor(0, 0, 0)

		this.currentY += 4
	}

	/**
	 * Add the main marksheet table
	 */
	private addMarksheetTable(): void {
		// Build column definitions
		const columns = this.buildTableColumns()
		const headers = this.buildTableHeaders()
		const body = this.buildTableBody()

		autoTable(this.doc, {
			startY: this.currentY,
			head: headers,
			body: body,
			theme: 'grid',
			styles: {
				fontSize: this.options.fontSize || 6,
				cellPadding: 0.8,
				lineColor: COLORS.border,
				lineWidth: 0.1,
				overflow: 'linebreak',
				valign: 'middle',
				halign: 'center'
			},
			headStyles: {
				fillColor: COLORS.headerBg,
				textColor: COLORS.headerText,
				fontStyle: 'bold',
				fontSize: this.options.headerFontSize || 7
			},
			alternateRowStyles: {
				fillColor: COLORS.rowAlt
			},
			columnStyles: this.buildColumnStyles(columns),
			margin: { left: MARGIN, right: MARGIN },
			tableWidth: 'auto',
			didParseCell: (data) => {
				// Color-code results
				if (data.section === 'body') {
					const cellText = String(data.cell.text).trim()
					if (cellText === 'PASS' || cellText === 'P') {
						data.cell.styles.textColor = COLORS.pass
						data.cell.styles.fontStyle = 'bold'
					} else if (cellText === 'FAIL' || cellText === 'F' || cellText === 'RA') {
						data.cell.styles.textColor = COLORS.fail
						data.cell.styles.fontStyle = 'bold'
					}
				}
			}
		})

		// Update currentY after table
		this.currentY = (this.doc as any).lastAutoTable?.finalY || this.currentY + 100
	}

	/**
	 * Build table columns configuration
	 */
	private buildTableColumns(): string[] {
		const columns: string[] = []

		// Fixed columns
		if (this.options.showSno) columns.push('sno')
		columns.push('regNo')
		columns.push('name')

		// Course columns (grouped by column_group)
		this.headerStructure.columnGroups.forEach(cg => {
			cg.courses.forEach(course => {
				columns.push(`${course.courseCode}_code`)
				columns.push(`${course.courseCode}_sem`)
				columns.push(`${course.courseCode}_int`)
				columns.push(`${course.courseCode}_ext`)
				columns.push(`${course.courseCode}_tot`)
				columns.push(`${course.courseCode}_res`)
				columns.push(`${course.courseCode}_gp`)
				columns.push(`${course.courseCode}_lg`)
			})
		})

		// Summary columns
		columns.push('sgpa')
		columns.push('cgpa')
		columns.push('result')

		return columns
	}

	/**
	 * Build multi-row table headers
	 */
	private buildTableHeaders(): RowInput[] {
		const headers: RowInput[] = []

		// Row 1: Main group headers
		const row1: CellDef[] = []

		// Fixed columns spanning 2 rows
		if (this.options.showSno) {
			row1.push({ content: 'S.No', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })
		}
		row1.push({ content: 'REG NO', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })
		row1.push({ content: 'STUDENT NAME', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })

		// Column group headers
		this.headerStructure.columnGroups.forEach(cg => {
			if (cg.courses.length > 0) {
				const colspan = cg.courses.length * 8 // 8 sub-columns per course
				row1.push({
					content: `COLUMN GROUP ${cg.groupNumber}`,
					colSpan: colspan,
					styles: {
						halign: 'center',
						fillColor: this.getGroupColor(cg.groupNumber)
					}
				})
			}
		})

		// Summary columns spanning 2 rows
		row1.push({ content: 'SGPA', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })
		row1.push({ content: 'CGPA', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })
		row1.push({ content: 'RESULT', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } })

		headers.push(row1)

		// Row 2: Course codes
		const row2: CellDef[] = []
		this.headerStructure.columnGroups.forEach(cg => {
			cg.courses.forEach(course => {
				row2.push({
					content: course.courseCode,
					colSpan: 8,
					styles: {
						halign: 'center',
						fillColor: COLORS.subHeaderBg,
						textColor: COLORS.subHeaderText,
						fontStyle: 'bold'
					}
				})
			})
		})
		headers.push(row2)

		// Row 3: Sub-column headers
		const row3: CellDef[] = []
		this.headerStructure.columnGroups.forEach(cg => {
			cg.courses.forEach(() => {
				row3.push({ content: 'CODE', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'SEM', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'INT', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'EXT', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'TOT', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'RES', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'GP', styles: { halign: 'center', fontSize: 5 } })
				row3.push({ content: 'LG', styles: { halign: 'center', fontSize: 5 } })
			})
		})
		headers.push(row3)

		return headers
	}

	/**
	 * Build table body data
	 */
	private buildTableBody(): RowInput[] {
		const body: RowInput[] = []

		this.data.students.forEach((student, index) => {
			const row: (string | number)[] = []

			// Fixed columns
			if (this.options.showSno) row.push(index + 1)
			row.push(student.regNo)
			row.push(`${student.firstName} ${student.lastName}`.trim())

			// Create a map for quick course mark lookup
			const marksMap = new Map<string, typeof student.courseMarks[0]>()
			student.courseMarks.forEach(m => {
				marksMap.set(m.courseCode, m)
			})

			// Course marks (grouped by column_group)
			this.headerStructure.columnGroups.forEach(cg => {
				cg.courses.forEach(course => {
					const marks = marksMap.get(course.courseCode)
					if (marks) {
						row.push(course.courseCode)
						row.push(marks.semester || '-')
						row.push(marks.internalMarks ?? '-')
						row.push(marks.externalMarks ?? '-')
						row.push(marks.totalMarks ?? '-')
						row.push(marks.result || '-')
						row.push(marks.gradePoints ?? '-')
						row.push(marks.letterGrade || '-')
					} else {
						// No marks for this course
						row.push(course.courseCode)
						row.push('-')
						row.push('-')
						row.push('-')
						row.push('-')
						row.push('-')
						row.push('-')
						row.push('-')
					}
				})
			})

			// Summary columns
			row.push(student.sgpa?.toFixed(2) || '-')
			row.push(student.cgpa?.toFixed(2) || '-')
			row.push(student.overallResult)

			body.push(row)
		})

		return body
	}

	/**
	 * Build column styles for autoTable
	 */
	private buildColumnStyles(columns: string[]): Record<number, any> {
		const styles: Record<number, any> = {}
		let colIndex = 0

		// S.No column
		if (this.options.showSno) {
			styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.sno, halign: 'center' }
		}

		// Reg No
		styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.regNo, halign: 'center' }

		// Name
		styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.name, halign: 'left' }

		// Course columns
		this.headerStructure.columnGroups.forEach(cg => {
			cg.courses.forEach(() => {
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.courseCode, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.sem, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.int, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.ext, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.tot, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.res, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.gp, halign: 'center' }
				styles[colIndex++] = { cellWidth: COURSE_SUB_COLUMN_WIDTHS.lg, halign: 'center' }
			})
		})

		// Summary columns
		styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.sgpa, halign: 'center' }
		styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.cgpa, halign: 'center' }
		styles[colIndex++] = { cellWidth: FIXED_COLUMN_WIDTHS.result, halign: 'center' }

		return styles
	}

	/**
	 * Get color for column group header
	 */
	private getGroupColor(groupNumber: number): [number, number, number] {
		const colors: Record<number, [number, number, number]> = {
			1: [139, 92, 246],   // Purple (violet-500)
			2: [59, 130, 246],   // Blue (blue-500)
			3: [249, 115, 22],   // Orange (orange-500)
			4: [245, 158, 11]    // Amber (amber-500)
		}
		return colors[groupNumber] || COLORS.headerBg
	}

	/**
	 * Add footer with page numbers and signature lines
	 */
	private addFooter(): void {
		const pageCount = this.doc.getNumberOfPages()

		for (let i = 1; i <= pageCount; i++) {
			this.doc.setPage(i)

			const footerY = LEGAL_HEIGHT - MARGIN - 8

			// Page number
			this.doc.setFont('times', 'normal')
			this.doc.setFontSize(7)
			this.doc.setTextColor(100, 100, 100)
			this.doc.text(`Page ${i} of ${pageCount}`, LEGAL_WIDTH / 2, LEGAL_HEIGHT - MARGIN, { align: 'center' })

			// Signature lines (only on last page)
			if (i === pageCount) {
				this.doc.setTextColor(0, 0, 0)
				this.doc.setFontSize(8)

				// Prepared by
				this.doc.text('Prepared by:', MARGIN + 20, footerY)
				this.doc.line(MARGIN + 20, footerY + 6, MARGIN + 60, footerY + 6)

				// Verified by
				this.doc.text('Verified by:', LEGAL_WIDTH / 2 - 20, footerY)
				this.doc.line(LEGAL_WIDTH / 2 - 20, footerY + 6, LEGAL_WIDTH / 2 + 20, footerY + 6)

				// Controller of Examinations
				this.doc.text('Controller of Examinations:', LEGAL_WIDTH - MARGIN - 80, footerY)
				this.doc.line(LEGAL_WIDTH - MARGIN - 80, footerY + 6, LEGAL_WIDTH - MARGIN - 20, footerY + 6)
			}
		}
	}

	/**
	 * Convert number to Roman numerals
	 */
	private toRoman(num: number): string {
		const romanNumerals: [number, string][] = [
			[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
		]
		let result = ''
		for (const [value, symbol] of romanNumerals) {
			while (num >= value) {
				result += symbol
				num -= value
			}
		}
		return result
	}
}

// ============================================================
// CONVENIENCE FUNCTION
// ============================================================

/**
 * Generate marksheet PDF from data
 * @param data - Marksheet data
 * @param options - PDF options
 * @returns Data URI string for the PDF
 */
export function generateMarksheetPDF(
	data: MarksheetData,
	options: MarksheetPDFOptions = {}
): string {
	const generator = new MarksheetPDFGenerator(data, options)
	return generator.generate()
}

/**
 * Download marksheet PDF
 * @param data - Marksheet data
 * @param filename - Output filename
 * @param options - PDF options
 */
export function downloadMarksheetPDF(
	data: MarksheetData,
	filename: string = 'marksheet.pdf',
	options: MarksheetPDFOptions = {}
): void {
	const generator = new MarksheetPDFGenerator(data, options)
	generator.download(filename)
}
