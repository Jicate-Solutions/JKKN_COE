import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()
		const action = searchParams.get('action')

		// Reuse filter-cascade from internal-mark-entry for programs/semesters/courses
		// Assessment options — NO date filtering (show all rounds)
		if (action === 'assessments') {
			const institutionsId = searchParams.get('institutions_id')
			const sessionId = searchParams.get('examination_session_id')

			if (!institutionsId || !sessionId) {
				return NextResponse.json({ error: 'institutions_id and examination_session_id required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('cia_entry_settings')
				.select('*')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (error) {
				return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 })
			}

			// Return ALL rounds without date filtering
			const options: any[] = []
			for (const setting of (data || [])) {
				for (const round of (setting.cia_rounds || [])) {
					options.push({
						id: `${setting.id}__${round.round}`,
						label: `${setting.setting_name} - ${round.round_name}`,
						setting,
						round,
					})
				}
			}
			return NextResponse.json(options)
		}

		// Get report data — learners with marks + dummy numbers
		if (action === 'report-data') {
			const courseOfferingId = searchParams.get('course_offering_id')
			const sessionId = searchParams.get('examination_session_id')
			const programCode = searchParams.get('program_code')
			const ciaRound = searchParams.get('cia_round') || '1'

			if (!courseOfferingId || !sessionId) {
				return NextResponse.json({ error: 'course_offering_id and examination_session_id required' }, { status: 400 })
			}

			// Get course_code from offering
			const { data: offering } = await supabase
				.from('course_offerings')
				.select('course_code')
				.eq('id', courseOfferingId)
				.single()

			const courseCode = offering?.course_code

			// Fetch registrations
			let regQuery = supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id')
				.eq('examination_session_id', sessionId)
				.eq('is_regular', true)
				.order('stu_register_no')

			if (courseCode) regQuery = regQuery.eq('course_code', courseCode)
			else regQuery = regQuery.eq('course_offering_id', courseOfferingId)
			if (programCode) regQuery = regQuery.eq('program_code', programCode)

			const { data: registrations, error: regError } = await regQuery.range(0, 9999)
			if (regError) return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
			if (!registrations || registrations.length === 0) return NextResponse.json([])

			// Fetch cia_marks for this round
			const allCOIds = [...new Set(registrations.map(r => r.course_offering_id))]
			const { data: marks } = await supabase
				.from('cia_marks')
				.select('*')
				.in('course_offering_id', allCOIds)
				.eq('examination_session_id', sessionId)
				.eq('cia_round', Number(ciaRound))
				.eq('is_active', true)

			const marksMap = new Map<string, any>()
			for (const m of (marks || [])) marksMap.set(m.student_id, m)

			// Fetch dummy numbers
			const regIds = registrations.map(r => r.id)
			const { data: dummyNumbers } = await supabase
				.from('student_dummy_numbers')
				.select('exam_registration_id, dummy_number')
				.in('exam_registration_id', regIds)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			const dummyMap = new Map<string, string>()
			for (const d of (dummyNumbers || [])) dummyMap.set(d.exam_registration_id, d.dummy_number)

			// Build result
			const result = registrations.map(r => ({
				...r,
				dummy_number: dummyMap.get(r.id) || '-',
				saved_marks: marksMap.get(r.student_id) || null,
			}))

			return NextResponse.json(result)
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
	} catch (error) {
		console.error('Internal mark report error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
