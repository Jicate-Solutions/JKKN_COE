import XLSX from '@/lib/utils/excel-compat'
import type { MergeRange } from '@/lib/utils/excel-compat'
import type { ReportType } from '@/types/exam-registration-reports'

interface ExcelExportOptions {
	report_type: ReportType
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	data: any[]
	course_category_filter?: string[]
}

interface ExcelReportResult {
	rows: Record<string, any>[]
	merges: MergeRange[]
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function toRoman(n: number): string { return ROMAN[n] || String(n) }

/** Sheet / block label for a learner's own semester */
function semesterLabel(semester: number): string {
	return semester > 0 ? toRoman(semester) : 'Not Mapped'
}

/** Column header for a learner-semester count column */
function semesterColumnLabel(semester: number): string {
	return semester > 0 ? `Sem ${toRoman(semester)}` : 'Not Mapped'
}

/** Semester sort key — an unresolved semester sorts after every real one */
function semesterSortKey(semester: number): number {
	return semester > 0 ? semester : 99
}

/**
 * Build a map of student register number → the learner's CURRENT semester.
 *
 * Every sheet is bucketed by this, never by the semester of the paper: a learner
 * sits in ONE semester and carries arrear papers from the semesters behind it, so
 * keying off the paper would list a Semester 3 learner again under Semester 1 and
 * Semester 2 purely because they still owe a paper there.
 *
 * The API stamps learner_semester on every row, resolved over the whole session
 * before any filter is applied. The fallbacks re-derive it from the rows in hand:
 * regular papers define the semester, and a learner who applied for arrears only is
 * placed by the highest semester they applied in.
 */
function buildStudentSemesterMap(data: any[]): Map<string, number> {
	const stamped = new Map<string, number>()
	const maxRegSem = new Map<string, number>()
	const maxAnySem = new Map<string, number>()
	for (const row of data) {
		const regNo = row.stu_register_no
		if (!regNo) continue
		const stampedSem = Number(row.learner_semester) || 0
		if (stampedSem > 0) stamped.set(regNo, stampedSem)
		const sem = row.course_offering?.semester || 0
		if (sem <= 0) continue
		if (row.is_regular) maxRegSem.set(regNo, Math.max(maxRegSem.get(regNo) || 0, sem))
		maxAnySem.set(regNo, Math.max(maxAnySem.get(regNo) || 0, sem))
	}
	const result = new Map<string, number>()
	for (const regNo of new Set([...stamped.keys(), ...maxRegSem.keys(), ...maxAnySem.keys()])) {
		result.set(regNo, stamped.get(regNo) || maxRegSem.get(regNo) || maxAnySem.get(regNo) || 0)
	}
	return result
}

/**
 * Exam application fee accumulator (Student Exam Application report)
 * -----------------------------------------------------
 * Application / mark statement / late fine are charged once per learner per
 * session and stamped on a single anchor row, so they are summed over EVERY row
 * of the learner. The per-paper fee is added once per printed subject instead,
 * so it tracks the deduplicated course list.
 *
 * The sheet has no Late Fine column but the fine is real money owed, so it is
 * folded into Total Amount - a fined learner's total exceeds the columns above.
 */
interface StudentFees {
	paper: number
	application: number
	markStatement: number
	lateFine: number
	/** true once any amount at all has been seen - keeps unpriced rows blank rather than 0 */
	priced: boolean
}

function newStudentFees(): StudentFees {
	return { paper: 0, application: 0, markStatement: 0, lateFine: 0, priced: false }
}

function feeNum(value: any): number {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

/** Add a row's once-per-session charges. Call for every row of the learner. */
function addSessionCharges(fees: StudentFees, row: any) {
	const application = feeNum(row?.application_fee)
	const markStatement = feeNum(row?.mark_statement_fee)
	const lateFine = feeNum(row?.late_fine)
	fees.application += application
	fees.markStatement += markStatement
	fees.lateFine += lateFine
	if (application || markStatement || lateFine) fees.priced = true
}

/** Add a row's per-paper fee. Call once per printed subject. */
function addPaperFee(fees: StudentFees, row: any) {
	const raw = row?.paper_fee ?? row?.fee_amount
	if (raw == null) return
	const amount = feeNum(raw)
	fees.paper += amount
	if (amount) fees.priced = true
}

/** The four fee cells as numbers (blank when nothing is priced) so Excel can total them */
function feeCells(fees: StudentFees): { theory: number | '', application: number | '', markStatement: number | '', total: number | '' } {
	if (!fees.priced) return { theory: '', application: '', markStatement: '', total: '' }
	const total = fees.paper + fees.application + fees.markStatement + fees.lateFine
	return {
		theory: fees.paper || '',
		application: fees.application || '',
		markStatement: fees.markStatement || '',
		total: total || '',
	}
}

// ── Report 1: Student Fee Details ──

function exportStudentFeeDetailsExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentMap = new Map<string, { name: string, dob: string, courses: any[], fees: StudentFees }>()
	for (const row of opts.data) {
		const regNo = row.stu_register_no || 'Unknown'
		if (!studentMap.has(regNo)) {
			studentMap.set(regNo, { name: row.student_name || '', dob: row.date_of_birth || '', courses: [], fees: newStudentFees() })
		}
		const student = studentMap.get(regNo)!
		// Once-per-session heads live on one anchor row, so they are summed over
		// every row of the learner - never over the deduplicated course list.
		addSessionCharges(student.fees, row)
		const co = row.course_offering
		if (co) {
			// Deduplicate by course_code (same course can exist under multiple offerings)
			if (!student.courses.some((c: any) => c.course_code === co.course_code)) {
				student.courses.push({
					semester: co.semester || 0,
					course_order: co.course_order ?? 999,
					course_code: co.course_code || '',
					course_name: co.course_name || '',
				})
				// The per-paper fee tracks the printed subject list
				addPaperFee(student.fees, row)
			}
		}
	}

	const students = Array.from(studentMap.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))

	const rows: Record<string, any>[] = []
	const merges: MergeRange[] = []
	let sno = 0
	let rowIdx = 0 // 0-based data row index (header is row 0 in sheet, data starts at row 1)

	students.forEach(([regNo, info]) => {
		sno++
		info.courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

		const fees = feeCells(info.fees)
		const courseCount = Math.max(info.courses.length, 1)
		const startRow = rowIdx + 1 // +1 because row 0 is header in sheet

		// Merge S.No, Register No, Name, DOB, Total Subjects, and fee columns for this student
		if (courseCount > 1) {
			// Columns: 0=S.No, 1=Register No, 2=Name, 3=DOB, 7=Total Subjects, 8=Theory, 9=App Fee, 10=MS Fee, 11=Total, 12=Sign
			const mergeCols = [0, 1, 2, 3, 7, 8, 9, 10, 11, 12]
			mergeCols.forEach(col => {
				merges.push({ s: { r: startRow, c: col }, e: { r: startRow + courseCount - 1, c: col } })
			})
		}

		info.courses.forEach((course: any, ci: number) => {
			rows.push({
				'S.No': ci === 0 ? sno : '',
				'Register No': ci === 0 ? regNo : '',
				'Name of the Candidate': ci === 0 ? info.name : '',
				'Date of Birth': ci === 0 ? info.dob : '',
				'Sem': toRoman(course.semester),
				'Subject Code': course.course_code,
				'Course Name': course.course_name,
				'Total Subjects': ci === 0 ? info.courses.length : '',
				'Theory': ci === 0 ? fees.theory : '',
				'Application Fee': ci === 0 ? fees.application : '',
				'Mark Statement Fee': ci === 0 ? fees.markStatement : '',
				'Total Amount': ci === 0 ? fees.total : '',
				'Signature of the Student': '',
			})
			rowIdx++
		})

		if (info.courses.length === 0) {
			rows.push({
				'S.No': sno,
				'Register No': regNo,
				'Name of the Candidate': info.name,
				'Date of Birth': info.dob,
				'Sem': '',
				'Subject Code': '',
				'Course Name': '',
				'Total Subjects': 0,
				'Theory': fees.theory,
				'Application Fee': fees.application,
				'Mark Statement Fee': fees.markStatement,
				'Total Amount': fees.total,
				'Signature of the Student': '',
			})
			rowIdx++
		}
	})

	return { rows, merges }
}

// ── Report 1b: Student Exam Registration (regular papers only, no fee columns) ──

function exportStudentExamRegistrationExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentMap = new Map<string, { name: string, dob: string, courses: any[] }>()
	for (const row of opts.data) {
		const regNo = row.stu_register_no || 'Unknown'
		if (!studentMap.has(regNo)) {
			studentMap.set(regNo, { name: row.student_name || '', dob: row.date_of_birth || '', courses: [] })
		}
		const co = row.course_offering
		if (co) {
			const student = studentMap.get(regNo)!
			// Deduplicate by course_code (same course can exist under multiple offerings)
			if (!student.courses.some((c: any) => c.course_code === co.course_code)) {
				student.courses.push({
					semester: co.semester || 0,
					course_order: co.course_order ?? 999,
					course_code: co.course_code || '',
					course_name: co.course_name || '',
				})
			}
		}
	}

	const students = Array.from(studentMap.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))

	const rows: Record<string, any>[] = []
	const merges: MergeRange[] = []
	let sno = 0
	let rowIdx = 0 // 0-based data row index (header is row 0 in sheet, data starts at row 1)

	students.forEach(([regNo, info]) => {
		sno++
		info.courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

		const courseCount = Math.max(info.courses.length, 1)
		const startRow = rowIdx + 1 // +1 because row 0 is header in sheet

		// Merge S.No, Register No, Name, DOB, Total Subjects, and Sign columns for this student
		if (courseCount > 1) {
			// Columns: 0=S.No, 1=Register No, 2=Name, 3=DOB, 7=Total Subjects, 8=Sign
			const mergeCols = [0, 1, 2, 3, 7, 8]
			mergeCols.forEach(col => {
				merges.push({ s: { r: startRow, c: col }, e: { r: startRow + courseCount - 1, c: col } })
			})
		}

		info.courses.forEach((course: any, ci: number) => {
			rows.push({
				'S.No': ci === 0 ? sno : '',
				'Register No': ci === 0 ? regNo : '',
				'Name of the Candidate': ci === 0 ? info.name : '',
				'Date of Birth': ci === 0 ? info.dob : '',
				'Sem': toRoman(course.semester),
				'Subject Code': course.course_code,
				'Course Name': course.course_name,
				'Total Subjects': ci === 0 ? info.courses.length : '',
				'Signature of the Student': '',
			})
			rowIdx++
		})

		if (info.courses.length === 0) {
			rows.push({
				'S.No': sno,
				'Register No': regNo,
				'Name of the Candidate': info.name,
				'Date of Birth': info.dob,
				'Sem': '',
				'Subject Code': '',
				'Course Name': '',
				'Total Subjects': 0,
				'Signature of the Student': '',
			})
			rowIdx++
		}
	})

	return { rows, merges }
}

// ── Report 2A: Course Count Regular/Arrear ──

function exportCourseCountRegularArrearExcel(opts: ExcelExportOptions): ExcelReportResult {
	const countMap = new Map<string, any>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const key = `${co.board_code || ''}|${co.course_code}`
		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', regular: 0, arrear: 0 })
		}
		const entry = countMap.get(key)!
		if (row.is_regular) entry.regular++
		else entry.arrear++
	}

	const sorted = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.program_order - b.program_order) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Build board groups for merge
	const merges: MergeRange[] = []
	let prevBoard = ''
	let boardStartIdx = 0

	for (let i = 0; i <= sorted.length; i++) {
		const currentBoard = i < sorted.length ? sorted[i].board_code : ''
		if (i > 0 && (currentBoard !== prevBoard || i === sorted.length)) {
			const count = i - boardStartIdx
			if (count > 1) {
				// Board column is col 1, data rows start at sheet row 1 (0-indexed, header is row 0)
				merges.push({ s: { r: boardStartIdx + 1, c: 1 }, e: { r: i, c: 1 } })
			}
			boardStartIdx = i
		}
		if (i === 0) boardStartIdx = 0
		prevBoard = currentBoard
	}

	const rows = sorted.map((row, idx) => ({
		'S.No': idx + 1,
		'Board': row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '',
		'Sem': row.semester ? toRoman(row.semester) : '',
		'Course Code': row.course_code,
		'Course Name': row.course_name,
		'Regular Students': row.regular,
		'Arrear Students': row.arrear,
		'Total': row.regular + row.arrear,
	}))

	return { rows, merges }
}

// ── Report 2B: Course Count Semester-wise ──

function exportCourseCountSemesterWiseExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentSemesterMap = buildStudentSemesterMap(opts.data)
	const countMap = new Map<string, any>()
	const allSemesters = new Set<number>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const key = `${co.board_code || ''}|${co.course_code}`
		const sem = studentSemesterMap.get(row.stu_register_no) || 0
		allSemesters.add(sem)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', semesters: {} })
		}
		const entry = countMap.get(key)!
		entry.semesters[sem] = (entry.semesters[sem] || 0) + 1
	}

	const sortedSemesters = Array.from(allSemesters).sort((a, b) => semesterSortKey(a) - semesterSortKey(b))

	const sorted = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Board merges
	const merges: MergeRange[] = []
	let prevBoard = ''
	let boardStartIdx = 0

	for (let i = 0; i <= sorted.length; i++) {
		const currentBoard = i < sorted.length ? sorted[i].board_code : ''
		if (i > 0 && (currentBoard !== prevBoard || i === sorted.length)) {
			const count = i - boardStartIdx
			if (count > 1) {
				merges.push({ s: { r: boardStartIdx + 1, c: 1 }, e: { r: i, c: 1 } })
			}
			boardStartIdx = i
		}
		if (i === 0) boardStartIdx = 0
		prevBoard = currentBoard
	}

	const rows = sorted.map((row, idx) => {
		const semCols: Record<string, number> = {}
		let total = 0
		sortedSemesters.forEach(sem => {
			const count = row.semesters[sem] || 0
			semCols[semesterColumnLabel(sem)] = count
			total += count
		})
		return {
			'S.No': idx + 1,
			'Board': row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '',
			'Sem': row.semester ? toRoman(row.semester) : '',
			'Course Code': row.course_code,
			'Course Name': row.course_name,
			...semCols,
			'Total': total,
		}
	})

	return { rows, merges }
}

// ── Report 2C: Course Count with Program Code Semester-wise ──

function exportCourseCountProgramSemesterWiseExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentSemesterMap = buildStudentSemesterMap(opts.data)
	const countMap = new Map<string, any>()
	const allSemesters = new Set<number>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const key = `${co.board_code || ''}|${programCode}|${co.course_code}`
		const sem = studentSemesterMap.get(row.stu_register_no) || 0
		allSemesters.add(sem)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: programCode, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', semesters: {} })
		}
		const entry = countMap.get(key)!
		entry.semesters[sem] = (entry.semesters[sem] || 0) + 1
	}

	const sortedSemesters = Array.from(allSemesters).sort((a, b) => semesterSortKey(a) - semesterSortKey(b))

	const sorted = Array.from(countMap.values())
		.sort((a, b) => (a.board_order - b.board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

	// Board merges (col 1) and Program merges (col 2)
	const merges: MergeRange[] = []

	// Board merges
	let prevBoard = ''
	let boardStartIdx = 0
	for (let i = 0; i <= sorted.length; i++) {
		const currentBoard = i < sorted.length ? sorted[i].board_code : ''
		if (i > 0 && (currentBoard !== prevBoard || i === sorted.length)) {
			const count = i - boardStartIdx
			if (count > 1) {
				merges.push({ s: { r: boardStartIdx + 1, c: 1 }, e: { r: i, c: 1 } })
			}
			boardStartIdx = i
		}
		if (i === 0) boardStartIdx = 0
		prevBoard = currentBoard
	}

	// Program merges
	let prevPgKey = ''
	let pgStartIdx = 0
	for (let i = 0; i <= sorted.length; i++) {
		const currentPgKey = i < sorted.length ? `${sorted[i].board_code}|${sorted[i].program_code}` : ''
		if (i > 0 && (currentPgKey !== prevPgKey || i === sorted.length)) {
			const count = i - pgStartIdx
			if (count > 1) {
				merges.push({ s: { r: pgStartIdx + 1, c: 2 }, e: { r: i, c: 2 } })
			}
			pgStartIdx = i
		}
		if (i === 0) pgStartIdx = 0
		prevPgKey = currentPgKey
	}

	const rows = sorted.map((row, idx) => {
		const semCols: Record<string, number> = {}
		let total = 0
		sortedSemesters.forEach(sem => {
			const count = row.semesters[sem] || 0
			semCols[semesterColumnLabel(sem)] = count
			total += count
		})
		return {
			'S.No': idx + 1,
			'Board': row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '',
			'Program Code': row.program_code,
			'Sem': row.semester ? toRoman(row.semester) : '',
			'Course Code': row.course_code,
			'Course Name': row.course_name,
			...semCols,
			'Total': total,
		}
	})

	return { rows, merges }
}

// ── Report 3: Course Count by Program Section ──

function exportCourseCountProgramSectionExcel(opts: ExcelExportOptions): { sections: { sheetName: string; result: ExcelReportResult }[] } {
	const studentSemesterMap = buildStudentSemesterMap(opts.data)
	const allSemesters = new Set<number>()

	// Group by program_code → courses with semester-wise counts
	const programMap = new Map<string, {
		program_code: string
		program_name: string | null
		program_order: number
		courses: Map<string, { semester: number; course_order: number; course_code: string; course_name: string; semesters: Record<number, number> }>
	}>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const sem = studentSemesterMap.get(row.stu_register_no) || 0
		allSemesters.add(sem)

		if (!programMap.has(programCode)) {
			programMap.set(programCode, {
				program_code: programCode,
				program_name: co.program_name || null,
				program_order: co.program_order ?? 999,
				courses: new Map(),
			})
		}
		const program = programMap.get(programCode)!
		const courseKey = co.course_code
		if (!program.courses.has(courseKey)) {
			program.courses.set(courseKey, {
				semester: co.semester || 0,
				course_order: co.course_order ?? 999,
				course_code: co.course_code,
				course_name: co.course_name || '',
				semesters: {},
			})
		}
		program.courses.get(courseKey)!.semesters[sem] = (program.courses.get(courseKey)!.semesters[sem] || 0) + 1
	}

	const sortedSemesters = Array.from(allSemesters).sort((a, b) => semesterSortKey(a) - semesterSortKey(b))

	const sections = Array.from(programMap.values())
		.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))

	return {
		sections: sections.map(section => {
			const courses = Array.from(section.courses.values())
				.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

			const rows = courses.map((course, idx) => {
				const semCols: Record<string, number> = {}
				let total = 0
				sortedSemesters.forEach(sem => {
					const count = course.semesters[sem] || 0
					semCols[semesterColumnLabel(sem)] = count
					total += count
				})
				return {
					'S.No': idx + 1,
					'Sem': toRoman(course.semester),
					'Course Code': course.course_code,
					'Course Name': course.course_name,
					...semCols,
					'Total': total,
				}
			})

			const sheetName = section.program_code.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Unknown'
			return { sheetName, result: { rows, merges: [] } }
		}),
	}
}

// ── Helper: apply sheet formatting ──

function applySheetFormatting(ws: ReturnType<typeof XLSX.utils.json_to_sheet>, result: ExcelReportResult) {
	const cols = Object.keys(result.rows[0] || {})
	ws['!cols'] = cols.map(col => {
		if (col === 'Course Name') return { wch: 60 }
		if (col === 'Name of the Candidate') return { wch: 30 }
		if (col === 'Board') return { wch: 22 }
		if (col.includes('Fee') || col.includes('Amount')) return { wch: 18 }
		if (col === 'Register No') return { wch: 20 }
		if (col === 'Total') return { wch: 10 }
		return { wch: 15 }
	})
	if (result.merges.length > 0) {
		ws['!merges'] = result.merges
	}

	// Enable wrap text on Course Name and Name of the Candidate columns
	const wrapCols: number[] = []
	cols.forEach((col, idx) => {
		if (col === 'Course Name' || col === 'Name of the Candidate' || col === 'Board') {
			wrapCols.push(idx)
		}
	})
	if (wrapCols.length > 0) {
		ws['!wrapCols'] = wrapCols
	}
}

// ── Prepend info row to worksheet ──

function prependInfoRow(ws: ReturnType<typeof XLSX.utils.json_to_sheet>, label: string): void {
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

	// Collect all existing data cells with new shifted positions
	const shifted: [string, any][] = []
	for (const key of Object.keys(ws)) {
		if (key[0] === '!') continue
		const ref = XLSX.utils.decode_cell(key)
		shifted.push([XLSX.utils.encode_cell({ r: ref.r + 1, c: ref.c }), ws[key]])
	}

	// Remove old data cells
	for (const key of Object.keys(ws)) {
		if (key[0] !== '!') delete ws[key]
	}

	// Add shifted cells
	for (const [k, v] of shifted) ws[k] = v

	// Add info cell at A1
	ws['A1'] = { v: label, t: 's' }

	// Shift existing merges down by 1
	if (ws['!merges']) {
		ws['!merges'] = ws['!merges'].map((m: any) => ({
			s: { r: m.s.r + 1, c: m.s.c },
			e: { r: m.e.r + 1, c: m.e.c },
		}))
	} else {
		ws['!merges'] = []
	}

	// Merge info row across all columns
	ws['!merges'].unshift({ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } })

	// Update sheet ref
	range.e.r += 1
	ws['!ref'] = XLSX.utils.encode_range(range)
}

// ── Compute per-section program info (subjects-per-student + student count) ──

function computeProgramInfo(data: any[]): { subjectCount: number; studentCount: number; programName: string | null } {
	const studentCourses = new Map<string, Set<string>>()
	let programName: string | null = null
	for (const row of data) {
		const regNo = row.stu_register_no || 'Unknown'
		if (!studentCourses.has(regNo)) studentCourses.set(regNo, new Set())
		const co = row.course_offering
		if (co?.course_code) studentCourses.get(regNo)!.add(co.course_code)
		if (!programName && co?.program_name) programName = co.program_name
	}
	let subjectCount = 0
	for (const s of studentCourses.values()) subjectCount = Math.max(subjectCount, s.size)
	return { subjectCount, studentCount: studentCourses.size, programName }
}

// ── Prepend Program / Semester info rows (label left, count right-aligned) ──

function prependProgramInfoRows(
	ws: ReturnType<typeof XLSX.utils.json_to_sheet>,
	programLabel: string,
	subjectsLabel: string,
	semesterInfoLabel: string,
	studentsLabel: string
): void {
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const lastCol = range.e.c
	const shiftBy = 2

	const shifted: [string, any][] = []
	for (const key of Object.keys(ws)) {
		if (key[0] === '!') continue
		const ref = XLSX.utils.decode_cell(key)
		shifted.push([XLSX.utils.encode_cell({ r: ref.r + shiftBy, c: ref.c }), ws[key]])
	}
	for (const key of Object.keys(ws)) {
		if (key[0] !== '!') delete ws[key]
	}
	for (const [k, v] of shifted) ws[k] = v

	// Row 0: Program (left) + No. of Subjects (right-aligned, last column)
	ws[XLSX.utils.encode_cell({ r: 0, c: 0 })] = { v: programLabel, t: 's', bold: true }
	ws[XLSX.utils.encode_cell({ r: 0, c: lastCol })] = { v: subjectsLabel, t: 's', align: 'right', bold: true }
	// Row 1: Semester (left) + No. of Students (right-aligned, last column)
	ws[XLSX.utils.encode_cell({ r: 1, c: 0 })] = { v: semesterInfoLabel, t: 's', bold: true }
	ws[XLSX.utils.encode_cell({ r: 1, c: lastCol })] = { v: studentsLabel, t: 's', align: 'right', bold: true }

	// Shift existing merges down by 2
	if (ws['!merges']) {
		ws['!merges'] = ws['!merges'].map((m: any) => ({
			s: { r: m.s.r + shiftBy, c: m.s.c },
			e: { r: m.e.r + shiftBy, c: m.e.c },
		}))
	}

	range.e.r += shiftBy
	ws['!ref'] = XLSX.utils.encode_range(range)
}

// ── Main Export ──

export async function exportExamRegistrationReportExcel(opts: ExcelExportOptions) {
	const wb = XLSX.utils.book_new()

	const isRegistrationType = opts.report_type === 'student-exam-registration' || opts.report_type === 'student-exam-registration-summary' || opts.report_type === 'student-wise-registration'
	if (opts.report_type === 'student-fee-details' || opts.report_type === 'student-exam-registration' || opts.report_type === 'student-exam-registration-summary' || opts.report_type === 'student-wise-application' || opts.report_type === 'student-wise-registration') {
		// Student-wise reports — format to be customised; reuse program-wise layout for now
		const buildSheet = isRegistrationType
			? exportStudentExamRegistrationExcel
			: exportStudentFeeDetailsExcel
		// Group data by program_code, then by the LEARNER's semester within each program
		const programGroups = new Map<string, any[]>()
		const programMeta = new Map<string, { program_order: number }>()
		for (const row of opts.data) {
			const programCode = row.course_offering?.program_code || row.program_code || 'Unknown'
			if (!programGroups.has(programCode)) {
				programGroups.set(programCode, [])
				programMeta.set(programCode, {
					program_order: row.course_offering?.program_order ?? 999,
				})
			}
			programGroups.get(programCode)!.push(row)
		}

		// Sort programs by program_order ASC
		const sortedPrograms = Array.from(programGroups.keys()).sort((a, b) => {
			const ma = programMeta.get(a)!
			const mb = programMeta.get(b)!
			return (ma.program_order - mb.program_order) || a.localeCompare(b)
		})

		if (sortedPrograms.length === 0) return

		for (const programCode of sortedPrograms) {
			const programData = programGroups.get(programCode)!

			// The learner's own semester decides the sheet they are listed on - not the
			// semester of the paper, which for an arrear belongs to a semester they have
			// already left. Every paper they applied for, regular and arrear alike, then
			// lands on that one sheet.
			const studentSemesterMap = buildStudentSemesterMap(programData)

			const semesterGroups = new Map<number, any[]>()
			for (const row of programData) {
				const regNo = row.stu_register_no || 'Unknown'
				const sem = studentSemesterMap.get(regNo) || 0
				if (!semesterGroups.has(sem)) semesterGroups.set(sem, [])
				semesterGroups.get(sem)!.push(row)
			}

			const sortedSemesters = Array.from(semesterGroups.keys()).sort((a, b) => semesterSortKey(a) - semesterSortKey(b))

			for (const semester of sortedSemesters) {
				const semesterData = semesterGroups.get(semester)!
				const result = buildSheet({ ...opts, data: semesterData })
				if (result.rows.length === 0) continue

				const ws = XLSX.utils.json_to_sheet(result.rows)
				applySheetFormatting(ws, result)

				// Program / Semester info block (matches the PDF subtitle)
				const word = isRegistrationType ? 'Registered' : 'Applied'
				const info = computeProgramInfo(semesterData)
				prependProgramInfoRows(
					ws,
					`Program & Branch : ${programCode}${info.programName ? ` - ${info.programName}` : ''}`,
					`No.of Subjects : ${info.subjectCount}`,
					`Semester : ${semesterLabel(semester)}`,
					`No.of Students ${word} : ${info.studentCount}`
				)
				if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)

				// Sheet name: "PCA-Sem III" (max 31 chars, sanitized)
				const sheetName = `${programCode}-${semesterColumnLabel(semester)}`.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Unknown'
				XLSX.utils.book_append_sheet(wb, ws, sheetName)
			}
		}

		if (wb.SheetNames.length === 0) return
	} else if (opts.report_type === 'course-count-program-year-section') {
		// Each program section gets its own sheet
		const { sections } = exportCourseCountProgramSectionExcel(opts)
		for (const { sheetName, result } of sections) {
			if (result.rows.length === 0) continue
			const ws = XLSX.utils.json_to_sheet(result.rows)
			applySheetFormatting(ws, result)
			if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)
			XLSX.utils.book_append_sheet(wb, ws, sheetName)
		}

		if (wb.SheetNames.length === 0) return
	} else if (opts.report_type === 'exam-date-wise-summary') {
		// Exam Date-wise Summary — single sheet
		const dateMap = new Map<string, { exam_date: string; fn: number; an: number }>()
		for (const row of opts.data) {
			const examDate = row.exam_date
			if (!examDate) continue
			const session = row.exam_session || ''
			if (!dateMap.has(examDate)) dateMap.set(examDate, { exam_date: examDate, fn: 0, an: 0 })
			const entry = dateMap.get(examDate)!
			if (session === 'FN') entry.fn++
			else if (session === 'AN') entry.an++
		}
		const sorted = Array.from(dateMap.values())
			.sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())

		if (sorted.length === 0) return

		const formatDate = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` } catch { return d } }

		const rows = sorted.map((row, idx) => ({
			'S.No': idx + 1,
			'Exam Date': formatDate(row.exam_date),
			'FN': row.fn,
			'AN': row.an,
			'Total': row.fn + row.an,
		}))

		const result: ExcelReportResult = { rows, merges: [] }
		const ws = XLSX.utils.json_to_sheet(result.rows)
		applySheetFormatting(ws, result)
		if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)
		XLSX.utils.book_append_sheet(wb, ws, 'Summary')
	} else if (opts.report_type === 'board-wise-exam-timetable') {
		// Board wise exam timetable — single sheet, no UG/PG split
		const courseMap = new Map<string, any>()
		for (const row of opts.data) {
			const co = row.course_offering
			if (!co) continue
			const examDate = row.exam_date || ''
			const examSession = row.exam_session || ''
			const key = `${co.board_code || ''}|${co.course_code}|${examDate}|${examSession}`
			if (!courseMap.has(key)) {
				courseMap.set(key, {
					board_code: co.board_code || '',
					board_name: co.board_name || '',
					board_order: co.board_order ?? 999,
					semester: co.semester || 0,
					course_order: co.course_order ?? 999,
					course_code: co.course_code,
					course_name: co.course_name || '',
					exam_date: examDate,
					exam_session: examSession,
				})
			}
		}
		const sorted = Array.from(courseMap.values())
			.sort((a, b) => (a.board_order - b.board_order) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

		if (sorted.length === 0) return

		const formatDate = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` } catch { return d } }

		const rows = sorted.map((row, idx) => ({
			'S.No': idx + 1,
			'Board': row.board_code ? `${row.board_code}${row.board_name ? ` - ${row.board_name}` : ''}` : '',
			'Exam Date': row.exam_date ? formatDate(row.exam_date) : '',
			'Session': row.exam_session || '',
			'Sem': row.semester ? toRoman(row.semester) : '',
			'Course Code': row.course_code,
			'Course Name': row.course_name,
		}))

		const result: ExcelReportResult = { rows, merges: [] }
		const ws = XLSX.utils.json_to_sheet(result.rows)
		applySheetFormatting(ws, result)
		if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)
		XLSX.utils.book_append_sheet(wb, ws, 'Timetable')
	} else if (opts.report_type === 'qp-packing-list') {
		// QP Packing List — one sheet per date+session
		const groupMap = new Map<string, any[]>()
		for (const row of opts.data) {
			const co = row.course_offering
			if (!co) continue
			const examDate = row.exam_date || ''
			const examSession = row.exam_session || ''
			if (!examDate || !examSession) continue
			const groupKey = `${examDate}|${examSession}`
			if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
			const courses = groupMap.get(groupKey)!
			let existing = courses.find((c: any) => c.course_code === co.course_code)
			if (!existing) {
				existing = { semester: co.semester || 0, board_code: co.board_code || '', board_order: co.board_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', course_order: co.course_order ?? 999, count: 0 }
				courses.push(existing)
			}
			existing.count++
		}
		const formatDate = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` } catch { return d } }
		const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
			const [dA, sA] = a.split('|'); const [dB, sB] = b.split('|')
			const dc = new Date(dA).getTime() - new Date(dB).getTime()
			if (dc !== 0) return dc
			return (sA === 'FN' ? 0 : 1) - (sB === 'FN' ? 0 : 1)
		})
		let sheetNum = 0
		for (const key of sortedKeys) {
			const [examDate, examSession] = key.split('|')
			const courses = groupMap.get(key)!
			courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.board_order - b.board_order) || (a.course_order - b.course_order))
			const rows = courses.map((c: any, idx: number) => ({
				'S.No': idx + 1,
				'Sem': c.semester ? toRoman(c.semester) : '',
				'Board': c.board_code,
				'Course Code': c.course_code,
				'Course Name': c.course_name,
				'QP Count': c.count,
			}))
			if (rows.length === 0) continue
			const result: ExcelReportResult = { rows, merges: [] }
			const ws = XLSX.utils.json_to_sheet(result.rows)
			applySheetFormatting(ws, result)
			prependInfoRow(ws, `Exam Date: ${formatDate(examDate)} | Session: ${examSession}`)
			sheetNum++
			const sheetName = `${formatDate(examDate)}-${examSession}`.replace(/[\\/*?[\]:]/g, '').slice(0, 31)
			XLSX.utils.book_append_sheet(wb, ws, sheetName)
		}
		if (wb.SheetNames.length === 0) return
	} else if (opts.report_type === 'exam-date-wise-registration' || opts.report_type === 'exam-date-wise-attendance') {
		// Exam date-wise reports — single sheet, grouped by date+session
		const includePresent = opts.report_type === 'exam-date-wise-attendance'
		const groupMap = new Map<string, any[]>()
		for (const row of opts.data) {
			const co = row.course_offering
			if (!co) continue
			const examDate = row.exam_date || ''
			const examSession = row.exam_session || ''
			if (!examDate || !examSession) continue
			const groupKey = `${examDate}|${examSession}`
			if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
			const courses = groupMap.get(groupKey)!
			const courseKey = co.course_code
			let existing = courses.find((c: any) => c.course_code === courseKey)
			if (!existing) {
				existing = { semester: co.semester || 0, board_code: co.board_code || '', board_order: co.board_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', course_order: co.course_order ?? 999, registered: 0, present: 0 }
				courses.push(existing)
			}
			existing.registered++
			if (includePresent && row.is_present) existing.present++
		}
		const formatDate = (d: string) => { try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` } catch { return d } }
		const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
			const [dA, sA] = a.split('|'); const [dB, sB] = b.split('|')
			const dc = new Date(dA).getTime() - new Date(dB).getTime()
			if (dc !== 0) return dc
			return (sA === 'FN' ? 0 : 1) - (sB === 'FN' ? 0 : 1)
		})
		const allRows: Record<string, any>[] = []
		for (const key of sortedKeys) {
			const [examDate, examSession] = key.split('|')
			const courses = groupMap.get(key)!
			courses.sort((a: any, b: any) => (a.semester - b.semester) || (a.board_order - b.board_order) || (a.course_order - b.course_order))
			for (const c of courses) {
				const row: Record<string, any> = {
					'Exam Date': formatDate(examDate),
					'Session': examSession,
					'Sem': c.semester ? toRoman(c.semester) : '',
					'Board': c.board_code,
					'Course Code': c.course_code,
					'Course Name': c.course_name,
					'No. of Students Register/QP': c.registered,
				}
				if (includePresent) row['No. of Students Present'] = c.present
				allRows.push(row)
			}
		}
		if (allRows.length === 0) return
		const result: ExcelReportResult = { rows: allRows, merges: [] }
		const ws = XLSX.utils.json_to_sheet(result.rows)
		applySheetFormatting(ws, result)
		if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)
		XLSX.utils.book_append_sheet(wb, ws, includePresent ? 'Attendance' : 'Registration')
	} else {
		// Split data into UG / PG using board_type (most reliable), then fallback to prefix
		const classifyRow = (row: any): 'UG' | 'PG' | null => {
			const programType = row.course_offering?.program_type || ''
			if (programType === 'UG' || programType === 'PG') return programType
			const studentBoardType = row.student_board_type || ''
			if (studentBoardType === 'UG' || studentBoardType === 'PG') return studentBoardType
			const courseBoardType = row.course_offering?.board_type || ''
			if (courseBoardType === 'UG' || courseBoardType === 'PG') return courseBoardType
			const pc = row.course_offering?.program_code || row.program_code || ''
			if (pc.startsWith('U')) return 'UG'
			if (pc.startsWith('P')) return 'PG'
			return null
		}
		const ugData = opts.data.filter(row => classifyRow(row) === 'UG')
		const pgData = opts.data.filter(row => classifyRow(row) === 'PG')

		const levels: { label: string, data: any[] }[] = []
		if (ugData.length > 0) levels.push({ label: 'UG', data: ugData })
		if (pgData.length > 0) levels.push({ label: 'PG', data: pgData })
		if (levels.length === 0) return

		const reportFn = (data: any[]) => {
			const levelOpts = { ...opts, data }
			switch (opts.report_type) {
				case 'course-count-regular-arrear':
					return exportCourseCountRegularArrearExcel(levelOpts)
				case 'course-count-year-wise':
					return exportCourseCountSemesterWiseExcel(levelOpts)
				case 'course-count-program-year-wise':
					return exportCourseCountProgramSemesterWiseExcel(levelOpts)
				default:
					throw new Error(`Unknown report type: ${opts.report_type}`)
			}
		}

		for (const level of levels) {
			const result = reportFn(level.data)
			if (result.rows.length === 0) continue

			const ws = XLSX.utils.json_to_sheet(result.rows)
			applySheetFormatting(ws, result)
			if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)

			XLSX.utils.book_append_sheet(wb, ws, level.label)
		}

		if (wb.SheetNames.length === 0) return
	}

	const reportNames: Record<string, string> = {
		'student-fee-details': 'fee-details',
		'student-exam-registration': 'student-registration',
		'student-exam-registration-summary': 'subject-summary',
		'student-wise-application': 'student-wise-application',
		'student-wise-registration': 'student-wise-registration',
		'course-count-regular-arrear': 'course-count-regular-arrear',
		'course-count-year-wise': 'course-count-year-wise',
		'course-count-program-year-wise': 'course-count-program-year-wise',
		'course-count-program-year-section': 'course-count-program-year-section',
		'board-wise-exam-timetable': 'board-wise-exam-timetable',
		'exam-date-wise-summary': 'exam-date-wise-summary',
		'qp-packing-list': 'qp-packing-list',
	}

	const filename = `exam-registration-${reportNames[opts.report_type]}-${opts.session_code}-${new Date().toISOString().slice(0, 10)}.xlsx`
	await XLSX.writeFile(wb, filename)
}
