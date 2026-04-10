import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

// GET: list exam registrations
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const student_id = searchParams.get('student_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const registration_status = searchParams.get('registration_status')
		const program_code = searchParams.get('program_code')
		const course_offering_id = searchParams.get('course_offering_id')
		const search = searchParams.get('search')

		// Check if client wants all records (for bulk operations)
		const fetchAll = searchParams.get('fetchAll') === 'true'
		const requestedPageSize = parseInt(searchParams.get('pageSize') || '50000')

		// Paginate to bypass Supabase 1000 row limit - fetch up to 1,000,000 records
		let allRegistrations: any[] = []
		const pageSize = 1000 // Internal page size for fetching
		let page = 0
		let hasMore = true
		let totalCount = 0

		while (hasMore) {
			let query = supabase
				.from('exam_registrations')
				.select(`
					*,
					institution:institutions(id, institution_code, name),
					examination_session:examination_sessions(id, session_name, session_code, exam_start_date, exam_end_date),
					course_offering:course_offerings(id, course_code, program_code)
				`, { count: page === 0 ? 'exact' : undefined })
				.order('created_at', { ascending: false })
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (institutions_id) {
				query = query.eq('institutions_id', institutions_id)
			}
			if (student_id) {
				query = query.eq('student_id', student_id)
			}
			if (examination_session_id) {
				query = query.eq('examination_session_id', examination_session_id)
			}
			if (registration_status) {
				query = query.eq('registration_status', registration_status)
			}
			if (course_offering_id) {
				query = query.eq('course_offering_id', course_offering_id)
			}
			// Filter by program_code directly on exam_registrations (denormalized column)
			if (program_code) {
				query = query.eq('program_code', program_code)
			}
			// Server-side search by register number, student name, or course code
			if (search) {
				query = query.or(`stu_register_no.ilike.%${search}%,student_name.ilike.%${search}%,course_code.ilike.%${search}%`)
			}

			const { data, error, count } = await query

			if (error) {
				console.error('Exam registrations table error (page ' + page + '):', error)
				return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
			}

			// Store total count from first page
			if (page === 0 && count !== null) {
				totalCount = count
			}

			if (data && data.length > 0) {
				allRegistrations = allRegistrations.concat(data)
				page++
				// Continue if we got a full page AND haven't exceeded 1,000,000 records AND haven't reached requested pageSize
				hasMore = data.length === pageSize &&
					allRegistrations.length < 1000000 &&
					(fetchAll || allRegistrations.length < requestedPageSize)
			} else {
				hasMore = false
			}
		}

		// Debug logging
		console.log('📊 Query result:', {
			rowsFetched: allRegistrations.length,
			totalCount: totalCount,
			pages: page
		})

		// Fetch course names from courses table to enrich course_offering data
		// Also paginate this query to handle large course tables
		let allCourses: any[] = []
		let coursePage = 0
		let courseHasMore = true

		while (courseHasMore) {
			const { data: coursesData, error: coursesError } = await supabase
				.from('courses')
				.select('course_code, course_name')
				.range(coursePage * 1000, (coursePage + 1) * 1000 - 1)

			if (coursesError) {
				console.error('Courses fetch error:', coursesError)
				break
			}

			if (coursesData && coursesData.length > 0) {
				allCourses = allCourses.concat(coursesData)
				coursePage++
				courseHasMore = coursesData.length === 1000
			} else {
				courseHasMore = false
			}
		}

		// Create a map for quick lookup
		const courseMap = new Map(
			allCourses.map((c: any) => [c.course_code, c.course_name])
		)

		// Transform the data to include course_name in course_offering
		const transformedData = allRegistrations.map((item: any) => ({
			...item,
			course_offering: item.course_offering ? {
				...item.course_offering,
				course_name: courseMap.get(item.course_offering.course_code) || null
			} : null
		}))

		// Return with pagination metadata
		// Check if pagination is explicitly requested (when page or pageSize params are provided)
		const usePagination = searchParams.has('page') || searchParams.has('pageSize')
		const totalPages = totalCount ? Math.ceil(totalCount / requestedPageSize) : 0

		if (usePagination) {
			// Return paginated response with metadata
			return NextResponse.json({
				data: transformedData,
				pagination: {
					page: 1,
					pageSize: transformedData.length,
					total: totalCount || transformedData.length,
					totalPages: 1,
					hasMore: false
				}
			})
		} else {
			// Backward compatibility: return data array directly
			return NextResponse.json(transformedData)
		}
	} catch (e) {
		console.error('Exam registrations API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: create exam registration
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id) {
			return NextResponse.json({
				error: 'institutions_id is required'
			}, { status: 400 })
		}
		// student_id is optional for bulk import - stu_register_no can be used instead
		// At least one of student_id or stu_register_no must be provided
		if (!body.student_id && !body.stu_register_no) {
			return NextResponse.json({
				error: 'Either student_id or stu_register_no is required'
			}, { status: 400 })
		}
		if (!body.examination_session_id) {
			return NextResponse.json({
				error: 'examination_session_id is required'
			}, { status: 400 })
		}
		if (!body.course_offering_id) {
			return NextResponse.json({
				error: 'course_offering_id is required'
			}, { status: 400 })
		}

		// Resolve missing denormalized code fields from their FK UUIDs
		let inst_code = body.institution_code || null
		if (!inst_code && body.institutions_id) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', body.institutions_id)
				.single()
			inst_code = inst?.institution_code || null
		}

		let sess_code = body.session_code || null
		if (!sess_code && body.examination_session_id) {
			const { data: sess } = await supabase
				.from('examination_sessions')
				.select('session_code')
				.eq('id', body.examination_session_id)
				.single()
			sess_code = sess?.session_code || null
		}

		let co_code = body.course_code || null
		if (!co_code && body.course_offering_id) {
			const { data: co } = await supabase
				.from('course_offerings')
				.select('course_code')
				.eq('id', body.course_offering_id)
				.single()
			co_code = co?.course_code || null
		}

		const insertPayload: any = {
			institutions_id: body.institutions_id,
			student_id: body.student_id || null, // Can be null for bulk import
			examination_session_id: body.examination_session_id,
			course_offering_id: body.course_offering_id,
			stu_register_no: body.stu_register_no ?? null,
			student_name: body.student_name ?? null,
			registration_date: body.registration_date || new Date().toISOString(),
			registration_status: body.registration_status || 'Pending',
			is_regular: body.is_regular ?? true,
			attempt_number: body.attempt_number || 1,
			fee_paid: body.fee_paid ?? false,
			fee_amount: body.fee_amount ?? null,
			payment_date: body.payment_date ?? null,
			payment_transaction_id: body.payment_transaction_id ?? null,
			remarks: body.remarks ?? null,
			approved_by: body.approved_by ?? null,
			approved_date: body.approved_date ?? null,
			// Denormalized code values (NOT NULL constraint on institution_code)
			institution_code: inst_code,
			session_code: sess_code,
			course_code: co_code,
			program_code: body.program_code ?? null,
		}

		const { data, error } = await supabase
			.from('exam_registrations')
			.insert([insertPayload])
			.select(`
				*,
				institution:institutions(id, institution_code, name),
				examination_session:examination_sessions(id, session_name, session_code, exam_start_date, exam_end_date),
				course_offering:course_offerings(id, course_code)
			`)
			.single()

		if (error) {
			console.error('Error creating exam registration:', error)
			console.error('Error details:', {
				code: error.code,
				message: error.message,
				details: error.details,
				hint: error.hint,
				payload: insertPayload
			})

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: `Duplicate entry: Registration already exists for student "${body.stu_register_no || body.student_id}" in this session and course`
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				// Parse the error message to identify which foreign key failed
				let fieldName = 'reference'
				if (error.message?.includes('institutions_id')) fieldName = 'Institution'
				else if (error.message?.includes('student_id')) fieldName = 'Student'
				else if (error.message?.includes('examination_session_id')) fieldName = 'Examination Session'
				else if (error.message?.includes('course_offering_id')) fieldName = 'Course Offering'
				return NextResponse.json({
					error: `Invalid ${fieldName}: The specified ${fieldName.toLowerCase()} does not exist in the system`
				}, { status: 400 })
			}

			// Handle NOT NULL violation
			if (error.code === '23502') {
				// Parse field name from error
				const fieldMatch = error.message?.match(/column "(\w+)"/)
				const fieldName = fieldMatch ? fieldMatch[1].replace(/_/g, ' ') : 'required field'
				return NextResponse.json({
					error: `Missing required field: ${fieldName} cannot be empty`
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: `Data validation failed: ${error.message || 'Value does not meet requirements'}`
				}, { status: 400 })
			}

			// Handle timezone or date parsing errors
			if (error.message?.includes('time zone') || error.message?.includes('timestamp')) {
				return NextResponse.json({
					error: `Invalid date format: Please use YYYY-MM-DD format for dates`
				}, { status: 400 })
			}

			// Generic error with full details for debugging
			return NextResponse.json({
				error: `Database error: ${error.message || 'Unknown error occurred'}`,
				code: error.code,
				hint: error.hint
			}, { status: 500 })
		}

		// Enrich with course_name
		if (data && data.course_offering && data.course_offering.course_code) {
			const { data: course } = await supabase
				.from('courses')
				.select('course_title')
				.eq('course_code', data.course_offering.course_code)
				.single()

			if (course) {
				data.course_offering.course_name = course.course_title
			}
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Exam registration creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT: update exam registration
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({
				error: 'Exam registration ID is required'
			}, { status: 400 })
		}

		// Resolve missing denormalized code fields from their FK UUIDs
		// institution_code has a NOT NULL constraint – must always be present
		let institution_code = body.institution_code || null
		if (!institution_code && body.institutions_id) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', body.institutions_id)
				.single()
			institution_code = inst?.institution_code || null
		}

		let session_code = body.session_code || null
		if (!session_code && body.examination_session_id) {
			const { data: sess } = await supabase
				.from('examination_sessions')
				.select('session_code')
				.eq('id', body.examination_session_id)
				.single()
			session_code = sess?.session_code || null
		}

		let course_code = body.course_code || null
		if (!course_code && body.course_offering_id) {
			const { data: co } = await supabase
				.from('course_offerings')
				.select('course_code')
				.eq('id', body.course_offering_id)
				.single()
			course_code = co?.course_code || null
		}

		const updatePayload: any = {
			institutions_id: body.institutions_id,
			student_id: body.student_id,
			examination_session_id: body.examination_session_id,
			course_offering_id: body.course_offering_id,
			stu_register_no: body.stu_register_no ?? null,
			student_name: body.student_name ?? null,
			registration_date: body.registration_date || null,
			registration_status: body.registration_status,
			is_regular: body.is_regular,
			attempt_number: body.attempt_number,
			fee_paid: body.fee_paid,
			fee_amount: body.fee_amount ?? null,
			payment_date: body.payment_date ?? null,
			payment_transaction_id: body.payment_transaction_id ?? null,
			remarks: body.remarks ?? null,
			approved_by: body.approved_by ?? null,
			approved_date: body.approved_date ?? null,
			updated_at: new Date().toISOString(),
			// Denormalized code values (NOT NULL constraint on institution_code)
			institution_code,
			session_code,
			course_code,
			program_code: body.program_code ?? null,
		}

		const { data, error } = await supabase
			.from('exam_registrations')
			.update(updatePayload)
			.eq('id', body.id)
			.select(`
				*,
				institution:institutions(id, institution_code, name),
				examination_session:examination_sessions(id, session_name, session_code, exam_start_date, exam_end_date),
				course_offering:course_offerings(id, course_code)
			`)
			.single()

		if (error) {
			console.error('Error updating exam registration:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'This exam registration already exists for this student, session, and course.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, student, session, or course.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update exam registration' }, { status: 500 })
		}

		// Enrich with course_name
		if (data && data.course_offering && data.course_offering.course_code) {
			const { data: course } = await supabase
				.from('courses')
				.select('course_title')
				.eq('course_code', data.course_offering.course_code)
				.single()

			if (course) {
				data.course_offering.course_name = course.course_title
			}
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Exam registration update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE: delete exam registration by id
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Exam registration ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('exam_registrations', id, request)
	} catch (e) {
		console.error('Delete error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
