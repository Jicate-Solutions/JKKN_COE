import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	MyJKKNApiError,
	fetchAllMyJKKNInstitutions,
	fetchAllMyJKKNLearnerProfiles,
	fetchAllMyJKKNPrograms,
} from '@/lib/myjkkn-api'
import type {
	StudentStrengthReport,
	ProgramStrengthRow,
	SubtotalRow,
	YearCount,
} from '@/types/student-strength-report'

// ── Next.js data cache for MyJKKN API responses ───────────────────────────────
// These endpoints are slow (22 pages × 200 records for learners).
// Cache them so repeat report loads are near-instant.

const getCachedInstitutions = unstable_cache(
	() => fetchAllMyJKKNInstitutions({ all: true } as Parameters<typeof fetchAllMyJKKNInstitutions>[0]),
	['myjkkn-institutions'],
	{ revalidate: 86400, tags: ['myjkkn-institutions'] } // 24 hours — institutions rarely change
)

const getCachedPrograms = unstable_cache(
	() => fetchAllMyJKKNPrograms({ all: true } as Parameters<typeof fetchAllMyJKKNPrograms>[0]),
	['myjkkn-programs'],
	{ revalidate: 86400, tags: ['myjkkn-programs'] } // 24 hours — programs rarely change
)

// Learner profiles: 1 hour TTL. Keyed by institution_id arg so each institution
// gets its own cache bucket. MyJKKN returns all learners regardless of institution_id,
// so we only need to call once and filter client-side.
// IMPORTANT: Only cache the 4 fields we actually use — full profiles are ~10MB which
// exceeds Next.js's 2MB unstable_cache limit.
type SlimLearner = { register_number: string; institution_id: string; institution_code: string; program_code: string }

const getCachedLearners = unstable_cache(
	async (institutionId: string): Promise<SlimLearner[]> => {
		const learners = await fetchAllMyJKKNLearnerProfiles({
			institution_id: institutionId,
			all: true,
			limit: 200, // API max is 200/page; must equal actual max so fetchAllPages paginates
		} as Parameters<typeof fetchAllMyJKKNLearnerProfiles>[0])
		return (learners as Record<string, unknown>[]).map(l => ({
			register_number: String(l.register_number ?? ''),
			institution_id:  String(l.institution_id  ?? ''),
			institution_code: String(l.institution_code ?? ''),
			program_code:    String(l.program_code    ?? ''),
		}))
	},
	['myjkkn-learners'],
	{ revalidate: 3600, tags: ['myjkkn-learners'] } // 1 hour
)

// unstable_cache does not coalesce concurrent misses: every report request that lands
// while the first sweep is still running starts its own 25-page crawl, and MyJKKN
// answers the pile-up with 500s. Share one in-flight sweep per institution instead.
// Failures are not retained — the entry is dropped as soon as the sweep settles.
const inflightLearners = new Map<string, Promise<SlimLearner[]>>()

function getLearnersOnce(institutionId: string): Promise<SlimLearner[]> {
	const pending = inflightLearners.get(institutionId)
	if (pending) return pending

	const sweep = getCachedLearners(institutionId).finally(() => {
		inflightLearners.delete(institutionId)
	})
	inflightLearners.set(institutionId, sweep)
	return sweep
}

function emptyYearCount(): YearCount {
	return { aided: 0, sf: 0, total: 0 }
}

function computeSubtotal(rows: ProgramStrengthRow[], maxYear: number): SubtotalRow {
	const year_counts: Record<number, YearCount> = {}
	for (let y = 1; y <= maxYear; y++) year_counts[y] = emptyYearCount()
	const grand = emptyYearCount()

	for (const row of rows) {
		for (let y = 1; y <= maxYear; y++) {
			const yc = row.year_counts[y] || emptyYearCount()
			year_counts[y].aided += yc.aided
			year_counts[y].sf += yc.sf
			year_counts[y].total += yc.total
			grand.aided += yc.aided
			grand.sf += yc.sf
			grand.total += yc.total
		}
	}

	return { year_counts, grand }
}

type RegistrationRow = {
	stu_register_no: string
	course_offering_id: string
	program_code: string
	course_offerings: { semester: number } | null
}

/**
 * GET /api/reports/student-strength
 * Query params: institutions_id, examination_session_id
 *
 * Generates a pre-exam student strength report showing enrollment by program,
 * academic year, and funding type (AIDED / SF).
 *
 * AIDED/SF logic:
 * - CAS institution has 2 myjkkn_institution_ids; name containing "(Aided)" → AIDED
 * - All other institutions → SF only
 *
 * Performance strategy:
 * - Phase 1: institution + session + exam_registrations fetched in parallel
 * - Phase 2: MyJKKN institutions + learners (once) + programs fetched in parallel
 * - Learners fetched only once — MyJKKN API ignores institution_id server-side;
 *   filtered client-side by learner.institution_id
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// ?refresh=true forces a fresh fetch from MyJKKN by busting the cache
		if (searchParams.get('refresh') === 'true') {
			const { revalidateTag } = await import('next/cache')
			revalidateTag('myjkkn-learners')
			revalidateTag('myjkkn-institutions')
			revalidateTag('myjkkn-programs')
		}

		// ── Phase 1: Parallel Supabase fetches ───────────────────────────────────
		const fetchRegistrations = async (): Promise<RegistrationRow[]> => {
			const all: RegistrationRow[] = []
			let offset = 0
			const pageSize = 1000
			while (true) {
				const { data, error } = await supabase
					.from('exam_registrations')
					.select('stu_register_no, course_offering_id, program_code, course_offerings(semester)')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.range(offset, offset + pageSize - 1)

				if (error || !data || data.length === 0) break
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				all.push(...(data as any))
				if (data.length < pageSize) break
				offset += pageSize
			}
			return all
		}

		const [institutionResult, sessionResult, allRegistrations] = await Promise.all([
			supabase
				.from('institutions')
				.select('id, name, institution_code, myjkkn_institution_ids')
				.eq('id', institutions_id)
				.single(),
			supabase
				.from('examination_sessions')
				.select('id, session_name, session_code')
				.eq('id', examination_session_id)
				.single(),
			fetchRegistrations(),
		])

		const { data: institution, error: instError } = institutionResult
		if (instError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		if (allRegistrations.length === 0) {
			return NextResponse.json(
				{ error: 'No exam registrations found for this session' },
				{ status: 404 }
			)
		}

		const { data: session } = sessionResult
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []
		const myjkknIdsStr = myjkknIds.map(String)

		// ── Phase 2: MyJKKN institutions + programs (cached 24h, small) ──────────
		// Learner profiles are deliberately NOT fetched here — whether they are needed
		// at all depends on has_aided, which these two answers decide (see below).
		// Results are cached via unstable_cache — subsequent requests skip the API calls.
		const [allMyjkknInst, allPrograms] = await Promise.all([
			myjkknIdsStr.length > 0 ? getCachedInstitutions() : Promise.resolve([]),
			getCachedPrograms(),
		])

		// ── Build institution type map (AIDED / SF) ──────────────────────────────
		// COE stores one merged "CAS" institution but MyJKKN has two separate:
		//   "JKKN College of Arts and Science (Aided)" → AIDED
		//   "JKKN College of Arts and Science (Self)"  → SF
		// Index under BOTH id and institution_code — learner profiles may reference either.
		const institutionTypeMap = new Map<string, 'AIDED' | 'SF'>()

		for (const inst of allMyjkknInst) {
			const i = inst as Record<string, unknown>
			const instId   = String(i.id ?? '')
			const instCode = String(i.institution_code ?? '')

			const matched =
				(instId   && myjkknIdsStr.includes(instId))   ||
				(instCode && myjkknIdsStr.includes(instCode))
			if (!matched) continue

			const name = String(i.name || i.institution_name || '').toLowerCase()
			const type: 'AIDED' | 'SF' = name.includes('aided') ? 'AIDED' : 'SF'

			if (instId)   institutionTypeMap.set(instId,   type)
			if (instCode) institutionTypeMap.set(instCode, type)
		}

		const has_aided = [...institutionTypeMap.values()].includes('AIDED')

		// ── Learner profiles (only when they can change the answer) ──────────────
		// They feed two things: the AIDED/SF split and a program_code fallback for
		// registrations that lack one. An institution with no aided arm whose
		// registrations all carry a program_code gets an identical report without
		// paying for — or failing on — the 25-page MyJKKN profile sweep.
		const needsProgramFallback = allRegistrations.some(r => !(r.program_code || '').trim())
		const allLearners: SlimLearner[] =
			myjkknIds.length > 0 && (has_aided || needsProgramFallback)
				? await getLearnersOnce(String(myjkknIds[0]))
				: []

		// ── Build learner map (register_number → AIDED/SF) ───────────────────────
		// Filter to learners whose institution_id belongs to this COE institution.
		// AIDED always wins: if a learner appears as SF first, AIDED overwrites it.
		type LearnerInfo = { type: 'AIDED' | 'SF'; program_code: string }
		const learnerMap = new Map<string, LearnerInfo>()

		for (const learner of allLearners) {
			const rawReg = learner.register_number.trim().toUpperCase()
			if (!rawReg) continue

			const lInstId   = learner.institution_id
			const lInstCode = learner.institution_code

			// Skip learners that don't belong to this institution
			const belongsHere =
				(lInstId   && myjkknIdsStr.includes(lInstId))   ||
				(lInstCode && myjkknIdsStr.includes(lInstCode))
			if (!belongsHere) continue

			const type: 'AIDED' | 'SF' =
				institutionTypeMap.get(lInstId)   ||
				institutionTypeMap.get(lInstCode) ||
				'SF'

			const existing = learnerMap.get(rawReg)
			if (!existing || type === 'AIDED') {
				learnerMap.set(rawReg, {
					type,
					program_code: learner.program_code,
				})
			}
		}

		// ── Build program metadata map ────────────────────────────────────────────
		const programMeta = new Map<string, { name: string; type: 'UG' | 'PG'; order: number }>()
		allPrograms.forEach((prog, idx) => {
			const p = prog as Record<string, unknown>
			const code = ((p.program_code || p.program_id || '') as string).trim()
			if (!code) return
			const rawType = ((p.program_type || '') as string).toLowerCase()
			const type: 'UG' | 'PG' =
				rawType.includes('pg') || rawType.includes('post') ? 'PG' : 'UG'
			// program_order may arrive as number or numeric string
			const rawOrder = p.program_order
			const order =
				typeof rawOrder === 'number'
					? rawOrder
					: typeof rawOrder === 'string' && rawOrder !== '' && !isNaN(Number(rawOrder))
						? Number(rawOrder)
						: idx
			programMeta.set(code, {
				name: (p.program_name || code) as string,
				type,
				order,
			})
		})

		// ── Aggregate: unique student per (program, year) with AIDED/SF split ─────
		// Each student is counted only in their HIGHEST year for this session.
		// A II-year student taking I-year arrear papers is counted in II year only.

		// Pass 1: find the max (current) year per student per program
		const studentMaxYear = new Map<string, number>() // `${regNo}_${programCode}` → maxYear
		let maxYear = 1

		for (const reg of allRegistrations) {
			const regNo = (reg.stu_register_no || '').trim().toUpperCase()
			if (!regNo) continue
			const coSem = reg.course_offerings
			const semNumber = (Array.isArray(coSem) ? coSem[0]?.semester : coSem?.semester) ?? 1
			const year = Math.ceil(semNumber / 2)
			if (year > maxYear) maxYear = year
			const programCode =
				(reg.program_code || learnerMap.get(regNo)?.program_code || '').trim() || 'UNKNOWN'
			const key = `${regNo}_${programCode}`
			const prev = studentMaxYear.get(key) ?? 0
			if (year > prev) studentMaxYear.set(key, year)
		}

		// Pass 2: count each student once, in their max year only
		const counts = new Map<string, { aided: number; sf: number }>()
		const seenStudents = new Set<string>()

		for (const reg of allRegistrations) {
			const regNo = (reg.stu_register_no || '').trim().toUpperCase()
			if (!regNo) continue

			const coSem = reg.course_offerings
			const semNumber = (Array.isArray(coSem) ? coSem[0]?.semester : coSem?.semester) ?? 1
			const year = Math.ceil(semNumber / 2)

			const programCode =
				(reg.program_code || learnerMap.get(regNo)?.program_code || '').trim() || 'UNKNOWN'

			// Skip arrear registrations — count in current (max) year only
			const currentYear = studentMaxYear.get(`${regNo}_${programCode}`) ?? year
			if (year < currentYear) continue

			// Each student counted once per program
			const studentKey = `${regNo}_${programCode}`
			if (seenStudents.has(studentKey)) continue
			seenStudents.add(studentKey)

			const countKey = `${programCode}_${currentYear}`
			if (!counts.has(countKey)) counts.set(countKey, { aided: 0, sf: 0 })
			const count = counts.get(countKey)!

			const learnerInfo = learnerMap.get(regNo)
			if (learnerInfo?.type === 'AIDED') {
				count.aided++
			} else {
				count.sf++
			}
		}

		// ── Build program rows ────────────────────────────────────────────────────
		const programCodeSet = new Set<string>()
		for (const key of counts.keys()) {
			const idx = key.lastIndexOf('_')
			programCodeSet.add(key.substring(0, idx))
		}

		const allProgramRows: ProgramStrengthRow[] = []
		for (const programCode of programCodeSet) {
			const meta = programMeta.get(programCode)
			const year_counts: Record<number, YearCount> = {}
			for (let y = 1; y <= maxYear; y++) {
				const c = counts.get(`${programCode}_${y}`) || { aided: 0, sf: 0 }
				year_counts[y] = { aided: c.aided, sf: c.sf, total: c.aided + c.sf }
			}
			allProgramRows.push({
				s_no: 0,
				program_code: programCode,
				program_name: meta?.name || programCode,
				program_type: meta?.type || 'UG',
				program_order: meta?.order ?? 9999,
				year_counts,
			})
		}

		// Sort: UG first, then PG; within each group by program_order
		allProgramRows.sort((a, b) => {
			if (a.program_type !== b.program_type) return a.program_type === 'UG' ? -1 : 1
			return a.program_order - b.program_order
		})

		const ug_rows = allProgramRows.filter(r => r.program_type === 'UG')
		const pg_rows = allProgramRows.filter(r => r.program_type === 'PG')
		ug_rows.forEach((r, i) => (r.s_no = i + 1))
		pg_rows.forEach((r, i) => (r.s_no = i + 1))

		const ug_subtotal = computeSubtotal(ug_rows, maxYear)
		const pg_subtotal = computeSubtotal(pg_rows, maxYear)
		const grand_total = computeSubtotal(allProgramRows, maxYear)

		const report: StudentStrengthReport = {
			institution_name: institution.name || '',
			institution_code: institution.institution_code || '',
			exam_session_name: session?.session_name || session?.session_code || '',
			generated_at: new Date().toISOString(),
			has_aided,
			max_year: maxYear,
			ug_rows,
			pg_rows,
			ug_subtotal,
			pg_subtotal,
			grand_total,
		}

		return NextResponse.json(report)
	} catch (error) {
		console.error('[Student Strength Report] Unexpected error:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: `MyJKKN API is not responding (${error.status}). Please try again in a moment.` },
				{ status: 502 }
			)
		}
		return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
	}
}
