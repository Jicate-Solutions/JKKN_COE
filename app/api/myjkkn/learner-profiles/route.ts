import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNLearnerProfiles, MyJKKNApiError } from '@/lib/myjkkn-api'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	MYJKKN_MAX_PER_PAGE,
	enrichLearnerData,
	fetchLookupData,
	parseSemesterValue,
} from '@/lib/myjkkn-learner-enrichment'

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const page = searchParams.get('page')
	const limit = searchParams.get('limit')
	// Support both 'search' and 'register_number' parameters
	// If register_number is provided, use it as the search term
	const register_number = searchParams.get('register_number')
	const search = register_number || searchParams.get('search')
	const is_active = searchParams.get('is_active')
	const institution_id = searchParams.get('institution_id')
	const institution_code = searchParams.get('institution_code')
	const program_id = searchParams.get('program_id')
	const program_code = searchParams.get('program_code')
	const department_id = searchParams.get('department_id')
	const department_code = searchParams.get('department_code')
	const batch_id = searchParams.get('batch_id')
	const current_semester = searchParams.get('current_semester')
	const semester_id = searchParams.get('semester_id')
	const admission_year = searchParams.get('admission_year')
	// MyJKKN omits non-active learners unless lifecycle_status is passed
	// ('all' returns every lifecycle state). Opt-in only — callers that don't
	// send it keep the previous active-only behaviour.
	const lifecycle_status = searchParams.get('lifecycle_status')
	const fetchAll = searchParams.get('fetchAll') === 'true' || (limit && parseInt(limit, 10) > MYJKKN_MAX_PER_PAGE)

	// Log request parameters for debugging
	if (register_number || program_id || institution_id) {
		console.log(`[Learner Profiles API] Request params: register_number=${register_number}, program_id=${program_id}, institution_id=${institution_id}, fetchAll=${fetchAll}, limit=${limit}`)
	}

	// Try MyJKKN API first
	try {
		const baseOptions = {
			search: search || undefined,
			is_active: is_active ? is_active === 'true' : undefined,
			institution_id: institution_id || undefined,
			institution_code: institution_code || undefined,
			program_id: program_id || undefined,
			program_code: program_code || undefined,
			department_id: department_id || undefined,
			department_code: department_code || undefined,
			batch_id: batch_id || undefined,
			// Prefer semester_id (UUID) if provided, otherwise use current_semester (number)
			semester_id: semester_id || undefined,
			current_semester: !semester_id && current_semester ? parseInt(current_semester, 10) : undefined,
			admission_year: admission_year ? parseInt(admission_year, 10) : undefined,
			lifecycle_status: lifecycle_status || undefined,
		}

		// If fetchAll or large limit requested, paginate through all results
		if (fetchAll) {
			console.log('[Learner Profiles API] Fetching all learners with pagination...')

			// Fetch lookup data first
			const lookups = await fetchLookupData()

			// Fetch first page to get total count
			const firstPageResponse = await fetchMyJKKNLearnerProfiles({
				...baseOptions,
				page: 1,
				limit: MYJKKN_MAX_PER_PAGE,
			})

			const allData: unknown[] = [...(firstPageResponse.data || [])]
			// Handle both 'metadata' and 'pagination' keys (API may use either)
			const paginationInfo = (firstPageResponse as any).metadata || (firstPageResponse as any).pagination || {}
			const totalPages = paginationInfo.totalPages || 1
			const totalCount = paginationInfo.total || (firstPageResponse as any).count || allData.length

			console.log(`[Learner Profiles API] Page 1/${totalPages} - Fetched ${firstPageResponse.data?.length || 0}`)

			// Fetch remaining pages in parallel, in bounded batches. Sequential paging of
			// ~23 pages dominated request latency (~8s); a small concurrency window cuts
			// that to ~1-2s without overwhelming the MyJKKN API.
			const PAGE_CONCURRENCY = 6
			for (let start = 2; start <= totalPages; start += PAGE_CONCURRENCY) {
				const batch: number[] = []
				for (let p = start; p < start + PAGE_CONCURRENCY && p <= totalPages; p++) batch.push(p)

				const batchResults = await Promise.all(
					batch.map(async (pageNum) => {
						try {
							const response = await fetchMyJKKNLearnerProfiles({
								...baseOptions,
								page: pageNum,
								limit: MYJKKN_MAX_PER_PAGE,
							})
							return response.data || []
						} catch (pageError) {
							console.error(`[Learner Profiles API] Error fetching page ${pageNum}:`, pageError)
							return []
						}
					})
				)

				for (const data of batchResults) {
					if (data.length > 0) allData.push(...data)
				}
			}

			console.log(`[Learner Profiles API] Complete! Total learners fetched: ${allData.length} (${totalPages} pages, concurrency ${PAGE_CONCURRENCY})`)

			// If register_number was specifically requested, filter to exact matches
			let filteredData = allData
			if (register_number && allData.length > 0) {
				const exactMatches = allData.filter((l: any) =>
					l.register_number === register_number || l.roll_number === register_number
				)
				if (exactMatches.length > 0) {
					console.log(`[Learner Profiles API] Filtered to ${exactMatches.length} exact matches for register_number=${register_number}`)
					filteredData = exactMatches
				} else {
					console.warn(`[Learner Profiles API] No exact match found for register_number=${register_number} in ${allData.length} results`)
				}
			}

			// Enrich data with lookup values
			let enrichedData = enrichLearnerData(filteredData, lookups)

			// Post-enrichment filtering: program_code and current_semester
			// MyJKKN API often ignores these server-side, so we enforce client-side after enrichment
			if (program_code) {
				const before = enrichedData.length
				enrichedData = enrichedData.filter((l: any) => l.program_code === program_code)
				console.log(`[Learner Profiles API] program_code filter "${program_code}": ${before} → ${enrichedData.length}`)
			}
			// Filter by semester_id (UUID) if provided
			if (semester_id) {
				const before = enrichedData.length
				// Debug: log what semester_id values learners have
				const sampleIds = [...new Set(enrichedData.slice(0, 10).map((l: any) => l.semester_id))].slice(0, 3)
				console.log(`[Learner Profiles API] semester_id filter: looking for "${semester_id}", sample learner values: [${sampleIds.join(', ')}]`)
				enrichedData = enrichedData.filter((l: any) => l.semester_id === semester_id)
				console.log(`[Learner Profiles API] semester_id filter: ${before} → ${enrichedData.length}`)
			}
			// Or filter by current_semester (number) if semester_id not provided
			else if (current_semester) {
				const semNum = parseInt(current_semester, 10)
				if (!isNaN(semNum)) {
					const before = enrichedData.length
					// Only filter if learner has a valid current_semester; keep learners without semester mapping
					enrichedData = enrichedData.filter((l: any) => {
						const learnerSem = l.current_semester
						if (learnerSem == null) return true // Keep learners without semester (might be unresolved)
						return parseSemesterValue(learnerSem) === semNum
					})
					console.log(`[Learner Profiles API] current_semester filter ${semNum}: ${before} → ${enrichedData.length}`)
				}
			}

			return NextResponse.json({
				data: enrichedData,
				metadata: {
					page: 1,
					limit: enrichedData.length,
					total: enrichedData.length,
					totalPages: 1,
				},
			})
		}

		// Single page request - also enrich data
		const [lookups, response] = await Promise.all([
			fetchLookupData(),
			fetchMyJKKNLearnerProfiles({
				...baseOptions,
				page: page ? parseInt(page, 10) : 1,
				limit: limit ? Math.min(parseInt(limit, 10), MYJKKN_MAX_PER_PAGE) : MYJKKN_MAX_PER_PAGE,
			})
		])

		// DEBUG: Log raw MyJKKN response before enrichment
		let rawData = response.data || []
		console.log(`[Learner Profiles API] MyJKKN API returned ${rawData.length} results for search="${search}"`)

		if (rawData.length === 0 && register_number) {
			// MyJKKN search returned no results - this might mean search doesn't work for register_number
			console.warn(`[Learner Profiles API] WARNING: MyJKKN API returned 0 results for register_number=${register_number}. The search parameter may not support register_number lookup.`)
		}

		if (rawData.length > 0 && search) {
			console.log('[Learner Profiles API] RAW MyJKKN response first learner:', {
				register_number: (rawData[0] as any).register_number,
				roll_number: (rawData[0] as any).roll_number,
				first_name: (rawData[0] as any).first_name,
				last_name: (rawData[0] as any).last_name,
				batch_id: (rawData[0] as any).batch_id,
				student_photo_url: (rawData[0] as any).student_photo_url?.substring(0, 80) || 'NULL',
			})
			// Check if any learner has matching register number
			const matchingLearner = rawData.find((l: any) =>
				l.register_number === search || l.roll_number === search
			)
			console.log('[Learner Profiles API] Learner matching search:', matchingLearner ? {
				register_number: (matchingLearner as any).register_number,
				roll_number: (matchingLearner as any).roll_number,
				batch_id: (matchingLearner as any).batch_id,
				student_photo_url: (matchingLearner as any).student_photo_url?.substring(0, 80) || 'NULL',
			} : 'NONE FOUND')
		}

		// If register_number was specifically requested, filter to exact matches
		if (register_number && rawData.length > 0) {
			const exactMatches = rawData.filter((l: any) =>
				l.register_number === register_number || l.roll_number === register_number
			)
			if (exactMatches.length > 0) {
				console.log(`[Learner Profiles API] Filtered to ${exactMatches.length} exact matches for register_number=${register_number}`)
				rawData = exactMatches
			}
		}

		const enrichedData = enrichLearnerData(rawData, lookups)

		return NextResponse.json({
			...response,
			data: enrichedData,
		})
	} catch (error) {
		console.error('MyJKKN API failed, falling back to local Supabase:', error)

		// Fallback to local Supabase learners_profiles table
		try {
			const supabase = getSupabaseServer()
			const pageNum = page ? parseInt(page, 10) : 1
			const limitNum = limit ? parseInt(limit, 10) : 100000

			// Helper to build base query with filters
			const buildQuery = () => {
				let q = supabase.from('learners_profiles').select('*', { count: 'exact' })
				if (institution_id) q = q.eq('institution_id', institution_id)
				if (program_id) q = q.eq('program_id', program_id)
				if (department_id) q = q.eq('department_id', department_id)
				if (batch_id) q = q.eq('batch_id', batch_id)
				if (admission_year) q = q.eq('admission_year', parseInt(admission_year, 10))
				if (search) {
					q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,roll_number.ilike.%${search}%,register_number.ilike.%${search}%,college_email.ilike.%${search}%`)
				}
				return q.order('created_at', { ascending: false })
			}

			// Supabase has 1000 row limit per request, fetch in batches for large requests
			const BATCH_SIZE = 1000
			let allData: unknown[] = []
			let total = 0

			if (limitNum > BATCH_SIZE) {
				// Fetch in batches
				const offset = (pageNum - 1) * limitNum
				let fetched = 0
				let batchOffset = offset

				while (fetched < limitNum) {
					const batchLimit = Math.min(BATCH_SIZE, limitNum - fetched)
					const { data: batchData, error: batchError, count: batchCount } = await buildQuery()
						.range(batchOffset, batchOffset + batchLimit - 1)

					if (batchError) {
						console.error('Supabase fallback error:', batchError)
						throw batchError
					}

					if (batchCount !== null && total === 0) {
						total = batchCount
					}

					if (!batchData || batchData.length === 0) break

					allData = allData.concat(batchData)
					fetched += batchData.length
					batchOffset += batchLimit

					// Stop if we got less than requested (no more data)
					if (batchData.length < batchLimit) break
				}
			} else {
				// Single request for small limits
				const offset = (pageNum - 1) * limitNum
				const { data, error: dbError, count } = await buildQuery()
					.range(offset, offset + limitNum - 1)

				if (dbError) {
					console.error('Supabase fallback error:', dbError)
					throw dbError
				}

				allData = data || []
				total = count || 0
			}

			const totalPages = Math.ceil(total / limitNum)

			return NextResponse.json({
				data: allData,
				metadata: {
					page: pageNum,
					limit: limitNum,
					total,
					totalPages,
				},
				source: 'supabase_fallback',
			})
		} catch (fallbackError) {
			console.error('Supabase fallback also failed:', fallbackError)

			if (error instanceof MyJKKNApiError) {
				return NextResponse.json(
					{ error: error.message, status: error.status, details: error.details },
					{ status: error.status }
				)
			}
			return NextResponse.json(
				{ error: 'Failed to fetch learner profiles' },
				{ status: 500 }
			)
		}
	}
}
