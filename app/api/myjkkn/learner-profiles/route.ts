import { NextRequest, NextResponse } from 'next/server'
import {
	fetchMyJKKNLearnerProfiles,
	fetchMyJKKNInstitutions,
	fetchMyJKKNPrograms,
	fetchMyJKKNSemesters,
	fetchMyJKKNDepartments,
	fetchMyJKKNBatches,
	MyJKKNApiError
} from '@/lib/myjkkn-api'
import { getSupabaseServer } from '@/lib/supabase-server'

// MyJKKN API has a server-side max limit per request
const MYJKKN_MAX_PER_PAGE = 200

// Cache for lookup data with TTL (5 minutes)
const LOOKUP_CACHE_TTL = 5 * 60 * 1000
let lookupCache: { data: LookupMaps | null; timestamp: number } = { data: null, timestamp: 0 }

// Cache for lookup data (refreshed per request)
interface LookupMaps {
	institutions: Map<string, { counselling_code: string; name: string }>
	programs: Map<string, { program_code: string; program_name: string }>
	semesters: Map<string, { semester_code: string; semester_name: string; semester_number: number }>
	departments: Map<string, { department_code: string; department_name: string }>
	batches: Map<string, { batch_code: string; batch_name: string }>
	localInstitutions: Map<string, { institution_name: string; institution_code: string }>
}

// Fetch all lookup data from MyJKKN APIs (with caching)
async function fetchLookupData(): Promise<LookupMaps> {
	// Check cache first
	const now = Date.now()
	if (lookupCache.data && (now - lookupCache.timestamp) < LOOKUP_CACHE_TTL) {
		console.log('[Learner Profiles API] Using cached lookup data')
		return lookupCache.data
	}

	console.log('[Learner Profiles API] Fetching lookup data for enrichment...')

	const [institutionsRes, programsRes, semestersRes, departmentsRes, batchesRes] = await Promise.all([
		fetchMyJKKNInstitutions({ limit: 1000 }).catch(() => ({ data: [] })),
		fetchMyJKKNPrograms({ limit: 1000 }).catch(() => ({ data: [] })),
		fetchMyJKKNSemesters({ limit: 1000 }).catch(() => ({ data: [] })),
		fetchMyJKKNDepartments({ limit: 1000 }).catch(() => ({ data: [] })),
		fetchMyJKKNBatches({ limit: 1000 }).catch(() => ({ data: [] })),
	])

	// Build institution lookup map (id -> { counselling_code, name })
	const institutions = new Map<string, { counselling_code: string; name: string }>()
	for (const inst of institutionsRes.data || []) {
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
	for (const prog of programsRes.data || []) {
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
	for (const sem of semestersRes.data || []) {
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
	for (const dept of departmentsRes.data || []) {
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
	for (const batch of batchesRes.data || []) {
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
		const { data: localInsts } = await supabase
			.from('institutions')
			.select('id, institution_code, institution_name')

		for (const inst of localInsts || []) {
			// Map by institution_code (counselling_code from MyJKKN)
			if (inst.institution_code) {
				localInstitutions.set(inst.institution_code, {
					institution_name: inst.institution_name || '',
					institution_code: inst.institution_code
				})
			}
		}
	} catch (err) {
		console.warn('[Learner Profiles API] Could not fetch local institutions:', err)
	}

	console.log(`[Learner Profiles API] Lookup data loaded: ${institutions.size} institutions, ${programs.size} programs, ${semesters.size} semesters, ${departments.size} departments, ${batches.size} batches, ${localInstitutions.size} local institutions`)

	const result = { institutions, programs, semesters, departments, batches, localInstitutions }

	// Store in cache
	lookupCache = { data: result, timestamp: Date.now() }

	return result
}

// Enrich learner data with lookup values
function enrichLearnerData(learners: unknown[], lookups: LookupMaps): unknown[] {
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
			email: l.college_email || l.student_email || l.email || '',
			phone: l.student_mobile || l.phone || '',
			is_active: l.is_active ?? l.is_profile_complete ?? true,
			// Photo URL - check multiple possible field names from external API
			student_photo_url: photoUrl,
		}
	})
}

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
	const admission_year = searchParams.get('admission_year')
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
			current_semester: current_semester ? parseInt(current_semester, 10) : undefined,
			admission_year: admission_year ? parseInt(admission_year, 10) : undefined,
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

			// Fetch remaining pages sequentially (to avoid overwhelming the API)
			for (let currentPage = 2; currentPage <= totalPages; currentPage++) {
				try {
					const response = await fetchMyJKKNLearnerProfiles({
						...baseOptions,
						page: currentPage,
						limit: MYJKKN_MAX_PER_PAGE,
					})

					if (response.data && response.data.length > 0) {
						allData.push(...response.data)
					}

					console.log(`[Learner Profiles API] Page ${currentPage}/${totalPages} - Fetched ${response.data?.length || 0}, Total: ${allData.length}`)
				} catch (pageError) {
					console.error(`[Learner Profiles API] Error fetching page ${currentPage}:`, pageError)
					// Continue with what we have so far instead of failing completely
					break
				}
			}

			console.log(`[Learner Profiles API] Complete! Total learners fetched: ${allData.length}`)

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
			const enrichedData = enrichLearnerData(filteredData, lookups)

			return NextResponse.json({
				data: enrichedData,
				metadata: {
					page: 1,
					limit: enrichedData.length,
					total: filteredData.length,
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
