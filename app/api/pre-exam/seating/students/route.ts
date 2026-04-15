import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examDate = searchParams.get('exam_date')
		const session = searchParams.get('session')

		if (!institutionId || !examinationSessionId || !examDate || !session) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// 1. Get published timetables for this date + session
		const { data: timetables, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, course_offering_id, course_id')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.eq('exam_date', examDate)
			.eq('session', session)
			.eq('is_published', true)

		if (ttError) {
			console.error('Timetable fetch error:', ttError)
			return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
		}

		if (!timetables || timetables.length === 0) {
			return NextResponse.json({ students: [], timetables: [], total: 0 })
		}

		const courseOfferingIds = timetables.map(tt => tt.course_offering_id)
		const courseIds = [...new Set(timetables.map(tt => tt.course_id).filter(Boolean))]

		// 2. Get course codes from courses table
		let courseLookup = new Map<string, string>()
		if (courseIds.length > 0) {
			const { data: courses } = await supabase
				.from('courses')
				.select('id, course_code')
				.in('id', courseIds)
			if (courses) {
				courseLookup = new Map(courses.map(c => [c.id, c.course_code]))
			}
		}

		// 3. Get approved registrations for the matching course offerings
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id, program_code, is_regular, attempt_number')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.in('course_offering_id', courseOfferingIds)
			.eq('registration_status', 'Approved')
			.order('stu_register_no', { ascending: true })
			.range(0, 9999)

		if (regError) {
			console.error('Registration fetch error:', regError)
			return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
		}

		// 4. Build timetable lookup: course_offering_id -> timetable
		const ttLookup = new Map<string, typeof timetables[number]>()
		for (const tt of timetables) {
			ttLookup.set(tt.course_offering_id, tt)
		}

		// 5. Fetch program_type from MyJKKN API
		const { data: institution } = await supabase
			.from('institutions')
			.select('myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		const myjkknIds: string[] = institution?.myjkkn_institution_ids || []
		const programTypeLookup = new Map<string, 'UG' | 'PG'>()

		for (const myjkknInstId of myjkknIds) {
			try {
				const programs = await fetchAllMyJKKNPrograms({
					institution_id: myjkknInstId,
					is_active: true,
					all: true,
				})
				for (const p of programs) {
					const code = (p as any).program_id || p.program_code
					if (code && p.program_type) {
						const pt = p.program_type.toUpperCase()
						if (pt === 'UG' || pt === 'PG') {
							programTypeLookup.set(code, pt)
						}
					}
				}
			} catch (err) {
				console.error(`Failed to fetch programs for MyJKKN inst ${myjkknInstId}:`, err)
			}
		}

		// 6. Map registrations to SeatingStudent format with program_type
		const students = (registrations || []).map(reg => {
			const tt = ttLookup.get(reg.course_offering_id)
			const courseCode = tt?.course_id ? (courseLookup.get(tt.course_id) || '') : ''
			const programCode = reg.program_code || ''
			return {
				exam_registration_id: reg.id,
				stu_register_no: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				program_code: programCode,
				course_code: courseCode,
				course_offering_id: reg.course_offering_id,
				exam_timetable_id: tt?.id || '',
				is_regular: reg.is_regular,
				program_type: programTypeLookup.get(programCode) || (programCode.startsWith('P') ? 'PG' : 'UG'),
			}
		})

		return NextResponse.json({
			students,
			timetables: timetables.map(tt => ({
				id: tt.id,
				course_offering_id: tt.course_offering_id,
				course_id: tt.course_id,
			})),
			total: students.length,
		})
	} catch (e) {
		console.error('Seating students API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
