import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'
import { parseRoleTags, COE_ROLE_TAGS, type CoeRoleTag } from '@/lib/coe-calendar/visibility'
import { PROGRAMME_TYPES, mapCalendarDbError, parseProgramCodes } from '@/lib/coe-calendar/validate'
import { fetchInstitutionPrograms } from '@/lib/coe-calendar/programs'

/**
 * True only for a real calendar date. Guards against impossible values such as
 * month 27 or 31 February reaching Postgres, which otherwise fails the whole
 * batch with an opaque "date/time field value out of range" (SQLSTATE 22008).
 */
function isRealDate(y: number, m: number, d: number): boolean {
	if (m < 1 || m > 12 || d < 1 || d > 31) return false
	const dt = new Date(Date.UTC(y, m - 1, d))
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseDate(raw: string | number | Date | undefined): string | null {
	if (!raw) return null

	// exceljs returns a Date for cells formatted as dates
	if (raw instanceof Date) {
		const y = raw.getFullYear()
		const m = String(raw.getMonth() + 1).padStart(2, '0')
		const d = String(raw.getDate()).padStart(2, '0')
		return `${y}-${m}-${d}`
	}

	// Excel serial number
	if (typeof raw === 'number') {
		const excelEpoch = new Date(1899, 11, 30)
		const date = new Date(excelEpoch.getTime() + raw * 86400000)
		const y = date.getFullYear()
		const m = String(date.getMonth() + 1).padStart(2, '0')
		const d = String(date.getDate()).padStart(2, '0')
		return `${y}-${m}-${d}`
	}

	const str = String(raw).trim()

	// DD-MM-YYYY / DD.MM.YYYY / DD/MM/YYYY
	const match = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
	if (match) {
		const d = Number(match[1])
		const m = Number(match[2])
		const y = Number(match[3])
		if (!isRealDate(y, m, d)) return null
		return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
	}

	// ISO YYYY-MM-DD — still validated, so a typo like "2026-27-20" is rejected
	// here with a clear per-row message instead of blowing up the DB insert.
	const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (iso) {
		const y = Number(iso[1])
		const m = Number(iso[2])
		const d = Number(iso[3])
		if (!isRealDate(y, m, d)) return null
		return str
	}

	return null
}

function cellText(value: unknown): string {
	if (value == null) return ''
	// exceljs yields objects for rich text and formula cells
	if (typeof value === 'object') {
		const obj = value as { text?: string; result?: unknown; richText?: { text: string }[] }
		if (Array.isArray(obj.richText)) return obj.richText.map(r => r.text).join('').trim()
		if (typeof obj.text === 'string') return obj.text.trim()
		if (obj.result != null) return String(obj.result).trim()
		return ''
	}
	return String(value).trim()
}

/**
 * Column matching is by header name, not position.
 *
 * The template's column set changes as the module grows — dropping the
 * UG/PG/BOTH level column, adding Programmes — and positional parsing turns
 * every such change into a silent mis-mapping of everyone's saved files.
 * Matching on names lets old and new layouts import side by side, tolerates
 * reordering, and ignores extra columns (so an exported file re-imports as-is).
 */
const HEADER_ALIASES: Record<string, string[]> = {
	programme_type: ['programme', 'program', 'programme type', 'program type', 'level'],
	exam_category: ['category', 'exam category', 'category code'],
	event_title: ['event title', 'title', 'event'],
	event_start_date: ['from date', 'from', 'start date', 'start'],
	event_end_date: ['to date', 'to', 'end date', 'end'],
	event_description: ['description', 'desc', 'details'],
	visible_to_roles: ['visible to', 'audience', 'visible'],
	program_codes: ['programmes', 'programs', 'programme codes', 'program codes'],
}

const REQUIRED_COLUMNS = ['exam_category', 'event_title', 'event_start_date', 'event_end_date']

/**
 * One tick column per audience — Excel list validation is single-select, so
 * multi-select is expressed as a Yes/No column per tag.
 */
const AUDIENCE_COLUMN_ALIASES: Record<CoeRoleTag, string[]> = {
	ALL: ['all', 'everyone'],
	LEARNERS: ['learners', 'learner', 'students'],
	TEACHING: ['teaching', 'teaching staff', 'faculty'],
	NON_TEACHING: ['non teaching', 'non teaching staff'],
	ADMINISTRATIVE: ['administrative', 'admin', 'administration'],
	MANAGEMENT: ['management'],
	ACCOUNTS: ['accounts', 'finance'],
	COE_OFFICE: ['coe office', 'coe'],
}

const TICK_TRUE = new Set(['yes', 'y', 'true', '1', 'x', '✓', '✔'])
const TICK_FALSE = new Set(['no', 'n', 'false', '0', '-'])

function normaliseHeader(value: string): string {
	return value
		.toLowerCase()
		// Drop bracketed hints such as "From Date * (DD-MM-YYYY)" so the header
		// can carry guidance without breaking the match.
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\*/g, '')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function mapAudienceColumns(headerRow: unknown[]): Partial<Record<CoeRoleTag, number>> {
	const map: Partial<Record<CoeRoleTag, number>> = {}
	headerRow.forEach((cell, index) => {
		const header = normaliseHeader(cellText(cell))
		if (!header) return
		for (const [tag, aliases] of Object.entries(AUDIENCE_COLUMN_ALIASES) as [CoeRoleTag, string[]][]) {
			if (map[tag] === undefined && aliases.includes(header)) {
				map[tag] = index
			}
		}
	})
	return map
}

function mapHeaders(headerRow: unknown[]): Record<string, number> {
	const map: Record<string, number> = {}
	headerRow.forEach((cell, index) => {
		const header = normaliseHeader(cellText(cell))
		if (!header) return
		for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
			if (map[field] === undefined && aliases.includes(header)) {
				map[field] = index
			}
		}
	})
	return map
}

interface CalendarRow {
	institutions_id: string
	academic_year: string
	programme_type: string
	exam_category: string
	event_title: string
	event_description: string | null
	event_start_date: string
	event_end_date: string
	visible_to_roles: CoeRoleTag[]
	program_codes: string[] | null
	status: string
	is_bulk_uploaded: boolean
}

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const formData = await request.formData()
	const file = formData.get('file') as File | null

	// Accept the context from either the form body or the query string — the
	// page posts multipart, and the year must not silently default (it used to
	// stamp every import 2025-2026 regardless of the year being imported).
	const institutionsId =
		(formData.get('institutions_id') as string | null) || searchParams.get('institutions_id')
	const academicYear =
		(formData.get('academic_year') as string | null) || searchParams.get('academic_year')

	if (!institutionsId) {
		return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
	}
	if (!academicYear || !/^\d{4}-\d{4}$/.test(academicYear)) {
		return NextResponse.json(
			{ error: 'academic_year is required and must look like 2025-2026' },
			{ status: 400 },
		)
	}
	if (!file) {
		return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
	}

	// Categories are data now, so the valid set comes from the database rather
	// than a hardcoded list that drifts. Scoped to the target institution, since
	// each institution owns its own categories (same code, different rows).
	const { data: categoryRows, error: categoryError } = await supabase
		.from('coe_calendar_categories')
		.select('code')
		.eq('is_active', true)
		.eq('institutions_id', institutionsId)

	if (categoryError) {
		console.error('coe_calendar bulk-upload category fetch error:', categoryError)
		return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
	}

	const validCategoryCodes = new Set((categoryRows || []).map(c => c.code))
	const validCategories = Array.from(validCategoryCodes)

	const programs = await fetchInstitutionPrograms(supabase, institutionsId)
	const programsByUpper = new Map(programs.map(p => [p.program_code.toUpperCase(), p.program_code]))
	const validProgramCodes = programs.map(p => p.program_code)

	const arrayBuffer = await file.arrayBuffer()
	const wb = new ExcelJS.Workbook()
	await wb.xlsx.load(arrayBuffer)
	const sheet = wb.worksheets[0]
	if (!sheet) {
		return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 })
	}

	// eachRow SKIPS blank rows, so a positional index drifts out of sync with
	// the spreadsheet as soon as the user leaves a gap. Carry the real row
	// number through, or every error after a blank row points at the wrong line.
	const rows: { number: number; values: unknown[] }[] = []
	sheet.eachRow((row) => {
		// row.values is 1-indexed; slice to normalise
		const vals = Array.isArray(row.values) ? row.values.slice(1) : []
		rows.push({ number: row.number, values: vals as unknown[] })
	})

	if (rows.length < 2) {
		return NextResponse.json({ error: 'File has no data rows' }, { status: 400 })
	}

	const cols = mapHeaders(rows[0].values)
	const audienceCols = mapAudienceColumns(rows[0].values)
	const missing = REQUIRED_COLUMNS.filter(field => cols[field] === undefined)
	if (missing.length > 0) {
		const labels = missing.map(f => HEADER_ALIASES[f][0])
		return NextResponse.json(
			{
				error: `Missing required column(s): ${labels.join(', ')}. Download the template for the expected headers.`,
			},
			{ status: 400 },
		)
	}

	const errors: string[] = []
	const toInsert: CalendarRow[] = []
	// Natural key -> first sheet row that used it. Postgres rejects an upsert
	// whose conflict target repeats inside one statement, so in-file duplicates
	// must be caught here rather than surfacing as an opaque database error.
	const seen = new Map<string, number>()

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i].values
		const rowNo = rows[i].number
		if (!row || row.every(cell => !cell)) continue

		const at = (field: string): unknown =>
			cols[field] === undefined ? undefined : row[cols[field]]

		const category = at('exam_category')
		const title = at('event_title')
		const fromDate = at('event_start_date')
		const toDate = at('event_end_date')
		const description = at('event_description')
		const visibleTo = at('visible_to_roles')
		const programmes = at('program_codes')

		const eventTitle = cellText(title)
		if (!eventTitle) {
			errors.push(`Row ${rowNo}: Event title is required`)
			continue
		}

		const cat = cellText(category).toUpperCase().replace(/[\s-]+/g, '_')
		if (!validCategoryCodes.has(cat)) {
			errors.push(`Row ${rowNo}: Invalid category "${cellText(category)}". Must be one of: ${validCategories.join(', ')}`)
			continue
		}

		// The level column was dropped from the template; when it is absent (or
		// blank in an older file) an event applies to both UG and PG.
		const programmeRaw = cellText(at('programme_type'))
		const prog = programmeRaw ? programmeRaw.toUpperCase() : 'BOTH'
		if (!(PROGRAMME_TYPES as readonly string[]).includes(prog)) {
			errors.push(`Row ${rowNo}: Invalid programme "${programmeRaw}". Must be UG, PG, or BOTH`)
			continue
		}

		const startDate = parseDate(fromDate as string | number | Date)
		const endDate = parseDate(toDate as string | number | Date)

		if (!startDate) {
			errors.push(`Row ${rowNo}: Invalid From Date "${cellText(fromDate)}". Use DD-MM-YYYY format`)
			continue
		}
		if (!endDate) {
			errors.push(`Row ${rowNo}: Invalid To Date "${cellText(toDate)}". Use DD-MM-YYYY format`)
			continue
		}
		// Previously unchecked — the database CHECK fired mid-insert and failed
		// the whole batch with no indication of which row was at fault.
		if (endDate < startDate) {
			errors.push(`Row ${rowNo}: To Date (${cellText(toDate)}) is before From Date (${cellText(fromDate)})`)
			continue
		}

		// Audience: tick columns first, falling back to a legacy single
		// "Visible To" cell so older sheets keep importing.
		const ticked: CoeRoleTag[] = []
		let badTick: string | null = null

		for (const [tag, idx] of Object.entries(audienceCols) as [CoeRoleTag, number][]) {
			const raw = cellText(row[idx])
			if (!raw) continue
			const value = raw.toLowerCase()
			if (TICK_TRUE.has(value)) ticked.push(tag)
			else if (!TICK_FALSE.has(value)) badTick = `${tag} = "${raw}"`
		}

		if (badTick) {
			errors.push(`Row ${rowNo}: Invalid tick value ${badTick}. Use Yes or No`)
			continue
		}

		const visibleRaw = cellText(visibleTo)
		let tags: CoeRoleTag[]

		if (ticked.length > 0) {
			// parseRoleTags collapses ALL + others down to ALL, matching the
			// database CHECK and the picker in the app.
			tags = parseRoleTags(ticked)!
		} else if (visibleRaw) {
			const parsed = parseRoleTags(visibleRaw)
			if (!parsed) {
				errors.push(`Row ${rowNo}: Invalid Visible To "${visibleRaw}". Use one or more of: ${COE_ROLE_TAGS.join(', ')}`)
				continue
			}
			tags = parsed
		} else {
			errors.push(`Row ${rowNo}: Visible To is required — set Yes on at least one audience column`)
			continue
		}

		// Blank = every programme. Codes are checked against this institution's
		// master list and rewritten to its casing before insert.
		const programmesRaw = cellText(programmes)
		let resolvedPrograms: string[] | null = null
		if (programmesRaw) {
			const requested = parseProgramCodes(programmesRaw)
			const unknown = (requested || []).filter(c => !programsByUpper.has(c.toUpperCase()))
			if (unknown.length > 0) {
				errors.push(`Row ${rowNo}: Unknown programme code(s) "${unknown.join(', ')}". Valid codes: ${validProgramCodes.join(', ') || 'none configured'}`)
				continue
			}
			resolvedPrograms = (requested || []).map(c => programsByUpper.get(c.toUpperCase())!)
		}

		const naturalKey = [institutionsId, academicYear, cat, eventTitle, startDate].join('|')
		const firstSeen = seen.get(naturalKey)
		if (firstSeen) {
			errors.push(`Row ${rowNo}: Duplicate of row ${firstSeen} (same category, title and start date)`)
			continue
		}
		seen.set(naturalKey, rowNo)

		toInsert.push({
			institutions_id: institutionsId,
			// institution_code / myjkkn_institution_ids are filled by trigger
			academic_year: academicYear,
			programme_type: prog,
			exam_category: cat,
			event_title: eventTitle,
			event_description: cellText(description) || null,
			event_start_date: startDate,
			event_end_date: endDate,
			visible_to_roles: tags,
			program_codes: resolvedPrograms,
			status: 'ACTIVE',
			is_bulk_uploaded: true,
		})
	}

	if (errors.length > 0) {
		return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
	}

	if (toInsert.length === 0) {
		return NextResponse.json({ error: 'No valid rows found in file' }, { status: 400 })
	}

	// Upsert on the natural key so re-importing a corrected sheet updates rows
	// instead of duplicating them.
	const { data, error } = await supabase
		.from('coe_calendar')
		.upsert(toInsert, {
			onConflict: 'institutions_id,academic_year,exam_category,event_title,event_start_date',
		})
		.select()

	if (error) {
		const mapped = mapCalendarDbError(error)
		if (mapped.status === 500) console.error('coe_calendar bulk-upload error:', error)
		return NextResponse.json({ error: mapped.message }, { status: mapped.status })
	}

	return NextResponse.json({
		success: true,
		inserted: data?.length || 0,
		total: toInsert.length,
	}, { status: 201 })
}
