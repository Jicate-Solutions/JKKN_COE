import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSupabaseServer } from '@/lib/supabase-server'
import { parseRoleTags, toFilterTags } from '@/lib/coe-calendar/visibility'
import { csv, sanitizeSearch, searchFilter } from '@/lib/coe-calendar/validate'

/**
 * GET /api/coe-calendar/export
 *
 * Exports the calendar as .xlsx, honouring the same filters as the list
 * endpoint. The export sheet uses the same column order as the import
 * template, so an exported file can be edited and re-uploaded directly.
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const academicYear = searchParams.get('academic_year')
	const categories = csv(searchParams.get('exam_category'))
	const programmeType = searchParams.get('programme_type')
	const status = searchParams.get('status') || 'ACTIVE'
	const rolesParam = searchParams.get('roles')
	const from = searchParams.get('from')
	const to = searchParams.get('to')
	const search = searchParams.get('search')?.trim()

	let query = supabase.from('coe_calendar').select('*')

	if (institutionsId) query = query.eq('institutions_id', institutionsId)
	if (academicYear) query = query.eq('academic_year', academicYear)
	if (categories.length) query = query.in('exam_category', categories)
	if (programmeType) query = query.eq('programme_type', programmeType)
	if (status !== 'ALL') query = query.eq('status', status)

	if (rolesParam) {
		const tags = parseRoleTags(rolesParam)
		if (!tags) return NextResponse.json({ error: 'Invalid roles filter' }, { status: 400 })
		query = query.overlaps('visible_to_roles', toFilterTags(tags))
	}

	if (to) query = query.lte('event_start_date', to)
	if (from) query = query.gte('event_end_date', from)
	// Title OR description, matching what the table's client-side filter does —
	// otherwise a description-only match is visible on screen but missing here.
	if (search && sanitizeSearch(search)) query = query.or(searchFilter(search))

	const { data, error } = await query
		.order('event_start_date', { ascending: true })
		.order('id', { ascending: true })
		.range(0, 9999)

	if (error) {
		console.error('coe_calendar export error:', error)
		return NextResponse.json({ error: 'Failed to export calendar' }, { status: 500 })
	}

	const wb = new ExcelJS.Workbook()
	const sheet = wb.addWorksheet('COE Calendar')

	// Same column order as the import template so a round-trip works — the
	// importer reads positionally and ignores anything past column H.
	sheet.addRow([
		'Programme', 'Category', 'Event Title', 'From Date', 'To Date',
		'Description', 'Visible To', 'Programmes', 'Academic Year', 'Status', 'Institution',
	])
	sheet.getRow(1).font = { bold: true }

	const toDdMmYyyy = (iso: string) => {
		const [y, m, d] = iso.split('-')
		return `${d}-${m}-${y}`
	}

	for (const row of data || []) {
		sheet.addRow([
			row.programme_type,
			row.exam_category,
			row.event_title,
			toDdMmYyyy(row.event_start_date),
			toDdMmYyyy(row.event_end_date),
			row.event_description || '',
			Array.isArray(row.visible_to_roles) ? row.visible_to_roles.join(', ') : '',
			// Blank means every programme — matches how the importer reads it.
			Array.isArray(row.program_codes) ? row.program_codes.join(', ') : '',
			row.academic_year,
			row.status,
			row.institution_code || '',
		])
	}

	sheet.columns = [
		{ width: 12 }, { width: 18 }, { width: 42 }, { width: 14 }, { width: 14 },
		{ width: 32 }, { width: 34 }, { width: 30 }, { width: 15 }, { width: 10 }, { width: 14 },
	]

	const buffer = await wb.xlsx.writeBuffer()
	const stamp = academicYear || 'all'

	return new NextResponse(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="coe-calendar-${stamp}.xlsx"`,
		},
	})
}
