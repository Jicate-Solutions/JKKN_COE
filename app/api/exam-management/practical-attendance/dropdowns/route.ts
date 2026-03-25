import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Cascading dropdown data for practical exam attendance form
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')
		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('session_id')
		const courseId = searchParams.get('course_id')

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
				session_type: session.semester_type,
				start_date: session.exam_start_date,
				end_date: session.exam_end_date
			}))

			return NextResponse.json(mappedData)
		}

		// 3. Fetch Courses that have published Practical timetable entries for TODAY
		if (type === 'courses' && institutionId && sessionId) {
			const today = new Date().toISOString().split('T')[0]
			console.log('Fetching practical courses for today:', { institutionId, sessionId, today })

			// Step 1: Get practical timetable entries for today
			const { data: timetableData, error: timetableError } = await supabase
				.from('exam_timetables')
				.select('course_id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)
				.eq('exam_date', today)

			if (timetableError) {
				console.error('Error fetching practical timetables:', timetableError)
				return NextResponse.json({ error: 'Failed to fetch practical timetables' }, { status: 500 })
			}

			if (!timetableData || timetableData.length === 0) {
				console.log('No practical timetable entries found for today')
				return NextResponse.json([])
			}

			// Step 2: Get unique course_ids
			const courseIds = [...new Set(timetableData.map((t: any) => t.course_id).filter(Boolean))]

			if (courseIds.length === 0) {
				return NextResponse.json([])
			}

			// Step 3: Get course details from courses table
			const { data: coursesData, error: coursesError } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.in('id', courseIds)
				.order('course_code', { ascending: true })

			if (coursesError) {
				console.error('Error fetching course details:', coursesError)
				return NextResponse.json({ error: 'Failed to fetch course details' }, { status: 500 })
			}

			// Map to match frontend interface
			const mappedCourses = (coursesData || []).map((course: any) => ({
				course_id: course.id,
				course_code: course.course_code,
				course_name: course.course_name
			}))

			console.log('Practical courses found for today:', mappedCourses.length)
			return NextResponse.json(mappedCourses)
		}

		// 4. Fetch Batches (practical timetable rows for a course TODAY)
		if (type === 'batches' && institutionId && sessionId && courseId) {
			const today = new Date().toISOString().split('T')[0]
			console.log('Fetching practical batches for today:', { institutionId, sessionId, courseId, today })

			// Step 1: Get all practical timetable rows for this course today
			const { data: rows, error: rowsError } = await supabase
				.from('exam_timetables')
				.select('id, exam_date, session, exam_time, batch_capacity')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('course_id', courseId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)
				.eq('exam_date', today)

			if (rowsError) {
				console.error('Error fetching practical batches:', rowsError)
				return NextResponse.json({ error: 'Failed to fetch practical batches' }, { status: 500 })
			}

			if (!rows || rows.length === 0) {
				console.log('No practical batches found for today')
				return NextResponse.json([])
			}

			// Step 2: Sort - FN before AN, then by exam_time
			const sorted = [...rows].sort((a: any, b: any) => {
				const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
				if (a.session !== b.session) return sessionOrder(a.session) - sessionOrder(b.session)
				// Sort by exam_time within the same session
				const timeA = a.exam_time || ''
				const timeB = b.exam_time || ''
				return timeA.localeCompare(timeB)
			})

			// Step 3: Get student counts from practical_batch_students for each timetable
			const timetableIds = sorted.map((r: any) => r.id)

			const { data: batchStudents } = await supabase
				.from('practical_batch_students')
				.select('exam_timetable_id')
				.in('exam_timetable_id', timetableIds)

			const studentCountMap = new Map<string, number>()
			for (const bs of batchStudents || []) {
				studentCountMap.set(bs.exam_timetable_id, (studentCountMap.get(bs.exam_timetable_id) || 0) + 1)
			}

			// Step 4: Check attendance_exists from exam_attendance for each timetable
			const { data: attendanceData } = await supabase
				.from('exam_attendance')
				.select('exam_timetable_id')
				.in('exam_timetable_id', timetableIds)

			const attendanceSet = new Set<string>()
			for (const att of attendanceData || []) {
				attendanceSet.add(att.exam_timetable_id)
			}

			// Step 5: Build batch list with 1-indexed batch_no
			const batches = sorted.map((row: any, idx: number) => ({
				timetable_id: row.id,
				batch_no: idx + 1,
				exam_date: row.exam_date,
				session: row.session,
				exam_time: row.exam_time || null,
				batch_capacity: row.batch_capacity || 0,
				student_count: studentCountMap.get(row.id) || 0,
				attendance_exists: attendanceSet.has(row.id)
			}))

			console.log('Practical batches found for today:', batches.length)
			return NextResponse.json(batches)
		}

		return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
	} catch (e) {
		console.error('Practical attendance dropdown API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
