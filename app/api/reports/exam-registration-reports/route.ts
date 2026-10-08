import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	learnerChargeLines,
	loadFeeRateBook,
	priceCourseList,
	resolveProgramLevel,
	type CourseFeeInput,
	type PaperFeeHead,
} from '@/lib/exam-fee/calculate'
import type { ProgramLevel } from '@/lib/exam-fee-catalog'
import { normalizeDateOfBirth } from '@/lib/myjkkn-learner-enrichment'

// Helper: fetch all pages from Supabase in parallel batches
async function fetchAllPaginated(
	queryFn: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
	pageSize = 1000
): Promise<any[]> {
	// Fetch first page to get initial data + check if more needed
	const { data: firstPage, error } = await queryFn(0, pageSize - 1)
	if (error || !firstPage || firstPage.length === 0) return firstPage || []
	if (firstPage.length < pageSize) return firstPage

	// Fetch remaining pages in parallel (estimate up to 20 pages = 20k rows)
	const allData = [...firstPage]
	let page = 1
	let hasMore = true

	while (hasMore) {
		// Fetch next 8 pages in parallel (a 15k-row session: 2.2s at 4, 1.3s at 8)
		const pagePromises = []
		for (let i = 0; i < 8 && hasMore; i++) {
			const p = page + i
			pagePromises.push(queryFn(p * pageSize, (p + 1) * pageSize - 1))
		}
		const results = await Promise.all(pagePromises)
		for (const r of results) {
			if (r.data && r.data.length > 0) {
				allData.push(...r.data)
				if (r.data.length < pageSize) { hasMore = false; break }
			} else {
				hasMore = false
				break
			}
		}
		page += pagePromises.length
	}
	return allData
}

// Helper: run batched .in() queries in parallel
async function fetchBatchedIn<T>(
	ids: string[],
	batchFn: (batch: string[]) => Promise<{ data: T[] | null; error: any }>,
	batchSize = 200
): Promise<T[]> {
	if (ids.length === 0) return []
	const batches: string[][] = []
	for (let i = 0; i < ids.length; i += batchSize) {
		batches.push(ids.slice(i, i + batchSize))
	}
	const results = await Promise.all(batches.map(batch => batchFn(batch)))
	const all: T[] = []
	for (const r of results) {
		if (r.data) all.push(...r.data)
	}
	return all
}

// Helper: fetch paginated MyJKKN API for a single institution
async function fetchMyJKKNPaginated(
	apiUrl: string,
	endpoint: string,
	myjkknInstId: string,
	apiKey: string,
	pgSize = 200,
	earlyStopFn?: (profiles: any[]) => boolean
): Promise<any[]> {
	const all: any[] = []
	let pg = 1
	let hasMore = true

	while (hasMore) {
		const params = new URLSearchParams({
			institution_id: myjkknInstId,
			limit: String(pgSize),
			page: String(pg),
		})
		try {
			const response = await fetch(
				`${apiUrl}/api-management/${endpoint}?${params.toString()}`,
				{
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
					cache: 'no-store',
				}
			)
			if (response.ok) {
				const data = await response.json()
				const items = data.data || data || []
				all.push(...items)
				if (items.length < pgSize) { hasMore = false; break }
				// Early termination if caller says we have enough
				if (earlyStopFn && earlyStopFn(all)) { hasMore = false; break }
				pg++
			} else {
				hasMore = false
			}
		} catch {
			hasMore = false
		}
	}
	return all
}

// ── MyJKKN learner profile cache ──
// The profiles endpoint ignores institution_id and returns every institution's learners,
// so sweeping once per MyJKKN institution id fetched the whole table several times over,
// one 200-row page after another. One sweep now serves every institution: pages are
// requested in concurrent windows (the endpoint caps pages at 200 and 500s past the
// last page), the result is cached process-wide, and concurrent requests share the
// in-flight sweep.
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000
const PROFILE_PAGE_SIZE = 200
const PROFILE_PAGE_CONCURRENCY = 8
const PROFILE_MAX_PAGES = 400

interface SlimProfile {
	/** register_number and roll_number, trimmed + UPPER — unnumbered learners are registered under the roll number */
	ids: string[]
	student_name: string | null
	date_of_birth: string | null
	gender: string | null
}

let profileCache: { at: number; data: SlimProfile[]; ids: Set<string> } | null = null
let profileInflight: Promise<SlimProfile[]> | null = null

/** Keep only the fields the reports actually read — cached rows stay small */
function slimProfile(p: any): SlimProfile {
	const ids = [p.register_number, p.roll_number]
		.map(v => (v ?? '').toString().trim().toUpperCase())
		.filter(Boolean)
	return {
		ids: [...new Set(ids)],
		student_name: p.student_name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
		date_of_birth: p.date_of_birth || null,
		gender: p.gender || null,
	}
}

/** One page of profiles, or null when the request failed */
async function fetchProfilePage(apiUrl: string, apiKey: string, page: number): Promise<any[] | null> {
	try {
		const response = await fetch(
			`${apiUrl}/api-management/learners/profiles?limit=${PROFILE_PAGE_SIZE}&page=${page}`,
			{
				method: 'GET',
				headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
				cache: 'no-store',
			}
		)
		if (!response.ok) return null
		const json = await response.json()
		const rows = json?.data ?? json
		return Array.isArray(rows) ? rows : null
	} catch {
		return null
	}
}

/** Every profile, or null when not even the first page could be read */
async function sweepLearnerProfiles(apiUrl: string, apiKey: string): Promise<SlimProfile[] | null> {
	const startedAt = Date.now()
	const all: SlimProfile[] = []
	let done = false
	for (let start = 1; !done && start <= PROFILE_MAX_PAGES; start += PROFILE_PAGE_CONCURRENCY) {
		const pages = Array.from({ length: PROFILE_PAGE_CONCURRENCY }, (_, i) => start + i)
		const results = await Promise.all(pages.map(pg => fetchProfilePage(apiUrl, apiKey, pg)))
		for (let i = 0; i < results.length; i++) {
			// A failed page is retried once; still failing = past the last page
			const rows = results[i] ?? await fetchProfilePage(apiUrl, apiKey, pages[i])
			if (rows === null) {
				if (all.length === 0) return null
				done = true
				break
			}
			for (const row of rows) all.push(slimProfile(row))
			if (rows.length < PROFILE_PAGE_SIZE) { done = true; break }
		}
	}
	console.log(`[ExamReports] Profile sweep: ${all.length} profiles in ${Date.now() - startedAt}ms`)
	return all
}

function refreshLearnerProfiles(apiUrl: string, apiKey: string): Promise<SlimProfile[]> {
	if (profileInflight) return profileInflight
	profileInflight = sweepLearnerProfiles(apiUrl, apiKey)
		.then(rows => {
			// A failed sweep keeps the last good answer
			if (rows) profileCache = { at: Date.now(), data: rows, ids: new Set(rows.flatMap(r => r.ids)) }
			return profileCache?.data ?? []
		})
		.catch(() => profileCache?.data ?? [])
		.finally(() => { profileInflight = null })
	return profileInflight
}

/**
 * MyJKKN learner profiles for name / DOB / gender. Served from cache when fresh.
 * A stale cache that still resolves every learner is served at once and refreshed
 * in the background; one missing a learner (e.g. a register number generated since
 * the last sweep) waits for a fresh sweep.
 */
async function getLearnerProfiles(apiUrl: string, apiKey: string, needed: Set<string>): Promise<SlimProfile[]> {
	if (profileCache) {
		const fresh = Date.now() - profileCache.at < PROFILE_CACHE_TTL_MS
		if (fresh) return profileCache.data
		const cache = profileCache
		const coversAll = [...needed].every(k => cache.ids.has(k))
		if (coversAll) {
			void refreshLearnerProfiles(apiUrl, apiKey)
			return cache.data
		}
	}
	return refreshLearnerProfiles(apiUrl, apiKey)
}

/**
 * Final Registration Approval report - one row per learner from
 * exam_registration_fee_details. Rows carry `program_code` and
 * `learner_semester` so the page's programme / semester filters work unchanged.
 */
async function buildFinalApprovalReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutions_id: string,
	examination_session_id: string
) {
	const [{ data: institution }, { data: session }, { data: localPrograms }] = await Promise.all([
		supabase.from('institutions').select('id, institution_code, name').eq('id', institutions_id).single(),
		supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).single(),
		supabase.from('programs').select('program_code, program_name, program_order').eq('institutions_id', institutions_id),
	])

	if (!institution || !session) {
		return NextResponse.json({ error: 'Institution or Session not found' }, { status: 404 })
	}

	const baseColumns = 'id, student_id, stu_register_no, student_name, regulation_code, program_code, semester, total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, final_amount, fee_paid, payment_status, registration_status, approved_at'
	const fetchRows = (columns: string) => fetchAllPaginated(async (from, to) => {
		const res = await supabase
			.from('exam_registration_fee_details')
			.select(columns)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.order('stu_register_no', { ascending: true })
			.order('id', { ascending: true })
			.range(from, to)
		if (res.error) throw res.error
		return res
	})

	let rows: any[]
	try {
		try {
			rows = await fetchRows(`${baseColumns}, payment_mode, payment_transaction_id, concession_amount`)
		} catch (e: any) {
			// payment_* arrive with 20260919_final_approval_manual_late_fine.sql and
			// concession_amount with 20260921_exam_fee_concessions.sql; the report
			// must keep working until those migrations are run.
			if (!/payment_mode|payment_transaction_id|concession_amount/i.test(e?.message || '')) throw e
			try {
				rows = await fetchRows(`${baseColumns}, payment_mode, payment_transaction_id`)
			} catch (e2: any) {
				if (!/payment_mode|payment_transaction_id/i.test(e2?.message || '')) throw e2
				rows = await fetchRows(baseColumns)
			}
		}
	} catch (e: any) {
		const message = e?.message || ''
		if (/exam_registration_fee_details/i.test(message) && /(does not exist|schema cache)/i.test(message)) {
			return NextResponse.json(
				{ error: 'Final approval is not set up yet. Run supabase/migrations/20260912_exam_registration_final_approval.sql in the Supabase SQL Editor.' },
				{ status: 503 }
			)
		}
		console.error('[ExamReports] final-approval fetch error:', e)
		return NextResponse.json({ error: 'Failed to fetch final approved registrations' }, { status: 500 })
	}

	const programByCode = new Map<string, { program_name: string | null; program_order: number | null }>()
	for (const p of localPrograms || []) {
		const code = String(p.program_code || '').trim().toUpperCase()
		if (code && !programByCode.has(code)) programByCode.set(code, { program_name: p.program_name || null, program_order: p.program_order ?? null })
	}

	const num = (v: any) => {
		const n = Number(v)
		return Number.isFinite(n) ? n : 0
	}

	const data = rows.map(r => {
		const programCode = String(r.program_code || '').trim().toUpperCase() || null
		const program = programCode ? programByCode.get(programCode) : undefined
		return {
			id: r.id,
			student_id: r.student_id,
			stu_register_no: r.stu_register_no,
			student_name: r.student_name || '',
			program_code: programCode,
			program_name: program?.program_name || null,
			regulation_code: r.regulation_code || null,
			learner_semester: Number(r.semester) || 0,
			total_subjects: Number(r.total_subjects) || 0,
			exam_fee: num(r.exam_fee),
			application_fee: num(r.application_fee),
			mark_statement_fee: num(r.mark_statement_fee),
			late_fine: num(r.late_fine),
			concession_amount: num(r.concession_amount),
			final_amount: num(r.final_amount),
			fee_paid: !!r.fee_paid,
			payment_status: r.payment_status || null,
			registration_status: r.registration_status || 'Approved',
			payment_mode: r.payment_mode || null,
			payment_transaction_id: r.payment_transaction_id || null,
			approved_at: r.approved_at || null,
			// Mirrors the shape the programme filter / options read on every report
			course_offering: {
				program_code: programCode,
				program_name: program?.program_name || null,
				program_order: program?.program_order ?? 999,
				semester: Number(r.semester) || 0,
			},
		}
	})

	return NextResponse.json({
		report_type: 'student-final-approval',
		institution_name: institution.name,
		institution_code: institution.institution_code,
		session_name: session.session_name,
		session_code: session.session_code,
		generated_at: new Date().toISOString(),
		data,
	})
}

/**
 * Learners registered in the session who have not applied for a single paper,
 * counted per programme. The Exam Application reports leave them out by design,
 * so a programme whose learners are all still Pending just vanishes from the
 * report and from its Program filter - this is what lets the page say so.
 *
 * `in_report` is false for a programme with no applied learner at all.
 */
function summarizeNotApplied(appliedRows: any[], notAppliedRows: any[]) {
	const appliedLearners = new Set<string>()
	const appliedPrograms = new Set<string>()
	for (const r of appliedRows) {
		if (r.stu_register_no) appliedLearners.add(String(r.stu_register_no).toUpperCase())
		if (r.program_code) appliedPrograms.add(r.program_code)
	}

	const learnersByProgram = new Map<string, Set<string>>()
	for (const r of notAppliedRows) {
		const regNo = String(r.stu_register_no || '').toUpperCase()
		// A learner with some papers applied is on the report already
		if (!regNo || !r.program_code || appliedLearners.has(regNo)) continue
		if (!learnersByProgram.has(r.program_code)) learnersByProgram.set(r.program_code, new Set())
		learnersByProgram.get(r.program_code)!.add(regNo)
	}

	return [...learnersByProgram]
		.map(([program_code, learners]) => ({
			program_code,
			learners: learners.size,
			in_report: appliedPrograms.has(program_code),
		}))
		.sort((a, b) => a.program_code.localeCompare(b.program_code))
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const report_type = searchParams.get('report_type')

		// The two Exam Application reports are the fee form a learner signs, so they
		// cover only learners who actually applied - a Pending registration has not
		// been applied for and owes nothing yet. Filtered in the query rather than
		// after the fetch: on a live session this is 363 rows instead of 12,507.
		//
		// 'Approved' alone is NOT applied: registration approval writes it too, before
		// the learner has applied for anything. Only the final approval stamps
		// payment_date beside it (see lib/exam-registration-status.ts), so a bare
		// 'Approved' row is a registered learner who owes nothing yet and must stay
		// off the fee form - the Exam Applications screen lists them as 'Not Applied'.
		const APPLIED_STATUSES = ['Applied', 'Approved']
		const APPLIED_FILTER = 'registration_status.eq.Applied,and(registration_status.eq.Approved,payment_date.not.is.null)'
		const isApplicationReport = report_type === 'student-fee-details' || report_type === 'student-wise-application'

		if (!institutions_id || !examination_session_id || !report_type) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id, and report_type are required' },
				{ status: 400 }
			)
		}

		// ── Final Registration Approval report ──
		// Learner-wise, read straight from exam_registration_fee_details - the
		// consolidated row the Final Approval page writes per learner per session.
		// It never touches the paper rows, so it needs none of the phases below.
		if (report_type === 'student-final-approval') {
			return buildFinalApprovalReport(supabase, institutions_id, examination_session_id)
		}

		// ── Phase 1: Fetch institution, session, and registrations in parallel ──
		const [{ data: institution }, { data: session }, allRegistrations, notAppliedRows] = await Promise.all([
			supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).single(),
			supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).single(),
			fetchAllPaginated((from, to) => {
				let query = supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, attempt_number, fee_paid, fee_amount, registration_status, program_code, course_offering_id, course_code')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
				if (isApplicationReport) query = query.or(APPLIED_FILTER)
				return query
					.order('stu_register_no', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
			}),
			// The complement of APPLIED_FILTER among live registrations: Pending, and
			// 'Approved' with no payment_date (registration approved, not applied for)
			isApplicationReport
				? fetchAllPaginated((from, to) =>
					supabase
						.from('exam_registrations')
						.select('stu_register_no, program_code')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.not('registration_status', 'in', '(Applied,Cancelled,Rejected,Withdrawn)')
						.or('registration_status.neq.Approved,payment_date.is.null')
						.order('id', { ascending: true })
						.range(from, to)
				)
				: Promise.resolve([] as any[]),
		])

		if (!institution || !session) {
			return NextResponse.json({ error: 'Institution or Session not found' }, { status: 404 })
		}

		const notApplied = isApplicationReport ? summarizeNotApplied(allRegistrations, notAppliedRows) : null

		if (allRegistrations.length === 0) {
			if (isApplicationReport) {
				console.warn(`[ExamReports] No registration in this session is ${APPLIED_STATUSES.join(' / ')} (final-approved) - the Exam Application report covers applied learners only. Apply the cohort from Exam Management > Exam Applications first.`)
			}
			return NextResponse.json({
				report_type,
				institution_name: institution.name,
				institution_code: institution.institution_code,
				session_name: session.session_name,
				session_code: session.session_code,
				generated_at: new Date().toISOString(),
				data: [],
				...(notApplied ? { not_applied: notApplied } : {}),
			})
		}

		// ── Phase 2: All independent lookups in parallel ──
		const courseOfferingIds = [...new Set(allRegistrations.map(r => r.course_offering_id).filter(Boolean))]
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []
		const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
		const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

		const [
			allOfferings,
			allBoards,
			localPrograms,
			myjkknProgramsRaw,
		] = await Promise.all([
			// Course offerings (parallel batches)
			fetchBatchedIn(courseOfferingIds, (batch) =>
				supabase
					.from('course_offerings')
					.select('id, course_code, program_code, semester, course_id, courses:course_id(course_name, board_id, board_code, course_category, exam_duration)')
					.in('id', batch)
			),
			// All boards
			supabase.from('board').select('id, board_code, board_name, board_order, board_type').then(r => r.data || []),
			// Local programs
			supabase.from('programs').select('program_code, program_name, program_order').eq('institutions_id', institutions_id).eq('is_active', true).then(r => r.data || []),
			// MyJKKN programs (all institutions in parallel)
			(myjkknIds.length > 0 && myjkknApiKey)
				? Promise.all(myjkknIds.map(id => fetchMyJKKNPaginated(myjkknApiUrl, 'organizations/programs', id, myjkknApiKey)))
					.then(results => results.flat())
					.catch(() => [] as any[])
				: Promise.resolve([] as any[]),
		])

		// ── Phase 2b: Course mapping (needs course_ids from offerings) — parallel with MyJKKN profiles ──
		const uniqueCourseIds = [...new Set(allOfferings.map(o => o.course_id).filter(Boolean))]
		const registerNumbers = [...new Set(allRegistrations.map(r => r.stu_register_no).filter(Boolean))]
		// Upper-cased: profile ids and the row lookups below are both upper-case
		const registerNumberSet = new Set(registerNumbers.map(r => r.toUpperCase()))

		// Only the student-* reports print learner name / DOB / gender
		const needsLearnerProfiles = report_type.startsWith('student-')

		const [courseMappings, myjkknProfilesRaw]: [any[], SlimProfile[]] = await Promise.all([
			// Course mapping (parallel batches)
			fetchBatchedIn(uniqueCourseIds, (batch) =>
				supabase.from('course_mapping').select('course_id, course_order').in('course_id', batch)
			),
			// MyJKKN learner profiles — only the learner-detail reports read names/DOB/gender.
			// Count and date-wise reports aggregate by course, so skip the sweep entirely for them.
			(needsLearnerProfiles && registerNumbers.length > 0 && myjkknIds.length > 0 && myjkknApiKey)
				? getLearnerProfiles(myjkknApiUrl, myjkknApiKey, registerNumberSet)
				: Promise.resolve([] as SlimProfile[]),
		])

		// ── Phase 3: Build lookup maps (pure computation, fast) ──

		// Board maps
		const boardMap = new Map<string, { board_code: string; board_order: number; board_type: string | null }>()
		const boardCodeMap = new Map<string, { board_code: string; board_order: number; board_type: string | null }>()
		const boardNameMap = new Map<string, string>()
		for (const b of allBoards) {
			const info = { board_code: b.board_code, board_order: b.board_order ?? 999, board_type: b.board_type || null }
			boardMap.set(b.id, info)
			boardCodeMap.set(b.board_code, info)
			if (b.board_name) boardNameMap.set(b.board_code, b.board_name)
		}

		// Course mapping order
		const courseMappingOrderMap = new Map<string, number>()
		for (const m of courseMappings) {
			if (m.course_id && !courseMappingOrderMap.has(m.course_id)) {
				courseMappingOrderMap.set(m.course_id, m.course_order ?? 999)
			}
		}

		// Program names, order, and type (UG/PG)
		const programNameMap = new Map<string, string>()
		const programOrderMap = new Map<string, number>()
		const programTypeMap = new Map<string, string>()
		// MyJKKN programs first (primary source for program_order + program_type)
		for (const p of myjkknProgramsRaw) {
			const code = p.program_id || p.program_code || ''
			if (code && !programOrderMap.has(code)) {
				const order = p.program_order ?? p.sort_order
				if (order != null) programOrderMap.set(code, order)
			}
			if (code && !programNameMap.has(code)) {
				const pName = p.program_name || p.name || ''
				if (pName) programNameMap.set(code, pName)
			}
			if (code && !programTypeMap.has(code)) {
				const pType = (p.program_type || p.degree_type || '').toString().toUpperCase()
				if (pType === 'UG' || pType === 'PG') programTypeMap.set(code, pType)
			}
		}
		// Local programs as fallback for names and order
		for (const lp of localPrograms) {
			if (lp.program_code && lp.program_name && !programNameMap.has(lp.program_code)) {
				programNameMap.set(lp.program_code, lp.program_name)
			}
			if (lp.program_code && lp.program_order != null && !programOrderMap.has(lp.program_code)) {
				programOrderMap.set(lp.program_code, lp.program_order)
			}
		}
		// Fallback: use board_order as program_order (board_code = program_code in this system)
		for (const [boardCode, boardInfo] of boardCodeMap) {
			if (!programOrderMap.has(boardCode)) {
				programOrderMap.set(boardCode, boardInfo.board_order)
			}
		}
		// Program orders resolved: MyJKKN API → local programs → board_order fallback

		// MyJKKN learner name + DOB + gender maps
		const isStudentWise = report_type === 'student-wise-application' || report_type === 'student-wise-registration'
		const nameMap = new Map<string, string>()
		const dobMap = new Map<string, string>()
		const genderMap = new Map<string, string>()
		for (const lp of myjkknProfilesRaw) {
			// A learner may be registered under either the register number or the roll number
			for (const key of lp.ids) {
				if (!registerNumberSet.has(key)) continue
				if (!nameMap.has(key) && lp.student_name) nameMap.set(key, lp.student_name)
				if (isStudentWise && !genderMap.has(key) && lp.gender) {
					const g = String(lp.gender).trim()
					if (g) genderMap.set(key, g.charAt(0).toUpperCase() + g.slice(1).toLowerCase())
				}
				if ((report_type === 'student-fee-details' || report_type === 'student-exam-registration' || report_type === 'student-wise-application' || report_type === 'student-wise-registration') && !dobMap.has(key) && lp.date_of_birth) {
					// MyJKKN stores some DOBs as Excel serials ("39911"); new Date() reads those as the year
					const iso = normalizeDateOfBirth(lp.date_of_birth)
					if (iso) {
						const [y, m, d] = iso.split('-')
						dobMap.set(key, `${d}-${m}-${y}`)
					}
				}
			}
		}
		console.log(`[ExamReports] Names: ${nameMap.size}/${registerNumbers.length}, DOBs: ${dobMap.size}/${registerNumbers.length} from MyJKKN${needsLearnerProfiles ? '' : ' (profile sweep skipped for this report)'}`)

		// Offering map
		const offeringMap = new Map(
			allOfferings.map(o => {
				const courseData = o.courses as any
				let boardInfo = courseData?.board_code
					? boardCodeMap.get(courseData.board_code)
					: boardMap.get(courseData?.board_id)

				if (!boardInfo && o.course_code && o.course_code.length >= 5) {
					const prefix = o.course_code.substring(2, 5)
					boardInfo = boardCodeMap.get(prefix)
					if (!boardInfo && o.program_code) boardInfo = boardCodeMap.get(o.program_code)
				}

				const programBoardInfo = boardCodeMap.get(o.program_code)

				return [o.id, {
					course_code: o.course_code,
					course_id: o.course_id,
					course_order: courseMappingOrderMap.get(o.course_id) ?? 999,
					board_type: boardInfo?.board_type || null,
					program_type: programTypeMap.get(o.program_code) || null,
					program_code: o.program_code,
					program_name: programNameMap.get(o.program_code) || boardNameMap.get(o.program_code) || null,
					semester: o.semester,
					course_name: (o.courses as any)?.course_name || null,
					course_category: (o.courses as any)?.course_category || null,
					exam_duration: (o.courses as any)?.exam_duration ?? null,
					board_code: boardInfo?.board_code || null,
					board_name: boardNameMap.get(boardInfo?.board_code || '') || null,
					board_order: boardInfo?.board_order ?? 999,
					program_order: programOrderMap.get(o.program_code) ?? 999,
					program_board_order: programBoardInfo?.board_order ?? 999,
				}]
			})
		)

		// Secondary lookup: course_code → offering data (for fallback when offering ID doesn't match)
		const courseCodeToOffering = new Map<string, any>()
		for (const [, offering] of offeringMap) {
			if (offering.course_code && !courseCodeToOffering.has(offering.course_code)) {
				courseCodeToOffering.set(offering.course_code, offering)
			}
		}

		// Find course_codes that are in registrations but not in any offering — fetch from courses table
		const unmatchedCodes = [...new Set(
			allRegistrations
				.filter(r => r.course_code && !offeringMap.has(r.course_offering_id) && !courseCodeToOffering.has(r.course_code))
				.map(r => r.course_code)
		)]
		const directCourses = unmatchedCodes.length > 0
			? await fetchBatchedIn(unmatchedCodes, (batch) =>
				supabase.from('courses').select('course_code, course_name, board_id, board_code, course_category, exam_duration').in('course_code', batch)
			)
			: []
		const directCourseMap = new Map(directCourses.map((c: any) => [c.course_code, c]))

		// ── Phase 4: Enrich registrations ──
		const enriched = allRegistrations.map(r => {
			const regNo = r.stu_register_no?.toUpperCase()
			// Use offering map → same course_code from another offering → direct courses lookup → minimal fallback
			const existingOffering = offeringMap.get(r.course_offering_id)
			let offering = existingOffering
			if (!offering && r.course_code) {
				// Try another offering with the same course_code (gets course_name, semester, etc.)
				const byCode = courseCodeToOffering.get(r.course_code)
				if (byCode) {
					// Another offering of the same course carries the course data; the
					// programme is re-resolved from the registration just below.
					offering = { ...byCode }
				} else {
					// Build from direct courses lookup + registration data
					const directCourse = directCourseMap.get(r.course_code)
					const boardInfo = directCourse?.board_code
						? boardCodeMap.get(directCourse.board_code)
						: boardCodeMap.get(r.program_code)
					offering = {
						course_code: r.course_code,
						course_id: null,
						course_order: 999,
						board_type: boardInfo?.board_type || null,
						program_type: programTypeMap.get(r.program_code) || null,
						program_code: r.program_code || '',
						program_name: programNameMap.get(r.program_code) || boardNameMap.get(r.program_code) || null,
						semester: null,
						course_name: directCourse?.course_name || null,
						course_category: directCourse?.course_category || null,
						exam_duration: directCourse?.exam_duration ?? null,
						board_code: boardInfo?.board_code || null,
						board_name: boardNameMap.get(boardInfo?.board_code || '') || null,
						board_order: boardInfo?.board_order ?? 999,
						program_order: programOrderMap.get(r.program_code) ?? 999,
						program_board_order: boardCodeMap.get(r.program_code)?.board_order ?? 999,
					}
				}
			}

			// A learner is printed under their OWN programme, never the programme that
			// owns the course offering. A generic elective is offered once and taken
			// across programmes - 24USTAGE1 / 24UMAGE5 sit on the UCS offering while
			// UCA / UCY / UAD learners register against them - so attributing a row by
			// the offering dragged those learners into the UCS section of every
			// program-wise report (and past the program filter). exam_registrations
			// .program_code is the learner's programme and is what every consumer here
			// means by "program", so it wins wherever the two disagree.
			const learnerProgram = r.program_code || offering?.program_code || ''
			if (offering && learnerProgram && offering.program_code !== learnerProgram) {
				offering = {
					...offering,
					program_code: learnerProgram,
					program_type: programTypeMap.get(learnerProgram) || offering.program_type || null,
					program_name: programNameMap.get(learnerProgram) || boardNameMap.get(learnerProgram) || null,
					program_order: programOrderMap.get(learnerProgram) ?? 999,
					program_board_order: boardCodeMap.get(learnerProgram)?.board_order ?? 999,
				}
			}

			return {
				...r,
				course_offering: offering,
				student_board_type: boardCodeMap.get(r.program_code)?.board_type || programTypeMap.get(r.program_code) || null,
				student_name: (regNo && nameMap.get(regNo)) || r.student_name,
				learner_semester: 0, // filled in below, once every row of the learner is known
				...(regNo && dobMap.has(regNo) ? { date_of_birth: dobMap.get(regNo) } : {}),
				...(regNo && genderMap.has(regNo) ? { gender: genderMap.get(regNo) } : {}),
			}
		})

		// ── Phase 4a: The learner's current semester ──
		// A learner sits in ONE semester and carries arrear papers from the semesters
		// behind it. The learner forms print a whole learner - every paper applied for,
		// regular and arrear, in semester order - so a semester selection scopes the
		// learner COHORT, not the rows. Deciding that per paper listed a Semester 5
		// learner again in the Semester 1, 2, 3 and 4 reports, once for every semester
		// they still owed a paper in.
		//
		// Regular papers define the semester: a learner's regular papers never span two
		// of them. A learner applying for arrears only has no regular paper to go by, so
		// the highest semester they applied in stands in. Resolved over the whole session
		// here, before any filter, so a category or program selection can never move a
		// learner into a different semester.
		const regularSemester = new Map<string, number>()
		const anySemester = new Map<string, number>()
		for (const row of enriched) {
			const sem = Number(row.course_offering?.semester) || 0
			if (!row.stu_register_no || sem <= 0) continue
			if (row.is_regular) regularSemester.set(row.stu_register_no, Math.max(regularSemester.get(row.stu_register_no) ?? 0, sem))
			anySemester.set(row.stu_register_no, Math.max(anySemester.get(row.stu_register_no) ?? 0, sem))
		}
		for (const row of enriched) {
			row.learner_semester = row.stu_register_no
				? (regularSemester.get(row.stu_register_no) ?? anySemester.get(row.stu_register_no) ?? 0)
				: 0
		}

		// ── Phase 4b: Exam application fees (Student Exam Application report) ──
		// The printed form carries a per-paper fee column plus the application and
		// mark statement fees, which the circular charges once per learner per
		// session. exam_registrations holds all four, but only the Exam Application
		// screens stamp the once-per-session heads - a learner registered from any
		// other screen still carries 0 there, so those are priced from the rate book
		// instead, leaving the form payable either way.
		//
		// Late fine is NOT inferred: it depends on when the learner actually applied,
		// so only a fine already stamped on a registration is printed.
		if (report_type === 'student-fee-details') {
			// The three charge columns are added by
			// 20260824_add_application_fees_to_exam_registrations. Until that migration
			// runs they do not exist, so they are fetched separately and a missing
			// column degrades to "nothing stamped" instead of failing the base
			// registrations query - which would empty the whole report.
			const chargeProbe = await supabase
				.from('exam_registrations')
				.select('id, application_fee, mark_statement_fee, late_fine')
				.limit(1)
			const chargeColumnsExist = !chargeProbe.error
			if (!chargeColumnsExist) {
				console.warn(`[ExamReports] exam_registrations has no application_fee / mark_statement_fee / late_fine columns (${chargeProbe.error?.message}). Run supabase/migrations/20260824_add_application_fees_to_exam_registrations.sql; the once-per-session heads are priced from exam_fee_master meanwhile.`)
			}

			const [book, chargeRows] = await Promise.all([
				loadFeeRateBook(supabase, {
					institutions_id,
					examination_session_id,
				}),
				chargeColumnsExist
					? fetchAllPaginated((from, to) => {
						let query = supabase
							.from('exam_registrations')
							.select('id, application_fee, mark_statement_fee, late_fine')
							.eq('institutions_id', institutions_id)
							.eq('examination_session_id', examination_session_id)
						if (isApplicationReport) query = query.or(APPLIED_FILTER)
						return query.order('id', { ascending: true }).range(from, to)
					})
					: Promise.resolve([] as any[]),
			])

			const chargeById = new Map<string, { application_fee: any; mark_statement_fee: any; late_fine: any }>(
				chargeRows.map((c: any) => [c.id, c])
			)

			// ── Per-paper fee: the stored amount wins, an unpriced row falls back to
			// the rate in force for its course category at the programme's fee tier.
			const courseInputs: CourseFeeInput[] = []
			const seenCourseCodes = new Set<string>()
			const collectCourse = (code: any, category: any, duration: any) => {
				const key = String(code || '').trim().toUpperCase()
				if (!key || seenCourseCodes.has(key)) return
				seenCourseCodes.add(key)
				courseInputs.push({ course_code: key, course_category: category ?? null, exam_duration: duration ?? null })
			}
			for (const [, o] of offeringMap) collectCourse(o.course_code, o.course_category, (o as any).exam_duration)
			for (const [, c] of directCourseMap) collectCourse((c as any).course_code, (c as any).course_category, (c as any).exam_duration)

			const pricedByScope = new Map<string, Map<string, { head: PaperFeeHead | null; amount: number | null }>>()
			const pricedFor = (level: ProgramLevel, programCode: string) => {
				const scope = `${level}|${programCode}`
				let priced = pricedByScope.get(scope)
				if (!priced) {
					priced = priceCourseList(book, level, courseInputs, programCode)
					pricedByScope.set(scope, priced)
				}
				return priced
			}

			const num = (v: any) => {
				const n = Number(v)
				return Number.isFinite(n) ? n : 0
			}

			for (const row of enriched as any[]) {
				const programCode = String(row.course_offering?.program_code || row.program_code || '').trim().toUpperCase()
				const level = resolveProgramLevel(programCode, book.levelByProgram)
				const stored = row.fee_amount == null ? null : Number(row.fee_amount)
				if (stored != null && Number.isFinite(stored)) {
					row.paper_fee = stored
				} else {
					const code = String(row.course_offering?.course_code || row.course_code || '').trim().toUpperCase()
					row.paper_fee = code ? (pricedFor(level, programCode).get(code)?.amount ?? null) : null
				}
				const charge = chargeById.get(row.id)
				row.application_fee = num(charge?.application_fee)
				row.mark_statement_fee = num(charge?.mark_statement_fee)
				row.late_fine = num(charge?.late_fine)
			}

			// ── Once-per-session heads: keep what is stamped, otherwise price the
			// learner's tier and stamp it on a single anchor row so any report that
			// sums a learner's rows never double-counts.
			const rowsByLearner = new Map<string, any[]>()
			for (const row of enriched as any[]) {
				const key = String(row.stu_register_no || '').trim().toUpperCase() || `id:${row.id}`
				if (!rowsByLearner.has(key)) rowsByLearner.set(key, [])
				rowsByLearner.get(key)!.push(row)
			}

			let pricedLearners = 0
			for (const [, rows] of rowsByLearner) {
				const alreadyCharged = rows.reduce((sum, r) => sum + r.application_fee + r.mark_statement_fee + r.late_fine, 0)
				if (alreadyCharged > 0) continue

				const anchor = rows[0]
				const programCode = String(anchor.course_offering?.program_code || anchor.program_code || '').trim().toUpperCase()
				const lines = learnerChargeLines(book, resolveProgramLevel(programCode, book.levelByProgram), programCode)
				const application_fee = lines.find(l => l.head === 'APPLICATION')?.amount || 0
				const mark_statement_fee = lines.find(l => l.head === 'MARK_STATEMENT')?.amount || 0
				if (application_fee === 0 && mark_statement_fee === 0) continue

				anchor.application_fee = application_fee
				anchor.mark_statement_fee = mark_statement_fee
				pricedLearners++
			}

			const unpriced = (enriched as any[]).filter(r => r.paper_fee == null).length
			const stamped = chargeById.size > 0
			console.log(`[ExamReports] Fees: ${rowsByLearner.size} learner(s), ${stamped ? 'stamped charges read from exam_registrations, ' : ''}once-per-session priced from rate book for ${pricedLearners}, ${unpriced} paper row(s) with no rate`)
			if (book.isEmpty) {
				console.warn(`[ExamReports] exam_fee_master has no active CREDIT rates for this institution - the Theory / Application / Mark Statement columns print blank until they are configured (Master > Exam Fee).`)
			}
		}

		// ── Phase 5: Date-wise report enrichment (timetable + attendance) ──
		const isDateWiseReport = report_type === 'exam-date-wise-registration' || report_type === 'exam-date-wise-attendance' || report_type === 'board-wise-exam-timetable' || report_type === 'date-wise-exam-timetable' || report_type === 'exam-date-wise-summary' || report_type === 'qp-packing-list'

		if (isDateWiseReport) {
			const registrationIds = enriched.map(r => r.id)

			// Fetch timetables (3 strategies) + practical batch allotment + attendance in parallel
			const [timetablesByOffering, timetablesByCourseId, practicalBatchRows, attendanceData] = await Promise.all([
				// Strategy 2: by course_offering_id
				fetchBatchedIn(courseOfferingIds, (batch) =>
					supabase
						.from('exam_timetables')
						.select('course_offering_id, exam_date, session')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.eq('is_published', true)
						.in('course_offering_id', batch)
				),
				// Strategy 3: by course_id (for shared courses)
				fetchBatchedIn(uniqueCourseIds, (batch) =>
					supabase
						.from('exam_timetables')
						.select('course_id, exam_date, session')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.eq('is_published', true)
						.in('course_id', batch)
				),
				// Strategy 1 (highest priority): practical batch allotment per learner
				// Each practical learner is allotted to a specific exam_timetable (date+session)
				fetchBatchedIn(registrationIds, (batch) =>
					supabase
						.from('practical_batch_students')
						.select('exam_registration_id, exam_timetables:exam_timetable_id(exam_date, session, is_published)')
						.in('exam_registration_id', batch)
				),
				// Attendance (only for attendance report)
				report_type === 'exam-date-wise-attendance'
					? fetchBatchedIn(
						registrationIds,
						(batch) => supabase.from('exam_attendance').select('exam_registration_id, attendance_status').in('exam_registration_id', batch)
					)
					: Promise.resolve([]),
			])

			// Build practical batch map: registration_id → {exam_date, session}
			// Highest priority — handles courses with multiple dates/sessions (e.g. practicals)
			const practicalTimetableMap = new Map<string, { exam_date: string; session: string }>()
			for (const pb of practicalBatchRows as any[]) {
				const tt = pb.exam_timetables
				if (pb.exam_registration_id && tt && tt.is_published && tt.exam_date) {
					practicalTimetableMap.set(pb.exam_registration_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}

			// Build timetable maps
			const timetableByOfferingMap = new Map<string, { exam_date: string; session: string }>()
			for (const tt of timetablesByOffering) {
				if (tt.course_offering_id && !timetableByOfferingMap.has(tt.course_offering_id)) {
					timetableByOfferingMap.set(tt.course_offering_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}
			const timetableByCourseIdMap = new Map<string, { exam_date: string; session: string }>()
			for (const tt of timetablesByCourseId) {
				if (tt.course_id && !timetableByCourseIdMap.has(tt.course_id)) {
					timetableByCourseIdMap.set(tt.course_id, { exam_date: tt.exam_date, session: tt.session })
				}
			}

			// Offering → course_id lookup
			const offeringToCourseId = new Map<string, string>()
			for (const o of allOfferings) {
				if (o.id && o.course_id) offeringToCourseId.set(o.id, o.course_id)
			}

			// Attendance set
			const attendancePresentSet = new Set<string>()
			for (const att of attendanceData) {
				if (att.attendance_status === 'Present') attendancePresentSet.add(att.exam_registration_id)
			}

			// Attach to enriched rows — priority: practical batch (per-learner) → offering → course_id
			// Track which strategy resolved each row (for diagnostics)
			const unresolvedDiag = new Map<string, {
				count: number
				course_name: string | null
				program_code: string | null
				course_offering_id: string | null
				course_id_known: boolean
				has_practical_batch_unpublished: boolean
				sample_register_no: string
			}>()

			for (const row of enriched) {
				const practicalTt = practicalTimetableMap.get(row.id)
				if (practicalTt) {
					row.exam_date = practicalTt.exam_date
					row.exam_session = practicalTt.session
				} else {
					const tt = timetableByOfferingMap.get(row.course_offering_id)
					if (tt) {
						row.exam_date = tt.exam_date
						row.exam_session = tt.session
					} else {
						const courseId = offeringToCourseId.get(row.course_offering_id)
						if (courseId) {
							const ttFallback = timetableByCourseIdMap.get(courseId)
							if (ttFallback) {
								row.exam_date = ttFallback.exam_date
								row.exam_session = ttFallback.session
							}
						}
					}
				}
				if (report_type === 'exam-date-wise-attendance') {
					row.is_present = attendancePresentSet.has(row.id)
				}

				// Diagnostic: track rows that ended up without an exam_date
				if (!row.exam_date) {
					const co = row.course_offering
					const code = co?.course_code || row.course_code || 'UNKNOWN'
					const courseId = offeringToCourseId.get(row.course_offering_id) || null
					if (!unresolvedDiag.has(code)) {
						unresolvedDiag.set(code, {
							count: 0,
							course_name: co?.course_name || null,
							program_code: co?.program_code || row.program_code || null,
							course_offering_id: row.course_offering_id || null,
							course_id_known: !!courseId,
							has_practical_batch_unpublished: false,
							sample_register_no: row.stu_register_no || '',
						})
					}
					unresolvedDiag.get(code)!.count++
				}
			}

			// Diagnostic: detect practical_batch_students rows that exist but reference unpublished timetables
			const unpublishedPbRegIds = new Set<string>()
			for (const pb of practicalBatchRows as any[]) {
				const tt = pb.exam_timetables
				if (pb.exam_registration_id && tt && !tt.is_published) {
					unpublishedPbRegIds.add(pb.exam_registration_id)
				}
			}
			if (unpublishedPbRegIds.size > 0) {
				for (const row of enriched) {
					if (!row.exam_date && unpublishedPbRegIds.has(row.id)) {
						const code = row.course_offering?.course_code || row.course_code || 'UNKNOWN'
						const entry = unresolvedDiag.get(code)
						if (entry) entry.has_practical_batch_unpublished = true
					}
				}
			}

			if (unresolvedDiag.size > 0) {
				console.warn(`[ExamReports] ${unresolvedDiag.size} course(s) DROPPED from ${report_type} (no exam_date resolved):`)
				for (const [code, info] of unresolvedDiag) {
					console.warn(`  • ${code} (${info.course_name || 'no name'}) | program=${info.program_code} | regs=${info.count} | offering_id=${info.course_offering_id} | course_id_known=${info.course_id_known} | unpublished_practical_batch=${info.has_practical_batch_unpublished} | sample_learner=${info.sample_register_no}`)
				}
			}
		}

		// Student Exam Registration (program-wise & student-wise): only regular papers (is_regular = true)
		const responseData = (report_type === 'student-exam-registration' || report_type === 'student-exam-registration-summary' || report_type === 'student-wise-registration')
			? enriched.filter((r: any) => r.is_regular === true)
			: enriched

		return NextResponse.json({
			report_type,
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: session.session_name,
			session_code: session.session_code,
			generated_at: new Date().toISOString(),
			data: responseData,
			...(notApplied ? { not_applied: notApplied } : {}),
		})
	} catch (e) {
		console.error('Exam registration reports API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
