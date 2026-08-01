import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSupabaseServer } from '@/lib/supabase-server'
import { COE_ROLE_TAGS, COE_ROLE_TAG_CONFIG } from '@/lib/coe-calendar/visibility'

export const DATE_FORMAT_HINT = 'DD-MM-YYYY'

// Audience lives in ONE column holding one or more comma-separated tags.
//
// Excel list validation is single-select, so the dropdown offers each tag plus
// the ready-made combinations below; any other mix can still be typed, since
// the validation only warns. A true click-to-tick multi-select inside a single
// cell needs VBA in a macro-enabled .xlsm, which ExcelJS cannot author — and
// macros are blocked by default in browser-downloaded files anyway, so common
// combinations in the dropdown give one-click multi-select without them.
//
// Curated, not exhaustive (8 tags = too many permutations to list). Ordered
// most-used first. ALL is deliberately excluded — it stands alone. Add or trim
// freely; anything a user needs beyond these can be typed by hand.
const COMMON_AUDIENCE_COMBOS = [
	'TEACHING, NON_TEACHING',
	'TEACHING, NON_TEACHING, ADMINISTRATIVE',
	'TEACHING, ADMINISTRATIVE',
	'LEARNERS, TEACHING',
	'ADMINISTRATIVE, ACCOUNTS',
	'ADMINISTRATIVE, MANAGEMENT',
	'ACCOUNTS, COE_OFFICE',
	'MANAGEMENT, COE_OFFICE',
]

// Single tags first, then the ready-made combinations.
const AUDIENCE_OPTIONS = [...COE_ROLE_TAGS, ...COMMON_AUDIENCE_COMBOS]

// The UG/PG/BOTH level column is deliberately absent — with real programme
// codes available, two similarly named columns only invited confusion.
// Imported rows take programme_type = BOTH; change it per event in the app.
// Column order is not load-bearing: the importer matches on header names.
const HEADERS = [
	'Category *',
	'Event Title *',
	`From Date * (${DATE_FORMAT_HINT})`,
	`To Date * (${DATE_FORMAT_HINT})`,
	'Description',
	'Visible To *',
]

const COLUMN_WIDTHS = [
	{ width: 20 }, { width: 44 }, { width: 22 }, { width: 22 },
	{ width: 34 }, { width: 46 },
]

const FIRST_DATA_ROW = 2
const LAST_DATA_ROW = 201

/** 0-based index -> column letter (A, B, ... Z, AA). */
function columnLetter(index: number): string {
	let n = index + 1
	let letter = ''
	while (n > 0) {
		const rem = (n - 1) % 26
		letter = String.fromCharCode(65 + rem) + letter
		n = Math.floor((n - 1) / 26)
	}
	return letter
}

interface ValidationSpec {
	/** Target column letters on the data sheet; all share one lookup list. */
	columns: string[]
	values: string[]
	errorTitle: string
	error: string
	/**
	 * Flag values that are not in the list with a red fill. Correct for
	 * single-value columns; wrong for a column accepting several
	 * comma-separated codes, where valid input would be marked red.
	 */
	redHighlight: boolean
	/**
	 * Show Excel's prompt when the cell does not match the list. Turn it off on
	 * multi-value columns: picking one tag then typing ", TEACHING" after it is
	 * intended usage, and a popup on every such edit makes the sheet unusable.
	 */
	warnOnMismatch?: boolean
	/** Optional tooltip shown when a cell in the column is selected. */
	promptTitle?: string
	prompt?: string
}

/**
 * Applies list validation the same way lib/utils/excel-compat.ts does for
 * client-side templates: values are mirrored into a hidden `_ValidCodes` sheet,
 * the dropdown uses an inline formula while it fits inside Excel's 255-character
 * limit and a sheet reference beyond it, and out-of-list values are highlighted.
 */
function applyValidations(
	workbook: ExcelJS.Workbook,
	sheet: ExcelJS.Worksheet,
	specs: ValidationSpec[],
) {
	const lookup = workbook.addWorksheet('_ValidCodes')
	lookup.state = 'hidden'

	specs.forEach((spec, index) => {
		if (spec.values.length === 0) return

		const lookupColIndex = index + 1
		const lookupColLetter = columnLetter(index)

		spec.values.forEach((value, rowIdx) => {
			lookup.getCell(rowIdx + 1, lookupColIndex).value = value
		})

		const inlineFormula = `"${spec.values.join(',')}"`
		const sheetRef = `'_ValidCodes'!$${lookupColLetter}$1:$${lookupColLetter}$${spec.values.length}`
		// An inline list is itself comma-delimited, so a value containing a
		// comma would be split into bogus entries. Excel also rejects an inline
		// formula beyond 255 characters. Either case reads from the hidden sheet.
		const canInline =
			inlineFormula.length <= 255 && !spec.values.some(v => v.includes(','))
		const formula = canInline ? inlineFormula : sheetRef

		for (const column of spec.columns) {
			const targetColNum = column.split('').reduce(
				(acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0,
			)

			for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
				sheet.getCell(row, targetColNum).dataValidation = {
					type: 'list',
					allowBlank: true,
					formulae: [formula],
					showErrorMessage: spec.warnOnMismatch !== false,
					errorTitle: spec.errorTitle,
					error: spec.error,
					// 'warning' rather than 'stop' so pasting many rows is not
					// rejected outright — the import still validates server-side.
					errorStyle: 'warning',
					// Selecting the cell shows this hint (macro-free guidance).
					showInputMessage: Boolean(spec.prompt),
					promptTitle: spec.promptTitle,
					prompt: spec.prompt,
				}
			}

			if (!spec.redHighlight) continue

			const anchor = `${column}${FIRST_DATA_ROW}`
			sheet.addConditionalFormatting({
				ref: `${column}${FIRST_DATA_ROW}:${column}${LAST_DATA_ROW}`,
				rules: [
					{
						type: 'expression',
						formulae: [`AND(${anchor}<>"",COUNTIF(${sheetRef},${anchor})=0)`],
						style: {
							fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
							font: { color: { argb: 'FF9C0006' } },
						},
						priority: 1,
					},
				],
			})
		}
	})
}

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')

	// Categories are database-driven, so the dropdown lists whatever is
	// currently valid rather than a hardcoded set that drifts out of date.
	let categoryQuery = supabase
		.from('coe_calendar_categories')
		.select('code, label, description, default_visible_to_roles')
		.eq('is_active', true)
		.order('sort_order', { ascending: true })

	if (institutionsId) {
		categoryQuery = categoryQuery.eq('institutions_id', institutionsId)
	}

	const { data: categories } = await categoryQuery
	const categoryCodes = (categories || []).map(c => c.code)

	// Programmes are set per event in the app, not through the import sheet.
	// The importer still recognises a "Programmes" column if one is present in
	// a file, so older sheets keep working.

	const wb = new ExcelJS.Workbook()

	// ── Sheet 1: the only sheet the importer reads ──────────────────────
	const dataSheet = wb.addWorksheet('Calendar Events')
	dataSheet.addRow(HEADERS)

	const headerRow = dataSheet.getRow(1)
	headerRow.font = { bold: true }
	headerRow.alignment = { vertical: 'middle', wrapText: true }
	headerRow.height = 28
	headerRow.eachCell(cell => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
	})

	dataSheet.columns = COLUMN_WIDTHS
	dataSheet.views = [{ state: 'frozen', ySplit: 1 }]

	// Dates display in the format the header advertises.
	dataSheet.getColumn(3).numFmt = 'dd-mm-yyyy'
	dataSheet.getColumn(4).numFmt = 'dd-mm-yyyy'

	applyValidations(wb, dataSheet, [
		{
			columns: ['A'],
			values: categoryCodes,
			errorTitle: 'Invalid Category',
			error: 'Select a category code from the dropdown',
			redHighlight: true,
		},
		{
			columns: ['F'],
			values: AUDIENCE_OPTIONS,
			errorTitle: 'Check Visible To',
			error: 'Pick a tag, or type several separated by commas — e.g. TEACHING, ACCOUNTS.',
			// Combinations are legitimate input, so neither the red highlight
			// nor the mismatch prompt should fire on them.
			redHighlight: false,
			warnOnMismatch: false,
			promptTitle: 'Who can see this event?',
			prompt: 'Pick a single tag or a ready-made combination from the dropdown. '
				+ 'For any other mix, type the tags separated by commas — e.g. '
				+ 'TEACHING, ACCOUNTS. Use ALL on its own for everyone.',
		},
	])

	// ── Sheet 2: Reference Codes ────────────────────────────────────────
	const refSheet = wb.addWorksheet('Reference Codes')
	refSheet.addRow(['Type', 'Code', 'Name/Description'])
	refSheet.getRow(1).font = { bold: true }

	const section = (title: string) => {
		const row = refSheet.addRow([`═══ ${title} ═══`, '', ''])
		row.font = { bold: true }
	}

	section('CATEGORY')
	for (const cat of categories || []) {
		refSheet.addRow(['Category', cat.code, cat.description || cat.label])
	}

	section('VISIBLE TO — REQUIRED')
	for (const tag of COE_ROLE_TAGS) {
		refSheet.addRow(['Visible To', tag, COE_ROLE_TAG_CONFIG[tag].description])
	}
	refSheet.addRow(['Rule', 'Required', 'Every row must name at least one audience'])
	refSheet.addRow(['Rule', 'Multiple allowed', 'Comma-separate, e.g. TEACHING, ADMINISTRATIVE'])
	refSheet.addRow(['Rule', 'ALL', 'Stands alone — means everyone, cannot be combined'])
	refSheet.addRow(['Tip', 'One-click combos', 'The dropdown includes ready-made combinations — pick one directly'])
	refSheet.addRow(['Tip', 'Custom mix', 'Type tags separated by commas — e.g. TEACHING, ACCOUNTS'])

	section('VISIBLE TO — READY-MADE COMBINATIONS')
	for (const combo of COMMON_AUDIENCE_COMBOS) {
		refSheet.addRow(['Combination', combo, 'In the dropdown — no typing needed'])
	}

	section('GENERAL')
	refSheet.addRow(['Date Format', DATE_FORMAT_HINT, 'e.g. 03-02-2026 — also accepts 03/02/2026 and real Excel dates'])
	refSheet.addRow(['Sheet', 'Calendar Events', 'Only this sheet is imported — enter your rows there'])
	refSheet.addRow(['Required', '*', 'Columns marked * in the header must be filled'])
	refSheet.addRow(['Columns', 'Matched by name', 'Order can be changed and extra columns are ignored'])
	refSheet.addRow(['Programme level', 'BOTH', 'Imported events apply to UG and PG — change per event in the app'])
	refSheet.addRow(['Re-import', 'Safe', 'Rows matching category + title + start date are updated, not duplicated'])

	refSheet.columns = [{ width: 26 }, { width: 40 }, { width: 66 }]

	const buffer = await wb.xlsx.writeBuffer()

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="coe-calendar-template.xlsx"',
		},
	})
}
