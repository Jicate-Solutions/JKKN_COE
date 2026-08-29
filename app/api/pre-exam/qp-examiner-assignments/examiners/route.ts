// Eligible question-paper setters for the assignment screen.
//
// GET /api/pre-exam/qp-examiner-assignments/examiners?kind=external|internal&...
//
// external — the Examiner Panel (`examiners`), narrowed to ACTIVE rows whose
//            willingness_roles include "Question Paper Setter" (spec §3).
// internal — MyJKKN staff of the institution (the same source as
//            /exam-management/examiners/internal), each flagged with whether an
//            `examiners` mirror row already exists so the picker can say so.
//
// Both kinds come back in one shape (QpExaminerOption) so the UI renders one
// table regardless of which tab is open.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNStaff } from '@/services/myjkkn-service'
import { QP_SETTER_ROLE, type QpExaminerOption } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'

/** Live assignments per examiner in a session — shown as a workload hint. */
async function assignmentCounts(
	supabase: any,
	institutionsId: string,
	sessionId: string | null
): Promise<Map<string, number>> {
	let q = supabase
		.from('ia_qp_assignments')
		.select('examiner_id')
		.eq('institutions_id', institutionsId)
		.neq('status', 'cancelled')
	if (sessionId) q = q.eq('examination_session_id', sessionId)

	const { data, error } = await q
	if (error) {
		console.error('[QP assign] workload count failed:', error.message)
		return new Map()
	}
	const counts = new Map<string, number>()
	for (const row of data || []) {
		counts.set(row.examiner_id, (counts.get(row.examiner_id) || 0) + 1)
	}
	return counts
}

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const kind = searchParams.get('kind') === 'internal' ? 'internal' : 'external'
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const search = (searchParams.get('search') || '').trim().toLowerCase()

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const counts = await assignmentCounts(supabase, institutionsId, sessionId)

		// ── External: the examiner panel ──────────────────────────────────────
		if (kind === 'external') {
			const { data, error } = await supabase
				.from('examiners')
				.select(
					'id, full_name, email, mobile, designation, department, institution_name, willingness_roles, status, institution_id, is_internal'
				)
				.eq('status', 'ACTIVE')
				.order('full_name', { ascending: true })
				.range(0, 4999)

			if (error) {
				console.error('[QP assign] examiner fetch failed:', error.message)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			const options: QpExaminerOption[] = (data || [])
				// The willingness role is the eligibility rule from the spec. Rows are
				// filtered here rather than with a Postgres array operator so a row
				// storing the role with different spacing/case still matches.
				.filter(e =>
					(e.willingness_roles || []).some(
						(r: string) => String(r).trim().toLowerCase() === QP_SETTER_ROLE.toLowerCase()
					)
				)
				// An internal staff member mirrored by a previous assignment must not
				// reappear in the external list — they belong to the Internal tab.
				.filter(e => !e.is_internal)
				.filter(e =>
					!search ||
					e.full_name?.toLowerCase().includes(search) ||
					e.email?.toLowerCase().includes(search) ||
					e.department?.toLowerCase().includes(search) ||
					e.institution_name?.toLowerCase().includes(search)
				)
				.map(e => ({
					id: e.id,
					kind: 'external' as const,
					full_name: e.full_name,
					email: e.email,
					mobile: e.mobile,
					designation: e.designation,
					department: e.department,
					institution_name: e.institution_name,
					willingness_roles: e.willingness_roles,
					status: e.status,
					active_assignments: counts.get(e.id) || 0,
				}))

			return NextResponse.json({ kind, data: options, count: options.length })
		}

		// ── Internal: MyJKKN staff of this institution ────────────────────────
		const { data: institution } = await supabase
			.from('institutions')
			.select('id, institution_code, myjkkn_institution_ids')
			.eq('id', institutionsId)
			.maybeSingle()

		// Use myjkkn_institution_ids directly — no two-step lookup — and filter
		// client-side, because MyJKKN's server-side institution filter is unreliable.
		const myjkknIds: string[] = institution?.myjkkn_institution_ids || []

		let staff: any[] = []
		try {
			staff = (await fetchAllMyJKKNStaff({ all: true, is_active: true })) as any[]
		} catch (e: any) {
			console.error('[QP assign] MyJKKN staff fetch failed:', e?.message || e)
			return NextResponse.json(
				{ error: 'Could not reach MyJKKN to list internal staff. Try again in a moment.' },
				{ status: 502 }
			)
		}

		const scoped = myjkknIds.length
			? staff.filter(s => {
					const instId = s?.institution?.id || s?.institution_id
					return instId && myjkknIds.includes(instId)
				})
			: staff

		// Which of them already have an examiners mirror row?
		const emails = scoped
			.map(s => (s.institution_email || s.email || '').toLowerCase().trim())
			.filter(Boolean)
		const mirrored = new Map<string, { id: string; count: number }>()
		if (emails.length) {
			// Chunked: a single .in() with thousands of emails truncates the GET URL.
			for (let i = 0; i < emails.length; i += 200) {
				const { data: rows } = await supabase
					.from('examiners')
					.select('id, email')
					.in('email', emails.slice(i, i + 200))
				for (const r of rows || []) {
					mirrored.set(String(r.email).toLowerCase(), { id: r.id, count: counts.get(r.id) || 0 })
				}
			}
		}

		const options: QpExaminerOption[] = scoped
			.map(s => {
				const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || s.staff_id || 'Unnamed'
				const email = (s.institution_email || s.email || '').toLowerCase().trim()
				const hit = email ? mirrored.get(email) : undefined
				return {
					// Once mirrored the examiners.id is the stable identity; before that
					// the MyJKKN staff id stands in, and assigning creates the mirror.
					id: hit?.id || s.id,
					kind: 'internal' as const,
					full_name: name,
					email,
					mobile: s.phone || null,
					designation: s.designation || null,
					department: s.department?.department_name || s.department_code || null,
					institution_name: s.institution?.name || null,
					myjkkn_staff_id: s.id,
					already_mirrored: !!hit,
					status: s.is_active === false ? 'INACTIVE' : 'ACTIVE',
					active_assignments: hit?.count || 0,
				}
			})
			// An internal examiner signs in with their college e-mail; without one
			// they cannot reach the portal at all, so they are not assignable.
			.filter(o => !!o.email)
			.filter(o =>
				!search ||
				o.full_name.toLowerCase().includes(search) ||
				o.email.toLowerCase().includes(search) ||
				(o.department || '').toLowerCase().includes(search) ||
				(o.designation || '').toLowerCase().includes(search)
			)
			.sort((a, b) => a.full_name.localeCompare(b.full_name))

		return NextResponse.json({ kind, data: options, count: options.length })
	} catch (error: any) {
		console.error('[QP assign] eligible examiners failed:', error)
		return NextResponse.json({ error: 'Failed to load eligible examiners' }, { status: 500 })
	}
}
