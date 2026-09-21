import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { loadDiscontinuedLearners } from '@/lib/discontinued-learners/report'
import { isEndSemesterExamType, sessionSortKey } from '@/lib/discontinued-learners/sessions'
import type { DiscontinuedSessionOption } from '@/types/discontinued-learners'

/**
 * Discontinued Learners report
 *
 * GET ?mode=sessions&institutions_id=…
 *   End Semester examination sessions of the institution, latest first.
 *
 * GET ?institutions_id=…&current_session_id=…&previous_session_id=…
 *   Learners approved in the previous session but not in the current one.
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		if (searchParams.get('mode') === 'sessions') {
			const [{ data: sessions, error }, { data: examTypes }] = await Promise.all([
				supabase
					.from('examination_sessions')
					.select('id, session_code, session_name, month_year, semester_type, session_status, exam_type_id, exam_start_date')
					.eq('institutions_id', institutions_id),
				supabase.from('exam_types').select('id, examination_name'),
			])
			if (error) {
				console.error('[discontinued-learners] sessions fetch error:', error)
				return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
			}

			const examTypeName = new Map<string, string>((examTypes || []).map((t: any) => [t.id, t.examination_name]))
			const options: DiscontinuedSessionOption[] = (sessions || [])
				.map((s: any) => ({
					id: s.id,
					session_code: s.session_code,
					session_name: s.session_name,
					month_year: s.month_year || null,
					semester_type: s.semester_type || null,
					session_status: s.session_status || null,
					exam_type_name: examTypeName.get(s.exam_type_id) || null,
					sort_key: sessionSortKey(s.month_year, s.exam_start_date),
				}))
				.filter(s => isEndSemesterExamType(s.exam_type_name))
				.sort((a, b) => b.sort_key - a.sort_key)

			return NextResponse.json({ data: options })
		}

		const current_session_id = searchParams.get('current_session_id')
		const previous_session_id = searchParams.get('previous_session_id')
		if (!current_session_id || !previous_session_id) {
			return NextResponse.json(
				{ error: 'current_session_id and previous_session_id are required' },
				{ status: 400 }
			)
		}
		if (current_session_id === previous_session_id) {
			return NextResponse.json({ error: 'Current and previous exam session must differ' }, { status: 400 })
		}

		const sessionColumns = 'id, session_code, session_name, month_year, institutions_id'
		const [{ data: institution }, { data: current }, { data: previous }] = await Promise.all([
			supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).maybeSingle(),
			supabase.from('examination_sessions').select(sessionColumns).eq('id', current_session_id).maybeSingle(),
			supabase.from('examination_sessions').select(sessionColumns).eq('id', previous_session_id).maybeSingle(),
		])

		if (!institution || !current || !previous) {
			return NextResponse.json({ error: 'Institution or exam session not found' }, { status: 404 })
		}
		// Both sessions must belong to the institution being reported on
		if (current.institutions_id !== institutions_id || previous.institutions_id !== institutions_id) {
			return NextResponse.json({ error: 'Exam session does not belong to this institution' }, { status: 400 })
		}

		const cohort = await loadDiscontinuedLearners(supabase, {
			institutions_id,
			current_session_id,
			previous_session_id,
			myjkkn_institution_ids: (institution.myjkkn_institution_ids as string[] | null) || [],
		})

		const sessionOut = (s: any) => ({
			id: s.id,
			session_code: s.session_code,
			session_name: s.session_name,
			month_year: s.month_year || null,
		})

		return NextResponse.json({
			institution_name: institution.name,
			institution_code: institution.institution_code,
			current_session: sessionOut(current),
			previous_session: sessionOut(previous),
			generated_at: new Date().toISOString(),
			summary: cohort.summary,
			data: cohort.data,
		})
	} catch (e) {
		console.error('Discontinued learners report API error:', e)
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
