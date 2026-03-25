/**
 * Marksheet Column Group Mapping Utility
 *
 * Maps course_order values to column groups for PDF generation.
 * The pattern repeats for unlimited courses:
 *   order 1 → group 1
 *   order 2 → group 2
 *   order 3 → group 3
 *   order 4 → group 1
 *   order 5 → group 4
 *   order 6 → group 3
 *   order 7 → group 1
 *   ... (pattern continues)
 */

// ============================================================
// PART 1: COLUMN GROUP MAPPING LOGIC
// ============================================================

/**
 * The repeating pattern for column group assignment
 * Pattern: [1, 2, 3, 1, 4, 3, 1] repeats every 7 orders
 */
const COLUMN_GROUP_PATTERN = [1, 2, 3, 1, 4, 3, 1]

/**
 * Maps a course_order value to its column group (1-4)
 * @param courseOrder - The course_order from course_mapping table
 * @returns Column group number (1, 2, 3, or 4)
 */
export function getColumnGroup(courseOrder: number): number {
	if (courseOrder < 1) return 1
	// Convert to 0-based index, apply pattern
	const index = (courseOrder - 1) % COLUMN_GROUP_PATTERN.length
	return COLUMN_GROUP_PATTERN[index]
}

/**
 * Get all course orders that map to a specific column group
 * @param columnGroup - The target column group (1, 2, 3, or 4)
 * @param maxOrder - Maximum course_order to check
 * @returns Array of course_order values for that group
 */
export function getOrdersForColumnGroup(columnGroup: number, maxOrder: number = 50): number[] {
	const orders: number[] = []
	for (let order = 1; order <= maxOrder; order++) {
		if (getColumnGroup(order) === columnGroup) {
			orders.push(order)
		}
	}
	return orders
}

// ============================================================
// PART 2: TYPE DEFINITIONS
// ============================================================

export interface CourseColumn {
	courseCode: string
	courseName: string
	courseId: string
	semester: number
	courseOrder: number
	columnGroup: number
	credit: number
	internalMax: number
	externalMax: number
	totalMax: number
}

export interface ColumnGroup {
	groupNumber: number
	groupLabel: string
	courses: CourseColumn[]
	/** Total width in mm for PDF */
	totalWidth: number
}

export interface MarksheetHeaderStructure {
	/** Fixed columns: REG NO, NAME */
	fixedColumns: {
		regNo: { label: string; width: number }
		name: { label: string; width: number }
	}
	/** Dynamic column groups (CG1-CG4) */
	columnGroups: ColumnGroup[]
	/** Summary columns: SGPA, CGPA, RESULT */
	summaryColumns: {
		sgpa: { label: string; width: number }
		cgpa: { label: string; width: number }
		result: { label: string; width: number }
	}
}

export interface CourseMarkData {
	courseCode: string
	semester: number
	internalMarks: number | null
	externalMarks: number | null
	totalMarks: number | null
	result: 'P' | 'F' | 'A' | 'W' // Pass, Fail, Absent, Withheld
	gradePoints: number | null
	letterGrade: string
}

export interface StudentMarksheetRow {
	regNo: string
	studentName: string
	courseMarks: Map<string, CourseMarkData> // courseCode -> marks
	sgpa: number | null
	cgpa: number | null
	overallResult: 'PASS' | 'FAIL' | 'RA' // RA = Re-Appear
}

// ============================================================
// PART 3: HEADER STRUCTURE BUILDER
// ============================================================

/**
 * Subject column widths (in mm) for 8 sub-columns per course
 * COURSE CODE, SEM, INT, EXT, TOT, RES, GP, LG
 */
export const COURSE_SUB_COLUMN_WIDTHS = {
	courseCode: 18,
	sem: 8,
	int: 10,
	ext: 10,
	tot: 10,
	res: 8,
	gp: 8,
	lg: 8
}

export const TOTAL_COURSE_WIDTH =
	COURSE_SUB_COLUMN_WIDTHS.courseCode +
	COURSE_SUB_COLUMN_WIDTHS.sem +
	COURSE_SUB_COLUMN_WIDTHS.int +
	COURSE_SUB_COLUMN_WIDTHS.ext +
	COURSE_SUB_COLUMN_WIDTHS.tot +
	COURSE_SUB_COLUMN_WIDTHS.res +
	COURSE_SUB_COLUMN_WIDTHS.gp +
	COURSE_SUB_COLUMN_WIDTHS.lg // = 80mm per course

/**
 * Fixed column widths (in mm)
 */
export const FIXED_COLUMN_WIDTHS = {
	sno: 8,
	regNo: 28,
	name: 45,
	sgpa: 12,
	cgpa: 12,
	result: 15
}

/**
 * Group courses by column group and build header structure
 * @param courses - Array of course data with course_order
 * @returns Structured header data for PDF generation
 */
export function buildMarksheetHeaderStructure(
	courses: Array<{
		courseCode: string
		courseName: string
		courseId: string
		semester: number
		courseOrder: number
		credit: number
		internalMax: number
		externalMax: number
		totalMax: number
	}>
): MarksheetHeaderStructure {
	// Map courses to column groups
	const coursesWithGroups: CourseColumn[] = courses.map(c => ({
		...c,
		columnGroup: getColumnGroup(c.courseOrder)
	}))

	// Group by column group number
	const groupedCourses = new Map<number, CourseColumn[]>()
	for (let g = 1; g <= 4; g++) {
		groupedCourses.set(g, [])
	}

	coursesWithGroups.forEach(course => {
		const group = groupedCourses.get(course.columnGroup)
		if (group) {
			group.push(course)
		}
	})

	// Sort courses within each group by course_order
	groupedCourses.forEach((courses, groupNum) => {
		courses.sort((a, b) => a.courseOrder - b.courseOrder)
	})

	// Build column groups
	const columnGroups: ColumnGroup[] = []
	for (let g = 1; g <= 4; g++) {
		const courses = groupedCourses.get(g) || []
		columnGroups.push({
			groupNumber: g,
			groupLabel: `CG${g}`,
			courses,
			totalWidth: courses.length * TOTAL_COURSE_WIDTH
		})
	}

	return {
		fixedColumns: {
			regNo: { label: 'REG NO', width: FIXED_COLUMN_WIDTHS.regNo },
			name: { label: 'NAME', width: FIXED_COLUMN_WIDTHS.name }
		},
		columnGroups,
		summaryColumns: {
			sgpa: { label: 'SGPA', width: FIXED_COLUMN_WIDTHS.sgpa },
			cgpa: { label: 'CGPA', width: FIXED_COLUMN_WIDTHS.cgpa },
			result: { label: 'RESULT', width: FIXED_COLUMN_WIDTHS.result }
		}
	}
}

// ============================================================
// PART 4: SQL GENERATION
// ============================================================

/**
 * SQL to calculate column_group based on course_order
 * Uses the pattern: [1, 2, 3, 1, 4, 3, 1] repeating
 */
export const SQL_COLUMN_GROUP_FUNCTION = `
-- Function to calculate column_group from course_order
CREATE OR REPLACE FUNCTION public.get_column_group(p_course_order integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pattern integer[] := ARRAY[1, 2, 3, 1, 4, 3, 1];
  idx integer;
BEGIN
  IF p_course_order < 1 THEN
    RETURN 1;
  END IF;
  -- Convert to 0-based index and get pattern value
  idx := ((p_course_order - 1) % 7) + 1;
  RETURN pattern[idx];
END;
$$;

COMMENT ON FUNCTION public.get_column_group(integer) IS
'Maps course_order to column_group (1-4) using pattern [1,2,3,1,4,3,1]';
`

/**
 * SQL to add column_group as a generated column to course_mapping
 */
export const SQL_ADD_COLUMN_GROUP = `
-- Add column_group as a generated column to course_mapping
ALTER TABLE public.course_mapping
ADD COLUMN IF NOT EXISTS column_group integer
GENERATED ALWAYS AS (
  CASE
    WHEN course_order IS NULL THEN 1
    ELSE (ARRAY[1, 2, 3, 1, 4, 3, 1])[((course_order::integer - 1) % 7) + 1]
  END
) STORED;

COMMENT ON COLUMN public.course_mapping.column_group IS
'Auto-calculated column group (1-4) for marksheet layout based on course_order';

-- Create index for efficient grouping
CREATE INDEX IF NOT EXISTS idx_course_mapping_column_group
ON public.course_mapping(column_group, course_order);
`

/**
 * SQL query to fetch courses grouped by column_group
 */
export const SQL_FETCH_COURSES_BY_COLUMN_GROUP = `
-- Fetch courses grouped by column_group for marksheet generation
SELECT
  cm.id,
  cm.course_id,
  cm.course_code,
  c.course_name,
  cm.semester_code,
  cm.course_order,
  -- Calculate column_group using the pattern
  CASE
    WHEN cm.course_order IS NULL THEN 1
    ELSE (ARRAY[1, 2, 3, 1, 4, 3, 1])[((cm.course_order::integer - 1) % 7) + 1]
  END AS column_group,
  c.credit,
  COALESCE(cm.internal_max_mark, c.internal_max_mark) AS internal_max,
  COALESCE(cm.external_max_mark, c.external_max_mark) AS external_max,
  COALESCE(cm.total_max_mark, c.total_max_mark) AS total_max
FROM public.course_mapping cm
JOIN public.courses c ON c.id = cm.course_id
WHERE cm.institution_code = $1
  AND cm.program_code = $2
  AND cm.batch_code = $3
  AND cm.semester_code = $4
ORDER BY
  column_group ASC,
  cm.course_order ASC;
`

/**
 * SQL view for marksheet data with column groups
 */
export const SQL_MARKSHEET_VIEW = `
-- Create view for marksheet data with column groups
CREATE OR REPLACE VIEW public.v_marksheet_courses AS
SELECT
  cm.id AS course_mapping_id,
  cm.institution_code,
  cm.program_code,
  cm.batch_code,
  cm.semester_code,
  cm.course_id,
  cm.course_code,
  c.course_name,
  c.display_code,
  cm.course_order,
  -- Column group calculation
  CASE
    WHEN cm.course_order IS NULL THEN 1
    ELSE (ARRAY[1, 2, 3, 1, 4, 3, 1])[((cm.course_order::integer - 1) % 7) + 1]
  END AS column_group,
  c.credit,
  COALESCE(cm.internal_max_mark, c.internal_max_mark, 25) AS internal_max,
  COALESCE(cm.external_max_mark, c.external_max_mark, 75) AS external_max,
  COALESCE(cm.total_max_mark, c.total_max_mark, 100) AS total_max,
  s.semester AS semester_number
FROM public.course_mapping cm
JOIN public.courses c ON c.id = cm.course_id
LEFT JOIN public.semesters s ON s.semester_code = cm.semester_code
WHERE cm.is_active = true;

COMMENT ON VIEW public.v_marksheet_courses IS
'View for marksheet generation with pre-calculated column groups';
`

// ============================================================
// PART 5: VISUAL LAYOUT REPRESENTATION
// ============================================================

/**
 * Generate ASCII representation of the header layout
 */
export function generateVisualLayout(headerStructure: MarksheetHeaderStructure): string {
	const lines: string[] = []

	// Top border
	lines.push('╔' + '═'.repeat(200) + '╗')

	// Title row
	lines.push('║' + ' '.repeat(80) + 'MARKSHEET HEADER LAYOUT' + ' '.repeat(97) + '║')
	lines.push('╠' + '═'.repeat(200) + '╣')

	// Header row 1: Main groups
	let headerRow1 = '║ REG NO │ NAME '
	headerStructure.columnGroups.forEach(cg => {
		if (cg.courses.length > 0) {
			const groupWidth = Math.max(20, cg.courses.length * 12)
			const label = `CG${cg.groupNumber} (${cg.courses.length} courses)`
			const padding = Math.max(0, groupWidth - label.length)
			headerRow1 += '│ ' + label + ' '.repeat(padding)
		}
	})
	headerRow1 += '│ SGPA │ CGPA │ RESULT ║'
	lines.push(headerRow1)

	// Separator
	lines.push('╟' + '─'.repeat(200) + '╢')

	// Header row 2: Course codes within groups
	let headerRow2 = '║        │      '
	headerStructure.columnGroups.forEach(cg => {
		if (cg.courses.length > 0) {
			const codes = cg.courses.map(c => c.courseCode).join(' │ ')
			headerRow2 += '│ ' + codes + ' '
		}
	})
	headerRow2 += '│      │      │        ║'
	lines.push(headerRow2)

	// Separator
	lines.push('╟' + '─'.repeat(200) + '╢')

	// Header row 3: Sub-columns for each course
	let headerRow3 = '║        │      '
	headerStructure.columnGroups.forEach(cg => {
		if (cg.courses.length > 0) {
			const subHeaders = cg.courses.map(() => 'SEM│INT│EXT│TOT│RES│GP│LG').join(' │ ')
			headerRow3 += '│ ' + subHeaders + ' '
		}
	})
	headerRow3 += '│      │      │        ║'
	lines.push(headerRow3)

	// Bottom border
	lines.push('╚' + '═'.repeat(200) + '╝')

	// Add legend
	lines.push('')
	lines.push('LEGEND:')
	lines.push('  REG NO  = Registration Number')
	lines.push('  NAME    = Student Name')
	lines.push('  CG1-CG4 = Column Groups (courses grouped by course_order pattern)')
	lines.push('  SEM     = Semester')
	lines.push('  INT     = Internal Marks')
	lines.push('  EXT     = External Marks')
	lines.push('  TOT     = Total Marks')
	lines.push('  RES     = Result (P/F/A)')
	lines.push('  GP      = Grade Points')
	lines.push('  LG      = Letter Grade')
	lines.push('  SGPA    = Semester Grade Point Average')
	lines.push('  CGPA    = Cumulative Grade Point Average')
	lines.push('')
	lines.push('COLUMN GROUP MAPPING (course_order → column_group):')
	lines.push('  Order 1 → CG1    Order 5 → CG4')
	lines.push('  Order 2 → CG2    Order 6 → CG3')
	lines.push('  Order 3 → CG3    Order 7 → CG1')
	lines.push('  Order 4 → CG1    (pattern repeats)')

	return lines.join('\n')
}

// ============================================================
// PART 6: EXAMPLE USAGE
// ============================================================

/**
 * Example: Map course orders 1-14 to column groups
 */
export function getExampleMapping(): Array<{ order: number; group: number }> {
	const mapping: Array<{ order: number; group: number }> = []
	for (let order = 1; order <= 14; order++) {
		mapping.push({
			order,
			group: getColumnGroup(order)
		})
	}
	return mapping
}

/**
 * Print the mapping table for reference
 */
export function printMappingTable(): string {
	const mapping = getExampleMapping()
	const lines = [
		'┌─────────────┬──────────────┐',
		'│ course_order│ column_group │',
		'├─────────────┼──────────────┤'
	]

	mapping.forEach(m => {
		lines.push(`│     ${m.order.toString().padStart(2)}      │      ${m.group}       │`)
	})

	lines.push('└─────────────┴──────────────┘')
	return lines.join('\n')
}
