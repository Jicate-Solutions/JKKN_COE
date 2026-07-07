import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/lib/myjkkn-api'

const BATCH_SIZE = 1000

// ─────────────────────────────────────────────────────────────
// All Clear Report (Programme-wise)
//
// "All Clear" = a learner who PASSED every paper they registered for
// in the session. Any FAIL or ABSENT paper means the learner is NOT
// all-clear.
//
// "Regular" papers = papers belonging to the learner's current
// semester (the highest semester among their papers this session).
// Papers from lower semesters are treated as arrear/backlog and are
// excluded from the "Regular paper all clear" calculation.
//
// Returns aggregation for a SINGLE programme (mirrors the pass %
// report — the page fetches selected programmes in parallel).
// Dropdown data (institutions/sessions/programs) is reused from
// /api/grading/pass-percentage-report.
// ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const searchParams = request.nextUrl.searchParams

	const institutionId = searchParams.get('institution_id')
	const sessionId = searchParams.get('session_id')
	const programCode = searchParams.get('program_code')

	if (!institutionId || !sessionId || !programCode) {
		return NextResponse.json(
			{ error: 'institution_id, session_id and program_code are required' },
			{ status: 400 }
		)
	}

	try {
		// ── Institution info ──
		const { data: instData } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('id', institutionId)
			.single()

		if (!instData) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// ── Session info ──
		const { data: sessionData } = await supabase
			.from('examination_sessions')
			.select('id, session_name, session_code, exam_type_id')
			.eq('id', sessionId)
			.single()

		if (!sessionData) {
			return NextResponse.json({ error: 'Session not found' }, { status: 404 })
		}

		let sessionExamTypeName = ''
		if (sessionData.exam_type_id) {
			const { data: examTypeRow } = await supabase
				.from('exam_types')
				.select('examination_name')
				.eq('id', sessionData.exam_type_id)
				.single()
			sessionExamTypeName = examTypeRow?.examination_name || ''
		}

		// ── Programme name from MyJKKN ──
		let programName = programCode
		try {
			const allProgs = await fetchAllMyJKKNPrograms({ all: true } as any)
			const found = allProgs.find((p: any) => (p.program_id || p.program_code) === programCode)
			if (found) programName = found.program_name || found.name || programCode
		} catch { /* fallback to code */ }

		// ── Fetch final_marks for this programme (paginated) ──
		const finalMarksSelect = `
			id,
			is_pass,
			pass_status,
			letter_grade,
			internal_marks_obtained,
			external_marks_obtained,
			student_id,
			course_id,
			courses:course_id (
				evaluation_type
			),
			course_offerings:course_offering_id (
				semester
			)
		`

		const allFinalMarks: any[] = []
		for (let offset = 0; ; offset += BATCH_SIZE) {
			const { data, error } = await supabase
				.from('final_marks')
				.select(finalMarksSelect)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCode)
				.eq('is_active', true)
				.range(offset, offset + BATCH_SIZE - 1)

			if (error) throw error
			if (!data || data.length === 0) break
			allFinalMarks.push(...data)
			if (data.length < BATCH_SIZE) break
		}

		// ── Absent detection (same rules as pass % / galley reports) ──
		const isAbsentMark = (mark: any): boolean => {
			const evalType = (mark.courses?.evaluation_type || 'CIA + ESE').trim().toUpperCase()
			if (evalType === 'CIA') {
				return mark.pass_status === 'Absent' || mark.pass_status === 'AAA' ||
					mark.letter_grade === 'AAA' || mark.internal_marks_obtained === null
			}
			if (evalType === 'ESE') {
				return mark.pass_status === 'Absent' || mark.pass_status === 'AAA' ||
					mark.letter_grade === 'AAA' || mark.external_marks_obtained === null
			}
			return mark.pass_status === 'Absent' || mark.pass_status === 'AAA' ||
				mark.letter_grade === 'AAA' ||
				(mark.external_marks_obtained === null && mark.internal_marks_obtained !== null)
		}

		// ── Group papers by learner ──
		interface Paper { semester: number; passed: boolean }
		const learnerMap = new Map<string, Paper[]>()

		allFinalMarks.forEach(mark => {
			const learnerId = mark.student_id
			if (!learnerId) return
			const semester = mark.course_offerings?.semester || 0
			// A paper is "cleared" only when explicitly passed. Fail OR absent = not cleared.
			const passed = mark.is_pass === true && !isAbsentMark(mark)
			if (!learnerMap.has(learnerId)) learnerMap.set(learnerId, [])
			learnerMap.get(learnerId)!.push({ semester, passed })
		})

		// ── Per-learner all-clear evaluation ──
		interface SemBucket {
			total: number          // learners whose current sem == this sem
			allClear: number       // passed ALL papers (incl. arrears)
			regularTotal: number   // learners with at least one regular paper
			regularAllClear: number // passed all regular-sem papers
		}
		const semBuckets = new Map<number, SemBucket>()

		let total = 0
		let allClear = 0
		let regularTotal = 0
		let regularAllClear = 0

		learnerMap.forEach(papers => {
			if (papers.length === 0) return
			total++

			// Current (regular) semester = highest semester among this learner's papers
			const regularSem = papers.reduce((mx, p) => Math.max(mx, p.semester), 0)
			const regularPapers = papers.filter(p => p.semester === regularSem)

			const overallAllClear = papers.every(p => p.passed)
			const regAllClear = regularPapers.length > 0 && regularPapers.every(p => p.passed)

			if (overallAllClear) allClear++
			if (regularPapers.length > 0) {
				regularTotal++
				if (regAllClear) regularAllClear++
			}

			// Per-semester bucket (learner assigned to their current/regular semester)
			if (!semBuckets.has(regularSem)) {
				semBuckets.set(regularSem, { total: 0, allClear: 0, regularTotal: 0, regularAllClear: 0 })
			}
			const bucket = semBuckets.get(regularSem)!
			bucket.total++
			if (overallAllClear) bucket.allClear++
			if (regularPapers.length > 0) {
				bucket.regularTotal++
				if (regAllClear) bucket.regularAllClear++
			}
		})

		const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

		const semesters = Array.from(semBuckets.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([semester, b]) => ({
				semester,
				total_learners: b.total,
				all_clear: b.allClear,
				all_clear_pct: pct(b.allClear, b.total),
				regular_total: b.regularTotal,
				regular_all_clear: b.regularAllClear,
				regular_all_clear_pct: pct(b.regularAllClear, b.regularTotal),
			}))

		return NextResponse.json({
			institution: { id: instData.id, name: instData.name, code: instData.institution_code },
			session: {
				id: sessionData.id,
				name: sessionData.session_name,
				code: sessionData.session_code,
				exam_type_name: sessionExamTypeName,
			},
			program: { program_code: programCode, program_name: programName },
			summary: {
				total_learners: total,
				all_clear: allClear,
				all_clear_pct: pct(allClear, total),
				regular_total: regularTotal,
				regular_all_clear: regularAllClear,
				regular_all_clear_pct: pct(regularAllClear, regularTotal),
			},
			semesters,
			generated_at: new Date().toISOString(),
		})
	} catch (error: any) {
		console.error('[All Clear Report] Error:', error)
		return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 })
	}
}
