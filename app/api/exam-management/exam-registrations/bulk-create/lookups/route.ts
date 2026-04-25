import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Bulk-Create Exam Registration Lookups
 *
 * Returns the registrable courses + already-registered learner IDs for a given
 * Institution → Session → Program → Regulation → Semester scope.
 *
 * type=courses
 *   Joins course_mapping (filtered by inst+prog+reg+sem) with course_offerings
 *   (filtered by inst+session+prog+sem) to return only courses that exist as
 *   offerings for the chosen exam session.
 *
 * type=registered
 *   Returns existing exam_registrations rows for the chosen scope so the UI can
 *   skip / pre-mark already-registered (learner, course) pairs.
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type')

		if (!type) {
			return NextResponse.json({ error: 'type parameter is required' }, { status: 400 })
		}

		if (type === 'courses') {
			const institutionsId = searchParams.get('institutions_id')
			const institutionCode = searchParams.get('institution_code')
			const examinationSessionId = searchParams.get('examination_session_id')
			const programCode = searchParams.get('program_code')
			const regulationCode = searchParams.get('regulation_code')
			const semesterCode = searchParams.get('semester_code')

			if (!institutionsId || !institutionCode || !examinationSessionId || !programCode || !regulationCode || !semesterCode) {
				return NextResponse.json({
					error: 'institutions_id, institution_code, examination_session_id, program_code, regulation_code, and semester_code are required'
				}, { status: 400 })
			}

			// 1. Get course_mapping rows for this regulation+semester+program+institution
			const { data: mappings, error: mappingErr } = await supabase
				.from('course_mapping')
				.select('id, course_id, course_code, course_order')
				.eq('institution_code', institutionCode)
				.eq('program_code', programCode)
				.eq('regulation_code', regulationCode)
				.eq('semester_code', semesterCode)
				.order('course_order', { ascending: true })
				.range(0, 9999)

			if (mappingErr) {
				console.error('[bulk-create lookups] course_mapping error:', mappingErr)
				return NextResponse.json({ error: 'Failed to fetch course mappings' }, { status: 500 })
			}

			const mappingList = mappings || []
			if (mappingList.length === 0) {
				return NextResponse.json([])
			}

			// 2. Get matching course_offerings for the exam session (institution-scoped)
			const mappingIds = mappingList.map(m => m.id)
			const { data: offerings, error: offerErr } = await supabase
				.from('course_offerings')
				.select('id, course_mapping_id, course_code, course_id, semester, semester_code, program_code')
				.eq('institutions_id', institutionsId)
				.eq('institution_code', institutionCode)
				.eq('examination_session_id', examinationSessionId)
				.eq('program_code', programCode)
				.eq('semester_code', semesterCode)
				.in('course_mapping_id', mappingIds)
				.range(0, 9999)

			if (offerErr) {
				console.error('[bulk-create lookups] course_offerings error:', offerErr)
				return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
			}

			const offeringList = offerings || []
			if (offeringList.length === 0) {
				return NextResponse.json([])
			}

			// 3. Enrich with course names from courses table
			const courseIds = [...new Set(offeringList.map(o => o.course_id).filter(Boolean))]
			const courseNamesMap = new Map<string, string>()
			if (courseIds.length > 0) {
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name')
					.in('id', courseIds)
					.range(0, 9999)
				;(courses || []).forEach(c => {
					courseNamesMap.set(c.id, c.course_name || c.course_code)
				})
			}

			// 4. Build response in mapping order
			const orderMap = new Map(mappingList.map((m, idx) => [m.id, idx]))
			const result = offeringList
				.map(o => ({
					course_offering_id: o.id,
					course_mapping_id: o.course_mapping_id,
					course_code: o.course_code,
					course_name: courseNamesMap.get(o.course_id) || o.course_code,
					semester: o.semester,
					semester_code: o.semester_code,
					program_code: o.program_code,
				}))
				.sort((a, b) => (orderMap.get(a.course_mapping_id) ?? 999) - (orderMap.get(b.course_mapping_id) ?? 999))

			return NextResponse.json(result)
		}

		if (type === 'registered') {
			const institutionsId = searchParams.get('institutions_id')
			const institutionCode = searchParams.get('institution_code')
			const examinationSessionId = searchParams.get('examination_session_id')
			const courseOfferingIds = searchParams.get('course_offering_ids') // comma-separated

			if (!institutionsId || !examinationSessionId || !courseOfferingIds) {
				return NextResponse.json({
					error: 'institutions_id, examination_session_id, and course_offering_ids are required'
				}, { status: 400 })
			}

			const ids = courseOfferingIds.split(',').map(s => s.trim()).filter(Boolean)
			if (ids.length === 0) {
				return NextResponse.json([])
			}

			// Paginate to bypass 1000-row limit — up to 1,000,000 rows
			const all: any[] = []
			let page = 0
			const pageSize = 1000
			let hasMore = true
			while (hasMore && all.length < 1000000) {
				let q = supabase
					.from('exam_registrations')
					.select('id, student_id, stu_register_no, course_offering_id')
					.eq('institutions_id', institutionsId)
					.eq('examination_session_id', examinationSessionId)
					.in('course_offering_id', ids)
					.range(page * pageSize, (page + 1) * pageSize - 1)
				if (institutionCode) q = q.eq('institution_code', institutionCode)
				const { data, error } = await q

				if (error) {
					console.error('[bulk-create lookups] registered error:', error)
					return NextResponse.json({ error: 'Failed to fetch existing registrations' }, { status: 500 })
				}

				if (data && data.length > 0) {
					all.push(...data)
					page++
					hasMore = data.length === pageSize
				} else {
					hasMore = false
				}
			}

			return NextResponse.json(all)
		}

		return NextResponse.json({ error: 'Invalid type. Must be courses or registered' }, { status: 400 })
	} catch (e) {
		console.error('[bulk-create lookups] unexpected error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
