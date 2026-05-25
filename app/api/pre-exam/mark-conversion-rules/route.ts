import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET /api/pre-exam/mark-conversion-rules?institutions_id=...&institution_code=...&regulation_code=...&search=...
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const regulationCode = searchParams.get('regulation_code')
		const search = searchParams.get('search')

		const supabase = getSupabaseServer()
		let query = supabase
			.from('mark_conversion_rules')
			.select('*')
			.eq('is_active', true)
			.order('wef_date', { ascending: false })

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (regulationCode) {
			query = query.eq('regulation_code', regulationCode)
		}

		if (search) {
			const s = `%${search}%`
			query = query.or(`rule_name.ilike.${s},description.ilike.${s}`)
		}

		const { data, error } = await query.range(0, 9999)
		if (error) {
			console.error('MCR GET error:', error)
			return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
		}
		return NextResponse.json(data || [])
	} catch (e) {
		console.error('MCR GET exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: create a new rule
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const {
			institutions_id,
			institution_code,
			regulation_id,
			regulation_code,
			wef_date,
			rule_name,
			description,
			attendance_slabs,
			component_rules,
			round_rules,
			final_rule,
			created_by,
		} = body

		// Required fields
		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!wef_date) {
			return NextResponse.json({ error: 'WEF date is required' }, { status: 400 })
		}
		if (!rule_name?.trim()) {
			return NextResponse.json({ error: 'Rule name is required' }, { status: 400 })
		}

		// WEF date must be today or future
		const today = new Date().toISOString().slice(0, 10)
		if (wef_date < today) {
			return NextResponse.json({ error: 'WEF date cannot be in the past' }, { status: 400 })
		}

		// Validate attendance slabs don't overlap
		if (Array.isArray(attendance_slabs) && attendance_slabs.length > 0) {
			const sorted = [...attendance_slabs].sort((a: any, b: any) => a.min_pct - b.min_pct)
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].min_pct <= sorted[i - 1].max_pct) {
					return NextResponse.json(
						{ error: `Attendance slabs overlap near ${sorted[i].min_pct}%` },
						{ status: 400 }
					)
				}
			}
		}

		const supabase = getSupabaseServer()

		// Resolve institution_code from institutions_id if missing
		let resolvedCode = institution_code
		if (!resolvedCode) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institutions_id)
				.single()
			if (!inst) {
				return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
			}
			resolvedCode = inst.institution_code
		}

		// Resolve regulation_id against LOCAL regulations table.
		// The client sends MyJKKN's regulation UUID which won't match the COE table —
		// FK constraint mcr_regulation_fk would fail. Look up by regulation_code and use
		// the local UUID (if it exists); otherwise leave NULL and rely on regulation_code.
		let resolvedRegulationId: string | null = null
		if (regulation_code) {
			const { data: localReg } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', regulation_code)
				.eq('institutions_id', institutions_id)
				.maybeSingle()
			resolvedRegulationId = localReg?.id || null
		}

		const { data, error } = await supabase
			.from('mark_conversion_rules')
			.insert({
				institutions_id,
				institution_code: resolvedCode,
				regulation_id: resolvedRegulationId,
				regulation_code: regulation_code || null,
				wef_date,
				rule_name: rule_name.trim(),
				description: description?.trim() || null,
				attendance_slabs: attendance_slabs || [],
				component_rules: component_rules || {},
				round_rules: round_rules || {},
				final_rule: final_rule || {},
				created_by: created_by || null,
				is_active: true,
			})
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A rule already exists for this institution/regulation/WEF date.' },
					{ status: 400 }
				)
			}
			console.error('MCR POST error:', error)
			return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('MCR POST exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT: update an existing rule
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Never allow scope changes
		delete updateData.institutions_id
		delete updateData.institution_code
		delete updateData.created_by

		if (updateData.wef_date) {
			const today = new Date().toISOString().slice(0, 10)
			if (updateData.wef_date < today) {
				return NextResponse.json({ error: 'WEF date cannot be in the past' }, { status: 400 })
			}
		}

		// Validate slab overlap on update
		if (Array.isArray(updateData.attendance_slabs) && updateData.attendance_slabs.length > 0) {
			const sorted = [...updateData.attendance_slabs].sort((a: any, b: any) => a.min_pct - b.min_pct)
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].min_pct <= sorted[i - 1].max_pct) {
					return NextResponse.json(
						{ error: `Attendance slabs overlap near ${sorted[i].min_pct}%` },
						{ status: 400 }
					)
				}
			}
		}

		if (updateData.rule_name) {
			updateData.rule_name = updateData.rule_name.trim()
		}
		if (updateData.description != null) {
			updateData.description = updateData.description?.trim() || null
		}

		const supabase = getSupabaseServer()

		// Resolve regulation_id against local regulations table — same reasoning as POST.
		// Fetch the existing row's institutions_id to constrain the regulation lookup.
		if ('regulation_id' in updateData || 'regulation_code' in updateData) {
			const { data: existing } = await supabase
				.from('mark_conversion_rules')
				.select('institutions_id')
				.eq('id', id)
				.maybeSingle()

			if (existing?.institutions_id && updateData.regulation_code) {
				const { data: localReg } = await supabase
					.from('regulations')
					.select('id')
					.eq('regulation_code', updateData.regulation_code)
					.eq('institutions_id', existing.institutions_id)
					.maybeSingle()
				updateData.regulation_id = localReg?.id || null
			} else if (!updateData.regulation_code) {
				updateData.regulation_id = null
			}
		}

		const { data, error } = await supabase
			.from('mark_conversion_rules')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('MCR PUT error:', error)
			return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('MCR PUT exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE: soft-delete if referenced, hard-delete otherwise
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')
		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Check references
		const { data: refs } = await supabase
			.from('cia_entry_settings')
			.select('id')
			.eq('conversion_rule_id', id)
			.limit(1)
		const { data: snaps } = await supabase
			.from('internal_marks')
			.select('id')
			.eq('rule_snapshot_id', id)
			.limit(1)

		if ((refs && refs.length) || (snaps && snaps.length)) {
			// Soft-delete: preserve snapshots
			const { error } = await supabase
				.from('mark_conversion_rules')
				.update({ is_active: false })
				.eq('id', id)
			if (error) {
				return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 })
			}
			return NextResponse.json({ success: true, deactivated: true })
		}

		const { error } = await supabase
			.from('mark_conversion_rules')
			.delete()
			.eq('id', id)
		if (error) {
			return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
		}
		return NextResponse.json({ success: true, deactivated: false })
	} catch (e) {
		console.error('MCR DELETE exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
