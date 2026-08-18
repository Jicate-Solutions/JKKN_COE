import ExcelJS from 'exceljs'

/**
 * University Degree-Data upload export.
 *
 * One row per consolidated learner, in the fixed column order expected by the
 * university degree-data upload sheet:
 *
 *   NEW_CODE | REG_NO | MAJ_PER | MAJ_CLSS_E | YR_COMP | E_DEGNAME | E_BRANCHNA |
 *   ENG_NAME | TAMIL_NAME | T_INITIAL | DEGREE | MEDIUM | GENDER
 *
 * Data sources:
 *   - NEW_CODE                          institutions.code || institution_code
 *   - REG_NO                            consolidated_results.register_number
 *   - MAJ_PER                           consolidated_results.cgpa
 *   - MAJ_CLSS_E                        consolidated_results.part_a_classification
 *                                       + " WITH " + .grade + " GRADE", e.g.
 *                                       "FIRST CLASS WITH A+ GRADE". Blank when
 *                                       the classification is unset (no fallback);
 *                                       suffix dropped when grade is null.
 *   - YR_COMP                           consolidated_results.last_appearance_month
 *                                       (expanded to the full month name) + _year
 *   - ENG_NAME                          learners_profiles.first_name +
 *                                       last_name (space-joined, uppercased)
 *   - T_INITIAL                         learners_profiles.last_name
 *   - GENDER                            learners_profiles.gender
 *   - E_DEGNAME                         MyJKKN programs.program_name
 *                                       ("MASTER OF COMMERCE"), uppercased
 *   - E_BRANCHNA                        MyJKKN programs.display_name ("COMMERCE")
 *   - DEGREE                            programs.program_name
 *   - MEDIUM                            derived from the program name
 *   - TAMIL_NAME                        no source in COE/MyJKKN — emitted blank
 */

export interface UniversityDataRow {
	NEW_CODE: string
	REG_NO: string
	MAJ_PER: number | string
	MAJ_CLSS_E: string
	YR_COMP: string
	E_DEGNAME: string
	E_BRANCHNA: string
	ENG_NAME: string
	TAMIL_NAME: string
	T_INITIAL: string
	DEGREE: string
	MEDIUM: string
	GENDER: string
}

// Fixed column order — MUST match the university upload template exactly.
const COLUMNS: { key: keyof UniversityDataRow; header: string; width: number }[] = [
	{ key: 'NEW_CODE', header: 'NEW_CODE', width: 12 },
	{ key: 'REG_NO', header: 'REG_NO', width: 16 },
	{ key: 'MAJ_PER', header: 'MAJ_PER', width: 10 },
	{ key: 'MAJ_CLSS_E', header: 'MAJ_CLSS_E', width: 20 },
	{ key: 'YR_COMP', header: 'YR_COMP', width: 14 },
	{ key: 'E_DEGNAME', header: 'E_DEGNAME', width: 28 },
	{ key: 'E_BRANCHNA', header: 'E_BRANCHNA', width: 28 },
	{ key: 'ENG_NAME', header: 'ENG_NAME', width: 30 },
	{ key: 'TAMIL_NAME', header: 'TAMIL_NAME', width: 30 },
	{ key: 'T_INITIAL', header: 'T_INITIAL', width: 12 },
	{ key: 'DEGREE', header: 'DEGREE', width: 12 },
	{ key: 'MEDIUM', header: 'MEDIUM', width: 12 },
	{ key: 'GENDER', header: 'GENDER', width: 10 }
]

const thinBorder: Partial<ExcelJS.Borders> = {
	top: { style: 'thin', color: { argb: 'FF000000' } },
	left: { style: 'thin', color: { argb: 'FF000000' } },
	bottom: { style: 'thin', color: { argb: 'FF000000' } },
	right: { style: 'thin', color: { argb: 'FF000000' } }
}

export async function generateUniversityDataExcel(
	rows: UniversityDataRow[]
): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = 'JKKN COE System'
	workbook.created = new Date()

	const sheet = workbook.addWorksheet('University Data')

	// Column widths
	COLUMNS.forEach((col, idx) => {
		sheet.getColumn(idx + 1).width = col.width
	})

	// ---- Header row ----
	const headerRow = sheet.getRow(1)
	COLUMNS.forEach((col, idx) => {
		const cell = headerRow.getCell(idx + 1)
		cell.value = col.header
		cell.font = { name: 'Calibri', bold: true, size: 11 }
		cell.alignment = { horizontal: 'center', vertical: 'middle' }
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
		cell.border = thinBorder
	})
	headerRow.height = 20

	// Freeze header + keep it as print title
	sheet.views = [{ state: 'frozen', ySplit: 1 }]
	sheet.pageSetup.printTitlesRow = '1:1'

	// ---- Data rows ----
	rows.forEach((row, rowIdx) => {
		const r = sheet.getRow(rowIdx + 2)
		COLUMNS.forEach((col, idx) => {
			const cell = r.getCell(idx + 1)
			const raw = row[col.key]
			cell.font = { name: 'Calibri', size: 11 }
			cell.border = thinBorder
			// MAJ_PER (CGPA) is written as a real number with 3-decimal format —
			// consolidated_results.cgpa is numeric(5,3) and is truncated (not
			// rounded) to 3dp upstream, so all three digits must survive the export.
			// Every other column stays text so reg numbers / codes never coerce.
			if (col.key === 'MAJ_PER' && typeof raw === 'number') {
				cell.value = raw
				cell.numFmt = '0.000'
				cell.alignment = { horizontal: 'right', vertical: 'middle' }
			} else {
				cell.value = raw ?? ''
				cell.alignment = { horizontal: 'left', vertical: 'middle' }
			}
		})
	})

	const buffer = await workbook.xlsx.writeBuffer()
	return Buffer.from(buffer)
}
