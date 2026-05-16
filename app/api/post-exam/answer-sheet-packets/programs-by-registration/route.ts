import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/post-exam/answer-sheet-packets/programs-by-registration
 * Returns distinct programs derived from exam_registrations for a given
 * institution + session (+ optional board), enriched with:
 *  - program_name (from programs table, best effort)
 *  - total_students (distinct learners registered)
 *  - course_codes (distinct theory courses registered under that program)
 *
 * Used by the program-wise packet generation tab.
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionCode = searchParams.get('institution_code')
		const examSession = searchParams.get('exam_session')
		const boardCode = searchParams.get('board_code') // optional

		if (!institutionCode?.trim()) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}
		if (!examSession?.trim()) {
			return NextResponse.json({ error: 'exam_session is required' }, { status: 400 })
		}

		// Resolve institution_id
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institutionCode)
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${institutionCode}" not found.`,
			}, { status: 404 })
		}

		// Resolve session_id (scoped to institution)
		const { data: sessionData, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id')
			.eq('session_code', examSession)
			.eq('institutions_id', institutionData.id)
			.single()

		if (sessionError || !sessionData) {
			return NextResponse.json({
				error: `Examination session "${examSession}" not found for institution "${institutionCode}".`,
			}, { status: 404 })
		}

		// Fetch all exam_registrations for this institution+session
		// (student_id is the column name on this table — terminology-wise represents a learner)
		const { data: regs, error: regsError } = await supabase
			.from('exam_registrations')
			.select('program_code, course_code, student_id')
			.eq('institutions_id', institutionData.id)
			.eq('examination_session_id', sessionData.id)
			.range(0, 99999)

		if (regsError) {
			console.error('Error fetching exam_registrations:', regsError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		if (!regs || regs.length === 0) {
			return NextResponse.json([])
		}

		// Group registrations by program_code — include ALL programs that have ANY
		// registration in this institution+session. Don't pre-filter by Theory or
		// already-packeted here; the UI handles those filters when listing courses
		// to generate (same condition pattern as the existing Board/Course tab).
		const programMap = new Map<string, {
			program_code: string
			learners: Set<string>
			course_codes: Set<string>
		}>()

		for (const r of regs) {
			const pc = r.program_code
			if (!pc) continue

			if (!programMap.has(pc)) {
				programMap.set(pc, {
					program_code: pc,
					learners: new Set<string>(),
					course_codes: new Set<string>(),
				})
			}
			const entry = programMap.get(pc)!
			if (r.student_id) entry.learners.add(r.student_id)
			if (r.course_code) entry.course_codes.add(r.course_code)
		}

		const programCodes = Array.from(programMap.keys())

		if (programCodes.length === 0) {
			return NextResponse.json([])
		}

		// Best-effort enrichment from programs table
		const { data: programsData } = await supabase
			.from('programs')
			.select('program_code, program_name')
			.eq('institution_code', institutionCode)
			.in('program_code', programCodes)

		const programNameByCode = new Map<string, string>()
		for (const p of programsData || []) {
			if (p.program_code) programNameByCode.set(p.program_code, p.program_name || '')
		}

		const result = programCodes
			.map(pc => {
				const entry = programMap.get(pc)!
				return {
					program_code: pc,
					program_name: programNameByCode.get(pc) || '',
					total_students: entry.learners.size,
					course_codes: Array.from(entry.course_codes).sort(),
					course_count: entry.course_codes.size,
				}
			})
			.sort((a, b) => a.program_code.localeCompare(b.program_code))

		return NextResponse.json(result)
	} catch (error) {
		console.error('Error in GET /api/post-exam/answer-sheet-packets/programs-by-registration:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error',
		}, { status: 500 })
	}
}
