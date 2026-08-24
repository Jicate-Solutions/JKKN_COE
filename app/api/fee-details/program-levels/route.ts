import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { PROGRAM_LEVELS } from '@/lib/exam-fee-catalog'

// =====================================================
// Programme Fee Tier API
// /api/fee-details/program-levels
//
// Maps a programme code to the exam fee tier (UG / PG / MCA) its papers are
// priced at. Without a row here the fee engine falls back to the UG/PG
// heuristic in lib/exam-fee/calculate.ts, which cannot see MCA at all — JKKN's
// MCA code is "PCA", indistinguishable from a generic PG code.
// =====================================================

const VALID_LEVELS: string[] = [...PROGRAM_LEVELS]

function normaliseCode(value: unknown): string {
	return String(value || '').trim().toUpperCase()
}

// Validate one mapping line. Returns an error string or null.
function validateLine(line: any): string | null {
	if (!line || typeof line !== 'object') return 'Invalid mapping'
	if (!normaliseCode(line.program_code)) return 'program_code is required'
	if (!VALID_LEVELS.includes(line.program_level))
		return `program_level must be one of ${VALID_LEVELS.join(', ')}`
	return null
}

// =====================================================
// GET — list mappings for an institution
//   ?institutions_id=  &is_active=
// Rows are enriched with program_name from the programs master so the UI does
// not have to hold the whole programme list to render a name.
// =====================================================
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const isActive = searchParams.get('is_active')

	try {
		let query = supabase
			.from('exam_fee_program_levels')
			.select('*')
			.order('program_code', { ascending: true })
			.range(0, 9999)

		if (institutionsId) query = query.eq('institutions_id', institutionsId)
		if (isActive !== null && isActive !== undefined) query = query.eq('is_active', isActive === 'true')

		const { data, error } = await query

		if (error) {
			console.error('Program fee tier fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch programme fee tiers' }, { status: 500 })
		}

		const rows = data || []
		if (rows.length === 0) return NextResponse.json([])

		// Enrich with programme names
		const codes = [...new Set(rows.map((r) => r.program_code).filter(Boolean))]
		const nameByCode = new Map<string, string>()

		for (let i = 0; i < codes.length; i += 500) {
			const batch = codes.slice(i, i + 500)
			const { data: programs, error: programError } = await supabase
				.from('programs')
				.select('program_code, program_name')
				.in('program_code', batch)

			if (programError) {
				// A missing name is cosmetic — never fail the listing over it
				console.error('Program name lookup error:', programError)
				break
			}
			for (const p of programs || []) {
				if (p.program_code) nameByCode.set(normaliseCode(p.program_code), p.program_name)
			}
		}

		return NextResponse.json(
			rows.map((r) => ({
				...r,
				program_name: nameByCode.get(normaliseCode(r.program_code)) || null,
			}))
		)
	} catch (error) {
		console.error('Program fee tier fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch programme fee tiers' }, { status: 500 })
	}
}

// =====================================================
// POST — create one or many mappings
//   Accepts a single object or { items: [...] }.
//   Re-using the same (institution, program_code) updates the tier.
// =====================================================
export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const rawLines: any[] = Array.isArray(body?.items) ? body.items : [body]

		if (rawLines.length === 0) {
			return NextResponse.json({ error: 'No programmes provided' }, { status: 400 })
		}

		const institutionsId = body.institutions_id || rawLines[0]?.institutions_id
		if (!institutionsId) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}

		// Validate all before inserting any
		const rows = []
		const seen = new Set<string>()

		for (let i = 0; i < rawLines.length; i++) {
			const line = { ...rawLines[i] }

			const err = validateLine(line)
			if (err) {
				return NextResponse.json({ error: `Line ${i + 1}: ${err}` }, { status: 400 })
			}

			const programCode = normaliseCode(line.program_code)
			if (seen.has(programCode)) {
				return NextResponse.json(
					{ error: `Line ${i + 1}: ${programCode} appears more than once` },
					{ status: 400 }
				)
			}
			seen.add(programCode)

			rows.push({
				institutions_id: line.institutions_id || institutionsId,
				institution_code: line.institution_code || body.institution_code || null,
				program_code: programCode,
				program_level: line.program_level,
				notes: line.notes || null,
				is_active: line.is_active !== undefined ? line.is_active : true,
			})
		}

		const { data, error } = await supabase
			.from('exam_fee_program_levels')
			.upsert(rows, { onConflict: 'institutions_id,program_code' })
			.select()

		if (error) {
			console.error('Program fee tier create error:', error)
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid institution reference' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to save programme fee tiers' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Program fee tier create error:', error)
		return NextResponse.json({ error: 'Failed to save programme fee tiers' }, { status: 500 })
	}
}

// =====================================================
// PUT — update a mapping by id
//   The institution and programme identify the row; only the tier, notes and
//   active flag are editable. Re-pointing a different programme is an add.
// =====================================================
export async function PUT(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const { id } = body

		if (!id) {
			return NextResponse.json({ error: 'Mapping id is required' }, { status: 400 })
		}

		const updateData: Record<string, unknown> = {}

		if (body.program_level !== undefined) {
			if (!VALID_LEVELS.includes(body.program_level)) {
				return NextResponse.json(
					{ error: `program_level must be one of ${VALID_LEVELS.join(', ')}` },
					{ status: 400 }
				)
			}
			updateData.program_level = body.program_level
		}
		if (body.notes !== undefined) updateData.notes = body.notes
		if (body.is_active !== undefined) updateData.is_active = body.is_active

		if (Object.keys(updateData).length === 0) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_fee_program_levels')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Program fee tier update error:', error)
			return NextResponse.json({ error: 'Failed to update programme fee tier' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Program fee tier update error:', error)
		return NextResponse.json({ error: 'Failed to update programme fee tier' }, { status: 500 })
	}
}

// =====================================================
// DELETE — remove a mapping by id (?id=)
//   The programme then falls back to the UG/PG heuristic.
// =====================================================
export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'Mapping id is required' }, { status: 400 })
	}

	try {
		const { error } = await supabase.from('exam_fee_program_levels').delete().eq('id', id)

		if (error) {
			console.error('Program fee tier delete error:', error)
			return NextResponse.json({ error: 'Failed to delete programme fee tier' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Program fee tier delete error:', error)
		return NextResponse.json({ error: 'Failed to delete programme fee tier' }, { status: 500 })
	}
}
