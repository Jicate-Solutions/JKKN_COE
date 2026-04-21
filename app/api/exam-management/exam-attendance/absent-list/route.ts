import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch absent learners grouped by course (course-wise absent list)
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('session_id')
		const examDate = searchParams.get('exam_date')
		const sessionType = searchParams.get('session') // FN or AN
		const programCode = searchParams.get('program_code') // Optional
		const courseCode = searchParams.get('course_code') // Optional

		if (!institutionId || !sessionId || !examDate || !sessionType) {
			return NextResponse.json(
				{ error: 'Missing required parameters: institution_id, session_id, exam_date, session' },
				{ status: 400 }
			)
		}

		// Get institution details
		const { data: institution, error: institutionError } = await supabase
			.from('institutions')
			.select('id, name, institution_code, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (institutionError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// Get session details
		const { data: session, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('session_name, session_code')
			.eq('id', sessionId)
			.single()

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Session not found' }, { status: 404 })
		}

		// Build absent attendance query - mirrors bundle-cover but filters to Absent only
		let query = supabase
			.from('exam_attendance')
			.select(`
				exam_registration_id,
				student_id,
				attendance_status,
				program_code,
				exam_registrations!inner (
					stu_register_no,
					student_name,
					is_regular,
					program_code,
					course_offerings!inner (
						course_id,
						program_code,
						examination_session_id,
						courses!inner (
							course_code,
							course_name
						)
					)
				),
				exam_timetables!inner (
					exam_date,
					session
				)
			`)
			.eq('exam_registrations.course_offerings.examination_session_id', sessionId)
			.eq('exam_timetables.exam_date', examDate)
			.eq('exam_timetables.session', sessionType)
			.eq('attendance_status', 'Absent')

		if (programCode) {
			query = query.or(
				`program_code.eq.${programCode},exam_registrations.program_code.eq.${programCode},exam_registrations.course_offerings.program_code.eq.${programCode}`
			)
		}

		if (courseCode) {
			query = query.eq('exam_registrations.course_offerings.courses.course_code', courseCode)
		}

		const { data: attendanceData, error: attendanceError } = await query

		if (attendanceError) {
			console.error('Error fetching absent list:', attendanceError)
			return NextResponse.json(
				{ error: 'Failed to fetch absent list', details: attendanceError.message },
				{ status: 500 }
			)
		}

		// Group absentees by course_code
		const groupedByCourse: Record<string, any> = {}

		;(attendanceData || []).forEach((record: any) => {
			const reg = record.exam_registrations
			const co = reg?.course_offerings
			const crs = co?.courses
			if (!reg || !co || !crs) return

			const recordProgramCode =
				record.program_code || reg.program_code || co.program_code || '-'

			const key = crs.course_code
			if (!groupedByCourse[key]) {
				groupedByCourse[key] = {
					course_code: crs.course_code,
					course_name: crs.course_name,
					program_code: recordProgramCode,
					students: []
				}
			}

			groupedByCourse[key].students.push({
				register_number: reg.stu_register_no,
				student_name: reg.student_name || '',
				is_regular: reg.is_regular,
				program_code: recordProgramCode
			})
		})

		// Override learner names from MyJKKN learner profiles
		const myjkknIds: string[] = institution?.myjkkn_institution_ids || []
		const allRegNos = new Set<string>()
		Object.values(groupedByCourse).forEach((course: any) => {
			course.students.forEach((s: any) => {
				if (s.register_number) allRegNos.add(s.register_number)
			})
		})

		const nameMap = new Map<string, string>()
		const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
		const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

		if (myjkknIds.length > 0 && myjkknApiKey && allRegNos.size > 0) {
			try {
				for (const myjkknInstId of myjkknIds) {
					let pg = 1
					const pgSize = 200
					let hasMorePages = true

					while (hasMorePages) {
						const profileParams = new URLSearchParams({
							institution_id: myjkknInstId,
							limit: String(pgSize),
							page: String(pg)
						})
						const profileResponse = await fetch(
							`${myjkknApiUrl}/api-management/learners/profiles?${profileParams.toString()}`,
							{
								method: 'GET',
								headers: {
									'Authorization': `Bearer ${myjkknApiKey}`,
									'Accept': 'application/json',
									'Content-Type': 'application/json'
								},
								cache: 'no-store'
							}
						)
						if (profileResponse.ok) {
							const profileData = await profileResponse.json()
							const profiles = profileData.data || []
							for (const lp of profiles) {
								const regNo = lp.register_number
								if (regNo && allRegNos.has(regNo) && !nameMap.has(regNo.toUpperCase())) {
									const myjkknFullName =
										lp.student_name ||
										lp.full_name ||
										[lp.first_name, lp.last_name].filter(Boolean).join(' ')
									if (myjkknFullName) nameMap.set(regNo.toUpperCase(), myjkknFullName)
								}
							}
							hasMorePages = profiles.length === pgSize
							pg++
						} else {
							hasMorePages = false
						}
					}
				}

				if (nameMap.size > 0) {
					Object.values(groupedByCourse).forEach((course: any) => {
						course.students.forEach((s: any) => {
							const key = s.register_number?.toUpperCase()
							if (key && nameMap.has(key)) s.student_name = nameMap.get(key)
						})
					})
				}
			} catch (myjkknError) {
				console.warn('[AbsentList] MyJKKN API error (non-critical):', myjkknError)
			}
		}

		// Format exam date (DD-MM-YYYY)
		const formattedDate = new Date(examDate).toLocaleDateString('en-GB', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})

		// Sort courses by course_code, and students within each course: regular first then register_number
		const courses = Object.values(groupedByCourse)
			.map((course: any) => ({
				...course,
				students: course.students.sort((a: any, b: any) => {
					if (a.is_regular !== b.is_regular) return a.is_regular ? -1 : 1
					return (a.register_number || '').localeCompare(b.register_number || '')
				})
			}))
			.sort((a: any, b: any) => a.course_code.localeCompare(b.course_code))

		return NextResponse.json({
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: session.session_name,
			session_code: session.session_code,
			exam_date: formattedDate,
			session_type: sessionType,
			courses,
			total_absent: courses.reduce((sum: number, c: any) => sum + c.students.length, 0)
		})
	} catch (error) {
		console.error('Absent list API error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Internal server error'
		return NextResponse.json(
			{ error: 'Failed to fetch absent list', details: errorMessage },
			{ status: 500 }
		)
	}
}
