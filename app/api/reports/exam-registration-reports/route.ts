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
		// Fetch next 4 pages in parallel
		const pagePromises = []
		for (let i = 0; i < 4 && hasMore; i++) {
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
// Profiles change rarely but the sweep costs many sequential 200-row pages, and the same
// institution is hit again every time the user switches report type. Cache per institution.
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000
const profileCache = new Map<string, { at: number; data: any[] }>()

/** Keep only the fields the reports actually read — cached rows stay small */
function slimProfile(p: any) {
	return {
		register_number: p.register_number,
		student_name: p.student_name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
		date_of_birth: p.date_of_birth || null,
		gender: p.gender || null,
	}
}

/** True when the given profiles resolve every register number we need */
function coversAll(profiles: any[], needed: Set<string>): boolean {
	if (needed.size === 0) return true
	const seen = new Set<string>()
	for (const p of profiles) {
		if (p.register_number && needed.has(p.register_number)) seen.add(p.register_number)
	}
	return seen.size >= needed.size
}

async function fetchLearnerProfilesCached(
	apiUrl: string,
	instIds: string[],
	apiKey: string,
	needed: Set<string>
): Promise<any[]> {
	try {
		const now = Date.now()
		const cached: any[] = []
		const stale: string[] = []
		for (const id of instIds) {
			const hit = profileCache.get(id)
			if (hit && now - hit.at < PROFILE_CACHE_TTL_MS) cached.push(...hit.data)
			else stale.push(id)
		}

		// Everything cached and every learner resolved — no network call at all
		if (stale.length === 0 && coversAll(cached, needed)) {
			console.log(`[ExamReports] Profile cache hit (${cached.length} rows, 0 requests)`)
			return cached
		}

		// Partially cached: only sweep the institutions we lack. If the cache is complete but
		// doesn't cover these learners (an earlier sweep stopped early), re-sweep all of them.
		const toFetch = stale.length > 0 ? stale : instIds
		const found = new Set<string>()
		for (const p of cached) {
			if (p.register_number && needed.has(p.register_number)) found.add(p.register_number)
		}

		const results = await Promise.all(toFetch.map(instId =>
			fetchMyJKKNPaginated(apiUrl, 'learners/profiles', instId, apiKey, 200, (profiles) => {
				for (const p of profiles) {
					if (p.register_number && needed.has(p.register_number)) found.add(p.register_number)
				}
				return found.size >= needed.size
			}).then(rows => {
				const slim = rows.map(slimProfile)
				profileCache.set(instId, { at: Date.now(), data: slim })
				return slim
			})
		))

		return stale.length > 0 ? [...cached, ...results.flat()] : results.flat()
	} catch {
		return []
	}
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
		const APPLIED_STATUSES = ['Applied', 'Approved']
		const isApplicationReport = report_type === 'student-fee-details' || report_type === 'student-wise-application'

		if (!institutions_id || !examination_session_id || !report_type) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id, and report_type are required' },
				{ status: 400 }
			)
		}

		// ── Phase 1: Fetch institution, session, and registrations in parallel ──
		const [{ data: institution }, { data: session }, allRegistrations] = await Promise.all([
			supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).single(),
			supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).single(),
			fetchAllPaginated((from, to) => {
				let query = supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, attempt_number, fee_paid, fee_amount, registration_status, program_code, course_offering_id, course_code')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
				if (isApplicationReport) query = query.in('registration_status', APPLIED_STATUSES)
				return query
					.order('stu_register_no', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
			}),
		])

		if (!institution || !session) {
			return NextResponse.json({ error: 'Institution or Session not found' }, { status: 404 })
		}

		if (allRegistrations.length === 0) {
			if (isApplicationReport) {
				console.warn(`[ExamReports] No registration in this session has registration_status ${APPLIED_STATUSES.join(' / ')} - the Exam Application report covers applied learners only. Apply the cohort from Exam Management > Exam Applications first.`)
			}
			return NextResponse.json({
				report_type,
				institution_name: institution.name,
				institution_code: institution.institution_code,
				session_name: session.session_name,
				session_code: session.session_code,
				generated_at: new Date().toISOString(),
				data: [],
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
		const registerNumberSet = new Set(registerNumbers)

		// Only the student-* reports print learner name / DOB / gender
		const needsLearnerProfiles = report_type.startsWith('student-')

		const [courseMappings, myjkknProfilesRaw] = await Promise.all([
			// Course mapping (parallel batches)
			fetchBatchedIn(uniqueCourseIds, (batch) =>
				supabase.from('course_mapping').select('course_id, course_order').in('course_id', batch)
			),
			// MyJKKN learner profiles — only the learner-detail reports read names/DOB/gender.
			// Count and date-wise reports aggregate by course, so skip the sweep entirely for them.
			(needsLearnerProfiles && registerNumbers.length > 0 && myjkknIds.length > 0 && myjkknApiKey)
				? fetchLearnerProfilesCached(myjkknApiUrl, myjkknIds, myjkknApiKey, registerNumberSet)
				: Promise.resolve([] as any[]),
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
			const regNo = lp.register_number
			if (!regNo || !registerNumberSet.has(regNo)) continue
			const key = regNo.toUpperCase()
			if (!nameMap.has(key)) {
				const fullName = lp.student_name || lp.full_name || [lp.first_name, lp.last_name].filter(Boolean).join(' ')
				if (fullName) nameMap.set(key, fullName)
			}
			if (isStudentWise && !genderMap.has(key) && lp.gender) {
				const g = String(lp.gender).trim()
				if (g) genderMap.set(key, g.charAt(0).toUpperCase() + g.slice(1).toLowerCase())
			}
			if ((report_type === 'student-fee-details' || report_type === 'student-exam-registration' || report_type === 'student-wise-application' || report_type === 'student-wise-registration') && !dobMap.has(key) && lp.date_of_birth) {
				try {
					const dob = new Date(lp.date_of_birth)
					if (!isNaN(dob.getTime())) {
						dobMap.set(key, `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`)
					} else {
						dobMap.set(key, lp.date_of_birth)
					}
				} catch {
					dobMap.set(key, lp.date_of_birth)
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
					// Use the other offering's data but override program_code from registration
					offering = { ...byCode, program_code: r.program_code || byCode.program_code }
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
			return {
				...r,
				course_offering: offering,
				student_board_type: boardCodeMap.get(r.program_code)?.board_type || programTypeMap.get(r.program_code) || null,
				student_name: (regNo && nameMap.get(regNo)) || r.student_name,
				...(regNo && dobMap.has(regNo) ? { date_of_birth: dobMap.get(regNo) } : {}),
				...(regNo && genderMap.has(regNo) ? { gender: genderMap.get(regNo) } : {}),
			}
		})

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
						if (isApplicationReport) query = query.in('registration_status', APPLIED_STATUSES)
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
		const isDateWiseReport = report_type === 'exam-date-wise-registration' || report_type === 'exam-date-wise-attendance' || report_type === 'board-wise-exam-timetable' || report_type === 'exam-date-wise-summary' || report_type === 'qp-packing-list'

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
		})
	} catch (e) {
		console.error('Exam registration reports API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
