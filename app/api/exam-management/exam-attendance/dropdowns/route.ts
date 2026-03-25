import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Cascading dropdown data for exam attendance form
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('session_id')
		const programCode = searchParams.get('program_code')
		const examDate = searchParams.get('exam_date')
		const sessionType = searchParams.get('session_type')

		// Institution filter params (from useInstitutionFilter hook)
		const filterInstitutionCode = searchParams.get('institution_code')
		const filterInstitutionsId = searchParams.get('institutions_id')

		// 1. Fetch Institutions - Apply institution filter for non-super_admin users
		if (type === 'institutions') {
			let query = supabase
				.from('institutions')
				.select('id, institution_code, name, myjkkn_institution_ids')
				.eq('is_active', true)

			// Apply filter if provided (normal users have filter, super_admin may not)
			if (filterInstitutionCode) {
				query = query.eq('institution_code', filterInstitutionCode)
			} else if (filterInstitutionsId) {
				query = query.eq('id', filterInstitutionsId)
			}
			// If no filter: super_admin viewing all - return all institutions

			const { data, error } = await query.order('name', { ascending: true })

			if (error) {
				console.error('Error fetching institutions:', error)
				return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
			}

			// Map 'name' to 'institution_name' to match frontend interface
			const mappedData = (data || []).map(inst => ({
				id: inst.id,
				institution_code: inst.institution_code,
				institution_name: inst.name,
				myjkkn_institution_ids: inst.myjkkn_institution_ids || []
			}))

			return NextResponse.json(mappedData)
		}

		// 2. Fetch Examination Sessions (filtered by institution)
		if (type === 'sessions' && institutionId) {
			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code, semester_type, exam_start_date, exam_end_date')
				.eq('institutions_id', institutionId)
				.order('exam_start_date', { ascending: false })

			if (error) {
				console.error('Error fetching sessions:', error)
				return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
			}

			// Map the response to match frontend interface
			const mappedData = (data || []).map(session => ({
				id: session.id,
				session_name: session.session_name,
				session_code: session.session_code,
				session_type: session.semester_type, // Map semester_type to session_type
				start_date: session.exam_start_date,
				end_date: session.exam_end_date
			}))

			return NextResponse.json(mappedData)
		}

		// 3. Fetch Programs from MyJKKN API (per MyJKKN COE dev rules)
		// Use myjkkn_institution_ids directly - no FK relationship needed
		if (type === 'programs' && institutionId && sessionId) {
			// Step 1: Get myjkkn_institution_ids from the institution
			const { data: instData, error: instError } = await supabase
				.from('institutions')
				.select('id, myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			if (instError || !instData) {
				console.error('Error fetching institution:', instError)
				return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
			}

			const myjkknIds = instData.myjkkn_institution_ids || []

			// Step 2: Get unique program_codes from course_offerings for this session
			const { data: offeringsData, error: offeringsError } = await supabase
				.from('course_offerings')
				.select('program_code')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (offeringsError) {
				console.error('Error fetching course offerings:', offeringsError)
				return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
			}

			// Get unique program codes from course_offerings
			const programCodesInOfferings = new Set(
				offeringsData?.map((o: any) => o.program_code).filter(Boolean) || []
			)

			if (programCodesInOfferings.size === 0) {
				console.log('No program codes found in course_offerings')
				return NextResponse.json([])
			}

			// Step 3: Fetch programs from MyJKKN API
			// If no myjkkn_institution_ids, fall back to fetching all active programs
			const allPrograms: any[] = []
			const seenCodes = new Set<string>()

			try {
				if (myjkknIds.length > 0) {
					// Fetch from MyJKKN for each institution ID
					for (const myjkknInstId of myjkknIds) {
						const params = new URLSearchParams()
						params.set('limit', '1000')
						params.set('is_active', 'true')
						params.set('institution_id', myjkknInstId)

						const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
						const res = await fetch(`${baseUrl}/api/myjkkn/programs?${params.toString()}`)

						if (res.ok) {
							const response = await res.json()
							const data = response.data || response || []

							// Client-side filter by institution_id (MyJKKN API may not filter server-side)
							const programs = Array.isArray(data)
								? data.filter((p: any) => {
									const programCode = p?.program_id || p?.program_code
									return programCode &&
										p.is_active !== false &&
										p.institution_id === myjkknInstId &&
										programCodesInOfferings.has(programCode) // Only include programs with course offerings
								})
								: []

							// Deduplicate by program_code (per MyJKKN COE dev rules)
							for (const prog of programs) {
								const programCode = prog.program_id || prog.program_code
								if (programCode && !seenCodes.has(programCode)) {
									seenCodes.add(programCode)
									allPrograms.push({
										id: prog.id,
										program_code: programCode,
										program_name: prog.program_name || prog.name || programCode,
										program_order: prog.program_order ?? prog.sort_order ?? 999
									})
								}
							}
						}
					}
				} else {
					// No myjkkn_institution_ids - fetch all programs from MyJKKN
					const params = new URLSearchParams()
					params.set('limit', '1000')
					params.set('is_active', 'true')

					const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
					const res = await fetch(`${baseUrl}/api/myjkkn/programs?${params.toString()}`)

					if (res.ok) {
						const response = await res.json()
						const data = response.data || response || []

						const programs = Array.isArray(data)
							? data.filter((p: any) => {
								const programCode = p?.program_id || p?.program_code
								return programCode &&
									p.is_active !== false &&
									programCodesInOfferings.has(programCode)
							})
							: []

						for (const prog of programs) {
							const programCode = prog.program_id || prog.program_code
							if (programCode && !seenCodes.has(programCode)) {
								seenCodes.add(programCode)
								allPrograms.push({
									id: prog.id,
									program_code: programCode,
									program_name: prog.program_name || prog.name || programCode,
									program_order: prog.program_order ?? prog.sort_order ?? 999
								})
							}
						}
					}
				}
			} catch (apiError) {
				console.error('Error fetching programs from MyJKKN API:', apiError)
				// Fall back to returning program codes from course_offerings without names
				return NextResponse.json(
					Array.from(programCodesInOfferings).map(code => ({
						id: code,
						program_code: code,
						program_name: code,
						program_order: 999
					}))
				)
			}

			// Sort by program_order first, then by program_code
			const sortedPrograms = allPrograms.sort((a: any, b: any) => {
				if (a.program_order !== b.program_order) {
					return a.program_order - b.program_order
				}
				return a.program_code.localeCompare(b.program_code)
			})

			console.log('Programs fetched from MyJKKN:', sortedPrograms.length)
			return NextResponse.json(sortedPrograms)
		}

	// 4. Fetch Exam Dates (filtered by examination_session, program_code, and TODAY's date only)
		// exam_timetables has course_offering_id → course_offerings has program_code
		if (type === 'exam_dates' && institutionId && sessionId && programCode) {
			const today = new Date().toISOString().split('T')[0]
			console.log('Fetching exam dates for:', { institutionId, sessionId, programCode, today })

			// Step 1: Get course_offering_ids that match the program_code
			const { data: offeringsData, error: offeringsError } = await supabase
				.from('course_offerings')
				.select('id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCode)

			if (offeringsError) {
				console.error('Error fetching course offerings:', offeringsError)
				return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
			}

			const offeringIds = offeringsData?.map((o: any) => o.id) || []
			if (offeringIds.length === 0) {
				console.log('No course offerings found for program:', programCode)
				return NextResponse.json([])
			}

			// Step 2: Get exam_timetables for those course_offerings
			const { data, error } = await supabase
				.from('exam_timetables')
				.select(`
					id,
					exam_date,
					exam_time,
					session,
					duration_minutes
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.in('course_offering_id', offeringIds)
				.eq('exam_date', today)
				.eq('is_published', true)
				.order('exam_time', { ascending: true })

			if (error) {
				console.error('Error fetching exam dates:', error)
				return NextResponse.json({ error: 'Failed to fetch exam dates', details: error }, { status: 500 })
			}

			console.log('Exam dates data:', data?.length, 'records for program', programCode)

			// Get unique dates (remove duplicates by date-session)
			const uniqueDates = new Map()
			;(data || []).forEach((item: any) => {
				const key = `${item.exam_date}-${item.session}`
				if (!uniqueDates.has(key)) {
					uniqueDates.set(key, item)
				}
			})

			const result = Array.from(uniqueDates.values())
			console.log('Returning unique exam dates:', result.length)
			return NextResponse.json(result)
		}

		// 5. Fetch Session Types (FN/AN) from exam_timetables for selected exam date and program
		// exam_timetables has course_offering_id → course_offerings has program_code
		if (type === 'session_types' && institutionId && sessionId && programCode && examDate) {
			console.log('Fetching session types for:', { institutionId, sessionId, programCode, examDate })

			// Step 1: Get course_offering_ids that match the program_code
			const { data: offeringsData, error: offeringsError } = await supabase
				.from('course_offerings')
				.select('id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCode)

			if (offeringsError) {
				console.error('Error fetching course offerings:', offeringsError)
				return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
			}

			const offeringIds = offeringsData?.map((o: any) => o.id) || []
			if (offeringIds.length === 0) {
				console.log('No course offerings found for program:', programCode)
				return NextResponse.json([])
			}

			// Step 2: Get exam_timetables for those course_offerings
			const { data, error } = await supabase
				.from('exam_timetables')
				.select(`
					id,
					session,
					exam_time
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.in('course_offering_id', offeringIds)
				.eq('exam_date', examDate)
				.eq('is_published', true)

			if (error) {
				console.error('Error fetching session types:', error)
				return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
			}

			console.log('Session types data:', data?.length, 'records')

			// Get unique sessions (FN/AN)
			const uniqueSessions = new Map()
			;(data || []).forEach((item: any) => {
				const key = item.session
				if (!uniqueSessions.has(key)) {
					uniqueSessions.set(key, item)
				}
			})

			return NextResponse.json(Array.from(uniqueSessions.values()))
		}

		// 6. Fetch Courses - Get courses from course_offerings filtered by program, then match with exam_timetables
		// Flow: course_offerings (program_code filter) → get course_id → match exam_timetables.course_id
		if (type === 'courses' && institutionId && sessionId && programCode && examDate && sessionType) {
			console.log('Fetching courses with params:', { institutionId, sessionId, programCode, examDate, sessionType })

			// Step 1: Get course_id list from course_offerings filtered by program_code
			// course_offerings.course_id references courses.id
			const { data: offeringsData, error: offeringsError } = await supabase
				.from('course_offerings')
				.select('id, course_id, course_code')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCode)
				.eq('is_active', true)

			if (offeringsError) {
				console.error('Error fetching course offerings:', offeringsError)
				return NextResponse.json({ error: 'Failed to fetch course offerings', details: offeringsError }, { status: 500 })
			}

			console.log('Course offerings found:', offeringsData?.length)

			// Get unique course_ids from course_offerings
			const courseIds = [...new Set(offeringsData?.map((o: any) => o.course_id).filter(Boolean) || [])]
			const courseCodeMap = new Map<string, string>()
			offeringsData?.forEach((o: any) => {
				if (o.course_id && o.course_code) {
					courseCodeMap.set(o.course_id, o.course_code)
				}
			})

			if (courseIds.length === 0) {
				console.log('No course_ids found in course_offerings')
				return NextResponse.json([])
			}

			console.log('Course IDs from offerings:', courseIds)

			// Step 2: Filter by exam_timetables using course_id + exam_date + session
			// exam_timetables.course_id references courses.id
			const { data: timetableData, error: timetableError } = await supabase
				.from('exam_timetables')
				.select('course_id')
				.in('course_id', courseIds)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('exam_date', examDate)
				.eq('session', sessionType)
				.eq('is_published', true)

			if (timetableError) {
				console.error('Error fetching exam timetables:', timetableError)
				return NextResponse.json({ error: 'Failed to filter by exam timetables', details: timetableError }, { status: 500 })
			}

			console.log('Timetable matches found:', timetableData?.length)

			// Get valid course IDs that have timetables for the selected date/session
			const validCourseIds = [...new Set(timetableData?.map((t: any) => t.course_id) || [])]

			if (validCourseIds.length === 0) {
				console.log('No courses found in exam_timetables for the selected date/session')
				return NextResponse.json([])
			}

			// Step 3: Get course details from courses table
			const { data: coursesData, error: coursesError } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.in('id', validCourseIds)

			if (coursesError) {
				console.error('Error fetching course details:', coursesError)
				return NextResponse.json({ error: 'Failed to fetch course details', details: coursesError }, { status: 500 })
			}

			// Build final course list
			const uniqueCourses = new Map()
			coursesData?.forEach((course: any) => {
				if (!uniqueCourses.has(course.course_code)) {
					uniqueCourses.set(course.course_code, {
						course_code: course.course_code,
						course_title: course.course_name || course.course_code
					})
				}
			})

			const courses = Array.from(uniqueCourses.values()).sort((a: any, b: any) =>
				a.course_code.localeCompare(b.course_code)
			)

			console.log('Final courses list:', courses.length)
			return NextResponse.json(courses)
		}

		return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
	} catch (e) {
		console.error('Cascading dropdown API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
