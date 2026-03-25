import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Registration Lookup API
 * Provides cascading filter lookup for exam registrations
 * Hierarchy: institution → exam_session → program_code → course_code
 */

// GET: Lookup registrations with cascading filters through course_offering
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Cascading filter parameters
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')
		const course_code = searchParams.get('course_code')

		// Optional additional filters
		const registration_status = searchParams.get('registration_status')
		const stu_register_no = searchParams.get('stu_register_no')

		// Build the query with course_offering join for proper filtering
		let query = supabase
			.from('exam_registrations')
			.select(`
				*,
				institution:institutions(id, institution_code, name),
				examination_session:examination_sessions(id, session_name, session_code, exam_start_date, exam_end_date),
				course_offering:course_offerings(
					id,
					course_code,
					program_code,
					examination_session_id,
					institutions_id,
					course_mapping:course_mapping(course_code, course_title)
				)
			`)
			.order('created_at', { ascending: false })

		// Apply cascading filters
		if (institutions_id) {
			query = query.eq('institutions_id', institutions_id)
		}

		if (examination_session_id) {
			query = query.eq('examination_session_id', examination_session_id)
		}

		// For program_code and course_code filters, we need to filter through course_offering
		// First get matching course_offering_ids if these filters are provided
		if (program_code || course_code) {
			let courseOfferingQuery = supabase
				.from('course_offerings')
				.select('id')

			if (institutions_id) {
				courseOfferingQuery = courseOfferingQuery.eq('institutions_id', institutions_id)
			}
			if (examination_session_id) {
				courseOfferingQuery = courseOfferingQuery.eq('examination_session_id', examination_session_id)
			}
			if (program_code) {
				courseOfferingQuery = courseOfferingQuery.eq('program_code', program_code)
			}
			if (course_code) {
				courseOfferingQuery = courseOfferingQuery.eq('course_code', course_code)
			}

			const { data: matchingOfferings, error: offeringsError } = await courseOfferingQuery

			if (offeringsError) {
				console.error('Error fetching course offerings for lookup:', offeringsError)
				return NextResponse.json({ error: 'Failed to filter by course offerings' }, { status: 500 })
			}

			const offeringIds = matchingOfferings?.map(o => o.id) || []

			if (offeringIds.length === 0) {
				// No matching course offerings, return empty with metadata
				return NextResponse.json({
					data: [],
					filters: {
						institutions_id,
						examination_session_id,
						program_code,
						course_code
					},
					count: 0
				})
			}

			query = query.in('course_offering_id', offeringIds)
		}

		// Apply additional filters
		if (registration_status) {
			query = query.eq('registration_status', registration_status)
		}
		if (stu_register_no) {
			query = query.ilike('stu_register_no', `%${stu_register_no}%`)
		}

		// Execute query with pagination handling
		let allRegistrations: any[] = []
		const pageSize = 1000
		let page = 0
		let hasMore = true

		while (hasMore) {
			const { data, error } = await query
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (error) {
				console.error('Registration lookup error (page ' + page + '):', error)
				return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
			}

			if (data && data.length > 0) {
				allRegistrations = allRegistrations.concat(data)
				page++
				hasMore = data.length === pageSize && allRegistrations.length < 100000
			} else {
				hasMore = false
			}
		}

		// Enrich with course names from courses table
		const courseCodes = [...new Set(allRegistrations
			.filter(r => r.course_offering?.course_code)
			.map(r => r.course_offering.course_code))]

		let courseNameMap = new Map<string, string>()
		if (courseCodes.length > 0) {
			const { data: courses } = await supabase
				.from('courses')
				.select('course_code, course_name')
				.in('course_code', courseCodes)

			if (courses) {
				courseNameMap = new Map(courses.map(c => [c.course_code, c.course_name]))
			}
		}

		// Transform data with course names
		const transformedData = allRegistrations.map(item => ({
			...item,
			course_offering: item.course_offering ? {
				...item.course_offering,
				course_name: courseNameMap.get(item.course_offering.course_code) ||
					item.course_offering.course_mapping?.course_title || null
			} : null
		}))

		return NextResponse.json({
			data: transformedData,
			filters: {
				institutions_id,
				examination_session_id,
				program_code,
				course_code,
				registration_status,
				stu_register_no
			},
			count: transformedData.length
		})

	} catch (e) {
		console.error('Registration lookup API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// GET available filter options based on current selections (for cascading dropdowns)
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { institutions_id, examination_session_id, program_code } = body

		// Build all three queries
		let sessionsQuery = supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, institutions_id, programs_included')
			.order('session_code', { ascending: false })

		if (institutions_id) {
			sessionsQuery = sessionsQuery.eq('institutions_id', institutions_id)
		}

		let programsQuery = supabase
			.from('course_offerings')
			.select('program_code')

		if (institutions_id) {
			programsQuery = programsQuery.eq('institutions_id', institutions_id)
		}
		if (examination_session_id) {
			programsQuery = programsQuery.eq('examination_session_id', examination_session_id)
		}

		let coursesQuery = supabase
			.from('course_offerings')
			.select('id, course_code, program_code, examination_session_id')

		if (institutions_id) {
			coursesQuery = coursesQuery.eq('institutions_id', institutions_id)
		}
		if (examination_session_id) {
			coursesQuery = coursesQuery.eq('examination_session_id', examination_session_id)
		}
		if (program_code) {
			coursesQuery = coursesQuery.eq('program_code', program_code)
		}

		// Execute all three independent queries in parallel
		const [sessionsResult, programsResult, coursesResult] = await Promise.all([
			sessionsQuery,
			programsQuery,
			coursesQuery,
		])

		const { data: sessions, error: sessionsError } = sessionsResult
		const { data: programsData, error: programsError } = programsResult
		const { data: coursesData, error: coursesError } = coursesResult

		if (sessionsError) {
			console.error('Error fetching sessions:', sessionsError)
		}

		if (programsError) {
			console.error('Error fetching programs:', programsError)
		}

		if (coursesError) {
			console.error('Error fetching courses:', coursesError)
		}

		// Deduplicate program codes
		const uniqueProgramCodes = [...new Set(programsData?.map(p => p.program_code).filter(Boolean) || [])]

		// Deduplicate course codes with additional info
		const courseMap = new Map<string, { course_code: string; program_code: string; session_id: string }>()
		coursesData?.forEach(c => {
			if (c.course_code && !courseMap.has(c.course_code)) {
				courseMap.set(c.course_code, {
					course_code: c.course_code,
					program_code: c.program_code,
					session_id: c.examination_session_id
				})
			}
		})

		// Get course names
		const courseCodes = [...courseMap.keys()]
		let courseNames = new Map<string, string>()
		if (courseCodes.length > 0) {
			const { data: names } = await supabase
				.from('courses')
				.select('course_code, course_name')
				.in('course_code', courseCodes)

			if (names) {
				courseNames = new Map(names.map(n => [n.course_code, n.course_name]))
			}
		}

		const courses = [...courseMap.values()].map(c => ({
			...c,
			course_name: courseNames.get(c.course_code) || c.course_code
		}))

		return NextResponse.json({
			sessions: sessions || [],
			programs: uniqueProgramCodes.map(code => ({ program_code: code })),
			courses: courses
		})

	} catch (e) {
		console.error('Filter options API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
