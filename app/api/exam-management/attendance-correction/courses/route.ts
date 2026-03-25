import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch unique course codes from exam_attendance filtered by institution and session
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')

		if (!institutionId) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get distinct exam_registration_ids, filtered by institution and optionally by session
		let attendanceQuery = supabase
			.from('exam_attendance')
			.select('exam_registration_id')
			.eq('institutions_id', institutionId)
			.not('exam_registration_id', 'is', null)

		if (sessionId) {
			attendanceQuery = attendanceQuery.eq('examination_session_id', sessionId)
		}

		const { data: attendanceData, error: attendanceError } = await attendanceQuery

		if (attendanceError) {
			console.error('Error fetching attendance:', attendanceError)
			return NextResponse.json({
				error: 'Failed to fetch attendance records',
				details: attendanceError.message
			}, { status: 500 })
		}

		// Get unique exam_registration_ids
		const uniqueRegIds = [...new Set(attendanceData?.map(r => r.exam_registration_id) || [])]

		if (uniqueRegIds.length === 0) {
			return NextResponse.json([])
		}

		// Fetch course_codes from exam_registrations - in batches if needed
		const batchSize = 100
		let allCourseCodes: string[] = []

		for (let i = 0; i < uniqueRegIds.length; i += batchSize) {
			const batchIds = uniqueRegIds.slice(i, i + batchSize)
			const { data: regData, error: regError } = await supabase
				.from('exam_registrations')
				.select('course_code')
				.in('id', batchIds)

			if (regError) {
				console.error('Error fetching exam_registrations batch:', regError)
				continue
			}

			const courseCodes = regData?.map(r => r.course_code).filter(Boolean) || []
			allCourseCodes = allCourseCodes.concat(courseCodes)
		}

		// Get unique course codes
		const uniqueCourseCodes = [...new Set(allCourseCodes)]

		if (uniqueCourseCodes.length === 0) {
			return NextResponse.json([])
		}

		// Fetch course details from courses table
		const { data: coursesData, error: coursesError } = await supabase
			.from('courses')
			.select('id, course_code, course_name')
			.in('course_code', uniqueCourseCodes)
			.order('course_code')

		if (coursesError) {
			console.error('Error fetching courses:', coursesError)
		}

		// Create a map for found courses
		const coursesMap = new Map(
			(coursesData || []).map(c => [c.course_code, c])
		)

		// Build final courses list - include courses not found in courses table
		const courses = uniqueCourseCodes
			.map(code => {
				const found = coursesMap.get(code)
				if (found) {
					return {
						id: found.id,
						course_code: found.course_code,
						course_name: found.course_name
					}
				}
				// Fallback for courses not in courses table
				return {
					id: code,
					course_code: code,
					course_name: code
				}
			})
			.sort((a, b) => a.course_code.localeCompare(b.course_code))

		return NextResponse.json(courses)

	} catch (error) {
		console.error('Error in attendance-correction/courses GET:', error)
		return NextResponse.json({
			error: 'Failed to fetch courses'
		}, { status: 500 })
	}
}
