import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch exam report with comprehensive student and exam details
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters with defaults
		const institutionCode = searchParams.get('institution_code') || 'JKKNCAS'
		const sessionCode = searchParams.get('session_code') || 'JKKNCAS-NOV-DEC-2025'
		const programCode = searchParams.get('program_code') || 'BSC-CS'
		const examDate = searchParams.get('exam_date') || '2025-10-31'
		const examSession = searchParams.get('exam_session') || 'FN'
		const courseCode = searchParams.get('course_code') || '24UGTA01'

		// Step 1: Get institution
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, name, institution_code')
			.eq('institution_code', institutionCode)
			.single()

		if (instError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// Steps 2 & 3: Get examination session and program in parallel (both depend only on institution.id)
		const [sessionResult, programResult] = await Promise.all([
			supabase
				.from('examination_sessions')
				.select('id, session_code, session_name, semester_type, session_status')
				.eq('session_code', sessionCode)
				.eq('institutions_id', institution.id)
				.single(),
			supabase
				.from('programs')
				.select('id, program_code, program_name, degree_code, pattern_type, program_order')
				.eq('program_code', programCode)
				.eq('institutions_id', institution.id)
				.single(),
		])

		const { data: examSession_data, error: sessionError } = sessionResult
		const { data: program, error: programError } = programResult

		if (sessionError || !examSession_data) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}

		if (programError || !program) {
			return NextResponse.json({ error: 'Program not found' }, { status: 404 })
		}

		// Step 4: Get course from course_mapping (which links to courses table)
		const { data: courseMappings, error: courseMappingError } = await supabase
			.from('course_mapping')
			.select(`
				id,
				course_id,
				courses!inner(
					id,
					course_code,
					course_name,
					course_category,
					course_type,
					credit,
					evaluation_type
				)
			`)
			.eq('institution_code', institutionCode)
			.eq('program_code', programCode)

		if (courseMappingError) {
			console.error('Error fetching course mapping:', courseMappingError)
			return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
		}

		// Find the specific course by course_code
		const courseMapping = courseMappings?.find(
			(cm: any) => cm.courses?.course_code === courseCode
		)

		if (!courseMapping || !courseMapping.courses) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		const course = courseMapping.courses

		// Step 5: Get course offering
		const { data: courseOfferings, error: offeringError } = await supabase
			.from('course_offerings')
			.select('id, section, semester, enrolled_count, is_active')
			.eq('institutions_id', institution.id)
			.eq('examination_session_id', examSession_data.id)
			.eq('program_id', program.id)
			.eq('course_id', courseMapping.id)

		if (offeringError) {
			console.error('Error fetching course offerings:', offeringError)
			return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
		}

		if (!courseOfferings || courseOfferings.length === 0) {
			return NextResponse.json({ error: 'Course offering not found' }, { status: 404 })
		}

		// Get all course offering IDs
		const offeringIds = courseOfferings.map((co: any) => co.id)

		// Step 6: Get exam timetable
		const { data: examTimetable, error: timetableError } = await supabase
			.from('exam_timetables')
			.select('id, exam_date, exam_time, duration_minutes, exam_mode, session')
			.eq('institutions_id', institution.id)
			.eq('examination_session_id', examSession_data.id)
			.in('course_offering_id', offeringIds)
			.eq('exam_date', examDate)
			.eq('session', examSession)
			.maybeSingle()

		if (timetableError) {
			console.error('Error fetching exam timetable:', timetableError)
			return NextResponse.json({ error: 'Failed to fetch exam timetable' }, { status: 500 })
		}

		if (!examTimetable) {
			return NextResponse.json({ error: 'Exam timetable not found for the specified date and session' }, { status: 404 })
		}

		// Step 7: Get exam registrations for all course offerings
		const { data: examRegistrations, error: regError } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				stu_register_no,
				student_name,
				registration_status,
				is_regular,
				attempt_number,
				fee_paid,
				payment_date,
				course_offering_id
			`)
			.eq('institutions_id', institution.id)
			.in('course_offering_id', offeringIds)
			.order('attempt_number', { ascending: true })
			.order('stu_register_no', { ascending: true })

		if (regError) {
			console.error('Error fetching exam registrations:', regError)
			return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 500 })
		}

		// Step 8: Combine all data
		const result = (examRegistrations || []).map((reg: any) => {
			// Find the specific course offering for this registration
			const offering = courseOfferings.find((co: any) => co.id === reg.course_offering_id)

			return {
				// Institution
				institution_id: institution.id,
				institution_name: institution.name,
				institution_code: institution.institution_code,

				// Examination Session
				examination_session_id: examSession_data.id,
				session_code: examSession_data.session_code,
				session_name: examSession_data.session_name,
				semester_type: examSession_data.semester_type,
				session_status: examSession_data.session_status,

				// Program
				program_id: program.id,
				program_code: program.program_code,
				program_name: program.program_name,
				degree_code: program.degree_code,
				pattern_type: program.pattern_type,
				program_order: program.program_order,

				// Course
				course_id: course.id,
				course_code: course.course_code,
				course_name: course.course_name,
				course_category: course.course_category,
				course_type: course.course_type,
				credit: course.credit,
				evaluation_type: course.evaluation_type,

				// Course Offering
				course_offering_id: offering?.id || reg.course_offering_id,
				section: offering?.section,
				semester: offering?.semester,
				enrolled_count: offering?.enrolled_count,
				offering_active: offering?.is_active,

				// Exam Registration
				exam_registration_id: reg.id,
				student_id: reg.student_id,
				stu_register_no: reg.stu_register_no,
				student_name: reg.student_name,
				registration_status: reg.registration_status,
				is_regular: reg.is_regular,
				attempt_number: reg.attempt_number,
				fee_paid: reg.fee_paid,
				payment_date: reg.payment_date,

				// Exam Timetable
				exam_timetable_id: examTimetable.id,
				exam_date: examTimetable.exam_date,
				exam_time: examTimetable.exam_time,
				duration_minutes: examTimetable.duration_minutes,
				exam_mode: examTimetable.exam_mode,
				exam_session: examTimetable.session,
			}
		})

		return NextResponse.json(result, { status: 200 })
	} catch (e) {
		console.error('Exam report API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
