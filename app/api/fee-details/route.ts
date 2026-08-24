import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	findCategory,
	findSubCategory,
	CALC_BASIS_LABELS,
	PROGRAM_LEVELS,
	type CalcBasis,
} from '@/lib/exam-fee-catalog'

// =====================================================
// Exam Fee Master API
// /api/fee-details
// Institution-wise exam fee configuration (credit + debit),
// versioned by effective_from.
// =====================================================

const FEE_TYPES = ['CREDIT', 'DEBIT']
const VALID_BASES = Object.keys(CALC_BASIS_LABELS) as CalcBasis[]
const VALID_LEVELS: string[] = [...PROGRAM_LEVELS]

// A rate can be scoped to one programme. Empty means the tier rate, which every
// programme at that level falls back to.
function normaliseProgramCode(value: unknown): string | null {
	const code = String(value ?? '').trim().toUpperCase()
	return code || null
}

// Validate a single fee line against the catalog. Returns an error string or null.
function validateFeeLine(line: any): string | null {
	if (!line || typeof line !== 'object') return 'Invalid fee line'

	if (!FEE_TYPES.includes(line.fee_type)) return 'fee_type must be CREDIT or DEBIT'

	const category = findCategory(line.category)
	if (!category) return `Unknown category: ${line.category}`
	if (category.feeType !== line.fee_type)
		return `Category ${line.category} does not belong to ${line.fee_type}`

	const sub = findSubCategory(line.category, line.sub_category)
	if (!sub) return `Unknown sub-category: ${line.sub_category}`

	if (!VALID_BASES.includes(line.calc_basis)) return `Invalid charge basis: ${line.calc_basis}`

	if (line.program_level != null && !VALID_LEVELS.includes(line.program_level))
		return `program_level must be one of ${VALID_LEVELS.join(', ')} or empty`

	const programCode = normaliseProgramCode(line.program_code)
	if (programCode && programCode.length > 50) return 'program_code must be 50 characters or fewer'

	const amount = Number(line.amount)
	if (!Number.isFinite(amount) || amount < 0) return 'amount must be a non-negative number'

	if (!line.effective_from) return 'effective_from (w.e.f date) is required'

	return null
}

// =====================================================
// GET — list fee rows (institution-filtered)
//   ?institutions_id=  &fee_type=CREDIT|DEBIT  &category=  &is_active=
// =====================================================
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const feeType = searchParams.get('fee_type')
	const category = searchParams.get('category')
	const programCode = searchParams.get('program_code')
	const isActive = searchParams.get('is_active')

	try {
		let query = supabase
			.from('exam_fee_master')
			.select('*')
			.order('effective_from', { ascending: false })
			.order('created_at', { ascending: false })
			.range(0, 9999)

		if (institutionsId) query = query.eq('institutions_id', institutionsId)
		if (feeType) query = query.eq('fee_type', feeType)
		if (category) query = query.eq('category', category)
		if (programCode) query = query.eq('program_code', programCode.trim().toUpperCase())
		if (isActive !== null && isActive !== undefined) query = query.eq('is_active', isActive === 'true')

		const { data, error } = await query

		if (error) {
			console.error('Exam fee fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch fee details' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Exam fee fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch fee details' }, { status: 500 })
	}
}

// =====================================================
// POST — create one or many fee rows
//   Accepts a single object or { items: [...] }.
//   Re-using the same (institution, fee key, effective_from) upserts the amount.
//   A line naming a programme is stored as its own rate, overriding the tier.
// =====================================================
export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const rawLines: any[] = Array.isArray(body?.items) ? body.items : [body]

		if (rawLines.length === 0) {
			return NextResponse.json({ error: 'No fee lines provided' }, { status: 400 })
		}

		// Institution is required for every line
		const institutionsId = body.institutions_id || rawLines[0]?.institutions_id
		if (!institutionsId) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}

		// Validate all before inserting any
		const rows = []
		for (let i = 0; i < rawLines.length; i++) {
			const line = { ...rawLines[i] }
			line.institutions_id = line.institutions_id || institutionsId
			line.institution_code = line.institution_code || body.institution_code || null

			const err = validateFeeLine(line)
			if (err) {
				return NextResponse.json({ error: `Line ${i + 1}: ${err}` }, { status: 400 })
			}

			const category = findCategory(line.category)!
			const sub = findSubCategory(line.category, line.sub_category)!
			const level = line.program_level || null
			const programCode = normaliseProgramCode(line.program_code)

			rows.push({
				institutions_id: line.institutions_id,
				institution_code: line.institution_code,
				fee_type: line.fee_type,
				category: line.category,
				sub_category: line.sub_category,
				program_level: level,
				program_code: programCode,
				label:
					line.label ||
					[programCode || level || '', category.label, sub.label].filter(Boolean).join(' — '),
				calc_basis: line.calc_basis,
				amount: Number(line.amount),
				currency: line.currency || 'INR',
				effective_from: line.effective_from,
				notes: line.notes || null,
				is_active: line.is_active !== undefined ? line.is_active : true,
				created_by: body.created_by || line.created_by || null,
			})
		}

		const { data, error } = await supabase
			.from('exam_fee_master')
			.upsert(rows, {
				onConflict:
					'institutions_id,fee_type,category,sub_category,program_level,program_code,calc_basis,effective_from',
			})
			.select()

		if (error) {
			console.error('Exam fee create error:', error)
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid institution reference' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to save fee details' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Exam fee create error:', error)
		return NextResponse.json({ error: 'Failed to save fee details' }, { status: 500 })
	}
}

// =====================================================
// PUT — update a single fee row by id
//   Editing amount/effective_from/notes/is_active. Institution and the
//   fee key are immutable (a rate change should be a NEW versioned row).
// =====================================================
export async function PUT(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const { id } = body

		if (!id) {
			return NextResponse.json({ error: 'Fee id is required' }, { status: 400 })
		}

		const updateData: Record<string, unknown> = {}

		if (body.amount !== undefined) {
			const amount = Number(body.amount)
			if (!Number.isFinite(amount) || amount < 0) {
				return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
			}
			updateData.amount = amount
		}
		if (body.effective_from !== undefined) updateData.effective_from = body.effective_from
		if (body.label !== undefined) updateData.label = body.label
		if (body.notes !== undefined) updateData.notes = body.notes
		if (body.is_active !== undefined) updateData.is_active = body.is_active

		if (body.calc_basis !== undefined) {
			if (!VALID_BASES.includes(body.calc_basis)) {
				return NextResponse.json({ error: `Invalid charge basis: ${body.calc_basis}` }, { status: 400 })
			}
			updateData.calc_basis = body.calc_basis
		}

		if (Object.keys(updateData).length === 0) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_fee_master')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Exam fee update error:', error)
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A fee with this key and effective date already exists' },
					{ status: 400 }
				)
			}
			return NextResponse.json({ error: 'Failed to update fee' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Exam fee update error:', error)
		return NextResponse.json({ error: 'Failed to update fee' }, { status: 500 })
	}
}

// =====================================================
// DELETE — remove a fee row by id (?id=)
// =====================================================
export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'Fee id is required' }, { status: 400 })
	}

	try {
		const { error } = await supabase.from('exam_fee_master').delete().eq('id', id)

		if (error) {
			console.error('Exam fee delete error:', error)
			return NextResponse.json({ error: 'Failed to delete fee' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Exam fee delete error:', error)
		return NextResponse.json({ error: 'Failed to delete fee' }, { status: 500 })
	}
}
