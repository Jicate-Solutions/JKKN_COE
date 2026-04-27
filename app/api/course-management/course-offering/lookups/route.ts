import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch distinct regulations, semesters, or courses from course_mapping
// Used by the bulk course offering create page
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type') // 'regulations' | 'semesters' | 'courses'
		const institutionCode = searchParams.get('institution_code')
		const programCode = searchParams.get('program_code')
		const regulationCode = searchParams.get('regulation_code')
		const semesterCode = searchParams.get('semester_code')

		if (!type) {
			return NextResponse.json({ error: 'type parameter is required' }, { status: 400 })
		}

		if (type === 'regulations') {
			// Get distinct regulation_codes from course_mapping for institution + program
			if (!institutionCode || !programCode) {
				return NextResponse.json({ error: 'institution_code and program_code are required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('course_mapping')
				.select('regulation_code')
				.eq('institution_code', institutionCode)
				.eq('program_code', programCode)
				.not('regulation_code', 'is', null)

			if (error) {
				console.error('Lookup regulations error:', error)
				return NextResponse.json({ error: 'Failed to fetch regulations' }, { status: 500 })
			}

			// Deduplicate
			const unique = [...new Set((data || []).map(d => d.regulation_code).filter(Boolean))]
			return NextResponse.json(unique.sort())
		}

		if (type === 'semesters') {
			// Get distinct semesters from course_mapping for institution + program + regulation
			if (!institutionCode || !programCode || !regulationCode) {
				return NextResponse.json({ error: 'institution_code, program_code, and regulation_code are required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('course_mapping')
				.select('semester_id, semester_code')
				.eq('institution_code', institutionCode)
				.eq('program_code', programCode)
				.eq('regulation_code', regulationCode)
				.not('semester_code', 'is', null)

			if (error) {
				console.error('Lookup semesters error:', error)
				return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
			}

			// Deduplicate by semester_id, preserve both id and code
			const seen = new Set<string>()
			const unique: Array<{ semester_id: string; semester_code: string }> = []
			for (const row of data || []) {
				if (row.semester_id && !seen.has(row.semester_id)) {
					seen.add(row.semester_id)
					unique.push({ semester_id: row.semester_id, semester_code: row.semester_code })
				}
			}
			const sorted = unique.sort((a, b) => {
				const numA = parseInt(a.semester_code.match(/(\d+)/)?.[1] || '0')
				const numB = parseInt(b.semester_code.match(/(\d+)/)?.[1] || '0')
				return numA - numB
			})
			return NextResponse.json(sorted)
		}

		if (type === 'courses') {
			// Get courses from course_mapping for institution + program + regulation + semester
			if (!institutionCode || !programCode || !regulationCode || !semesterCode) {
				return NextResponse.json({ error: 'institution_code, program_code, regulation_code, and semester_code are required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('course_mapping')
				.select('id, course_id, course_code')
				.eq('institution_code', institutionCode)
				.eq('program_code', programCode)
				.eq('regulation_code', regulationCode)
				.eq('semester_code', semesterCode)
				.order('course_order', { ascending: true })

			if (error) {
				console.error('Lookup courses error:', error)
				return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
			}

			// Enrich with course names from courses table
			const courseIds = [...new Set((data || []).map(d => d.course_id).filter(Boolean))]
			const courseNamesMap = new Map<string, string>()

			if (courseIds.length > 0) {
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name')
					.in('id', courseIds)

				;(courses || []).forEach(c => {
					courseNamesMap.set(c.id, c.course_name || c.course_code)
				})
			}

			const enriched = (data || []).map(d => ({
				course_mapping_id: d.id,
				course_id: d.course_id,
				course_code: d.course_code,
				course_name: courseNamesMap.get(d.course_id) || d.course_code,
			}))

			return NextResponse.json(enriched)
		}

		if (type === 'existing') {
			// Get existing course_offering records for session + program + semesters
			const institutionsId = searchParams.get('institutions_id')
			const sessionId = searchParams.get('examination_session_id')
			const programCodeParam = searchParams.get('program_code')
			const semesterCodes = searchParams.get('semester_codes') // comma-separated

			if (!institutionsId || !sessionId || !programCodeParam) {
				return NextResponse.json({ error: 'institutions_id, examination_session_id, and program_code are required' }, { status: 400 })
			}

			let query = supabase
				.from('course_offerings')
				.select('id, course_mapping_id, semester_code')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('program_code', programCodeParam)

			if (semesterCodes) {
				const codes = semesterCodes.split(',').map(s => s.trim()).filter(Boolean)
				if (codes.length > 0) {
					query = query.in('semester_code', codes)
				}
			}

			const { data, error } = await query

			if (error) {
				console.error('Lookup existing error:', error)
				return NextResponse.json({ error: 'Failed to fetch existing offerings' }, { status: 500 })
			}

			return NextResponse.json(data || [])
		}

		return NextResponse.json({ error: 'Invalid type. Must be regulations, semesters, courses, or existing' }, { status: 400 })
	} catch (e) {
		console.error('Course offering lookups error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
