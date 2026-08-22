/**
 * Shared enrichment for MyJKKN learner profiles.
 *
 * The `learners/profiles` endpoint returns raw foreign keys (institution_id,
 * program_id, semester_id, department_id, batch_id) and inconsistent field
 * names for the same value (college_email vs student_email, student_mobile vs
 * phone, six different photo-url spellings). Every consumer needs the resolved,
 * normalized shape, so the lookup maps and the mapper live here rather than
 * inside one API route.
 *
 * Used by:
 *  - app/api/myjkkn/learner-profiles/route.ts        (single page / fetchAll)
 *  - app/api/myjkkn/learner-profiles/directory/route.ts (full cached sweep)
 */

import {
	fetchMyJKKNInstitutions,
	fetchMyJKKNPrograms,
	fetchMyJKKNSemesters,
	fetchMyJKKNDepartments,
	fetchMyJKKNBatches,
} from '@/lib/myjkkn-api'
import { getSupabaseServer } from '@/lib/supabase-server'

// MyJKKN API has a server-side max limit per request
export const MYJKKN_MAX_PER_PAGE = 200

/**
 * Lifecycle values MyJKKN uses for a learner who is still on the rolls.
 * Anything else (alumni, discontinued, transferred, ...) counts as inactive.
 */
const ACTIVE_LIFECYCLE_STATUSES = new Set([
	'active',
	'studying',
	'enrolled',
	'continuing',
	'ongoing',
])

export function isActiveLifecycleStatus(status: string): boolean {
	return ACTIVE_LIFECYCLE_STATUSES.has(status.toLowerCase())
}

// Fetch EVERY page of a MyJKKN list endpoint. The API silently caps each request
// at MYJKKN_MAX_PER_PAGE (200) regardless of the requested `limit`, so a single
// `{ limit: 1000 }` call only ever returns the first 200 rows. Lookups like
// semesters exceed that (433 rows across 3 pages), and dropping the tail means a
// learner's semester_id can't resolve → current_semester collapses to null and the
// cohort disappears from filters. Paginate until a short page is returned.
//
// Resilience matters here: the caller wraps this in `.catch(() => [])`, so if a
// SINGLE page rejected and bubbled up, the ENTIRE lookup (e.g. all 433 semesters)
// would be discarded and every semester_id would fail to resolve. That is exactly
// what surfaces in production — under serverless concurrency the MyJKKN API
// rate-limits/times out a later page even when localhost fetches cleanly. So each
// page is retried a couple of times and, if it still fails, we keep the pages we
// already have (partial data) instead of throwing the whole lookup away.
async function fetchPageWithRetry<T>(
	fetchFn: (opts: { page: number; limit: number }) => Promise<{ data?: T[] }>,
	page: number,
	retries = 2
): Promise<T[] | null> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetchFn({ page, limit: MYJKKN_MAX_PER_PAGE })
			return res.data || []
		} catch (err) {
			if (attempt === retries) {
				console.error(`[fetchAllLookupPages] page ${page} failed after ${retries + 1} attempts:`, err)
				return null
			}
		}
	}
	return null
}

async function fetchAllLookupPages<T>(
	fetchFn: (opts: { page: number; limit: number }) => Promise<{ data?: T[]; metadata?: any; pagination?: any }>
): Promise<T[]> {
	const all: T[] = []
	const first = await fetchFn({ page: 1, limit: MYJKKN_MAX_PER_PAGE })
	all.push(...(first.data || []))
	const info = (first as any).metadata || (first as any).pagination || {}
	const totalPages = info.totalPages
		|| (info.total ? Math.ceil(info.total / MYJKKN_MAX_PER_PAGE) : 1)
	for (let page = 2; page <= totalPages; page++) {
		const rows = await fetchPageWithRetry(fetchFn, page)
		// null = page failed after retries; keep what we have rather than nuking the lookup.
		if (rows === null) continue
		if (rows.length === 0) break
		all.push(...rows)
	}
	return all
}

// Cache for lookup data with TTL (5 minutes)
const LOOKUP_CACHE_TTL = 5 * 60 * 1000
let lookupCache: { data: LookupMaps | null; timestamp: number } = { data: null, timestamp: 0 }

// Cache for lookup data (refreshed per request)
export interface LookupMaps {
	institutions: Map<string, { counselling_code: string; name: string }>
	programs: Map<string, { program_code: string; program_name: string }>
	semesters: Map<string, { semester_code: string; semester_name: string; semester_number: number }>
	departments: Map<string, { department_code: string; department_name: string }>
	batches: Map<string, { batch_code: string; batch_name: string }>
	localInstitutions: Map<string, { institution_name: string; institution_code: string }>
}

// Helper: parse semester value from number, string code, or raw format
export function parseSemesterValue(val: unknown): number {
	if (val == null) return 0
	const n = Number(val)
	if (!isNaN(n) && n > 0) return n
	// Fallback: extract digits from string code (e.g., "ECE-4" → 4, "Sem IV" → 0)
	const str = String(val)
	const m = str.match(/(\d+)/)
	return m ? parseInt(m[1], 10) : 0
}

// Fetch all lookup data from MyJKKN APIs (with caching)
export async function fetchLookupData(): Promise<LookupMaps> {
	// Check cache first
	const now = Date.now()
	if (lookupCache.data && (now - lookupCache.timestamp) < LOOKUP_CACHE_TTL) {
		console.log('[Learner Profiles API] Using cached lookup data')
		return lookupCache.data
	}

	console.log('[Learner Profiles API] Fetching lookup data for enrichment...')

	// Each list must be fully paginated — a single { limit: 1000 } call is capped at
	// 200 rows server-side, which silently drops semesters/programs beyond the first page.
	const [institutionsData, programsData, semestersData, departmentsData, batchesData] = await Promise.all([
		fetchAllLookupPages(opts => fetchMyJKKNInstitutions(opts)).catch(() => []),
		fetchAllLookupPages(opts => fetchMyJKKNPrograms(opts)).catch(() => []),
		fetchAllLookupPages(opts => fetchMyJKKNSemesters(opts)).catch(() => []),
		fetchAllLookupPages(opts => fetchMyJKKNDepartments(opts)).catch(() => []),
		fetchAllLookupPages(opts => fetchMyJKKNBatches(opts)).catch(() => []),
	])

	// Build institution lookup map (id -> { counselling_code, name })
	const institutions = new Map<string, { counselling_code: string; name: string }>()
	for (const inst of institutionsData || []) {
		const instAny = inst as Record<string, unknown>
		institutions.set(
			instAny.id as string,
			{
				counselling_code: (instAny.counselling_code || instAny.institution_code || '') as string,
				name: (instAny.name || instAny.institution_name || '') as string
			}
		)
	}

	// Build program lookup map (id -> { program_code, program_name })
	const programs = new Map<string, { program_code: string; program_name: string }>()
	for (const prog of programsData || []) {
		const progAny = prog as Record<string, unknown>
		programs.set(
			progAny.id as string,
			{
				program_code: (progAny.program_code || progAny.program_id || '') as string,
				program_name: (progAny.program_name || '') as string
			}
		)
	}

	// Build semester lookup map (id -> { semester_code, semester_name, semester_number })
	const semesters = new Map<string, { semester_code: string; semester_name: string; semester_number: number }>()
	for (const sem of semestersData || []) {
		const semAny = sem as Record<string, unknown>
		const semName = (semAny.semester_name || '') as string
		const semCode = (semAny.semester_code || '') as string
		// Extract semester number from name (e.g., "SEMESTER II" -> 2, "SEMESTER IV" -> 4)
		// or from code suffix (e.g., "UEN-2" -> 2)
		let semNumber = (semAny.semester_number || 0) as number
		if (!semNumber) {
			// Try to extract from semester name using Roman numerals
			const romanMatch = semName.match(/(?:SEMESTER|SEM)\s*([IVXLC]+)/i)
			if (romanMatch) {
				const romanToNum: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
				semNumber = romanToNum[romanMatch[1].toUpperCase()] || 0
			}
			// Fallback: try to extract from code suffix (e.g., "UEN-2" -> 2)
			if (!semNumber) {
				const codeMatch = semCode.match(/-(\d+)$/)
				if (codeMatch) {
					semNumber = parseInt(codeMatch[1], 10)
				}
			}
		}
		semesters.set(
			semAny.id as string,
			{
				semester_code: semCode,
				semester_name: semName,
				semester_number: semNumber
			}
		)
	}

	// Build department lookup map (id -> { department_code, department_name })
	const departments = new Map<string, { department_code: string; department_name: string }>()
	for (const dept of departmentsData || []) {
		const deptAny = dept as Record<string, unknown>
		departments.set(
			deptAny.id as string,
			{
				department_code: (deptAny.department_code || '') as string,
				department_name: (deptAny.department_name || '') as string
			}
		)
	}

	// Build batch lookup map (id -> { batch_code, batch_name })
	const batches = new Map<string, { batch_code: string; batch_name: string }>()
	for (const batch of batchesData || []) {
		const batchAny = batch as Record<string, unknown>
		batches.set(
			batchAny.id as string,
			{
				batch_code: (batchAny.batch_code || '') as string,
				batch_name: (batchAny.batch_name || '') as string
			}
		)
	}

	// Fetch local COE institutions for name lookup by institution_code
	const localInstitutions = new Map<string, { institution_name: string; institution_code: string }>()
	try {
		const supabase = getSupabaseServer()
		// NOTE: the COE institutions table column is `name`, not `institution_name`.
		const { data: localInsts, error: instErr } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.range(0, 9999)

		if (instErr) console.warn('[Learner Profiles API] local institutions query error:', instErr.message)

		for (const inst of localInsts || []) {
			// Map by institution_code (counselling_code from MyJKKN)
			if (inst.institution_code) {
				localInstitutions.set(inst.institution_code, {
					institution_name: inst.name || '',
					institution_code: inst.institution_code
				})
			}
		}

		// Resolve semesters from the local COE `course_mapping` table.
		// The MyJKKN semesters API only returns one page (~200 rows), so many semester_ids
		// don't resolve there, collapsing a learner's current_semester to null. course_mapping
		// is read through the same server client by the course-offering lookups route, so it is
		// reliably readable here, and carries semester_id + semester_code (e.g. "EEE-6" → 6).
		const { data: cmRows, error: cmErr } = await supabase
			.from('course_mapping')
			.select('semester_id, semester_code')
			.not('semester_id', 'is', null)
			.not('semester_code', 'is', null)
			.range(0, 99999)

		if (cmErr) console.warn('[Learner Profiles API] course_mapping semesters query error:', cmErr.message)

		const seenSemIds = new Set<string>()
		for (const row of cmRows || []) {
			const semId = (row as { semester_id?: string }).semester_id
			const semCode = (row as { semester_code?: string }).semester_code || ''
			if (!semId || seenSemIds.has(semId)) continue
			seenSemIds.add(semId)
			// course_mapping wins over the truncated MyJKKN list.
			semesters.set(semId, {
				semester_code: semCode,
				semester_name: semCode,
				semester_number: parseSemesterValue(semCode),
			})
		}
		console.log(`[Learner Profiles API] Merged ${seenSemIds.size} semesters from course_mapping (queried ${cmRows?.length ?? 0} rows)`)
	} catch (err) {
		console.warn('[Learner Profiles API] Could not fetch local institutions/semesters:', err)
	}

	console.log(`[Learner Profiles API] Lookup data loaded: ${institutions.size} institutions, ${programs.size} programs, ${semesters.size} semesters, ${departments.size} departments, ${batches.size} batches, ${localInstitutions.size} local institutions`)

	const result = { institutions, programs, semesters, departments, batches, localInstitutions }

	// Store in cache
	lookupCache = { data: result, timestamp: Date.now() }

	return result
}

// Enrich learner data with lookup values
export function enrichLearnerData(learners: unknown[], lookups: LookupMaps): unknown[] {
	// Log raw field names from first learner to help debug photo URL field name
	if (learners.length > 0) {
		const sampleLearner = learners[0] as Record<string, unknown>
		const photoFields = Object.keys(sampleLearner).filter(k =>
			k.toLowerCase().includes('photo') ||
			k.toLowerCase().includes('image') ||
			k.toLowerCase().includes('picture') ||
			k.toLowerCase().includes('avatar')
		)
		console.log('[enrichLearnerData] Sample learner photo-related fields:', photoFields)
		console.log('[enrichLearnerData] Sample learner photo field values:', {
			student_photo_url: sampleLearner.student_photo_url,
			photo_url: sampleLearner.photo_url,
			profile_photo: sampleLearner.profile_photo,
			image_url: sampleLearner.image_url,
			profile_image: sampleLearner.profile_image,
			student_image: sampleLearner.student_image,
		})
	}

	return learners.map((learner) => {
		const l = learner as Record<string, unknown>

		// Get institution info
		const instId = l.institution_id as string
		const instInfo = instId ? lookups.institutions.get(instId) : undefined
		const counsellingCode = instInfo?.counselling_code || ''
		const localInst = counsellingCode ? lookups.localInstitutions.get(counsellingCode) : undefined

		// Get program info
		const progId = l.program_id as string
		const progInfo = progId ? lookups.programs.get(progId) : undefined

		// Get semester info
		const semId = l.semester_id as string
		const semInfo = semId ? lookups.semesters.get(semId) : undefined

		// Get department info
		const deptId = l.department_id as string
		const deptInfo = deptId ? lookups.departments.get(deptId) : undefined

		// Get batch info
		const batchId = l.batch_id as string
		const batchInfo = batchId ? lookups.batches.get(batchId) : undefined

		// Check multiple possible photo field names from external API
		const photoUrl = (
			l.student_photo_url ||
			l.photo_url ||
			l.profile_photo ||
			l.image_url ||
			l.profile_image ||
			l.student_image ||
			l.avatar_url ||
			l.picture_url ||
			''
		) as string

		// Display name. MyJKKN files the name under several spellings and many
		// rows only carry the parts, so assemble it here — consumers that render
		// `learner_name` otherwise show a dash for every row.
		const learnerName = (
			(l.learner_name as string) ||
			(l.student_name as string) ||
			(l.full_name as string) ||
			[l.first_name, l.middle_name, l.last_name].filter(Boolean).join(' ')
		) || ''

		// Lifecycle state (active / alumni / discontinued / ...). `is_active` stays
		// authoritative when the row carries it; otherwise derive it from the
		// lifecycle so non-active learners aren't badged Active.
		const lifecycleStatus = ((l.lifecycle_status as string) || '').trim().toLowerCase()
		const isActive = l.is_active ?? (
			lifecycleStatus
				? isActiveLifecycleStatus(lifecycleStatus)
				: (l.is_profile_complete ?? true)
		)

		return {
			...l,
			// Institution fields
			institution_code: counsellingCode,
			institution_name: localInst?.institution_name || instInfo?.name || '',
			// Program fields
			program_code: progInfo?.program_code || '',
			program_name: progInfo?.program_name || '',
			// Semester fields
			semester_code: semInfo?.semester_code || '',
			semester_name: semInfo?.semester_name || '',
			current_semester: semInfo?.semester_number || l.current_semester || null,
			// Department fields
			department_code: deptInfo?.department_code || '',
			department_name: deptInfo?.department_name || '',
			// Batch fields
			batch_code: batchInfo?.batch_code || '',
			batch_name: batchInfo?.batch_name || '',
			// Normalize other fields
			learner_name: learnerName,
			email: l.college_email || l.student_email || l.email || '',
			phone: l.student_mobile || l.phone || '',
			lifecycle_status: lifecycleStatus,
			is_active: isActive,
			// Photo URL - check multiple possible field names from external API
			student_photo_url: photoUrl,
		}
	})
}
