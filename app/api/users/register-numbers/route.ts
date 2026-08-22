import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Register numbers issued to learners by the CoE.
 *
 * GET    — list the numbers already issued, scoped to an institution and
 *          optionally narrowed to a program + semester cohort.
 * DELETE — release issued numbers, either by row id or for a whole cohort,
 *          so the cohort can be re-generated.
 *
 * MyJKKN owns learner profiles and is read-only from COE, so this table is
 * the only place an issued number exists.
 */

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const programCode = searchParams.get('program_code')
		// Cohorts are keyed by semester_code — semester_id is null on older
		// course_mapping rows and cannot identify a cohort on its own.
		const semesterCode = searchParams.get('semester_code')
		const search = searchParams.get('search')

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		let query = supabase
			.from('learner_register_numbers')
			.select('*', { count: 'exact' })
			.eq('institutions_id', institutionsId)
			// serial_no is unique within a cohort but repeats across cohorts, so id
			// is added as a tiebreaker — a non-unique sort key silently duplicates
			// and skips rows once the result set spans pages.
			.order('serial_no', { ascending: true })
			.order('id', { ascending: true })
			.range(0, 9999)

		if (programCode) query = query.eq('program_code', programCode)
		if (semesterCode) query = query.eq('semester_code', semesterCode)
		if (search) {
			query = query.or(
				`register_number.ilike.%${search}%,learner_name.ilike.%${search}%,roll_number.ilike.%${search}%`
			)
		}

		const { data, error, count } = await query

		if (error) {
			// The table ships with this feature's migration; surface a clear hint
			// rather than a bare Postgres error when it hasn't been applied yet.
			if (error.code === '42P01') {
				return NextResponse.json(
					{
						error: 'Table learner_register_numbers does not exist',
						hint: 'Run supabase/migrations/20260821_create_learner_register_numbers.sql in the Supabase SQL Editor.',
					},
					{ status: 404 }
				)
			}
			console.error('[register-numbers] list error:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ data: data || [], count: count ?? (data?.length || 0) })
	} catch (err) {
		console.error('[register-numbers] unexpected GET error:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)

		// Accept the payload either as a JSON body or as query params — DELETE with
		// a body is legal but awkward for some callers.
		let body: Record<string, unknown> = {}
		try {
			body = await request.json()
		} catch {
			body = {}
		}

		const ids: string[] = Array.isArray(body.ids)
			? (body.ids as string[])
			: (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean)

		const institutionsId = (body.institutions_id as string) || searchParams.get('institutions_id') || ''
		const programCode = (body.program_code as string) || searchParams.get('program_code') || ''
		const semesterCode = (body.semester_code as string) || searchParams.get('semester_code') || ''

		const supabase = getSupabaseServer()

		if (ids.length > 0) {
			// Scope the id delete to the institution too, so a stray id from another
			// tenant can't be removed through this endpoint.
			if (!institutionsId) {
				return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
			}
			const { data, error } = await supabase
				.from('learner_register_numbers')
				.delete()
				.eq('institutions_id', institutionsId)
				.in('id', ids)
				.select('id')

			if (error) {
				console.error('[register-numbers] delete by id error:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}
			return NextResponse.json({ success: true, deleted: data?.length || 0 })
		}

		// Cohort delete — require the full cohort key so a mis-typed request can't
		// wipe every register number in an institution.
		if (!institutionsId || !programCode || !semesterCode) {
			return NextResponse.json(
				{ error: 'Provide ids, or institutions_id + program_code + semester_code to clear a cohort' },
				{ status: 400 }
			)
		}

		const { data, error } = await supabase
			.from('learner_register_numbers')
			.delete()
			.eq('institutions_id', institutionsId)
			.eq('program_code', programCode)
			.eq('semester_code', semesterCode)
			.select('id')

		if (error) {
			console.error('[register-numbers] cohort delete error:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ success: true, deleted: data?.length || 0 })
	} catch (err) {
		console.error('[register-numbers] unexpected DELETE error:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
