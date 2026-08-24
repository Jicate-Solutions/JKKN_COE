import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// PostgREST caps a single page at its own db-max-rows (1000 on this project)
// no matter how wide a range we ask for, so pages are fetched in PARALLEL
// rather than trying to pull more rows per request.
const PAGE_SIZE = 1000
const PAGE_CONCURRENCY = 6

const MONTH_TOKENS: Record<string, number> = {
	JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2,
	APR: 3, APRIL: 3, MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6,
	AUG: 7, AUGUST: 7, SEP: 8, SEPT: 8, SEPTEMBER: 8,
	OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11
}

// Chronological key for a session. exam_start_date is authoritative; when it is
// null we derive the date from the code ("NOV-DEC-2025", "APRIL-MAY-2026") —
// plain alphabetical ordering would place APRIL-MAY-2026 BEFORE NOV-DEC-2025
// and mislabel which attempt is the learner's latest.
const sessionTimestamp = (s: any): number => {
	if (s?.exam_start_date) {
		const t = new Date(s.exam_start_date).getTime()
		if (!isNaN(t)) return t
	}
	const text = `${s?.session_code || ''} ${s?.session_name || ''}`.toUpperCase()
	const yearMatch = text.match(/(19|20)\d{2}/)
	if (!yearMatch) return 0
	const year = parseInt(yearMatch[0])
	let month = 0
	for (const token of text.split(/[^A-Z]+/)) {
		if (token && Object.prototype.hasOwnProperty.call(MONTH_TOKENS, token)) {
			month = MONTH_TOKENS[token]
			break
		}
	}
	return Date.UTC(year, month, 1)
}

// ─────────────────────────────────────────────────────────────
// Overall Arrear Status (ALL examination sessions)
//
// The existing `backlogs` action reads student_backlogs for ONE
// original session and trusts the is_cleared flag, which is only
// refreshed when someone runs "update-cleared-backlogs".
//
// This route recomputes arrear status LIVE from final_marks across
// EVERY examination session:
//   group by (learner, course)
//     -> if ANY attempt PASSED, the paper is cleared and is SKIPPED
//     -> otherwise it is still an arrear; the LATEST attempt is the
//        current status that gets reported.
//
// So a learner who failed a paper in NOV-DEC-2025 but passed the
// same paper in APRIL-MAY-2026 does NOT appear in the list.
//
// Returns data for a SINGLE programme; the page fetches the selected
// programmes in parallel (mirrors the pass % / all-clear reports).
// ─────────────────────────────────────────────────────────────

interface AttemptRow {
	id: string
	student_id: string
	course_id: string
	examination_session_id: string
	program_code: string | null
	internal_marks_obtained: number | null
	internal_marks_maximum: number | null
	external_marks_obtained: number | null
	external_marks_maximum: number | null
	total_marks_obtained: number | null
	total_marks_maximum: number | null
	percentage: number | null
	letter_grade: string | null
	is_pass: boolean | null
	pass_status: string | null
	courses: any
	course_offerings: any
	exam_registrations: any
	__rank?: number
}

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const searchParams = request.nextUrl.searchParams

	const institutionId = searchParams.get('institutionId')
	const programCode = searchParams.get('programCode')
	const programId = searchParams.get('programId')
	const semestersParam = searchParams.get('semesters') // CSV of semester numbers
	const sessionIdsParam = searchParams.get('sessionIds') // CSV of session UUIDs; empty = ALL sessions
	const upToSessionId = searchParams.get('upToSessionId') // optional "as of" cutoff

	if (!institutionId) {
		return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
	}

	const semesterFilter = semestersParam
		? semestersParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
		: []

	// Which sessions count. An empty set means every session — the default for
	// the Overall view. Narrowing it restricts BOTH the pass check and the
	// arrear detection to the chosen sessions.
	const sessionFilter = new Set(
		(sessionIdsParam || '').split(',').map(v => v.trim()).filter(Boolean)
	)

	try {
		// ── Session catalogue: ordering decides "first" vs "latest" attempt ──
		const { data: sessionRows, error: sessionErr } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, exam_start_date')
			.eq('institutions_id', institutionId)

		if (sessionErr) throw sessionErr

		const orderedSessions = (sessionRows || []).slice().sort((a: any, b: any) => {
			const da = sessionTimestamp(a)
			const db = sessionTimestamp(b)
			if (da !== db) return da - db
			return (a.session_code || '').localeCompare(b.session_code || '')
		})

		// Sessions actually in scope for this run (used for ranking and stats)
		const scopedSessions = sessionFilter.size > 0
			? orderedSessions.filter((s: any) => sessionFilter.has(s.id))
			: orderedSessions

		const sessionMeta: Record<string, { code: string; name: string; rank: number }> = {}
		scopedSessions.forEach((s: any, idx: number) => {
			sessionMeta[s.id] = {
				code: s.session_code || '',
				name: s.session_name || '',
				rank: idx
			}
		})

		// Optional "as of" cutoff — ignore attempts from sessions AFTER the chosen one
		const cutoffRank = upToSessionId && sessionMeta[upToSessionId]
			? sessionMeta[upToSessionId].rank
			: Number.MAX_SAFE_INTEGER

		// ── Every final_marks row for this programme, across all sessions ──
		const selectClause = `
			id,
			student_id,
			course_id,
			examination_session_id,
			program_code,
			internal_marks_obtained,
			internal_marks_maximum,
			external_marks_obtained,
			external_marks_maximum,
			total_marks_obtained,
			total_marks_maximum,
			percentage,
			letter_grade,
			is_pass,
			pass_status,
			courses:course_id (
				course_code,
				course_name,
				credit,
				evaluation_type,
				internal_pass_mark,
				external_pass_mark,
				total_pass_mark
			),
			course_offerings:course_offering_id (
				semester
			),
			exam_registrations (
				stu_register_no,
				student_name
			)
		`

		// No programCode/programId = EVERY programme in the institution.
		// Ordering by the unique `id` keeps pages disjoint and stable, so they
		// can be fetched concurrently once we know how many rows there are.
		const withProgramFilter = (q: any) => {
			if (programCode) return q.eq('program_code', programCode)
			if (programId) return q.eq('program_id', programId)
			return q
		}

		const buildPageQuery = () => withProgramFilter(
			supabase
				.from('final_marks')
				.select(selectClause)
				.eq('institutions_id', institutionId)
				.eq('is_active', true)
				.order('id', { ascending: true })
		)

		const { count: totalRows } = await withProgramFilter(
			supabase
				.from('final_marks')
				.select('id', { count: 'exact', head: true })
				.eq('institutions_id', institutionId)
				.eq('is_active', true)
		)

		const allAttempts: AttemptRow[] = []

		if (typeof totalRows === 'number' && totalRows > 0) {
			const offsets: number[] = []
			for (let o = 0; o < totalRows; o += PAGE_SIZE) offsets.push(o)

			for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
				const wave = offsets.slice(i, i + PAGE_CONCURRENCY)
				const results = await Promise.all(
					wave.map(o => buildPageQuery().range(o, o + PAGE_SIZE - 1))
				)
				for (const { data, error } of results) {
					if (error) throw error
					if (data?.length) allAttempts.push(...(data as unknown as AttemptRow[]))
				}
			}
		}

		// Drain anything the count missed (null count, or rows added mid-scan).
		// Stop only on an EMPTY page — a short page does not mean the end of the
		// data, since the server decides the page size, not us.
		let offset = allAttempts.length
		for (;;) {
			const { data, error } = await buildPageQuery().range(offset, offset + PAGE_SIZE - 1)
			if (error) throw error
			if (!data || data.length === 0) break
			allAttempts.push(...(data as unknown as AttemptRow[]))
			offset += data.length
		}

		// ── Absent detection (same rules as pass % / galley / all-clear reports) ──
		const isAbsentAttempt = (m: AttemptRow): boolean => {
			if (m.pass_status === 'Absent' || m.pass_status === 'AAA' || m.letter_grade === 'AAA') return true
			const evalType = (m.courses?.evaluation_type || 'CIA + ESE').trim().toUpperCase()
			if (evalType === 'CIA') return m.internal_marks_obtained === null
			if (evalType === 'ESE') return m.external_marks_obtained === null
			return m.external_marks_obtained === null && m.internal_marks_obtained !== null
		}

		const hasPassed = (m: AttemptRow): boolean => m.is_pass === true && !isAbsentAttempt(m)

		// ── Group every attempt by learner + course ──
		const attemptGroups: Record<string, AttemptRow[]> = {}
		allAttempts.forEach(m => {
			if (!m.student_id || !m.course_id) return
			const meta = sessionMeta[m.examination_session_id]
			// No meta = session outside the selected subset (or another institution)
			if (!meta) return
			const rank = meta.rank
			if (rank > cutoffRank) return // attempt is after the "as of" session
			// Group by course CODE (not id) so a re-registered paper under a
			// newer regulation still counts as the same paper — a pass there
			// must clear the older arrear.
			const courseKey = (m.courses?.course_code || '').trim().toUpperCase() || m.course_id
			const key = `${m.student_id}|${courseKey}`
			if (!attemptGroups[key]) attemptGroups[key] = []
			attemptGroups[key].push({ ...m, __rank: rank })
		})

		const latestRank = scopedSessions.length > 0
			? Math.min(scopedSessions.length - 1, cutoffRank === Number.MAX_SAFE_INTEGER ? scopedSessions.length - 1 : cutoffRank)
			: 0

		const arrears: any[] = []
		const learnerMap: Record<string, any> = {}
		let clearedPapers = 0
		let recoveredPapers = 0 // failed at least once, passed in a later session

		Object.values(attemptGroups).forEach(group => {
			group.sort((a, b) => (a.__rank || 0) - (b.__rank || 0))

			// SKIP the paper entirely once the learner has passed it in any session
			if (group.some(hasPassed)) {
				clearedPapers++
				if (group.some(a => !hasPassed(a))) recoveredPapers++
				return
			}

			const first = group[0]
			const latest = group[group.length - 1]
			const semester = latest.course_offerings?.semester || first.course_offerings?.semester || 0

			if (semesterFilter.length > 0 && !semesterFilter.includes(semester)) return

			// Register number / name — take the most recent non-empty value
			let registerNumber = ''
			let studentName = ''
			for (let i = group.length - 1; i >= 0; i--) {
				if (!registerNumber) registerNumber = group[i].exam_registrations?.stu_register_no || ''
				if (!studentName) studentName = group[i].exam_registrations?.student_name || ''
				if (registerNumber && studentName) break
			}

			const course = latest.courses || first.courses || {}
			const absent = isAbsentAttempt(latest)
			const internalPass = course.internal_pass_mark ?? 0
			const externalPass = course.external_pass_mark ?? 0
			const internalShort = internalPass > 0 && (latest.internal_marks_obtained ?? 0) < internalPass
			const externalShort = externalPass > 0 && (latest.external_marks_obtained ?? 0) < externalPass

			let failureReason = 'Overall'
			if (absent) failureReason = 'Absent'
			else if (internalShort && externalShort) failureReason = 'Both'
			else if (internalShort) failureReason = 'Internal'
			else if (externalShort) failureReason = 'External'

			const sessionsPending = Math.max(0, latestRank - (first.__rank || 0))
			const attemptCount = group.length

			let priority: 'Critical' | 'High' | 'Normal' | 'Low' = 'Normal'
			if (attemptCount >= 3 || sessionsPending >= 4) priority = 'Critical'
			else if (attemptCount === 2 || sessionsPending >= 2) priority = 'High'

			const credits = course.credit ?? 0

			arrears.push({
				student_id: latest.student_id,
				register_number: registerNumber,
				student_name: studentName,
				program_code: latest.program_code || programCode || '',
				semester,
				course_id: latest.course_id,
				course_code: course.course_code || '',
				course_name: course.course_name || '',
				course_credits: credits,
				evaluation_type: course.evaluation_type || 'CIA + ESE',

				// Where the arrear started
				first_session_code: sessionMeta[first.examination_session_id]?.code || '',
				first_session_name: sessionMeta[first.examination_session_id]?.name || '',

				// Latest attempt = the CURRENT status
				latest_session_code: sessionMeta[latest.examination_session_id]?.code || '',
				latest_session_name: sessionMeta[latest.examination_session_id]?.name || '',
				latest_internal_marks: latest.internal_marks_obtained,
				latest_internal_maximum: latest.internal_marks_maximum,
				latest_external_marks: latest.external_marks_obtained,
				latest_external_maximum: latest.external_marks_maximum,
				latest_total_marks: latest.total_marks_obtained,
				latest_total_maximum: latest.total_marks_maximum,
				latest_percentage: latest.percentage,
				latest_letter_grade: latest.letter_grade,

				internal_pass_mark: internalPass,
				external_pass_mark: externalPass,
				total_pass_mark: course.total_pass_mark ?? 0,

				attempt_count: attemptCount,
				sessions_pending: sessionsPending,
				failure_reason: failureReason,
				is_absent: absent,
				priority_level: priority,
				attempt_history: group.map(a => ({
					session_code: sessionMeta[a.examination_session_id]?.code || '',
					session_name: sessionMeta[a.examination_session_id]?.name || '',
					internal_marks: a.internal_marks_obtained,
					external_marks: a.external_marks_obtained,
					total_marks: a.total_marks_obtained,
					letter_grade: a.letter_grade,
					is_absent: isAbsentAttempt(a)
				}))
			})

			if (!learnerMap[latest.student_id]) {
				learnerMap[latest.student_id] = {
					student_id: latest.student_id,
					register_no: registerNumber,
					student_name: studentName,
					program_code: latest.program_code || programCode || '',
					pending_arrears: 0,
					total_credits_pending: 0,
					critical_count: 0,
					high_priority_count: 0,
					absent_count: 0,
					arrears_by_semester: {} as Record<number, number>,
					latest_semester: 0
				}
			}
			const learner = learnerMap[latest.student_id]
			learner.pending_arrears++
			learner.total_credits_pending += credits
			if (priority === 'Critical') learner.critical_count++
			if (priority === 'High') learner.high_priority_count++
			if (absent) learner.absent_count++
			learner.arrears_by_semester[semester] = (learner.arrears_by_semester[semester] || 0) + 1
			if (semester > learner.latest_semester) learner.latest_semester = semester
		})

		arrears.sort((a, b) => {
			const reg = (a.register_number || '').localeCompare(b.register_number || '')
			if (reg !== 0) return reg
			if (a.semester !== b.semester) return a.semester - b.semester
			return (a.course_code || '').localeCompare(b.course_code || '')
		})

		const learners = Object.values(learnerMap).sort((a: any, b: any) =>
			(a.register_no || '').localeCompare(b.register_no || '')
		)

		const statistics = {
			total_arrears: arrears.length,
			learners_with_arrears: learners.length,
			critical_count: arrears.filter(a => a.priority_level === 'Critical').length,
			high_priority_count: arrears.filter(a => a.priority_level === 'High').length,
			total_credits_pending: arrears.reduce((sum, a) => sum + (a.course_credits || 0), 0),
			cleared_papers: clearedPapers,
			recovered_papers: recoveredPapers,
			sessions_covered: scopedSessions.length,
			attempts_scanned: allAttempts.length,
			failure_reasons: {
				Internal: arrears.filter(a => a.failure_reason === 'Internal').length,
				External: arrears.filter(a => a.failure_reason === 'External').length,
				Both: arrears.filter(a => a.failure_reason === 'Both').length,
				Absent: arrears.filter(a => a.is_absent).length,
				Overall: arrears.filter(a => a.failure_reason === 'Overall').length
			}
		}

		return NextResponse.json({
			arrears,
			learners,
			statistics,
			sessions: scopedSessions.map((s: any) => ({
				id: s.id,
				code: s.session_code,
				name: s.session_name
			}))
		})
	} catch (error: any) {
		console.error('[current-arrears] error:', error)
		const message = error?.message || error?.error_description || 'Failed to compute overall arrears'
		return NextResponse.json({
			error: message,
			code: error?.code,
			details: error?.details || error?.hint
		}, { status: 500 })
	}
}
