import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch unique course codes from exam_timetables (all scheduled exams - both Theory & Practical)
// filtered by institution and session. Sourcing from exam_timetables ensures we list every
// scheduled course, not only those where attendance has already been recorded.
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')

		if (!institutionId) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get distinct course_ids from exam_timetables (covers both Theory & Practical)
		let timetableQuery = supabase
			.from('exam_timetables')
			.select('course_id')
			.eq('institutions_id', institutionId)
			.eq('is_published', true)
			.not('course_id', 'is', null)
			.range(0, 9999)

		if (sessionId) {
			timetableQuery = timetableQuery.eq('examination_session_id', sessionId)
		}

		const { data: timetableData, error: timetableError } = await timetableQuery

		if (timetableError) {
			console.error('Error fetching exam timetables:', timetableError)
			return NextResponse.json({
				error: 'Failed to fetch exam timetables',
				details: timetableError.message
			}, { status: 500 })
		}

		// Get unique course_ids
		const uniqueCourseIds = [...new Set(timetableData?.map(r => r.course_id).filter(Boolean) || [])]

		if (uniqueCourseIds.length === 0) {
			return NextResponse.json([])
		}

		// Fetch course details from courses table (in batches)
		const batchSize = 100
		const coursesMap = new Map<string, { id: string; course_code: string; course_name: string }>()

		for (let i = 0; i < uniqueCourseIds.length; i += batchSize) {
			const batchIds = uniqueCourseIds.slice(i, i + batchSize)
			const { data: coursesBatch, error: coursesBatchError } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.in('id', batchIds)

			if (coursesBatchError) {
				console.error('Error fetching courses batch:', coursesBatchError)
				continue
			}

			for (const c of coursesBatch || []) {
				if (c.course_code && !coursesMap.has(c.course_code)) {
					coursesMap.set(c.course_code, c)
				}
			}
		}

		if (coursesMap.size === 0) {
			return NextResponse.json([])
		}

		// Build final courses list, sorted by course_code
		const courses = [...coursesMap.values()]
			.map(c => ({
				id: c.id,
				course_code: c.course_code,
				course_name: c.course_name
			}))
			.sort((a, b) => a.course_code.localeCompare(b.course_code))

		return NextResponse.json(courses)

	} catch (error) {
		console.error('Error in attendance-correction/courses GET:', error)
		return NextResponse.json({
			error: 'Failed to fetch courses'
		}, { status: 500 })
	}
}
