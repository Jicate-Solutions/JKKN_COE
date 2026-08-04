/**
 * Shared, cached index of MyJKKN learner profiles keyed by register number.
 *
 * WHY THIS EXISTS
 * ---------------
 * Report routes need photo / DOB / name for a cohort of learners, and the only
 * source is the MyJKKN `learners/profiles` endpoint. That endpoint is awkward:
 *
 *  - it HARD-CAPS every page at 200 rows regardless of the `limit` asked for
 *  - its `institution_id` / `program_code` / `register_number` filters are not
 *    reliable — the safe pattern is "sweep once, match client-side"
 *  - it 500s when asked for a page beyond `metadata.totalPages`
 *  - it omits non-active learners unless `lifecycle_status=all` is passed
 *
 * Routes that learned these lessons one bug at a time ended up stacking the
 * fallbacks: an institution sweep, THEN a global lifecycle sweep, THEN one
 * targeted HTTP call per still-missing learner — all sequential, all repeated
 * on every single request. A 175-learner batch marksheet paid hundreds of
 * round trips to jkkn.ai.
 *
 * This module replaces all of that with ONE sweep (`lifecycle_status=all`, so
 * every lifecycle state is covered in a single pass), run with page-level
 * concurrency, and memoised process-wide for TTL_MS. Subsequent report loads —
 * including the single-learner marksheet — hit memory instead of the network.
 */

const TTL_MS = 10 * 60 * 1000        // full index is good for 10 minutes
const PARTIAL_TTL_MS = 60 * 1000     // an incomplete sweep is retried sooner
const PAGE_SIZE = 200                // API caps pages at 200 regardless of `limit`
const PAGE_CONCURRENCY = 8
const MAX_PAGES = 2000               // safety cap against a runaway sweep

export type MyJKKNProfile = Record<string, any>
export type MyJKKNProfileIndex = Map<string, MyJKKNProfile>

interface CacheEntry {
	index: MyJKKNProfileIndex
	builtAt: number
	complete: boolean
}

let cached: CacheEntry | null = null
let inflight: Promise<MyJKKNProfileIndex> | null = null

/** Tolerant register-number key: case and stray whitespace are ignored. */
export function normalizeRegisterNumber(value: unknown): string {
	return (value ?? '').toString().trim().toUpperCase()
}

/**
 * Register-number-ish fields a profile may be filed under. MyJKKN is not
 * consistent — some records only carry roll_number or application_number.
 */
const ID_FIELDS = [
	'register_number',
	'registration_number',
	'roll_number',
	'rollno',
	'roll_no',
	'application_number',
] as const

function indexProfile(index: MyJKKNProfileIndex, profile: MyJKKNProfile) {
	for (const field of ID_FIELDS) {
		const key = normalizeRegisterNumber(profile?.[field])
		// First write wins: `register_number` is checked first, so a real
		// register number is never overwritten by another record's roll number.
		if (key && !index.has(key)) index.set(key, profile)
	}
}

function apiConfig() {
	return {
		url: process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api',
		key: process.env.MYJKKN_API_KEY || '',
	}
}

async function fetchProfilePage(
	page: number
): Promise<{ profiles: MyJKKNProfile[]; totalPages: number | null } | null> {
	const { url, key } = apiConfig()
	const params = new URLSearchParams()
	params.set('lifecycle_status', 'all')
	params.set('limit', String(PAGE_SIZE))
	params.set('page', String(page))

	const resp = await fetch(`${url}/api-management/learners/profiles?${params.toString()}`, {
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${key}`,
			'Accept': 'application/json',
			'Content-Type': 'application/json',
		},
		cache: 'no-store',
	})

	if (!resp.ok) return null

	const json = await resp.json()
	const totalPages = typeof json?.metadata?.totalPages === 'number'
		? json.metadata.totalPages
		: (typeof json?.metadata?.total === 'number'
			? Math.ceil(json.metadata.total / PAGE_SIZE) || 1
			: null)

	return { profiles: json?.data || [], totalPages }
}

async function buildIndex(): Promise<MyJKKNProfileIndex> {
	const index: MyJKKNProfileIndex = new Map()
	const { key } = apiConfig()

	if (!key) {
		console.log('[MyJKKN Profile Cache] No MyJKKN API key configured — empty index')
		cached = { index, builtAt: Date.now(), complete: false }
		return index
	}

	const startedAt = Date.now()
	let complete = true

	const first = await fetchProfilePage(1)
	if (!first) {
		console.warn('[MyJKKN Profile Cache] Page 1 failed — empty index')
		cached = { index, builtAt: Date.now(), complete: false }
		return index
	}
	first.profiles.forEach((p) => indexProfile(index, p))

	// `metadata.totalPages` is authoritative — requesting past it makes the API
	// 500 — so when it is present the remaining pages are fetched as one bounded
	// concurrent set. Without it, fall back to sliding windows until a page
	// comes back empty.
	if (first.totalPages !== null) {
		const lastPage = Math.min(first.totalPages, MAX_PAGES)
		for (let start = 2; start <= lastPage; start += PAGE_CONCURRENCY) {
			const pages = []
			for (let p = start; p < start + PAGE_CONCURRENCY && p <= lastPage; p++) pages.push(p)
			const results = await Promise.all(pages.map((p) => fetchProfilePage(p)))
			for (const result of results) {
				if (!result) { complete = false; continue }
				result.profiles.forEach((p) => indexProfile(index, p))
			}
		}
	} else {
		let start = 2
		let done = false
		while (!done && start <= MAX_PAGES) {
			const pages = []
			for (let p = start; p < start + PAGE_CONCURRENCY; p++) pages.push(p)
			const results = await Promise.all(pages.map((p) => fetchProfilePage(p)))
			for (const result of results) {
				// null (HTTP error) or an empty page means the end of the data
				if (!result || result.profiles.length === 0) { done = true; continue }
				result.profiles.forEach((p) => indexProfile(index, p))
			}
			start += PAGE_CONCURRENCY
		}
	}

	console.log(
		`[MyJKKN Profile Cache] Indexed ${index.size} register numbers in ${Date.now() - startedAt}ms (complete=${complete})`
	)
	cached = { index, builtAt: Date.now(), complete }
	return index
}

/**
 * The profile index, built at most once per TTL per process. Concurrent callers
 * share a single in-flight sweep rather than each starting their own.
 */
export async function getMyJKKNProfileIndex(): Promise<MyJKKNProfileIndex> {
	const ttl = cached?.complete ? TTL_MS : PARTIAL_TTL_MS
	if (cached && Date.now() - cached.builtAt < ttl) return cached.index
	if (inflight) return inflight

	inflight = buildIndex().finally(() => { inflight = null })
	return inflight
}

/** The index if it is already warm, else null — never triggers a sweep. */
export function getCachedMyJKKNProfileIndex(): MyJKKNProfileIndex | null {
	const ttl = cached?.complete ? TTL_MS : PARTIAL_TTL_MS
	if (cached && Date.now() - cached.builtAt < ttl) return cached.index
	return null
}

export function lookupMyJKKNProfile(
	index: MyJKKNProfileIndex | null,
	registerNumber: string
): MyJKKNProfile | null {
	if (!index) return null
	return index.get(normalizeRegisterNumber(registerNumber)) || null
}

/** Photo URL under any of the field names MyJKKN has used. */
export function profilePhotoUrl(profile: MyJKKNProfile | null): string | null {
	if (!profile) return null
	return profile.student_photo_url || profile.photo_url || profile.profile_photo || profile.image_url || null
}

/** DOB formatted DD-MM-YYYY for the marksheet, or null when unusable. */
export function profileDateOfBirth(profile: MyJKKNProfile | null): string | null {
	if (!profile?.date_of_birth) return null
	const dob = new Date(profile.date_of_birth)
	if (isNaN(dob.getTime())) return null
	const year = dob.getFullYear()
	if (year < 1900 || year > 2050) return null
	return `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${year}`
}

/** Display name assembled from whichever name fields the profile carries. */
export function profileFullName(profile: MyJKKNProfile | null): string {
	if (!profile) return ''
	return profile.student_name
		|| profile.full_name
		|| [profile.first_name, profile.last_name].filter(Boolean).join(' ')
		|| ''
}
