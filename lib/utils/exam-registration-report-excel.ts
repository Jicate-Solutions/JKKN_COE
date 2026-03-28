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

function semesterToYear(semester: number): string {
	const yearNum = Math.ceil(semester / 2)
	return `${toRoman(yearNum)} Year`
}

/** Build a map of student register number → current year (based on max regular semester) */
function buildStudentYearMap(data: any[]): Map<string, string> {
	const maxRegSem = new Map<string, number>()
	const maxAnySem = new Map<string, number>()
	for (const row of data) {
		const regNo = row.stu_register_no
		if (!regNo) continue
		const sem = row.course_offering?.semester || 0
		if (sem <= 0) continue
		if (row.is_regular) maxRegSem.set(regNo, Math.max(maxRegSem.get(regNo) || 0, sem))
		maxAnySem.set(regNo, Math.max(maxAnySem.get(regNo) || 0, sem))
	}
	const result = new Map<string, string>()
	for (const regNo of new Set([...maxRegSem.keys(), ...maxAnySem.keys()])) {
		const maxSem = maxRegSem.get(regNo) || maxAnySem.get(regNo) || 1
		result.set(regNo, semesterToYear(maxSem))
	}
	return result
}

// ── Report 1: Student Fee Details ──

function exportStudentFeeDetailsExcel(opts: ExcelExportOptions): ExcelReportResult {
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

		// Merge S.No, Register No, Name, DOB, and fee columns for this student
		if (courseCount > 1) {
			// Columns: 0=S.No, 1=Register No, 2=Name, 3=DOB, 7=Theory, 8=App Fee, 9=MS Fee, 10=Total, 11=Sign
			const mergeCols = [0, 1, 2, 3, 7, 8, 9, 10, 11]
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
				'SEM/Year': toRoman(course.semester),
				'Subject Code': course.course_code,
				'Course Name': course.course_name,
				'Theory': '',
				'Application Fee': '',
				'Mark Statement Fee': '',
				'Total Amount': '',
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
				'SEM/Year': '',
				'Subject Code': '',
				'Course Name': '',
				'Theory': '',
				'Application Fee': '',
				'Mark Statement Fee': '',
				'Total Amount': '',
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
		'Board': row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '',
		'Sem': row.semester ? toRoman(row.semester) : '',
		'Course Code': row.course_code,
		'Course Name': row.course_name,
		'Regular Students': row.regular,
		'Arrear Students': row.arrear,
		'Total': row.regular + row.arrear,
	}))

	return { rows, merges }
}

// ── Report 2B: Course Count Year-wise ──

function exportCourseCountYearWiseExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentYearMap = buildStudentYearMap(opts.data)
	const countMap = new Map<string, any>()
	const allYears = new Set<string>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const key = `${co.board_code || ''}|${co.course_code}`
		const year = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(year)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
		}
		const entry = countMap.get(key)!
		entry.years[year] = (entry.years[year] || 0) + 1
	}

	const sortedYears = Array.from(allYears).sort((a, b) => {
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return order.indexOf(a) - order.indexOf(b)
	})

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
		const yearCols: Record<string, number> = {}
		let total = 0
		sortedYears.forEach(y => {
			const count = row.years[y] || 0
			yearCols[y] = count
			total += count
		})
		return {
			'S.No': idx + 1,
			'Board': row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '',
			'Sem': row.semester ? toRoman(row.semester) : '',
			'Course Code': row.course_code,
			'Course Name': row.course_name,
			...yearCols,
			'Total': total,
		}
	})

	return { rows, merges }
}

// ── Report 2C: Course Count with Program Code Year-wise ──

function exportCourseCountProgramYearWiseExcel(opts: ExcelExportOptions): ExcelReportResult {
	const studentYearMap = buildStudentYearMap(opts.data)
	const countMap = new Map<string, any>()
	const allYears = new Set<string>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const key = `${co.board_code || ''}|${programCode}|${co.course_code}`
		const year = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(year)

		if (!countMap.has(key)) {
			countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: programCode, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
		}
		const entry = countMap.get(key)!
		entry.years[year] = (entry.years[year] || 0) + 1
	}

	const sortedYears = Array.from(allYears).sort((a, b) => {
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return order.indexOf(a) - order.indexOf(b)
	})

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
		const yearCols: Record<string, number> = {}
		let total = 0
		sortedYears.forEach(y => {
			const count = row.years[y] || 0
			yearCols[y] = count
			total += count
		})
		return {
			'S.No': idx + 1,
			'Board': row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '',
			'Program Code': row.program_code,
			'Sem': row.semester ? toRoman(row.semester) : '',
			'Course Code': row.course_code,
			'Course Name': row.course_name,
			...yearCols,
			'Total': total,
		}
	})

	return { rows, merges }
}

// ── Report 3: Course Count by Program & Year Section ──

function exportCourseCountProgramYearSectionExcel(opts: ExcelExportOptions): { sections: { sheetName: string; result: ExcelReportResult }[] } {
	const studentYearMap = buildStudentYearMap(opts.data)
	const allYears = new Set<string>()

	// Group by program_code → courses with year-wise counts
	const programMap = new Map<string, {
		program_code: string
		program_name: string | null
		program_order: number
		courses: Map<string, { semester: number; course_order: number; course_code: string; course_name: string; years: Record<string, number> }>
	}>()

	for (const row of opts.data) {
		const co = row.course_offering
		if (!co) continue
		const programCode = co.program_code || row.program_code || ''
		const studentYear = studentYearMap.get(row.stu_register_no) || semesterToYear(co.semester || 1)
		allYears.add(studentYear)

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
				years: {},
			})
		}
		program.courses.get(courseKey)!.years[studentYear] = (program.courses.get(courseKey)!.years[studentYear] || 0) + 1
	}

	const sortedYears = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year'].filter(y => allYears.has(y))

	const sections = Array.from(programMap.values())
		.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))

	return {
		sections: sections.map(section => {
			const courses = Array.from(section.courses.values())
				.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code))

			const rows = courses.map((course, idx) => {
				const yearCols: Record<string, number> = {}
				let total = 0
				sortedYears.forEach(y => {
					const count = course.years[y] || 0
					yearCols[y] = count
					total += count
				})
				return {
					'S.No': idx + 1,
					'Sem': toRoman(course.semester),
					'Course Code': course.course_code,
					'Course Name': course.course_name,
					...yearCols,
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

// ── Main Export ──

export async function exportExamRegistrationReportExcel(opts: ExcelExportOptions) {
	const wb = XLSX.utils.book_new()

	if (opts.report_type === 'student-fee-details') {
		// Group data by program_code, then by year within each program
		const programGroups = new Map<string, any[]>()
		const programMeta = new Map<string, { program_board_order: number }>()
		for (const row of opts.data) {
			const programCode = row.course_offering?.program_code || row.program_code || 'Unknown'
			if (!programGroups.has(programCode)) {
				programGroups.set(programCode, [])
				programMeta.set(programCode, {
					program_board_order: row.course_offering?.program_board_order ?? 999,
				})
			}
			programGroups.get(programCode)!.push(row)
		}

		// Sort programs by program_board_order ASC
		const sortedPrograms = Array.from(programGroups.keys()).sort((a, b) => {
			const ma = programMeta.get(a)!
			const mb = programMeta.get(b)!
			return (ma.program_board_order - mb.program_board_order) || a.localeCompare(b)
		})

		if (sortedPrograms.length === 0) return

		const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']

		for (const programCode of sortedPrograms) {
			const programData = programGroups.get(programCode)!

			// Determine each student's year (by max semester)
			const studentYearMap = new Map<string, number>()
			for (const row of programData) {
				const regNo = row.stu_register_no || 'Unknown'
				const semester = row.course_offering?.semester || 0
				studentYearMap.set(regNo, Math.max(studentYearMap.get(regNo) || 0, semester))
			}

			// Group rows by student's year
			const yearGroups = new Map<string, any[]>()
			for (const row of programData) {
				const regNo = row.stu_register_no || 'Unknown'
				const maxSem = studentYearMap.get(regNo) || 1
				const year = semesterToYear(maxSem)
				if (!yearGroups.has(year)) yearGroups.set(year, [])
				yearGroups.get(year)!.push(row)
			}

			const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => yearOrder.indexOf(a) - yearOrder.indexOf(b))

			for (const year of sortedYears) {
				const yearData = yearGroups.get(year)!
				const result = exportStudentFeeDetailsExcel({ ...opts, data: yearData })
				if (result.rows.length === 0) continue

				const ws = XLSX.utils.json_to_sheet(result.rows)
				applySheetFormatting(ws, result)
				if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)

				// Sheet name: "PCA-I Year" (max 31 chars, sanitized)
				const sheetName = `${programCode}-${year}`.replace(/[\\/*?[\]:]/g, '').slice(0, 31) || 'Unknown'
				XLSX.utils.book_append_sheet(wb, ws, sheetName)
			}
		}

		if (wb.SheetNames.length === 0) return
	} else if (opts.report_type === 'course-count-program-year-section') {
		// Each program+year section gets its own sheet
		const { sections } = exportCourseCountProgramYearSectionExcel(opts)
		for (const { sheetName, result } of sections) {
			if (result.rows.length === 0) continue
			const ws = XLSX.utils.json_to_sheet(result.rows)
			applySheetFormatting(ws, result)
			if (opts.course_category_filter?.length) prependInfoRow(ws, `Course Category : ${opts.course_category_filter.join(', ')}`)
			XLSX.utils.book_append_sheet(wb, ws, sheetName)
		}

		if (wb.SheetNames.length === 0) return
	} else {
		// Split data into UG / PG using board_type (most reliable), then fallback to prefix
		const classifyRow = (row: any): 'UG' | 'PG' | null => {
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
					return exportCourseCountYearWiseExcel(levelOpts)
				case 'course-count-program-year-wise':
					return exportCourseCountProgramYearWiseExcel(levelOpts)
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
		'course-count-regular-arrear': 'course-count-regular-arrear',
		'course-count-year-wise': 'course-count-year-wise',
		'course-count-program-year-wise': 'course-count-program-year-wise',
		'course-count-program-year-section': 'course-count-program-year-section',
	}

	const filename = `exam-registration-${reportNames[opts.report_type]}-${opts.session_code}-${new Date().toISOString().slice(0, 10)}.xlsx`
	await XLSX.writeFile(wb, filename)
}
