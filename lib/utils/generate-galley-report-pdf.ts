import jsPDF from 'jspdf'
import autoTable, { RowInput, CellDef } from 'jspdf-autotable'

interface CourseMarks {
	course: {
		id: string
		course_code: string
		course_name: string
		display_code: string
		credit: number
		internal_max_mark: number
		external_max_mark: number
		total_max_mark: number
		course_order?: number
		semester?: number  // ADDED: Include semester for display
		evaluation_type?: string  // ADDED: CIA, ESE, or CIA + ESE
		result_type?: string  // Mark | Status | comment | credit
	}
	internal_marks: number | null
	internal_max: number
	external_marks: number | null
	external_max: number
	total_marks: number | null
	total_max: number
	letter_grade: string
	grade_points: number
	is_pass: boolean
	pass_status: string
	is_regular?: boolean  // ADDED: Track if course is current semester (TRUE) or arrear (FALSE)
}

interface StudentData {
	student: {
		id: string
		first_name: string
		last_name: string
		register_number: string
		roll_number: string
		is_regular?: boolean
	}
	courses: CourseMarks[]
	semester_result: {
		sgpa: number
		cgpa: number
		percentage: number
		result_status: string
		result_class: string
		total_backlogs: number
	} | null
	is_regular?: boolean
}

interface CourseAnalysis {
	course: {
		id: string
		course_code: string
		course_name: string
		credit: number
		internal_max_mark: number
		external_max_mark: number
		total_max_mark: number
		course_order?: number
		semester?: number  // ADDED: Include semester for display
		evaluation_type?: string  // ADDED: CIA, ESE, or CIA + ESE
	}
	registered: number
	appeared: number
	absent: number
	passed: number
	failed: number
	reappear: number
	pass_percentage: string
	grades: Record<string, number>
}

interface GalleyReportData {
	institution: {
		id: string
		institution_code: string
		institution_name: string
	}
	session: {
		id: string
		session_name: string
		session_code: string
		session_type: string
		exam_type_name?: string
	}
	program: {
		id: string
		program_code: string
		program_name: string
		display_name: string
		degrees?: { degree_code: string; degree_name: string }
	}
	semester: number
	batch: string
	students: StudentData[]
	courseAnalysis: CourseAnalysis[]
	statistics: {
		total_students: number
		total_passed: number
		total_failed: number
		total_with_backlogs: number
		pass_percentage: string
		grade_distribution: Record<string, number>
		top_performers: Array<{
			register_number: string
			name: string
			cgpa: number
			sgpa: number
		}>
		highest_scorer: {
			register_number: string
			name: string
			total_marks: number
			total_max: number
		} | null
	}
	logoImage?: string
	rightLogoImage?: string
}

// Number of courses to display per row (3 course groups across the page)
const COURSES_PER_ROW = 3
// Columns per course: COURSE CODE, SEM, INT, EXT, TOT, RES, GP (7 columns)
const COLS_PER_COURSE = 7

export function generateGalleyReportPDF(data: GalleyReportData): string {
	// Legal size Landscape
	const doc = new jsPDF('landscape', 'mm', 'legal')
	const pageWidth = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()
	const margin = 5
 

	// Get all courses sorted by: 1) semester (ASCENDING), 2) course_order (ASCENDING), 3) course_code
	const allCourses = [...data.courseAnalysis].sort((a, b) => {
		// Primary sort: by semester (ASCENDING: Sem 1, Sem 2, Sem 3, ...)
		const semA = a.course.semester ?? -1
		const semB = b.course.semester ?? -1
		if (semA !== semB) return semA - semB  // ASCENDING for course analysis table

		// Secondary sort: by course_order from course_mapping (ASCENDING)
		const orderA = a.course.course_order ?? 999
		const orderB = b.course.course_order ?? 999
		if (orderA !== orderB) return orderA - orderB

		// Tertiary sort: by course_code if course_order is the same
		return (a.course.course_code || '').localeCompare(b.course.course_code || '')
	})

	// Sort students:
	// 1. Regular students (is_regular=true, current paper) come FIRST
	// 2. Arrear students (is_regular=false, arrear paper) come LAST
	// 3. Within each group, sort by register_number
	const sortedStudents = [...data.students].sort((a, b) => {
		// Get is_regular from exam_attendance data (passed through StudentData)
		const aRegular = a.is_regular ?? a.student.is_regular ?? true
		const bRegular = b.is_regular ?? b.student.is_regular ?? true

		// Regular (current paper) students first, Arrear students last
		if (aRegular !== bRegular) {
			return aRegular ? -1 : 1  // true (regular) comes before false (arrear)
		}

		// Within same group, sort by register number
		return (a.student.register_number || '').localeCompare(b.student.register_number || '')
	})

	// Helper function to add header
	const addHeader = (sessionName: string = '') => {
		let currentY = margin

		// ========== COLLEGE HEADER ==========
		const logoSize = 18

		// College Logo (left side)
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', margin, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add logo:', e)
			}
		}

		// College Logo (right side)
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - margin - logoSize, currentY, logoSize, logoSize)
			} catch (e) {
				console.warn('Failed to add right logo:', e)
			}
		}

		// College name and details (centered)
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 5, { align: 'center' })

		doc.setFont('times', 'italic')
		doc.setFontSize(10)
		doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 10, { align: 'center' })

		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY + 15, { align: 'center' })

		currentY += 20

		// ========== EXAMINATION TITLE ==========
		// Build the title from the session's exam type (e.g. "Supplementary Examination")
		// instead of a hardcoded "END SEMESTER". Falls back to "END SEMESTER EXAMINATION".
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		const examBase = (data.session?.exam_type_name || 'END SEMESTER EXAMINATION').toUpperCase().trim()
		const examLabel = examBase.includes('RESULT') ? examBase : `${examBase} RESULTS`
		const title = sessionName ? `${examLabel} - ${sessionName.toUpperCase()}` : examLabel
		doc.text(title, pageWidth / 2, currentY, { align: 'center' })

		currentY += 6

		// ========== PROGRAM INFO LINE ==========
		doc.setFont('times', 'bold')
		doc.setFontSize(11)

		// SEMESTER/YEAR in center (1&2 = I-Year, 3&4 = II-Year, 5&6 = III-Year, 7&8 = IV-Year)
		const yearNum = Math.ceil(data.semester / 2)
		const yearRoman = toRoman(yearNum)
		const semesterYearText = `SEMESTER/YEAR: ${toRoman(data.semester)}/ ${yearRoman}-Year`

		const batchText = `BATCH: ${data.batch}`

		// Draw semester/year centered on first line
		doc.text(semesterYearText, pageWidth / 2, currentY, { align: 'center' })

		// Draw batch right-aligned on first line
		doc.text(batchText, pageWidth - margin, currentY, { align: 'right' })

		// Calculate available width for program text (up to semester text)
		const semesterWidth = doc.getTextWidth(semesterYearText)
		const programMaxWidth = (pageWidth / 2) - margin - (semesterWidth / 2) - 5

		// Build program text: "PROGRAM: UAD - B.Sc. COMPUTER SCIENCE..."
		const programPrefix = 'PROGRAM: '
		const programCode = data.program?.program_code || ''
		const programName = data.program?.program_name || ''
		const fullProgramText = `${programPrefix}${programCode} - ${programName}`

		// Calculate indent for wrapped lines (align with after "PROGRAM: ")
		const prefixWidth = doc.getTextWidth(programPrefix)

		// Split the full text to fit within max width
		const programLines = doc.splitTextToSize(fullProgramText, programMaxWidth)

		// Draw first line at margin
		const lineHeight = 4
		if (programLines.length > 0) {
			doc.text(programLines[0], margin, currentY)
		}

		// Draw subsequent lines indented to align after "PROGRAM: "
		for (let i = 1; i < programLines.length; i++) {
			currentY += lineHeight
			doc.text(programLines[i].trim(), margin + prefixWidth, currentY)
		}

		currentY += 3

		return currentY
	}

	// Convert number to Roman numeral
	const toRoman = (num: number): string => {
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

	// Add footer to current page (Page number in center)
	const addPageFooter = (pageNum: number) => {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 5, { align: 'center' })
	}

	// =========================================
	// PAGE 1: STUDENT RESULTS TABLE
	// =========================================
	let startY = addHeader(data.session?.session_name || '')

	// Build headers - matching the sample format
	// S.No | REG NO | NAME OF THE CANDIDATE | [COURSE CODE | INT | EXT | TOT | RES | GP] x 3
	const buildTableHeaders = (): RowInput[] => {
		const headers: RowInput[] = []
		const row1: CellDef[] = []

		row1.push({
			content: 'S.No',
			styles: { halign: 'center', valign: 'middle', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
		})
		row1.push({
			content: 'REG NO.',
			styles: { halign: 'center', valign: 'middle', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
		})
		row1.push({
			content: 'NAME OF THE CANDIDATE',
			styles: { halign: 'center', valign: 'middle', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
		})

		// Add course column headers (repeat for each course slot per row)
		// Columns: COURSE CODE | SEM | INT | EXT | TOT | RES | GP (7 columns)
		for (let i = 0; i < COURSES_PER_ROW; i++) {
			row1.push({
				content: 'COURSE CODE',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'SEM',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'INT',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'EXT',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'TOT',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'RES',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
			row1.push({
				content: 'GP',
				styles: { halign: 'center', fillColor: [230, 230, 230], fontStyle: 'bold', fontSize: 8 }
			})
		}

		headers.push(row1)
		return headers
	}

	// Build table body with multi-row per student format
	// Option B: Show only student's actual courses compacted (no blanks for missing courses)
	// Each student gets only the rows needed for their actual courses
	const buildTableBody = (): RowInput[] => {
		const body: RowInput[] = []

		sortedStudents.forEach((student, studentIndex) => {
			// Sort student's courses by: 1) semester (DESCENDING), 2) course_order (ASCENDING), 3) course_code
			const studentCourses = [...student.courses].sort((a, b) => {
				// Primary sort: by semester (DESCENDING: Sem 6, Sem 5, Sem 4, ...)
				const semA = a.course.semester ?? -1
				const semB = b.course.semester ?? -1
				if (semA !== semB) return semB - semA  // DESCENDING

				// Secondary sort: by course_order from course_mapping (ASCENDING)
				const orderA = a.course.course_order ?? 999
				const orderB = b.course.course_order ?? 999
				if (orderA !== orderB) return orderA - orderB

				// Tertiary sort: by course_code if course_order is the same
				return (a.course.course_code || '').localeCompare(b.course.course_code || '')
			})

			// Calculate rows needed for THIS student based on their actual course count
			// Student with 6 courses needs 2 rows, student with 7 courses needs 3 rows
			const rowsForThisStudent = Math.max(1, Math.ceil(studentCourses.length / COURSES_PER_ROW))

			// Create rows for this student based on their actual courses
			for (let rowIdx = 0; rowIdx < rowsForThisStudent; rowIdx++) {
				const row: (string | number | CellDef)[] = []

				// S.No, REG NO, NAME - only on first row, span multiple rows
				if (rowIdx === 0) {
					row.push({
						content: studentIndex + 1,
						rowSpan: rowsForThisStudent,
						styles: { halign: 'center', valign: 'middle', fontSize: 10 }
					})
					row.push({
						content: student.student.register_number || '',
						rowSpan: rowsForThisStudent,
						styles: { halign: 'center', valign: 'middle', fontSize: 10 }
					})
					row.push({
						content: `${student.student.first_name} ${student.student.last_name || ''}`.trim(),
						rowSpan: rowsForThisStudent,
						styles: { halign: 'left', valign: 'middle', fontSize: 10}
					})
				}

				// Add courses for this row (COURSES_PER_ROW courses per row)
				// Use student's actual courses compacted (no blanks)
				for (let colIdx = 0; colIdx < COURSES_PER_ROW; colIdx++) {
					const courseIndex = rowIdx * COURSES_PER_ROW + colIdx
					const courseMarks = studentCourses[courseIndex]

					if (courseMarks) {
						const courseCode = courseMarks.course.course_code || ''
						const sem = courseMarks.course.semester ? String(courseMarks.course.semester) : '-'
						const evalType = (courseMarks.course.evaluation_type || 'CIA + ESE').trim().toUpperCase()
						const resultType = courseMarks.course.result_type || 'Mark'
						const isSpecialType = resultType === 'comment' || resultType === 'credit' || resultType === 'Status'

						if (isSpecialType) {
							// For comment/credit/Status: merge INT+EXT+TOT+RES+GP into one bold cell
							let mergedText: string
							if (resultType === 'comment') {
								mergedText = courseMarks.letter_grade || '-'
							} else if (resultType === 'credit') {
								mergedText = courseMarks.pass_status || 'Credit'
							} else {
								mergedText = courseMarks.pass_status || courseMarks.letter_grade || '-'
							}
							row.push(courseCode)
							row.push(sem)
							row.push({
								content: mergedText,
								colSpan: 5,
								styles: { halign: 'center', fillColor: [255, 255, 255] as [number, number, number] }
							})
						} else {
							let int: string
							let ext: string

							if (evalType === 'CIA') {
								int = (courseMarks.internal_marks === 0 || courseMarks.internal_marks) ? String(courseMarks.internal_marks) : '-'
								ext = '-'
							} else if (evalType === 'ESE') {
								int = '-'
								ext = (courseMarks.external_marks === 0 || courseMarks.external_marks) ? String(courseMarks.external_marks) : '-'
							} else {
								int = (courseMarks.internal_marks === 0 || courseMarks.internal_marks) ? String(courseMarks.internal_marks) : '-'
								ext = (courseMarks.external_marks === 0 || courseMarks.external_marks) ? String(courseMarks.external_marks) : '-'
							}

							const tot = (courseMarks.total_marks === 0 || courseMarks.total_marks) ? String(courseMarks.total_marks) : '-'

							let isAbsent = false
							if (evalType === 'CIA') {
								isAbsent = courseMarks.pass_status === 'Absent' || courseMarks.pass_status === 'AAA' || courseMarks.letter_grade === 'AAA' || courseMarks.internal_marks === null
							} else if (evalType === 'ESE') {
								isAbsent = courseMarks.pass_status === 'Absent' || courseMarks.pass_status === 'AAA' || courseMarks.letter_grade === 'AAA' || courseMarks.external_marks === null
							} else {
								isAbsent = courseMarks.pass_status === 'Absent' || courseMarks.pass_status === 'AAA' || courseMarks.letter_grade === 'AAA' ||
									(courseMarks.external_marks === null && courseMarks.internal_marks !== null) ||
									(courseMarks.external_marks === 0 && courseMarks.internal_marks !== null && courseMarks.internal_marks > 0 && courseMarks.total_marks === 0)
							}

							let res: string
							if (isAbsent) {
								res = 'A'
							} else if (courseMarks.pass_status === 'Pass' || courseMarks.is_pass) {
								res = 'P'
							} else if (courseMarks.pass_status === 'Reappear' || courseMarks.pass_status === 'RA' ||
								courseMarks.pass_status === 'Fail' || courseMarks.letter_grade === 'U' ||
								courseMarks.letter_grade === 'RA' || !courseMarks.is_pass) {
								res = 'RA'
							} else {
								res = 'P'
							}

							const gp = courseMarks.letter_grade ?? '-'

							row.push(courseCode)
							row.push(sem)
							row.push(int)
							row.push(ext)
							row.push(tot)
							row.push(res)
							row.push(gp)
						}
					} else {
						// No more courses for this student - fill with empty cells (7 columns now)
						row.push('')
						row.push('')
						row.push('')
						row.push('')
						row.push('')
						row.push('')
						row.push('')
					}
				}

				body.push(row)
			}
		})

		return body
	}

	// Build column styles - fit to legal landscape page
	// Legal landscape: 355.6mm x 215.9mm, with 5mm margins = 345.6mm usable width
	// 3 fixed columns + 3 courses x 7 columns = 24 columns total
	const buildColumnStyles = (): Record<number, object> => {
		const styles: Record<number, object> = {}
		let colIndex = 0

		// Fixed columns
		styles[colIndex++] = { cellWidth: 12, halign: 'center' }   // S.No
		styles[colIndex++] = { cellWidth: 28, halign: 'center' }   // Reg No
		styles[colIndex++] = { cellWidth: 45, halign: 'left' }     // Name

		// Course columns (7 per course slot: COURSE CODE, SEM, INT, EXT, TOT, RES, GP)
		// Remaining width: 345.6 - 12 - 28 - 45 = 260.6mm / 3 courses = ~87mm per course
		// Per course: 87mm / 7 columns
		for (let i = 0; i < COURSES_PER_ROW; i++) {
			styles[colIndex++] = { cellWidth: 23, halign: 'center' }  // COURSE CODE
			styles[colIndex++] = { cellWidth: 10, halign: 'center' }  // SEM
			styles[colIndex++] = { cellWidth: 11, halign: 'center' }  // INT
			styles[colIndex++] = { cellWidth: 11, halign: 'center' }  // EXT
			styles[colIndex++] = { cellWidth: 11, halign: 'center' }  // TOT
			styles[colIndex++] = { cellWidth: 10, halign: 'center' }  // RES
			styles[colIndex++] = { cellWidth: 11, halign: 'center' }  // GP (increased from 10 to 11 for AAA)
		}

		return styles
	}

	// Generate main table
	autoTable(doc, {
		startY: startY,
		head: buildTableHeaders(),
		body: buildTableBody(),
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 10,
			cellPadding: 1.5,
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			textColor: [0, 0, 0],
			overflow: 'linebreak',
			valign: 'middle'
		},
		headStyles: {
			fontStyle: 'bold',
			fontSize: 10,
			fillColor: [230, 230, 230],
			textColor: [0, 0, 0]
		},
		bodyStyles: {
			fontSize: 10
		},
		columnStyles: buildColumnStyles(),
		margin: { left: margin, right: margin },
		tableWidth: 'auto'
	})

	startY = (doc as any).lastAutoTable.finalY + 3

	// =========================================
	// LEGEND
	// =========================================
	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	const legendText = 'INTERNAL; TOT - TOTAL; RES - RESULT; P - PASS; RA - REAPPEAR; NA - NOT APPLICABLE; AAA - ABSENT; # - NO MARKS; LG - LETTER GRADE; GP - GRADE POINTS'
	doc.text(legendText, margin, startY)

	startY += 5

	// =========================================
	// COURSE ANALYSIS TABLE
	// =========================================
	const courseAnalysisHeaders = [
		'S.No',
		'COURSE CODE',
		'NAME OF THE COURSE',
		'SEM',
		'INT MAX MARKS',
		'EXT MAX MARKS',
		'TOTAL MARKS',
		'NO. OF STUDENTS REGISTERED',
		'NO. OF STUDENTS APPEARED',
		'NO. OF STUDENTS ABSENT',
		'NO. OF STUDENTS PASSED',
		'NO. OF STUDENTS RE-APPEAR',
		'PASS %'
	]

	// Build course analysis data with color coding
	const courseAnalysisData: (string | number | CellDef)[][] = allCourses.map((ca, index) => {
		const passPercentNum = parseFloat(ca.pass_percentage) || 0
		const evalType = (ca.course.evaluation_type || 'CIA + ESE').trim().toUpperCase()

		// Color code pass percentage: green for high, red for low
		const passPercentCell: CellDef = {
			content: ca.pass_percentage,
			styles: {
				textColor: passPercentNum >= 80 ? [0, 128, 0] : passPercentNum >= 50 ? [0, 0, 0] : [200, 0, 0],
				fontStyle: 'bold'
			}
		}

		// Determine INT MAX and EXT MAX based on evaluation_type
		// CIA: Show INT MAX, EXT MAX = 'NA'
		// ESE: INT MAX = 'NA', Show EXT MAX
		// CIA + ESE: Show both
		let intMaxDisplay: string | number
		let extMaxDisplay: string | number

		if (evalType === 'CIA') {
			intMaxDisplay = ca.course.internal_max_mark || '-'
			extMaxDisplay = '-'
		} else if (evalType === 'ESE') {
			intMaxDisplay = '-'
			extMaxDisplay = ca.course.external_max_mark || '-'
		} else {
			intMaxDisplay = ca.course.internal_max_mark || '-'
			extMaxDisplay = ca.course.external_max_mark || '-'
		}

		return [
			index + 1,  // S.No
			ca.course.course_code,
			ca.course.course_name,
			ca.course.semester ? String(ca.course.semester) : '-',  // SEMESTER in numeric (1, 2, 3, ...)
			intMaxDisplay,
			extMaxDisplay,
			ca.course.total_max_mark,
			ca.registered,
			ca.appeared,
			{ content: ca.absent, styles: { textColor: ca.absent > 0 ? [180, 90, 0] : [0, 0, 0], fontStyle: ca.absent > 0 ? 'bold' : 'normal' } },
			{ content: ca.passed, styles: { textColor: [0, 100, 0], fontStyle: 'bold' } },
			{ content: ca.reappear, styles: { textColor: ca.reappear > 0 ? [180, 0, 0] : [0, 0, 0], fontStyle: ca.reappear > 0 ? 'bold' : 'normal' } },
			passPercentCell
		]
	})

	// Check if we need a new page for course analysis table
	const remainingSpace = pageHeight - startY - 40
	if (remainingSpace < 50) {
		doc.addPage()
		startY = margin + 10
	}

	// ========== COURSE ANALYSIS TABLE TITLE ==========
	// e.g. "PROGRAM: UHI - B.A. HISTORY - Result Analysis - APRIL-MAY-2026 Examinations"
	const analysisProgramCode = data.program?.program_code || ''
	const analysisProgramName = data.program?.program_name || ''
	const analysisSessionName = data.session?.session_name || ''
	const analysisExamSuffix = data.session?.exam_type_name
		? data.session.exam_type_name.toUpperCase()
		: 'EXAMINATIONS'
	const analysisTitle = `PROGRAM: ${analysisProgramCode} - ${analysisProgramName.toUpperCase()} - RESULT ANALYSIS${analysisSessionName ? ` - ${analysisSessionName.toUpperCase()} ${analysisExamSuffix}` : ''}`
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)
	doc.text(analysisTitle, pageWidth / 2, startY, { align: 'center' })
	startY += 6

	autoTable(doc, {
		startY: startY,
		head: [courseAnalysisHeaders],
		body: courseAnalysisData,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 10,
			cellPadding: 2,
			lineColor: [0, 0, 0],
			lineWidth: 0.2,
			textColor: [0, 0, 0]
		},
		headStyles: {
			fillColor: [230, 230, 230],
			textColor: [0, 0, 0],
			fontStyle: 'bold',
			fontSize: 10,
			halign: 'center'
		},
		bodyStyles: {
			halign: 'center',
			fontSize: 10
		},
		columnStyles: {
			0: { cellWidth: 12, halign: 'center' },  // S.No
			1: { cellWidth: 28, halign: 'center' },  // Course code
			2: { cellWidth: 65, halign: 'left' },    // Course name
			3: { cellWidth: 15, halign: 'center' },  // Semester
			4: { cellWidth: 20 },  // INT MAX
			5: { cellWidth: 20 },  // EXT MAX
			6: { cellWidth: 20 },  // TOTAL
			7: { cellWidth: 26 },  // REGISTERED
			8: { cellWidth: 26 },  // APPEARED
			9: { cellWidth: 26 },  // ABSENT
			10: { cellWidth: 26 },  // PASSED
			11: { cellWidth: 26 },  // RE-APPEAR
			12: { cellWidth: 18 }  // PASS %
		},
		margin: { left: margin, right: margin }
	})

	startY = (doc as any).lastAutoTable.finalY + 35

	// =========================================
	// SIGNATURE SECTION (right after table with signature space)
	// =========================================
	// Check if we need a new page for signature (need ~25mm space)
	if (pageHeight - startY < 25) {
		doc.addPage()
		startY = 30
	}

	// Right signature - CONTROLLER OF EXAMINATIONS (positioned after table)
	const rightSignX = pageWidth - margin - 50

	doc.setFont('times', 'bold')
	doc.setFontSize(10)
	doc.text('CONTROLLER OF EXAMINATIONS', rightSignX, startY, { align: 'center' })

	// =========================================
	// ADD PAGE FOOTERS TO ALL PAGES
	// =========================================
	// Add page numbers to all pages at the end to ensure sequential numbering
	// and avoid duplicates from multiple tables on the same page
	const totalPages = (doc as any).internal.getNumberOfPages()
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i)
		addPageFooter(i)
	}

	// Save PDF
	const programCode = data.program?.program_code || 'PROGRAM'
	const semester = data.semester || ''
	const sessionCode = data.session?.session_code?.replace(/\s+/g, '_') || ''
	const fileName = `Galley_Report_${programCode}_Sem${semester}_${sessionCode}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)

	return fileName
}
